import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, empty, merge, from, throwError } from 'rxjs';
import { catchError, expand, filter, map, mergeMap, takeWhile, toArray } from 'rxjs/operators';

import { EVESSOService } from '../eve-sso/eve-sso.module';
import { EsiService, EsiError, EsiMailRecipient, EsiMailHeader } from './eve-esi.module';

import {
  EsiItem,
  EsiLocationType,
  EsiInformationType,
  EsiDataCategoryInfo,
  EsiDataGroupInfo,
  EsiDataPlanetInfo,
  EsiDataRegionInfo,
  EsiDataStationInfo,
  EsiDataStructureInfo,
  EsiDataSystemInfo,
  EsiDataTypeInfo,
  EsiMarketOrderState,
  EsiMarketOrderType,
  EsiMarketOrderCharacter,
  EsiMarketOrderStructure,
  EsiMarketOrderRegion,
  EsiWalletTransaction,
  EsiTypeInfo,
  EsiSystemInfo,
  EsiCategoryInfo,
  EsiConstellationInfo,
  EsiGroupInfo,
  EsiPlanetInfo,
  EsiRegionInfo,
  EsiStructureInfo,
  EsiStationInfo,
  EsiDataItemName,
  EsiDataMarketOrder,
  EsiDataCharMarketOrder,
  EsiDataConstellationInfo
} from './eve-esi.models';

export * from './eve-esi.models';

import { autoMap, set, tuple } from '../../utils/utils';

export interface EsiDataMailHeader {
  mail_id: number;
  from: number;
  recipients: EsiMailRecipient[];
  subject: string;
  timestamp: number;
  labels: number[];
  is_read: boolean;
}

export interface EsiDataMail extends EsiDataMailHeader {
  body: string;
}

/*
// 'asset_safety', 'character', 'unknown'
export interface EsiDataBasicLocationInfo {
  name: string;
  type: EsiLocationType;
}

// 'station', 'structure'
export interface EsiDataStructureLocationInfo extends EsiDataBasicLocationInfo {
  type_id: number;
  system_id: number;
  position: [number, number, number];
}

// 'solar_system'
export interface EsiDataSystemLocationInfo extends EsiDataBasicLocationInfo {
  region_id: number;
  region_name: string;
}

export type EsiDataLocationInfo = EsiDataBasicLocationInfo | EsiDataStructureLocationInfo | EsiDataSystemLocationInfo;
*/

export interface EsiDataLocMarketTypes {
  l_id: number; // station or structure
  types: number[];
}

export interface EsiDataLocMarketOrders {
  l_id: number;
  orders: Map<number, EsiDataMarketOrder[]>;
}

export const fltBuySell = <T extends EsiDataMarketOrder>(buy_sell: EsiMarketOrderType) => (o: T): boolean =>
  buy_sell === o.buy_sell;

export const fltBuySellUnk = <T extends EsiDataMarketOrder>(
  buy_sell: EsiMarketOrderType | undefined
): ((o: T) => boolean) => (buy_sell == undefined ? (): boolean => true : fltBuySell(buy_sell));

@Injectable({
  providedIn: 'root'
})
export class EsiDataService {
  private missedIDs(ids: number[], knownIDs: IterableIterator<number>): number[] {
    return set(ids).filter(id => ![...knownIDs].includes(id));
  }

  constructor(private http: HttpClient, private esi: EsiService, private sso: EVESSOService) {}

  get character(): { id: number; name: string } {
    const idn = this.sso.charIdName;
    if (idn == undefined) throw Error('Undefined character ID');
    return {
      id: idn.id,
      name: idn.name
    };
  }

