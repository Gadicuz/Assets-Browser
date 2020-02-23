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
  EsiStructureInfo,
  EsiStationInfo,
  EsiOrder,
  EsiCharOrder,
  EsiMail,
  EsiWalletTransaction
} from './eve-esi.module';
export * from './eve-esi.module';

import { set, tuple } from '../../utils/utils';

export interface EsiDataTypeInfo {
  name: string;
  volume: number;
  packaged_volume?: number;
}

export interface EsiDataLocationInfo {
  name: string; // name
  type_id?: number; // type_id or 0/undefined
  type_info?: string; // type if !type_id
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
  public typesInfo: Map<number, EsiDataTypeInfo>;

  // MAP: type_id -> price
  public prices: Map<number, number>; // markets/prices/ -> Map()

  // characters/{character_id}/assets/
  public charAssets: EsiAssetsItem[];
  private max_item_id: number;

  public charOrders: EsiCharOrder[];

  public charWalletTransactions: EsiWalletTransaction[];

  // MAP: item_id -> name?
  public charAssetsNames: Map<number, string>;

  // MAP: (station_id|structure_id) -> {name, type_id, err}
  public locationsInfo: Map<number, EsiDataLocationInfo>;

  private missedIDs(ids: number[], knownIDs: IterableIterator<number>): number[] {
    return set(ids).filter(id => ![...knownIDs].includes(id));
  }

  constructor(private http: HttpClient, private esi: EsiService, private sso: EVESSOService) {
    this.typesInfo = null;
    this.prices = null;
    this.charAssets = null;
    this.max_item_id = 0;
    this.charOrders = null;
    this.charAssetsNames = new Map<number, string>();
    this.locationsInfo = new Map<number, EsiDataLocationInfo>([
      [0, { name: 'Universe', type_info: 'Tranquility' }],
      [EsiService.LOCATION_ID_AssetSafety, { name: 'Asset Safety', type_info: '' }]
    ]);
  }

  get character_id(): number {
    return this.sso.charId;
  }

  findCharAssetsItem(item_id: number): EsiAssetsItem {
    return this.charAssets && this.charAssets.find(item => item.item_id == item_id);
  }

  loadTypeInfo(ids: number[]): Observable<Map<number, EsiDataTypeInfo>> {
    return iif(
      () => !this.typesInfo,
      from(this.http.get('/assets/sde/universe-types.json') as Observable<[number, EsiDataTypeInfo][]>).pipe(
        map(obj => (this.typesInfo = new Map<number, EsiDataTypeInfo>(obj)))
      ),
      of(this.typesInfo)
    ).pipe(
      switchMap(typesInfo =>
        from(this.missedIDs(ids, typesInfo.keys())).pipe(
          mergeMap(type_id => this.esi.getTypeInformation(type_id)),
          map(type_info =>
            typesInfo.set(type_info.type_id, {
              name: type_info.name,
              volume: type_info.volume,
              packaged_volume: type_info.packaged_volume
            })
          ),
          reduce(acc => acc, typesInfo)
        )
      )
    );
  }

  loadPrices(reload?: boolean): Observable<Map<number, number>> {
    if (this.prices != null && !reload) return of(this.prices);
    return this.esi.listMarketPrices().pipe(
      map(prices => new Map<number, number>(prices.map(v => [v.type_id, v.average_price || v.adjusted_price || 0]))),
      tap(prices => (this.prices = prices))
    );
  }

  private resetCharacterAssetsItemId(): void {
    this.max_item_id = Math.max(...this.charAssets.map(item => item.item_id));
  }

  generateCharacterAssetsItemId(): number {
    return ++this.max_item_id;
  }

  loadCharacterAssets(reload?: boolean): Observable<EsiAssetsItem[]> {
    if (this.charAssets != null && !reload) {
      this.resetCharacterAssetsItemId();
      return of(this.charAssets);
    }
    return this.esi.getCharacterAssets(this.character_id).pipe(
      tap(assets => {
        this.charAssets = assets;
        this.resetCharacterAssetsItemId();
      })
    );
  }

  loadCharacterOrders(reload?: boolean): Observable<EsiCharOrder[]> {
    if (this.charOrders != null && !reload) return of(this.charOrders);
    return this.esi.getCharacterOrders(this.character_id, false).pipe(tap(orders => (this.charOrders = orders)));
  }

  loadCharacterWalletTransactions(reload?: boolean): Observable<EsiWalletTransaction[]> {
    if (this.charWalletTransactions != null && !reload) return of(this.charWalletTransactions);
    return this.esi
      .getCharacterWalletTransactions(this.character_id)
      .pipe(tap(transactions => (this.charWalletTransactions = transactions)));
  }

  loadCharacterAssetsNames(ids: number[]): Observable<null> {
    ids = this.missedIDs(ids, this.charAssetsNames.keys());
    if (ids.length == 0) return of(null); // all names resolved
    return concat(
      this.esi.getCharacterAssetNames(this.character_id, ids).pipe(
        tap(id_name => this.charAssetsNames.set(id_name.item_id, id_name.name != 'None' ? id_name.name : null)), // remove 'None' names
        ignoreElements()
      ),
      of(null)
    );
  }

