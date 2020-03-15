import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, concat, defer, from, merge, of } from 'rxjs';
import { ignoreElements, map, mergeMap, switchMap, tap } from 'rxjs/operators';
import { mapGet } from '../../utils/utils';

import {
  EsiMarketOrderType,
  EsiWalletTransaction,
  EsiDataItem,
  EsiDataLocMarketTypes,
  EsiDataLocMarketOrders,
  EsiDataCharMarketOrder,
  EsiDataConstellationInfo,
  EsiDataPlanetInfo,
  EsiDataRegionInfo,
  EsiDataStationInfo,
  EsiDataStructureInfo,
  EsiDataSystemInfo,
  EsiDataTypeInfo,
  EsiDataService
} from './eve-esi-data.service';

import { autoMap, set, removeKeys } from '../../utils/utils';
import { EsiService } from './eve-esi.module';

@Injectable({
  providedIn: 'root'
})
export class EsiCacheService {
  constructor(private data: EsiDataService, private http: HttpClient) {}

  // characters/{character_id}/assets/
  // characters/{character_id}/assets/names/   - for is_singleton items only
  public characterItems = new Map<number, EsiDataItem>();
  public loadCharacterItems(): Observable<never> {
    return this.data.loadCharacterItems().pipe(
      tap(items => (this.characterItems = new Map(items.map(i => [i.item_id, i])))),
      mergeMap(items => this.data.loadCharacterItemNames(items.filter(i => i.is_singleton).map(i => i.item_id))),
      tap(names =>
        names.filter(n => n.name).forEach(n => ((this.characterItems.get(n.item_id) as EsiDataItem).name = n.name))
      ),
      ignoreElements()
    );
  }

