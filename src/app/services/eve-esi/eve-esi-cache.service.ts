import { Injectable } from '@angular/core';
import { Observable, concat, defer, from, merge, of } from 'rxjs';
import {
  bufferCount,
  delay,
  ignoreElements,
  map,
  mergeMap,
  publish,
  refCount,
  switchMap,
  tap,
  publishLast,
} from 'rxjs/operators';
import { mapGet } from '../../utils/utils';

import {
  EsiMarketOrderType,
  EsiWalletTransaction,
  EsiDataItem,
  EsiDataLocMarketTypes,
  EsiDataLocMarketOrders,
  EsiDataCharMarketOrder,
  EsiDataService,
  EsiDataInfo,
  isStationId,
} from './eve-esi-data.service';

import { autoMap, set, removeKeys } from '../../utils/utils';
import { SdeService } from '../eve-sde/eve-sde-service';

type EsiDataItems = Map<number, EsiDataItem>;

@Injectable({
  providedIn: 'root',
})
export class EsiCacheService {
  constructor(private data: EsiDataService, sde: SdeService) {
    this.getTypesInfo$ = sde.loadTypes('en').pipe(
      map((data) => {
        this.typesInfo = new Map<number, EsiDataInfo<'types'>>(
          data.map((d) => [
            d.typeID,
            {
              group_id: d.groupID,
              name: d.name,
              volume: d.volume,
              packaged_volume: d.packaged,
            },
          ])
        );
        this.getTypesInfo$ = of(this.typesInfo);
        return this.typesInfo;
      }),
      publishLast(),
      refCount()
    );
  }

  private _loadItems(subj_id: number): Observable<EsiDataItems> {
    return this.data.loadItems(subj_id).pipe(map((items) => new Map(items.map((i) => [i.item_id, i]))));
  }

  private _loadNames(subj_id: number, items: EsiDataItems): Observable<EsiDataItems> {
    return this.data.loadItemNames(subj_id, this.data.getNameApplicableIDs([...items.values()])).pipe(
      map((names) => {
        names.filter((n) => n.name).forEach((n) => ((items.get(n.item_id) as EsiDataItem).name = n.name));
        return items;
      })
    );
  }

  private _loadBlueprints(subj_id: number, items: EsiDataItems): Observable<EsiDataItems> {
    return this.data.loadBlueprints(subj_id).pipe(
      map((bps) => {
        bps.forEach((bp) => {
          let item = items.get(bp.item_id);
          const in_use = item == undefined;
          if (!item)
            items.set(
              bp.item_id,
              (item = {
                // Add currently used blueprints
                is_blueprint_copy: bp.quantity === -2,
                is_singleton: true,
                item_id: bp.item_id,
                location_id: bp.location_id,
                location_flag: 'ServiceFacility', //bp.location_flag,
                location_type: 'other',
                type_id: bp.type_id,
                quantity: bp.quantity > 0 ? bp.quantity : 1,
              })
            );
          item.name = ''; //`${bp.runs}/${bp.material_efficiency}/${bp.time_efficiency}`; // unique name
          item.bp_data = {
            runs: bp.runs > 0 ? bp.runs : undefined,
            me: bp.material_efficiency,
            te: bp.time_efficiency,
            in_use,
          };
        });
        return items;
      })
    );
  }

  // characters/{character_id}/assets/
  // characters/{character_id}/assets/names/   - for is_singleton items only
  // characters/{character_id}/blueprints/
  public entityItems = new Map<number, EsiDataItems>();
  public loadItems(subj_id: number): Observable<EsiDataItems> {
    return this._loadItems(subj_id).pipe(
      mergeMap((items) => this._loadNames(subj_id, items)),
      mergeMap((items) => this._loadBlueprints(subj_id, items).pipe(this.data.scoped(items))),
      tap((items) => this.entityItems.set(subj_id, items))
    );
  }