  loadLocationsInfo(id_types: [number, string][]): Observable<Map<number, EsiDataLocationInfo>> {
    const types = new Map(id_types);
    const ids = this.missedIDs([...types.keys()], this.locationsInfo.keys());
    if (ids.length == 0) return of(this.locationsInfo);
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
              type_id: null,
              type_info: `ID = ${sID}`
            });
            return of(null);
        }
        return this.esi.getInformation<EsiSystemInfo | EsiStructureInfo | EsiStationInfo>(selector, sID).pipe(
          map(esiInfo => {
            return {
              name: esiInfo.name,
              type_id: type == 'solar_system' ? null : (esiInfo as EsiStructureInfo | EsiStationInfo).type_id,
              type_info: type == 'solar_system' ? 'Solar system' : null
            } as EsiDataLocationInfo;
          }),
          catchError((err: unknown) => {
            //            if (err.name == 'EsiError' ...
            if (err instanceof EsiError && err.status == 403)
              // some locations are 'forbidden'
              return of({
                name: `*** Forbidden '${type}' ***`,
                type_id: null,
                type_info: `ID = ${sID}`
              } as EsiDataLocationInfo); // err.error - server 403 error body
            return throwError(err);
          }),
          map(info => {
            this.locationsInfo.set(sID, info);
            return info.type_id;
          })
        );
      }),
      filter(id => !!id),
      toArray(),
      switchMap(ids => this.loadTypeInfo(ids)),
      mapTo(this.locationsInfo)
    );
  }

  private getCharacterMailHeadersFromId(mail_id: number, labels: number[], up_to_date: number): Observable<EsiMail[]> {
    return this.esi.getCharacterMailHeaders(this.character_id, labels, mail_id).pipe(
      map(mails => mails.filter(m => up_to_date == undefined || new Date(m.timestamp).getTime() > up_to_date)),
      takeWhile(mails => mails.length != 0)
    );
  }

  getCharacterMailHeaders(labels?: number[], up_to_date?: number): Observable<EsiMail> {
    return this.getCharacterMailHeadersFromId(undefined, labels, up_to_date).pipe(
      expand(mails =>
        mails.length < 50
          ? empty()
          : this.getCharacterMailHeadersFromId(Math.min(...mails.map(m => m.mail_id)), labels, up_to_date)
      ),
      mergeMap(mails => from(mails))
    );
  }

  private remapIDs<T>(ids: number[], type: string, field: string): Observable<number[]> {
    return from(ids).pipe(
      mergeMap(id => this.esi.getInformation<T>(type, id)),
      map(info => info[field]),
      distinct(),
      toArray()
    );
  }

  private getLocationRegions(locs: LocationOrdersTypes[]): Observable<number> {
    return merge(
      from(locs.map(loc => loc.region_id).filter(region_id => !!region_id)),
      of(set(locs.filter(loc => !loc.region_id).map(loc => loc.location_id))).pipe(
        mergeMap(loc_ids => this.remapIDs<EsiStationInfo>(loc_ids, 'stations', 'system_id')),
        mergeMap(sys_ids => this.remapIDs<EsiSystemInfo>(sys_ids, 'systems', 'constellation_id')),
        mergeMap(con_ids => this.remapIDs(con_ids, 'constellations', 'region_id')),
        mergeMap(reg_ids => from(reg_ids))
      )
    ).pipe(distinct());
  }

  private resolveIDs<T>(
    ids: [number, number][],
    type: string,
    fields: [string, string]
  ): Observable<[number, number][]> {
    return from(ids.map(([, id]) => id)).pipe(
      distinct(),
      mergeMap(id => this.esi.getInformation<T>(type, id)),
      map(info => tuple(info[fields[0]], info[fields[1]])),
      toArray(),
      map(arr => new Map(arr)),
      map(m => ids.map(([loc, id]) => [loc, m.get(id)]))
    );
  }

  private getRegionLocations(locs: LocationOrdersTypes[]): Observable<[number, LocationOrdersTypes[]]> {
    return of(locs.filter(loc => !loc.region_id).map(loc => tuple(loc.location_id, loc.location_id))).pipe(
      mergeMap(loc_ids => this.resolveIDs<EsiStationInfo>(loc_ids, 'stations', ['station_id', 'system_id'])),
      mergeMap(sys_ids => this.resolveIDs<EsiSystemInfo>(sys_ids, 'systems', ['system_id', 'constellation_id'])),
      mergeMap(con_ids => this.resolveIDs(con_ids, 'constellations', ['constellation_id', 'region_id'])),
      map(reg_ids => new Map(reg_ids)),
      tap(reg_map => locs.forEach(loc => (loc.region_id = loc.region_id || reg_map.get(loc.location_id)))),
      mergeMap(() =>
        from(locs.map(loc => loc.region_id)).pipe(
          distinct(),
          map(region_id =>
            tuple(
              region_id,
              locs.filter(loc => loc.region_id == region_id)
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