  loadCategoryInfo(id: number): Observable<EsiDataCategoryInfo> {
    return this.esi.getInformation<EsiCategoryInfo>('categories', id);
  }
  loadConstellationInfo(id: number): Observable<EsiDataConstellationInfo> {
    return this.esi.getInformation<EsiConstellationInfo>('constellations', id);
  }
  loadGroupInfo(id: number): Observable<EsiDataGroupInfo> {
    return this.esi.getInformation<EsiGroupInfo>('groups', id);
  }
  loadPlanetInfo(id: number): Observable<EsiDataPlanetInfo> {
    return this.esi.getInformation<EsiPlanetInfo>('planets', id);
  }
  loadRegionInfo(id: number): Observable<EsiDataRegionInfo> {
    return this.esi.getInformation<EsiRegionInfo>('regions', id);
  }
  loadStationInfo(id: number): Observable<EsiDataStationInfo> {
    return this.esi.getInformation<EsiStationInfo>('stations', id);
  }
  loadStructureInfo(id: number): Observable<EsiDataStructureInfo> {
    return this.esi.getInformation<EsiStructureInfo>('structures', id).pipe(
      map(info => ({
        ...info,
        structure_id: id
      })),
      catchError((err: unknown) => {
        // some structures IDs are 'forbidden', status == 403
        if (err instanceof EsiError && err.status == 403)
          return of({
            name: '',
            owner_id: 0,
            solar_system_id: 0,
            structure_id: id,
            forbidden: true
          });
        return throwError(err);
      })
    );
  }
  loadSystemInfo(id: number): Observable<EsiDataSystemInfo> {
    return this.esi.getInformation<EsiSystemInfo>('systems', id);
  }
  loadTypeInfo(id: number): Observable<EsiDataTypeInfo> {
    return this.esi.getInformation<EsiTypeInfo>('types', id).pipe(
      map(info => ({
        name: info.name,
        volume: info.volume,
        packaged_volume: info.packaged_volume
      }))
    );
  }

  loadInformation<T>(infoType: EsiInformationType, id: number): Observable<T> {
    return this.esi.getInformation<T>(infoType, id);
  }

  loadCharacterItems(): Observable<EsiItem[]> {
    return this.esi.getCharacterItems(this.character.id);
  }

  loadCharacterItemNames(ids: number[]): Observable<EsiDataItemName[]> {
    return this.esi.getCharacterItemNames(this.character.id, ids).pipe(
      map(names =>
        names.map(n => ({
          item_id: n.item_id,
          name: n.name === 'None' ? undefined : n.name
        }))
      )
    );
  }

  loadMarketPrices(): Observable<Map<number, number>> {
    return this.esi
      .listMarketPrices()
      .pipe(
        map(prices => new Map<number, number>(prices.map(v => [v.type_id, v.average_price || v.adjusted_price || 0])))
      );
  }

  static pluckLocMarketTypes(locs: EsiDataLocMarketTypes[]): number[] {
    return set(locs.reduce<number[]>((s, x) => [...s, ...x.types], []));
  }

  private fromEsiMarketOrderCharacter(
    o: EsiMarketOrderCharacter,
    status?: EsiMarketOrderState
  ): EsiDataCharMarketOrder {
    return {
      order_id: o.order_id,
      buy_sell: o.is_buy_order ? 'buy' : 'sell',
      timestamp: new Date(o.issued).getTime(),
      location_id: o.location_id,
      range: o.range,
      duration: o.duration,
      type_id: o.type_id,
      price: o.price,
      min_volume: o.min_volume || 1,
      volume_remain: o.volume_remain,
      volume_total: o.volume_total,
      region_id: o.region_id,
      issued_by: this.character.id,
      is_corporation: o.is_corporation,
      escrow: o.escrow || 0,
      wallet_division: 0,
      status
    };
  }

  private fromEsiMarketOrderStructureOrRegion(o: EsiMarketOrderStructure | EsiMarketOrderRegion): EsiDataMarketOrder {
    // o.system_id ignored for EsiMarketOrderRegion
    return {
      order_id: o.order_id,
      buy_sell: o.is_buy_order ? 'buy' : 'sell',
      timestamp: new Date(o.issued).getTime(),
      location_id: o.location_id,
      range: o.range,
      duration: o.duration,
      type_id: o.type_id,
      price: o.price,
      min_volume: o.min_volume || 1,
      volume_remain: o.volume_remain,
      volume_total: o.volume_total,
      region_id: undefined
    };
  }

