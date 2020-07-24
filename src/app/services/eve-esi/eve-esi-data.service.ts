import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, empty, from, throwError } from 'rxjs';
import { catchError, expand, map, mergeMap, takeWhile, toArray } from 'rxjs/operators';

import { EsiService, EsiHttpErrorResponse, EsiMailRecipient, EsiMailHeader } from './eve-esi.module';

import {
  EsiItem,
  EsiInformation,
  EsiInfoSelector,
  EsiInfo,
  EsiMarketOrderState,
  EsiMarketOrderType,
  EsiMarketOrderCharacter,
  EsiMarketOrderStructure,
  EsiMarketOrderRegion,
  EsiWalletTransaction,
  EsiMarketOrderRange,
  EsiBlueprint,
} from './eve-esi.models';

import { autoMap, set, tuple } from '../../utils/utils';

export * from './eve-esi.models';

export interface EsiDataItemName {
  item_id: number;
  name: string | undefined;
}

export interface EsiDataBpd {
  me: number;
  te: number;
  copy?: number; // 0/undefined - original, >0 - copy
  in_use?: boolean;
}

export interface EsiDataItem extends EsiItem {
  name?: string;
  bpd?: EsiDataBpd;
}

type EsiDataInfoSelectors = 'structures' | 'types';
export type EsiDataInformation =
  | Exclude<EsiInformation, { selector: EsiDataInfoSelectors }>
  | { selector: 'structures'; data: EsiDataStructureInfo }
  | { selector: 'types'; data: EsiDataTypeInfo };

export type EsiDataInfo<T> = Extract<EsiDataInformation, { selector: T }>['data'];

interface EsiDataStructureInfo extends EsiInfo<'structures'> {
  structure_id: number;
  forbidden?: boolean;
}
interface EsiDataTypeInfo {
  name: string;
  volume?: number;
  packaged_volume?: number;
}

export interface EsiDataMarketOrder {
  order_id: number;
  buy_sell: EsiMarketOrderType;
  timestamp: number;
  location_id: number;
  range: EsiMarketOrderRange;
  duration: number;
  type_id: number;
  price: number;
  min_volume: number;
  volume_remain: number;
  volume_total: number;
  region_id?: number;
}

export interface EsiDataCharMarketOrder extends EsiDataMarketOrder {
  issued_by: number;
  is_corporation: boolean;
  escrow: number;
  wallet_division: number;
  status: EsiMarketOrderState | undefined;
}

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

export interface EsiIdName {
  id: number;
  name: string;
}

export interface EsiCharacterData {
  char: EsiIdName;
  corp: EsiIdName;
}

@Injectable({
  providedIn: 'root',
})
export class EsiDataService {
  private missedIDs(ids: number[], knownIDs: IterableIterator<number>): number[] {
    return set(ids).filter((id) => ![...knownIDs].includes(id));
  }

  constructor(private http: HttpClient, private esi: EsiService) {}

  public charData?: EsiCharacterData;
  private get charId(): number {
    if (this.charData == undefined) throw Error('Undefined character ID');
    return this.charData.char.id;
  }
  loadCharacterData(id$: Observable<number>): Observable<EsiCharacterData> {
    return id$.pipe(
      mergeMap((id) =>
        this.esi.getCharacter(id).pipe(
          mergeMap((ch) =>
            this.esi.getCorporation(ch.corporation_id).pipe(
              map((crp) => {
                const char = { id, name: ch.name };
                const corp = { id: ch.corporation_id, name: crp.name };
                return (this.charData = { char, corp });
              })
            )
          )
        )
      )
    );
  }

  // Generics extending unions cannot be narrowed #13995
  // https://github.com/microsoft/TypeScript/issues/13995
  //
  // This code, doesn't work. TS doesn't narrow 'T extends ...' parameter. Separate methods for EsiDataXXXInfo are implemented.
  //
  // loadInfo<T extends EsiInfoSelector>(selector: T, id: number): Observable<EsiDataInfo<T>> {
  //   if (selector === 'structures') ...
  //   else if (selector === 'types') ...
  //   else ...
  // }

  loadInfo<T extends Exclude<EsiInfoSelector, EsiDataInfoSelectors>>(selector: T, id: number): Observable<EsiInfo<T>> {
    return this.esi.getInformation<T>(selector, id);
  }

