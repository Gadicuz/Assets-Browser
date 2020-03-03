import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, empty, merge, from, throwError } from 'rxjs';
import { catchError, expand, filter, map, mergeMap, takeWhile, toArray } from 'rxjs/operators';

import { EVESSOService } from '../eve-sso/eve-sso.module';
import { EsiService, EsiError, EsiMailRecipient, EsiMailHeader } from './eve-esi.module';

import {
  EsiItem,
  EsiInformationType,
  EsiMarketOrderState,
  EsiMarketOrderType,
  EsiMarketOrderCharacter,
  EsiMarketOrderStructure,
  EsiMarketOrderRegion,
  EsiSystemInfo,
  EsiConstellationInfo,
  EsiStructureInfo,
  EsiStationInfo,
  EsiWalletTransaction,
  EsiDataTypeInfo,
  EsiDataItemName,
  EsiDataMarketOrder,
  EsiDataCharMarketOrder
} from './eve-esi.models';

export * from './eve-esi.models';

import { set, tuple } from '../../utils/utils';

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

export interface EsiDataLocationInfo {
  name: string; // name
  type_id?: number; // type_id or undefined
  type_info?: string; // type if type_id == undefined
}

export interface EsiDataLocMarketTypes {
  l_id: number;
  types: number[];
}

export function pluckLocMarketTypes(locs: EsiDataLocMarketTypes[]): number[] {
  return set(locs.reduce<number[]>((s, x) => [...s, ...x.types], []));
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

/**
 * maps data array to input keys
 * @param data data array
 * @param p checks if data item x is mapped to a key value k
 */
export function asKeys<K, T>(data: T[], p: (k: K, x: T) => boolean): (k: K) => [K, T[]] {
  return (key): [K, T[]] =>
    tuple(
      key,
      data.filter(x => p(key, x))
    );
}

@Injectable({
  providedIn: 'root'
})
export class EsiDataService {
  private missedIDs(ids: number[], knownIDs: IterableIterator<number>): number[] {
    return set(ids).filter(id => ![...knownIDs].includes(id));
  }

  constructor(private http: HttpClient, private esi: EsiService, private sso: EVESSOService) {}

  private get character_id(): number {
    const idn = this.sso.charIdName;
    if (idn == undefined) throw Error('Undefined character_id');
    return idn.id;
  }

  loadTypeInformation(id: number): Observable<EsiDataTypeInfo> {
    return this.esi.getTypeInformation(id).pipe(
      map(info => ({
        name: info.name,
        volume: info.volume,
        packaged_volume: info.packaged_volume
      }))
    );
  }

  loadCharacterItems(): Observable<EsiItem[]> {
    return this.esi.getCharacterItems(this.character_id);
  }

  loadCharacterItemNames(ids: number[]): Observable<EsiDataItemName> {
    return this.esi.getCharacterItemNames(this.character_id, ids).pipe(
      filter(itemName => itemName.name !== 'None'),
      map(itemName => tuple(itemName.item_id, itemName.name))
    );
  }

  loadMarketPrices(): Observable<Map<number, number>> {
    return this.esi
      .listMarketPrices()
      .pipe(
        map(prices => new Map<number, number>(prices.map(v => [v.type_id, v.average_price || v.adjusted_price || 0])))
      );
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
      issued_by: this.character_id,
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
      .getCharacterOrders(this.character_id)
      .pipe(map(orders => orders.map(o => this.fromEsiMarketOrderCharacter(o)).filter(fltBuySellUnk(buy_sell))));
  }

  loadStructuresMarketOrders(
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return merge(
      ...locs.map(loc =>
        this.esi.getStructureOrders(loc.l_id).pipe(
          map(orders => orders.map(o => this.fromEsiMarketOrderStructureOrRegion(o)).filter(fltBuySellUnk(buy_sell))),
          map(orders => ({
            l_id: loc.l_id,
            orders: new Map(loc.types.map(asKeys(orders, (id, o) => id === o.type_id)))
          }))
        )
      )
    );
  }

  loadStationsMarketOrders(
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return this.separateStations(locs).pipe(
      mergeMap(([r_id, r_locs]) =>
        this.esi.getRegionOrdersEx(r_id, pluckLocMarketTypes(r_locs), buy_sell).pipe(
          toArray(),
          mergeMap(r_orders =>
            from(r_locs).pipe(
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
        )
      )
    );
  }

  loadCharacterWalletTransactions(): Observable<EsiWalletTransaction[]> {
    return this.esi.getCharacterWalletTransactions(this.character_id);
  }

  loadLocationInfo(id: number): Observable<EsiDataLocationInfo> {
    const locType = EsiService.getLocationTypeById(id);
    const selector = {
      solar_system: 'systems',
      station: 'stations',
      other: 'structures',
      asset_safety: undefined
    }[locType] as EsiInformationType;
    if (selector == undefined)
      return of({
        name: `*** Unknown '${locType}' ***`,
        type_id: undefined,
        type_info: `ID = ${id}`
      });
    return this.esi.getInformation<EsiSystemInfo | EsiStructureInfo | EsiStationInfo>(selector, id).pipe(
      map(esiInfo =>
        locType === 'solar_system'
          ? {
              name: esiInfo.name,
              type_id: undefined,
              type_info: 'Solar system'
            }
          : {
              name: esiInfo.name,
              type_id: (esiInfo as EsiStructureInfo | EsiStationInfo).type_id,
              type_info: undefined
            }
      ),
      catchError((err: unknown) => {
        //            if (err.name == 'EsiError' ...
        if (err instanceof EsiError && err.status == 403)
          // some location IDs are 'forbidden'
          return of({
            name: `*** Forbidden '${locType}' ***`,
            type_id: undefined,
            type_info: `ID = ${id}`
          }); // err.error - server 403 error body
        return throwError(err);
      })
    );
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
    return this.esi.getCharacterMailHeaders(this.character_id, labels, mail_id).pipe(
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

  /**
   * Returns stations grouped by regions
   * @param locs
   */
  private separateStations(locs: EsiDataLocMarketTypes[]): Observable<[number, EsiDataLocMarketTypes[]]> {
    return of(locs.map(loc => tuple(loc.l_id, loc.l_id))).pipe(
      mergeMap(loc_sta => this.resolveIDs<EsiStationInfo>('stations', loc_sta, sta => sta.system_id)),
      mergeMap(loc_sys => this.resolveIDs<EsiSystemInfo>('systems', loc_sys, sys => sys.constellation_id)),
      mergeMap(loc_con => this.resolveIDs<EsiConstellationInfo>('constellations', loc_con, con => con.region_id)),
      mergeMap(loc_reg => {
        const r_ids = set(loc_reg.map(([, v]) => v));
        const l_map = new Map(loc_reg);
        return from(r_ids.map(asKeys(locs, (id, loc) => id === (l_map.get(loc.l_id) as number))));
      })
    );
  }

  loadMarketOrders(locs: EsiDataLocMarketTypes[], buy_sell?: EsiMarketOrderType): Observable<EsiDataLocMarketOrders> {
    const ids = locs.reduce<EsiDataLocMarketTypes[][]>(
      (s, x) => {
        s[EsiService.isStationId(x.l_id) ? 1 : 0].push(x);
        return s;
      },
      [[], []]
    );
    return merge(this.loadStationsMarketOrders(ids[1], buy_sell), this.loadStructuresMarketOrders(ids[0], buy_sell));
  }
}
