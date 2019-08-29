import { Injectable } from '@angular/core';
import { Observable, Subject, of, empty, concat, from, throwError } from 'rxjs';
import { map, expand, tap, switchMap, repeatWhen, switchMapTo, mergeMap, mergeMapTo, concatMap, takeWhile, filter, mapTo, toArray, catchError, bufferCount, ignoreElements } from 'rxjs/operators';

import { EVESSOService } from './EVESSO.service';
import { EsiService, EsiError, EsiAssetsItem, EsiMarketPrice, EsiSystemInfo, EsiStructureInfo, EsiStationInfo, EsiCharOrder, EsiStructureOrder, EsiRegionOrder, EsiMail, EsiWalletTransaction } from './ESI.service';

import universeTypesCache from '../../assets/universe.types.cache.json';

import { set, tuple } from '../utils/utils';

export interface EsiDataTypeInfo {
  name: string;
  volume: number;
  packaged_volume?: number;
}

export interface EsiDataLocationInfo {
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
  private max_item_id: number;

  public charOrders: EsiCharOrder[];

  public charWalletTransactions: EsiWalletTransaction[];

  // MAP: item_id -> name?
  public charAssetsNames: Map<number, string>;

  // MAP: (station_id|structure_id) -> {name, type_id, err}
  public locationsInfo: Map<number, EsiDataLocationInfo>;

  public get service(): EsiService { return this.esi; }

  private missedIDs(ids: number[], map: Map<number, any>): number[] {
    let knownIDs = [...map.keys()];
    return set(ids).filter(id => knownIDs.indexOf(id) < 0);
  }

  constructor(private esi: EsiService, private sso: EVESSOService) {
    this.typesInfo = new Map<number, EsiDataTypeInfo>(<([number, EsiDataTypeInfo])[]>universeTypesCache);
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

  private resetCharacterAssetsItemId() {
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
    return this.esi.getCharacterOrders(this.character_id, false).pipe(
      tap(orders => this.charOrders = orders)
    );
  }

  loadCharacterWalletTransactions(reload?: boolean): Observable<EsiWalletTransaction[]> {
    if (this.charWalletTransactions != null && !reload) return of(this.charWalletTransactions);
    return this.esi.getCharacterWalletTransactions(this.character_id).pipe(
      tap(transactions => this.charWalletTransactions = transactions)
    );
  }

  loadCharacterAssetsNames(ids: number[]): Observable<null> {
    ids = this.missedIDs(ids, this.charAssetsNames);
    if (ids.length == 0) return of(null); // all names resolved
    return concat(
      this.esi.getCharacterAssetNames(this.character_id, ids).pipe(
        tap(id_name => this.charAssetsNames.set(id_name.item_id, id_name.name != 'None' ? id_name.name : null)), // remove 'None' names
        ignoreElements()),
      of(null)
    );
  }

  loadLocationsInfo(id_types: [number,string][]): Observable<Map<number, EsiDataLocationInfo>> {
    const types = new Map(id_types);
    const ids = this.missedIDs([...types.keys()], this.locationsInfo);
    if (ids.length == 0) return of(this.locationsInfo);
    return from(ids).pipe(
      mergeMap(sID => {
        const type = types.get(sID) || EsiService.getAssetLocationType(sID);
        let selector;
        switch (type) {
          case 'solar_system': selector = 'systems'; break;
          case 'station': selector = 'stations'; break;
          case 'other': selector = 'structures'; break;
          default:
            this.locationsInfo.set(sID, <EsiDataLocationInfo>{
              name: `*** Unknown '${type}' ***`,
              type_id: null,
              type_info: `ID = ${sID}`
            });
            return of(null);
        }
        return this.esi.getInformation<EsiSystemInfo | EsiStructureInfo | EsiStationInfo>(selector, sID).pipe(
          map(esiInfo => {
            return <EsiDataLocationInfo>{
              name: esiInfo.name,
              type_id: type == 'solar_system' ? null : (<EsiStructureInfo | EsiStationInfo>esiInfo).type_id,
              type_info: type == 'solar_system' ? 'Solar system' : null
            };
          }),
          catchError((err: any) => {
            //            if (err.name == 'EsiError' ...
            if (err instanceof EsiError && err.status == 403) // some locations are 'forbidden'
              return of(<EsiDataLocationInfo>{
                name: `*** Forbidden '${type}' ***`,
                type_id: null,
                type_info: `ID = ${sID}`
              }); // err.error - server 403 error body
            return throwError(err);
          }),
          map(info => {
            this.locationsInfo.set(sID, info);
            return info.type_id;
          })
        )
      }),
      filter(id => !!id),
      toArray(),
      switchMap(ids => this.loadTypeInfo(ids)),
      mapTo(this.locationsInfo)
    );
  }

  private getCharacterMailHeadersFromId(mail_id: number, labels: number[], up_to_date: number): Observable<EsiMail[]> {
    return this.esi.getCharacterMailHeaders(this.character_id, labels, mail_id).pipe(
      map(mails => mails.filter(m => up_to_date == undefined || (new Date(m.timestamp)).getTime() > up_to_date)),
      takeWhile(mails => mails.length != 0)
    );
  }

  public getCharacterMailHeaders(labels?: number[], up_to_date?: number): Observable<EsiMail> {
    return this.getCharacterMailHeadersFromId(undefined, labels, up_to_date).pipe(
      expand(mails => mails.length < 50 ? empty() : this.getCharacterMailHeadersFromId(Math.min(...mails.map(m => m.mail_id)), labels, up_to_date)),
      mergeMap(mails => from(mails))
    );
  }

}