  loadCharacterMarketOrders(buy_sell?: EsiMarketOrderType): Observable<EsiDataCharMarketOrder[]> {
    return this.esi
      .getCharacterOrders(this.character.id)
      .pipe(map(orders => orders.map(o => this.fromEsiMarketOrderCharacter(o)).filter(fltBuySellUnk(buy_sell))));
  }

  loadStructureMarketOrders(
    loc: EsiDataLocMarketTypes,
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return this.esi.getStructureOrders(loc.l_id).pipe(
      map(orders =>
        orders
          .map(o => this.fromEsiMarketOrderStructureOrRegion(o))
          .filter(fltBuySellUnk(buy_sell))
          .reduce(
            autoMap(ord => ord.type_id, loc.types),
            new Map<number, EsiDataMarketOrder[]>()
          )
      ),
      map(orders => ({ l_id: loc.l_id, orders }))
    );
  }

  loadRegionMarketOrders(
    reg: number,
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return this.esi.getRegionOrdersEx(reg, EsiDataService.pluckLocMarketTypes(locs), buy_sell).pipe(
      toArray(),
      mergeMap(r_orders =>
        from(locs).pipe(
          map(loc => ({
            l_id: loc.l_id,
            orders: new Map(
              r_orders
                .filter(([t_id]) => loc.types.includes(t_id)) // remove type_id
                .map(([t_id, t_orders]) =>
                  tuple(
                    t_id,
                    t_orders
                      .filter(o => o.location_id === loc.l_id) // remove locations
                      .map(o => this.fromEsiMarketOrderStructureOrRegion(o))
                  )
                )
            )
          }))
        )
      )
    );
  }

  loadCharacterWalletTransactions(): Observable<EsiWalletTransaction[]> {
    return this.esi.getCharacterWalletTransactions(this.character.id);
  }

  private static convertEsiDataMailHeader(h: EsiMailHeader): EsiDataMailHeader {
    return {
      mail_id: h.mail_id,
      from: h.from,
      recipients: h.recipients,
      subject: h.subject,
      timestamp: new Date(h.timestamp).getTime(),
      labels: h.labels,
      is_read: h.is_read
    };
  }

  private getCharacterMailHeadersFromId(
    mail_id: number | undefined,
    labels: number[] | undefined,
    up_to_date = 0
  ): Observable<EsiDataMailHeader[]> {
    return this.esi.getCharacterMailHeaders(this.character.id, labels, mail_id).pipe(
      map(headers =>
        headers.map(h => EsiDataService.convertEsiDataMailHeader(h)).filter(h => h.timestamp >= up_to_date)
      ),
      takeWhile(headers => headers.length > 0) // ???
    );
  }

  getCharacterMailHeaders(labels?: number[], up_to_date?: number): Observable<EsiDataMailHeader> {
    return this.getCharacterMailHeadersFromId(undefined, labels, up_to_date).pipe(
      expand(headers =>
        headers.length < 50
          ? empty()
          : this.getCharacterMailHeadersFromId(Math.min(...headers.map(h => h.mail_id)), labels, up_to_date)
      ),
      mergeMap(headers => from(headers))
    );
  }

  private remapIDs<T>(info: EsiInformationType, ids: number[], m: (obj: T) => number): Observable<[number, number][]> {
    return from(ids).pipe(
      mergeMap(id => this.esi.getInformation<T>(info, id).pipe(map(obj => tuple(id, m(obj))))),
      toArray()
    );
  }

  private resolveIDs<T>(
    info: EsiInformationType,
    ids: [number, number][],
    m: (obj: T) => number
  ): Observable<[number, number][]> {
    return this.remapIDs(info, set(ids.map(([, v]) => v)), m).pipe(
      map(m => new Map(m)),
      map(m => ids.map(([id, v]) => tuple(id, m.get(v) as number)))
    );
  }
}
