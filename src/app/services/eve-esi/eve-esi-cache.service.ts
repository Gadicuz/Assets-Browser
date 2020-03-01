import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, concat, from, merge, of } from 'rxjs';
import { endWith, filter, ignoreElements, map, mapTo, mergeMap, switchMap, tap, toArray } from 'rxjs/operators';

import {
  EsiItem,
  EsiMarketOrderBuySell,
  EsiWalletTransaction,
  EsiDataMarketOrder,
  EsiDataLocMarketTypes,
  EsiDataLocMarketOrders,
  EsiDataCharMarketOrder,
  EsiDataLocationInfo,
  EsiDataTypeInfo,
  EsiDataService,
  pluckLocMarketTypes
} from './eve-esi-data.service';
import { EsiService } from './eve-esi.module';

import { set, fltRemoveKeys } from '../../utils/utils';

export const fltBuySell = <T extends EsiDataMarketOrder>(buy_sell: EsiMarketOrderBuySell) => (o: T): boolean =>
  buy_sell === o.buy_sell;

@Injectable({
  providedIn: 'root'
})
export class EsiCacheService {
  constructor(private data: EsiDataService, private http: HttpClient) {
    this.locationsInfo = new Map<number, EsiDataLocationInfo>([
      [0, { name: 'Universe', type_info: 'Tranquility' }],
      [EsiService.LOCATION_ID_AssetSafety, { name: 'Asset Safety', type_info: '' }]
    ]);
  }

  // characters/{character_id}/assets/
  public characterItems: EsiItem[] = [];
  public loadCharacterItems(): Observable<EsiItem[]> {
    return this.data.loadCharacterItems().pipe(tap(items => (this.characterItems = items)));
  }

  public findChararacterItem(item_id: number): EsiItem | undefined {
    return this.characterItems.find(item => item.item_id == item_id);
  }

  // MAP: item_id -> name?
  public characterItemNames = new Map<number, string | undefined>();
  public loadCharacterItemNames(ids: number[]): Observable<Map<number, string | undefined>> {
    const removeKeys = (m: Map<number, string | undefined>): number[] => ids.filter(fltRemoveKeys(m));
    return this.data.loadCharacterItemNames(removeKeys(this.characterItemNames)).pipe(
      tap(([id, name]) => this.characterItemNames.set(id, name)),
      ignoreElements(),
      endWith(this.characterItemNames),
      tap(names => removeKeys(names).forEach(id => names.set(id, undefined)))
    );
  }

  // MAP: type_id -> EsiDataTypeInfo
  public typesInfo = new Map<number, EsiDataTypeInfo>();
  public loadTypesInfo(ids: number[]): Observable<Map<number, EsiDataTypeInfo>> {
    return this.getTypesInfo().pipe(
      switchMap(typesInfo =>
        from(ids.filter(fltRemoveKeys(typesInfo))).pipe(
          mergeMap(id => this.data.loadTypeInformation(id).pipe(tap(info => typesInfo.set(id, info)))),
          ignoreElements(),
          endWith(typesInfo)
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

  // MAP: (station_id|structure_id) -> {name, type_id, type_info}
  public locationsInfo: Map<number, EsiDataLocationInfo>;
  public loadLocationsInfo(ids: number[]): Observable<Map<number, EsiDataLocationInfo>> {
    return from(ids.filter(fltRemoveKeys(this.locationsInfo))).pipe(
      mergeMap(id =>
        this.data.loadLocationInfo(id).pipe(
          tap(info => this.locationsInfo.set(id, info)),
          filter(info => info.type_id != undefined),
          map(info => info.type_id as number)
        )
      ),
      toArray(),
      switchMap(ids => this.loadTypesInfo(set(ids))),
      mapTo(this.locationsInfo)
    );
  }

  // markets/prices/ -> MAP: type_id -> price
  public marketPrices = new Map<number, number>();
  public loadMarketPrices(): Observable<Map<number, number>> {
    return this.data.loadMarketPrices().pipe(tap(prices => (this.marketPrices = prices)));
  }

  public characterMarketOrders: EsiDataCharMarketOrder[] = [];
  public loadCharacterMarketOrders(): Observable<EsiDataCharMarketOrder[]> {
    return this.data.loadCharacterMarketOrders(undefined).pipe(tap(orders => (this.characterMarketOrders = orders)));
  }

  public characterWalletTransactions: EsiWalletTransaction[] = [];
  public loadCharacterWalletTransactions(): Observable<EsiWalletTransaction[]> {
    return this.data.loadCharacterWalletTransactions().pipe(tap(wt => (this.characterWalletTransactions = wt)));
  }

  public loadMarketOrders(
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderBuySell
  ): Observable<EsiDataLocMarketOrders> {
    const loc_ids = set(locs.map(x => x.l_id));
    const typ_ids = pluckLocMarketTypes(locs);
    return concat(
      merge(this.loadLocationsInfo(loc_ids), this.loadTypesInfo(typ_ids)).pipe(ignoreElements()), // ensure ids are cached
      this.data.loadMarketOrders(locs, buy_sell)
    );
  }
}