  public constellationsInfo = new Map<number, EsiDataInfo<'constellations'>>();
  public loadConstellationsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.constellationsInfo)).pipe(
      mergeMap((id) => this.data.loadConstellationInfo(id).pipe(tap((i) => this.constellationsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public planetsInfo = new Map<number, EsiDataInfo<'planets'>>();
  public loadPlanetsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.planetsInfo)).pipe(
      mergeMap((id) => this.data.loadPlanetInfo(id).pipe(tap((i) => this.planetsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public regionsInfo = new Map<number, EsiDataInfo<'regions'>>();
  public loadRegionsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.regionsInfo)).pipe(
      mergeMap((id) => this.data.loadRegionInfo(id).pipe(tap((i) => this.regionsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public stationsInfo = new Map<number, EsiDataInfo<'stations'>>();
  public loadStationsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.stationsInfo)).pipe(
      mergeMap((id) => this.data.loadStationInfo(id).pipe(tap((i) => this.stationsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public structuresInfo = new Map<number, EsiDataInfo<'structures'>>();
  public loadStructuresInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.structuresInfo)).pipe(
      mergeMap((id) => this.data.loadStructureInfo(id).pipe(tap((i) => this.structuresInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public systemsInfo = new Map<number, EsiDataInfo<'systems'>>();
  public loadSystemsInfo(ids: number[]): Observable<never> {
    return from(removeKeys(ids, this.systemsInfo)).pipe(
      mergeMap((id) => this.data.loadSystemInfo(id).pipe(tap((i) => this.systemsInfo.set(id, i)))),
      ignoreElements()
    );
  }

  public typesInfo = new Map<number, EsiDataInfo<'types'>>();
  private getTypesInfo$: Observable<Map<number, EsiDataInfo<'types'>>>;
  public loadTypesInfo(ids: number[]): Observable<never> {
    return this.getTypesInfo$.pipe(
      switchMap((typesInfo) =>
        from(removeKeys(ids, typesInfo)).pipe(
          delay(0),
          mergeMap((id) => this.data.loadTypeInfo(id).pipe(tap((info) => typesInfo.set(id, info)))),
          ignoreElements()
        )
      )
    );
  }
  private tidSet = new Set<number>();
  private tidObservable$ = new Observable<never>();
  public loadTypeInfo(id: number): Observable<never> {
    if (this.tidSet.size) this.tidSet.add(id);
    else {
      this.tidSet = new Set<number>([id]);
      this.tidObservable$ = new Observable<number>((subscriber) => {
        const ids = this.tidSet;
        this.tidSet = new Set<number>();
        ids.forEach((id) => subscriber.next(id));
        subscriber.complete();
      }).pipe(
        bufferCount(8),
        //delay(0),
        mergeMap((ids) => this.loadTypesInfo(ids)),
        publish<never>(), // TS2322: Type 'Observable<any>' is not assignable to type 'Observable<never>'
        refCount()
      );
    }
    return this.tidObservable$;
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
      tap((prices) => (this.marketPrices = prices)),
      ignoreElements()
    );
  }

  public entityMarketOrders = new Map<number, EsiDataCharMarketOrder[]>();
  public loadMarketOrders(subj_id: number): Observable<EsiDataCharMarketOrder[]> {
    return this.data
      .loadMarketOrders(subj_id, undefined)
      .pipe(tap((orders) => this.entityMarketOrders.set(subj_id, orders)));
  }

  public loadStructuresMarketOrders(
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return merge(...locs.map((loc) => this.data.loadStructureMarketOrders(loc, buy_sell)));
  }

  public loadStationsMarketOrders(
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return from(
      locs
        .reduce(
          autoMap((loc) => this.getSCR(loc.l_id).reg),
          new Map<number, EsiDataLocMarketTypes[]>()
        )
        .entries()
    ).pipe(mergeMap(([r_id, r_locs]) => this.data.loadRegionMarketOrders(r_id, r_locs, buy_sell)));
  }

  public characterWalletTransactions: EsiWalletTransaction[] = [];
  public loadCharacterWalletTransactions(character_id: number): Observable<never> {
    return this.data.loadCharacterWalletTransactions(character_id).pipe(
      tap((wt) => (this.characterWalletTransactions = wt)),
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
        const sys_str = str_ids.map((id) => mapGet(this.structuresInfo, id).solar_system_id).filter((id) => id);
        const sys_sta = sta_ids.map((id) => mapGet(this.stationsInfo, id).system_id);
        ids = set([...sys_ids, ...sys_str, ...sys_sta]);
        return this.loadSystemsInfo(ids);
      }),
      defer(() => {
        const con_sys = ids.map((id) => mapGet(this.systemsInfo, id).constellation_id);
        ids = set([...con_ids, ...con_sys]);
        return this.loadConstellationsInfo(ids);
      }),
      defer(() => {
        const reg_con = ids.map((id) => mapGet(this.constellationsInfo, id).region_id);
        ids = set([...reg_ids, ...reg_con]);
        return this.loadRegionsInfo(ids);
      })
    );
  }

  public getSCR(ss_id: number): { sys: number; con: number; reg: number } {
    const sys = isStationId(ss_id)
      ? mapGet(this.stationsInfo, ss_id).system_id
      : mapGet(this.structuresInfo, ss_id).solar_system_id;
    const con = mapGet(this.systemsInfo, sys).constellation_id;
    const reg = mapGet(this.constellationsInfo, con).region_id;
    return { sys, con, reg };
  }
}