  public constellationsInfo = new Map<number, EsiDataConstellationInfo>();
  public loadConstellationsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.constellationsInfo)).pipe(
      mergeMap(id => this.data.loadConstellationInfo(id).pipe(tap(i => this.constellationsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public planetsInfo = new Map<number, EsiDataPlanetInfo>();
  public loadPlanetsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.planetsInfo)).pipe(
      mergeMap(id => this.data.loadPlanetInfo(id).pipe(tap(i => this.planetsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public regionsInfo = new Map<number, EsiDataRegionInfo>();
  public loadRegionsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.regionsInfo)).pipe(
      mergeMap(id => this.data.loadRegionInfo(id).pipe(tap(i => this.regionsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public stationsInfo = new Map<number, EsiDataStationInfo>();
  public loadStationsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.stationsInfo)).pipe(
      mergeMap(id => this.data.loadStationInfo(id).pipe(tap(i => this.stationsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public structuresInfo = new Map<number, EsiDataStructureInfo>();
  public loadStructuresInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.structuresInfo)).pipe(
      mergeMap(id => this.data.loadStructureInfo(id).pipe(tap(i => this.structuresInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public systemsInfo = new Map<number, EsiDataSystemInfo>();
  public loadSystemsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.systemsInfo)).pipe(
      mergeMap(id => this.data.loadSystemInfo(id).pipe(tap(i => this.systemsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public typesInfo = new Map<number, EsiDataTypeInfo>();
  public loadTypesInfo(ids: number[]): Observable<never> {
    return this.getTypesInfo().pipe(
      switchMap(typesInfo =>
        from(removeKeys(ids, typesInfo)).pipe(
          mergeMap(id => this.data.loadTypeInfo(id).pipe(tap(info => typesInfo.set(id, info)))),
          ignoreElements()
        )
      )
    );
  }
  private getTypesInfo(): Observable<Map<number, EsiDataTypeInfo>> {
    return this.typesInfo == undefined
      ? this.http
          .get<[number, EsiDataTypeInfo][]>('/assets/sde/universe-types.json')
          .pipe(map(data => (this.typesInfo = new Map<number, EsiDataTypeInfo>(data))))
      : of(this.typesInfo);
  }

  /*
  // MAP: (location_id) -> EsiDataLocationInfo
  public locationsInfo = new Map<number, EsiDataLocationInfo>();
  public loadLocationsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.locationsInfo)).pipe(
      mergeMap(id =>
        this.data.loadLocationInfo(id).pipe(
          tap(info => this.locationsInfo.set(id, info)),
          filter(info => info.type === 'station' || info.type === 'structure'),
          map(info => (info as EsiDataStructureLocationInfo).type_id)
        )
      ),
      toArray(),
      switchMap(ids => this.loadTypesInfo(set(ids)))
    );
  }
  */

  // markets/prices/ -> MAP: type_id -> price
  public marketPrices = new Map<number, number>();
  public loadMarketPrices(): Observable<never> {
    return this.data.loadMarketPrices().pipe(
      tap(prices => (this.marketPrices = prices)),
      ignoreElements()
    );
  }

  public characterMarketOrders: EsiDataCharMarketOrder[] = [];
  public loadCharacterMarketOrders(): Observable<never> {
    return this.data.loadCharacterMarketOrders(undefined).pipe(
      tap(orders => (this.characterMarketOrders = orders)),
      ignoreElements()
    );
  }

  public loadStructuresMarketOrders(
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return merge(...locs.map(loc => this.data.loadStructureMarketOrders(loc, buy_sell)));
  }

  public loadStationsMarketOrders(
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return from(
      locs
        .reduce(
          autoMap(loc => this.getSCR(loc.l_id).reg),
          new Map<number, EsiDataLocMarketTypes[]>()
        )
        .entries()
    ).pipe(mergeMap(([r_id, r_locs]) => this.data.loadRegionMarketOrders(r_id, r_locs, buy_sell)));
  }

  public characterWalletTransactions: EsiWalletTransaction[] = [];
  public loadCharacterWalletTransactions(): Observable<never> {
    return this.data.loadCharacterWalletTransactions().pipe(
      tap(wt => (this.characterWalletTransactions = wt)),
      ignoreElements()
    );
  }

  /** Caches StructuresInfo, StationsInfo, SystemsInfo, ConstellationsInfo, RegionsInfo */
  public loadSSSCR(ssscr: {
    str?: number[];
    sta?: number[];
    sys?: number[];
    con?: number[];
    reg?: number[];
  }): Observable<never> {
    const str_ids = set(ssscr.str || []);
    const sta_ids = set(ssscr.sta || []);
    const sys_ids = ssscr.sys || [];
    const con_ids = ssscr.con || [];
    const reg_ids = ssscr.reg || [];
    let ids: number[];
    return concat(
      merge(this.loadStructuresInfo(str_ids), this.loadStationsInfo(sta_ids)),
      defer(() => {
        const sys_str = str_ids.map(id => mapGet(this.structuresInfo, id).solar_system_id).filter(id => id);
        const sys_sta = sta_ids.map(id => mapGet(this.stationsInfo, id).system_id);
        ids = set([...sys_ids, ...sys_str, ...sys_sta]);
        return this.loadSystemsInfo(ids);
      }),
      defer(() => {
        const con_sys = ids.map(id => mapGet(this.systemsInfo, id).constellation_id);
        ids = set([...con_ids, ...con_sys]);
        return this.loadConstellationsInfo(ids);
      }),
      defer(() => {
        const reg_con = ids.map(id => mapGet(this.constellationsInfo, id).region_id);
        ids = set([...reg_ids, ...reg_con]);
        return this.loadRegionsInfo(ids);
      })
    );
  }

  public getSCR(ss_id: number): { sys: number; con: number; reg: number } {
    const sys = EsiService.isStationId(ss_id)
      ? mapGet(this.stationsInfo, ss_id).system_id
      : mapGet(this.structuresInfo, ss_id).solar_system_id;
    const con = mapGet(this.systemsInfo, sys).constellation_id;
    const reg = mapGet(this.constellationsInfo, con).region_id;
    return { sys, con, reg };
  }
}
