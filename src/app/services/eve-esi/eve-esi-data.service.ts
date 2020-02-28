import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, empty, concat, merge, iif, from, throwError } from 'rxjs';
import {
  map,
  expand,
  tap,
  distinct,
  switchMap,
  mergeMap,
  reduce,
  takeWhile,
  filter,
  mapTo,
  toArray,
  catchError,
  ignoreElements
} from 'rxjs/operators';

import { EVESSOService } from '../eve-sso/eve-sso.module';
import {
  EsiService,
  EsiError,
  EsiAssetsItem,
  EsiSystemInfo,
  EsiConstellationInfo,
  EsiStructureInfo,
  EsiStationInfo,
  EsiOrder,
  EsiCharOrder,
  EsiMailRecipient,
  EsiMailHeader,
  EsiWalletTransaction
} from './eve-esi.module';
export * from './eve-esi.module';

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

export interface EsiDataTypeInfo {
  name: string;
  volume?: number;
  packaged_volume?: number;
}

export interface EsiDataLocationInfo {
  name: string; // name
  type_id?: number; // type_id or undefined
  type_info?: string; // type if type_id == undefined
}

export type TypeOrders = Map<number, EsiOrder[]>;

export interface LocationOrdersTypes {
  location_id: number;
  types: number[];
  region_id?: number;
}

export interface LocationOrders {
  location_id: number;
  orders: TypeOrders;
}

@Injectable({
  providedIn: 'root'
})
export class EsiDataService {
  // MAP: type_id -> {name, volume, packaged_volume?}
  public typesInfo = new Map<number, EsiDataTypeInfo>();

  // markets/prices/ -> MAP: type_id -> price
  private _prices?: Map<number, number>;
  public get prices(): Map<number, number> {
    if (this._prices == undefined) throw Error('EsiDataService.prices() undefined');
    return this._prices;
  }

  // characters/{character_id}/assets/
  private _charAssets?: EsiAssetsItem[];
  public get charAssets(): EsiAssetsItem[] {
    if (this._charAssets == undefined) throw Error('EsiDataService.charAssets() undefined');
    return this._charAssets;
  }
  private maxItemId = 0;
  // MAP: item_id -> name?
  public charAssetsNames = new Map<number, string | undefined>();

  private _charOrders?: EsiCharOrder[];
  public get charOrders(): EsiCharOrder[] {
    if (this._charOrders == undefined) throw Error('EsiDataService.charOrders() undefined');
    return this._charOrders;
  }

  private _charWalletTransactions?: EsiWalletTransaction[];
  public get charWalletTransactions(): EsiWalletTransaction[] {
    if (this._charWalletTransactions == undefined) throw Error('EsiDataService.charWalletTransactions() undefined');
    return this._charWalletTransactions;
  }

  // MAP: (station_id|structure_id) -> {name, type_id, err}
  public locationsInfo: Map<number, EsiDataLocationInfo>;

  private missedIDs(ids: number[], knownIDs: IterableIterator<number>): number[] {
    return set(ids).filter(id => ![...knownIDs].includes(id));
  }

  constructor(private http: HttpClient, private esi: EsiService, private sso: EVESSOService) {
    this.locationsInfo = new Map<number, EsiDataLocationInfo>([
      [0, { name: 'Universe', type_info: 'Tranquility' }],
      [EsiService.LOCATION_ID_AssetSafety, { name: 'Asset Safety', type_info: '' }]
    ]);
  }

  private get character_id(): number {
    const idn = this.sso.charIdName;
    if (idn == undefined) throw Error('Undefined character_id');
    return idn.id;
  }

  findCharAssetsItem(item_id: number): EsiAssetsItem | undefined {
    return this.charAssets.find(item => item.item_id == item_id);
  }

  loadTypeInfo(ids: number[]): Observable<Map<number, EsiDataTypeInfo>> {
    return iif(
      () => !this.typesInfo.size,
      from(this.http.get<[number, EsiDataTypeInfo][]>('/assets/sde/universe-types.json')).pipe(
        map(obj => (this.typesInfo = new Map<number, EsiDataTypeInfo>(obj)))
      ),
      of(this.typesInfo)
    ).pipe(
      switchMap(typesInfo =>
        from(this.missedIDs(ids, typesInfo.keys())).pipe(
          mergeMap(type_id => this.esi.getTypeInformation(type_id)),
          map(type_info => typesInfo.set(type_info.type_id, type_info)),
          reduce(acc => acc, typesInfo)
        )
      )
    );
  }