  loadBeltInfo = (id: number): Observable<EsiInfo<'asteroid_belts'>> => this.loadInfo('asteroid_belts', id);
  loadCategoryInfo = (id: number): Observable<EsiInfo<'categories'>> => this.loadInfo('categories', id);
  loadConstellationInfo = (id: number): Observable<EsiInfo<'constellations'>> => this.loadInfo('constellations', id);
  loadGroupInfo = (id: number): Observable<EsiInfo<'groups'>> => this.loadInfo('groups', id);
  loadMoonInfo = (id: number): Observable<EsiInfo<'moons'>> => this.loadInfo('moons', id);
  loadPlanetInfo = (id: number): Observable<EsiInfo<'planets'>> => this.loadInfo('planets', id);
  loadRegionInfo = (id: number): Observable<EsiInfo<'regions'>> => this.loadInfo('regions', id);
  loadStationInfo = (id: number): Observable<EsiInfo<'stations'>> => this.loadInfo('stations', id);
  loadStargateInfo = (id: number): Observable<EsiInfo<'stargates'>> => this.loadInfo('stargates', id);
  loadStructureInfo(id: number): Observable<EsiDataStructureInfo> {
    return this.esi.getInformation('structures', id).pipe(
      map((info) => ({
        ...info,
        structure_id: id,
      })),
      catchError((err: unknown) => {
        // some structures IDs are 'forbidden', status == 403
        if (err instanceof EsiHttpErrorResponse && err.status == 403)
          return of({
            name: '',
            owner_id: 0,
            solar_system_id: 0,
            structure_id: id,
            forbidden: true,
          });
        return throwError(err);
      })
    );
  }
  loadSystemInfo = (id: number): Observable<EsiInfo<'systems'>> => this.loadInfo('systems', id);
  loadTypeInfo(id: number): Observable<EsiDataTypeInfo> {
    return this.esi.getInformation('types', id).pipe(
      map((info) => ({
        name: info.name,
        volume: info.volume,
        packaged_volume: info.packaged_volume,
      }))
    );
  }

  loadCharacterItems(): Observable<EsiItem[]> {
    return this.esi.getCharacterItems(this.charId);
  }

  loadCharacterItemNames(ids: number[]): Observable<EsiDataItemName[]> {
    return this.esi.getCharacterItemNames(this.charId, ids).pipe(
      map((names) =>
        names.map((n) => ({
          item_id: n.item_id,
          name: n.name === 'None' ? undefined : n.name,
        }))
      )
    );
  }

  loadMarketPrices(): Observable<Map<number, number>> {
    return this.esi
      .listMarketPrices()
      .pipe(
        map(
          (prices) => new Map<number, number>(prices.map((v) => [v.type_id, v.average_price || v.adjusted_price || 0]))
        )
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
      issued_by: this.charId,
      is_corporation: o.is_corporation,
      escrow: o.escrow || 0,
      wallet_division: 0,
      status,
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
      region_id: undefined,
    };
  }

  loadCharacterMarketOrders(buy_sell?: EsiMarketOrderType): Observable<EsiDataCharMarketOrder[]> {
    return this.esi
      .getCharacterOrders(this.charId)
      .pipe(map((orders) => orders.map((o) => this.fromEsiMarketOrderCharacter(o)).filter(fltBuySellUnk(buy_sell))));
  }

  loadStructureMarketOrders(
    loc: EsiDataLocMarketTypes,
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return this.esi.getStructureOrders(loc.l_id).pipe(
      map((orders) =>
        orders
          .map((o) => this.fromEsiMarketOrderStructureOrRegion(o))
          .filter(fltBuySellUnk(buy_sell))
          .reduce(
            autoMap((ord) => ord.type_id, loc.types),
            new Map<number, EsiDataMarketOrder[]>()
          )
      ),
      map((orders) => ({ l_id: loc.l_id, orders }))
    );
  }

  loadRegionMarketOrders(
    reg: number,
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return this.esi.getRegionOrdersEx(reg, EsiDataService.pluckLocMarketTypes(locs), buy_sell).pipe(
      toArray(),
      mergeMap((r_orders) =>
        from(locs).pipe(
          map((loc) => ({
            l_id: loc.l_id,
            orders: new Map(
              r_orders
                .filter(([t_id]) => loc.types.includes(t_id)) // remove type_id
                .map(([t_id, t_orders]) =>
                  tuple(
                    t_id,
                    t_orders
                      .filter((o) => o.location_id === loc.l_id) // remove locations
                      .map((o) => this.fromEsiMarketOrderStructureOrRegion(o))
                  )
                )
            ),
          }))
        )
      )
    );
  }

  loadCharacterBlueprints(): Observable<EsiBlueprint[]> {
    return this.esi.getCharacterBlueprints(this.charId);
  }

  loadCharacterWalletTransactions(): Observable<EsiWalletTransaction[]> {
    return this.esi.getCharacterWalletTransactions(this.charId);
  }

  private static convertEsiDataMailHeader(h: EsiMailHeader): EsiDataMailHeader {
    return {
      mail_id: h.mail_id,
      from: h.from,
      recipients: h.recipients,
      subject: h.subject,
      timestamp: new Date(h.timestamp).getTime(),
      labels: h.labels,
      is_read: h.is_read,
    };
  }

  private getCharacterMailHeadersFromId(
    mail_id: number | undefined,
    labels: number[] | undefined,
    up_to_date = 0
  ): Observable<EsiDataMailHeader[]> {
    return this.esi.getCharacterMailHeaders(this.charId, labels, mail_id).pipe(
      map((headers) =>
        headers.map((h) => EsiDataService.convertEsiDataMailHeader(h)).filter((h) => h.timestamp >= up_to_date)
      ),
      takeWhile((headers) => headers.length > 0) // ???
    );
  }

  getCharacterMailHeaders(labels?: number[], up_to_date?: number): Observable<EsiDataMailHeader> {
    return this.getCharacterMailHeadersFromId(undefined, labels, up_to_date).pipe(
      expand((headers) =>
        headers.length < 50
          ? empty()
          : this.getCharacterMailHeadersFromId(Math.min(...headers.map((h) => h.mail_id)), labels, up_to_date)
      ),
      mergeMap((headers) => from(headers))
    );
  }
}
