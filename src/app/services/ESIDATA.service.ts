import { Injectable } from '@angular/core';
import { Observable, of, concat, from, throwError } from 'rxjs';
import { map, tap, switchMap, switchMapTo, mergeMap, mergeMapTo, concatMap, filter, mapTo, toArray, catchError, bufferCount, ignoreElements } from 'rxjs/operators';

import { EVESSOService } from '../services/EVESSO.service';
import { EsiService, EsiError, EsiAssetsItem, EsiMarketPrice, EsiStructureInfo, EsiStationInfo, EsiCharOrder, EsiStructureOrder, EsiRegionOrder } from './ESI.service';

import universeTypesCache from '../../assets/universe.types.cache.json';

export interface EsiDataTypeInfo {
  name: string;
  volume: number;
  packaged_volume?: number;
}

export interface EsiStationOrStructureInfo {
  name: string;        // name
  type_id?: number;    // type_id or 0/undefined
  type_info?: string;  // type if !type_id
}

@Injectable({
  providedIn: 'root'
})
export class EsiDataService {

  // MAP: type_id -> {name, volume, packaged_volume?}
  public typesInfo: Map<number, EsiDataTypeInfo>;

  // MAP: type_id -> price
  public prices: Map<number, number>;   // markets/prices/ -> Map()

  // characters/{character_id}/assets/
  public charAssets: EsiAssetsItem[];

  // MAP: item_id -> name?
  public charAssetsNames: Map<number, string>;

  // MAP: (station_id|structure_id) -> {name, type_id, err}
  public structuresInfo: Map<number, EsiStationOrStructureInfo>;

  public get service(): EsiService { return this.esi; }

  private missedIDs(ids: number[], map: Map<number, any>): number[] {
    let knownIDs = [...map.keys()];
    return [...new Set(ids)].filter(id => knownIDs.indexOf(id) < 0);
  }

  constructor(private esi: EsiService, private sso: EVESSOService) {
    this.typesInfo = new Map<number, EsiDataTypeInfo>(<([number, EsiDataTypeInfo])[]>universeTypesCache);
    this.prices = null;
    this.charAssets = null;
    this.charAssetsNames = new Map<number, string>();
    this.structuresInfo = new Map<number, EsiStationOrStructureInfo>([[0, { name: 'Universe', type_info: 'Tranquility' }]]);
  }
   
  get character_id(): number {
    return this.sso.charData.CharacterID;
  }

  findCharAssetsItem(item_id: number): EsiAssetsItem {
    return this.charAssets && this.charAssets.find(item => item.item_id == item_id);
  }

  loadTypeInfo(ids: number[]): Observable<Map<number, EsiDataTypeInfo>> {
    ids = this.missedIDs(ids, this.typesInfo);
    if (ids.length == 0) return of(this.typesInfo);
    return concat(
      from(ids).pipe(
        mergeMap(type_id => this.esi.getTypeInformation(type_id)),
        tap(type_info => this.typesInfo.set(type_info.type_id, { name: type_info.name, volume: type_info.volume, packaged_volume: type_info.packaged_volume })),
        ignoreElements()),
      of(this.typesInfo)
    );
  }

  loadPrices(reload?: boolean): Observable<Map<number, number>> {
    if (this.prices != null && !reload) return of(this.prices);
    return this.esi.listMarketPrices().pipe(
      map(prices => new Map<number, number>(prices.map(v => [v.type_id, v.average_price || v.adjusted_price || 0]))),
      tap(prices => this.prices = prices)
    );
  }

  loadCharacterAssets(reload?: boolean): Observable<EsiAssetsItem[]> {
    if (this.charAssets != null && !reload) return of(this.charAssets);
    return this.esi.getCharacterAssets(this.character_id).pipe(
      tap(assets => this.charAssets = assets)
    );
  }

  loadCharacterAssetsNames(ids: number[]): Observable<Map<number, string | null>> {
    ids = this.missedIDs(ids, this.charAssetsNames);
    if (ids.length == 0) return of(this.charAssetsNames); // all names resolved
    return concat(
      this.esi.getCharacterAssetNames(this.character_id, ids).pipe(
        tap(id_name => this.charAssetsNames.set(id_name.item_id, id_name.name != 'None' ? id_name.name : null)), // remove 'None' names
        ignoreElements()),
      of(this.charAssetsNames)
    );
  }

  loadStructuresInfo(ids: number[]): Observable<Map<number, EsiStationOrStructureInfo>> {
    ids = this.missedIDs(ids, this.structuresInfo);
    if (ids.length == 0) return of(this.structuresInfo);
    return from(ids).pipe(
      mergeMap(sID =>
        this.esi.getInformation<EsiStructureInfo | EsiStationInfo>((sID >= Math.pow(2, 32)) ? 'structures' : 'stations', sID).pipe(
          catchError((err: any) => {
            //            if (err.name == 'EsiError' ...
            if (err instanceof EsiError && err.status == 403) // some structures are 'forbidden'
              return of({ name: `*** Forbidden Structure ***`, type_id: null, type_info: `ID = ${sID}` }); // err.error - server 403 error body
            return throwError(err);
          }),
          map(info => {
            this.structuresInfo.set(sID, info);
            return info.type_id;
          })
        )
      ),
      filter(id => !!id),
      toArray(),
      switchMap(ids => this.loadTypeInfo(ids)),
      mapTo(this.structuresInfo)
    );
  }

}