  loadPrices(reload?: boolean): Observable<Map<number, number>> {
    if (this._prices != undefined && !reload) return of(this._prices);
    return this.esi.listMarketPrices().pipe(
      map(prices => new Map<number, number>(prices.map(v => [v.type_id, v.average_price || v.adjusted_price || 0]))),
      tap(prices => (this._prices = prices))
    );
  }

  private initCharacterAssetsItemId(assets: EsiAssetsItem[]): EsiAssetsItem[] {
    this.maxItemId = Math.max(...assets.map(item => item.item_id));
    return (this._charAssets = assets);
  }

  generateCharacterAssetsItemId(): number {
    return ++this.maxItemId;
  }

  loadCharacterAssets(reload?: boolean): Observable<EsiAssetsItem[]> {
    if (this._charAssets != undefined && !reload) return of(this.initCharacterAssetsItemId(this._charAssets));
    return this.esi.getCharacterAssets(this.character_id).pipe(tap(assets => this.initCharacterAssetsItemId(assets)));
  }

  loadCharacterOrders(reload?: boolean): Observable<EsiCharOrder[]> {
    if (this._charOrders != undefined && !reload) return of(this._charOrders);
    return this.esi.getCharacterOrders(this.character_id, false).pipe(tap(orders => (this._charOrders = orders)));
  }

  loadCharacterWalletTransactions(reload?: boolean): Observable<EsiWalletTransaction[]> {
    if (this._charWalletTransactions != undefined && !reload) return of(this._charWalletTransactions);
    return this.esi
      .getCharacterWalletTransactions(this.character_id)
      .pipe(tap(transactions => (this._charWalletTransactions = transactions)));
  }

  loadCharacterAssetsNames(ids: number[]): Observable<never> {
    return this.esi.getCharacterAssetNames(this.character_id, this.missedIDs(ids, this.charAssetsNames.keys())).pipe(
      map(id_name => ({
        item_id: id_name.item_id,
        name: id_name.name !== 'None' ? id_name.name : undefined // remove 'None' names
      })),
      tap(id_name => this.charAssetsNames.set(id_name.item_id, id_name.name)),
      ignoreElements()
    );
  }

  loadLocationsInfo(id_types: [number, string][]): Observable<Map<number, EsiDataLocationInfo>> {
    const types = new Map(id_types);
    const ids = this.missedIDs([...types.keys()], this.locationsInfo.keys());
    //    if (ids.length == 0) return of(this.locationsInfo);
    return from(ids).pipe(
      mergeMap(sID => {
        const type = types.get(sID) || EsiService.getAssetLocationType(sID);
        let selector;
        switch (type) {
          case 'solar_system':
            selector = 'systems';
            break;
          case 'station':
            selector = 'stations';
            break;
          case 'other':
            selector = 'structures';
            break;
          default:
            this.locationsInfo.set(sID, {
              name: `*** Unknown '${type}' ***`,
              type_info: `ID = ${sID}`
            });
            return empty();
        }
        return this.esi.getInformation<EsiSystemInfo | EsiStructureInfo | EsiStationInfo>(selector, sID).pipe(
          map(esiInfo => {
            return (type === 'solar_system'
              ? {
                  name: esiInfo.name,
                  type_info: 'Solar system'
                }
              : {
                  name: esiInfo.name,
                  type_id: (esiInfo as EsiStructureInfo | EsiStationInfo).type_id
                }) as EsiDataLocationInfo;
          }),
          catchError((err: unknown) => {
            //            if (err.name == 'EsiError' ...
            if (err instanceof EsiError && err.status == 403)
              // some locations are 'forbidden'
              return of({
                name: `*** Forbidden '${type}' ***`,
                type_info: `ID = ${sID}`
              } as EsiDataLocationInfo); // err.error - server 403 error body
            return throwError(err);
          }),
          tap(info => this.locationsInfo.set(sID, info)),
          filter(info => info.type_id != undefined),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          map(info => info.type_id!)
        );
      }),
      toArray(),
      switchMap(ids => this.loadTypeInfo(ids)),
      mapTo(this.locationsInfo)
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

  private remapIDs<T>(ids: number[], type: string, m: (obj: T) => number): Observable<number[]> {
    return from(ids).pipe(
      mergeMap(id => this.esi.getInformation<T>(type, id).pipe(map(info => m(info)))),
      distinct(),
      toArray()
    );
  }

  private getLocationRegions(locs: LocationOrdersTypes[]): Observable<number> {
    return merge(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      from(locs.filter(loc => loc.region_id).map(loc => loc.region_id!)),
      of(set(locs.filter(loc => !loc.region_id).map(loc => loc.location_id))).pipe(
        mergeMap(loc_ids => this.remapIDs<EsiStationInfo>(loc_ids, 'stations', s => s.system_id)),
        mergeMap(sys_ids => this.remapIDs<EsiSystemInfo>(sys_ids, 'systems', s => s.constellation_id)),
        mergeMap(con_ids => this.remapIDs<EsiConstellationInfo>(con_ids, 'constellations', c => c.region_id)),
        mergeMap(reg_ids => from(reg_ids))
      )
    ).pipe(distinct());
  }

  private resolveIDs<T>(
    ids: [number, number][],
    type: string,
    r: (obj: T) => [number, number]
  ): Observable<[number, number][]> {
    return from(set(ids.map(([, id]) => id))).pipe(
      mergeMap(id => this.esi.getInformation<T>(type, id)),
      map(info => r(info)), //tuple(info[fields[0]], info[fields[1]])),
      toArray(),
      map(arr => new Map(arr)),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      map(m => ids.map(([loc, id]) => [loc, m.get(id)!]))
    );
  }

  private getRegionLocations(locs: LocationOrdersTypes[]): Observable<[number, LocationOrdersTypes[]]> {
    return of(locs.filter(loc => !loc.region_id).map(loc => tuple(loc.location_id, loc.location_id))).pipe(
      mergeMap(loc_ids => this.resolveIDs<EsiStationInfo>(loc_ids, 'stations', s => [s.station_id, s.system_id])),
      mergeMap(sys_ids => this.resolveIDs<EsiSystemInfo>(sys_ids, 'systems', s => [s.system_id, s.constellation_id])),
      mergeMap(con_ids =>
        this.resolveIDs<EsiConstellationInfo>(con_ids, 'constellations', c => [c.constellation_id, c.region_id])
      ),
      map(reg_ids => new Map(reg_ids)),
      tap(reg_map => locs.filter(loc => !loc.region_id).forEach(loc => (loc.region_id = reg_map.get(loc.location_id)))),
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      mapTo(set(locs.map(loc => loc.region_id!))),
      switchMap(r_ids =>
        from(r_ids).pipe(
          map(r_id =>
            tuple(
              r_id,
              locs.filter(loc => loc.region_id == r_id)
            )
          )
        )
      )
    );
  }

  loadStationOrders(locs: LocationOrdersTypes[]): Observable<LocationOrders> {
    return this.getRegionLocations(locs).pipe(
      mergeMap(([region_id, region_locs]) =>
        this.esi
          .getRegionOrdersEx(region_id, set(region_locs.map(loc => loc.types).reduce((s, t) => [...s, ...t])), 'sell')
          .pipe(
            toArray(),
            mergeMap(region_orders =>
              from(region_locs).pipe(
                map(region_loc => ({
                  location_id: region_loc.location_id,
                  orders: new Map(
                    region_orders
                      .map(([type_id, orders]) =>
                        tuple(
                          type_id,
                          orders.filter(o => o.location_id == region_loc.location_id)
                        )
                      )
                      .filter(([, orders]) => orders.length)
                  )
                }))
              )
            )
          )
      )
    );
  }

  loadStructureOrders(locs: LocationOrdersTypes[]): Observable<LocationOrders> {
    return from(locs).pipe(
      mergeMap(loc =>
        this.esi.getStructureOrdersEx(loc.location_id, loc.types, 'sell').pipe(
          toArray(),
          map(type_orders => ({ location_id: loc.location_id, orders: new Map(type_orders) }))
        )
      )
    );
  }

  loadOrders(locs: LocationOrdersTypes[]): Observable<LocationOrders> {
    const loc_ids = locs.map(loc => loc.location_id);
    const typ_ids = locs.map(loc => loc.types).reduce((s, a) => [...s, ...a], []);
    return concat(
      merge(
        this.loadLocationsInfo(loc_ids.map(id => [id, EsiService.getAssetLocationType(id)])),
        this.loadTypeInfo(typ_ids)
      ).pipe(ignoreElements()),
      merge(
        this.loadStationOrders(locs.filter(loc => EsiService.isLocationLocID(loc.location_id))),
        this.loadStructureOrders(locs.filter(loc => !EsiService.isLocationLocID(loc.location_id)))
      )
    );
  }
}
