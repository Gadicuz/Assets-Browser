import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { OAuthService } from 'angular-oauth2-oidc';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { map, tap, switchMap, switchMapTo, mergeMap, mergeMapTo, concatMap, filter, mapTo, toArray, catchError, bufferCount, ignoreElements } from 'rxjs/operators';
import { Observable, of, from, forkJoin, concat, zip, throwError } from 'rxjs';

import { EsiServer, EsiError, EsiAssetsItem, EsiMarketPrice, EsiStructureInfo, EsiStationInfo } from '../services/ESI.service';

import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

import { AssetsItem } from '../models/assets.item'
import { AssetsLocation } from '../models/assets.location'

import universeTypesCache from '../../assets/universe.types.cache.json';

interface StructureInfo {
  name: string;        // structure name
  type_id?: number;     // structure type_id or 0/undefined
  type_info?: string;   // structure type if !type_id
}

interface LocationContentData {
  items: number[];                 // content item_id's
  value: number | undefined;       // content gross value
  volume: number | undefined;      // content volume
}

@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.css']
})
export class LocationComponent implements OnInit {

  displayedColumns: string[] = ['name', 'quantity', 'value', 'volume'];
  location$ = null;
  locationItems: MatTableDataSource<any> | null = null;

  private TYPE_ID_AssetSafetyWrap = 60;

  private imageUrl = 'https://image.eveonline.com/';

  private assetsData: EsiAssetsItem[] = null;     // characters/{character_id}/assets/
  private marketPrices: Map<number, number> = null;   // markets/prices/ -> Map()
  private userNamesMap: Map<number, string> = new Map<number, string>();  // item_id -> user_name            (getUserNames)
  private typeInfoMap: Map<number, any> = new Map<number, any>(<([number, any])[]>universeTypesCache);      // type_id -> {name, volume, packaged_volume}       (getTypeInfo)

  private locInfoMap: Map<number, StructureInfo> = new Map<number, StructureInfo>();       // location_id -> {name, type_id, err}  (getLocInfo) top level locations

  private locationContent: Map<number, LocationContentData> = new Map<number, LocationContentData>();    // Map  location_id -> LocationContentData

  @ViewChild(MatSort, { static: false }) sort: MatSort;

  constructor(private oauthService: OAuthService, private route: ActivatedRoute, private esi: EsiServer) { }

  // get current auth character ID
  private getCharID(): number {
    return this.oauthService.getIdentityClaims()['CharacterID'];
  }

  private getItemName(item: EsiAssetsItem): string {
    const name = this.typeInfoMap.get(item.type_id).name;
    return item.is_blueprint_copy ? name + ' (Copy)' : name;
  }

  private getItemPrice(item: EsiAssetsItem): number {
    return item.is_blueprint_copy ? 0 : (this.marketPrices.get(item.type_id) || 0) * item.quantity;;
  }

  private getItemVol(item: EsiAssetsItem): number {
    const hasNoContent = this.locationContent.get(item.item_id) == null;
    if (item.type_id == this.TYPE_ID_AssetSafetyWrap)
      return this.getContentVol(this.locationContent.get(item.item_id));
    const typeInfo = this.typeInfoMap.get(item.type_id);
    return typeInfo ? (hasNoContent && typeInfo.packaged_volume || typeInfo.volume) * item.quantity : 0;
  }

  private getContentVol(contentData: LocationContentData): number | null {
    if (contentData == null) return null;
    if (!contentData.volume) {
      const vols = contentData.items.map(id => this.getAssetsItem(id)).filter(item => item != null).map(item => this.getItemVol(item)); // content volumes
      if (vols.findIndex(v => !v) == -1)
        contentData.volume = vols.reduce((acc, v) => acc + v, 0);
    }
    return contentData.volume || null;
  }

  // get (verified) itemIDs for location and contentData items
  private getLocationContentItemIDs(locID: number, contentData?: LocationContentData): number[] {
    if (contentData == null) contentData = this.locationContent.get(locID);
    return [locID].concat(contentData.items).filter(id => this.getAssetsItem(id) != null);
  }

  private getTopLocations(): number[] {
    return this.locationContent.get(0).items;
  }

  private getAssetsItem(itemId: number): EsiAssetsItem {
    return this.assetsData && this.assetsData.find(a => a.item_id == itemId);
  }

  // fill initial data
  private processAssetsData(prices: EsiMarketPrice[], assets: EsiAssetsItem[]) {
    this.marketPrices = new Map<number, number>(prices.map(v => [v.type_id, v.average_price || v.adjusted_price || 0]));
    this.assetsData = assets;
    const locIDs = [...new Set(this.assetsData.map(v => v.location_id))]; // all unique locations
    this.locationContent = new Map<number, any>(locIDs.map(id => [id, { items: [], volume: undefined, value: 0 }]));
    this.locationContent.set(0, { items: locIDs.filter(loc => !this.getAssetsItem(loc)), volume: 0, value: 0 }); // top level items    
    this.assetsData.forEach(a => {
      this.locationContent.get(a.location_id).items.push(a.item_id); // add item_id to location
      const val = this.getItemPrice(a);
      do {
        const loc_id = a.location_id;
        this.locationContent.get(loc_id).value += val;
        a = this.getAssetsItem(loc_id);
      } while (a);
      this.locationContent.get(0).value += val; // root item value
    });
  }

  ngOnInit() {
    this.locInfoMap.set(0, { name: 'Universe', type_info: 'Tranquility' });
    this.locationItems = new MatTableDataSource<any>();
    this.location$ = this.route.paramMap.pipe(
      map((params: ParamMap) => +params.get('id')),
      switchMap(id => concat(
        this.getAssetsFast(id),
        this.getAssets(id)).pipe(
          catchError(err => {
            console.log(err);
            return of({ ...this.getLocationData(id), error: err });
          })
        )
      ),
      tap(loc => this.locationItems.data = loc.items || [])
    );
  }

  ngAfterViewInit() {
    this.locationItems.sort = this.sort;
  }

  private getAssetsFast(locID: number): Observable<any> {
    //return of({ name: 'Loading...' });
    return of(this.getLocationData(locID));
  }

  // get assets info for locID
  private getAssets(locID: number): Observable<any> {
    if (this.assetsData) return this.getLocation(locID);
    return zip(
      this.esi.listMarketPrices(),
      this.esi.getCharacterAssets(this.getCharID()),
      (prices, assets) => this.processAssetsData(prices, assets)).pipe(
        mergeMap(() => this.getLocInfo(this.getTopLocations())),
        mergeMap(() => this.getLocation(locID))
      );      
  }

  private getNameComment(itemID: number, item: EsiAssetsItem): any {
    if (item)
      return {
        name: this.getItemName(item),
        comment: this.userNamesMap.get(itemID),
      };
    const locInfo = this.locInfoMap.get(itemID);
    if (locInfo)
      return {
        name: locInfo.name,
        comment: locInfo.type_id ? this.typeInfoMap.get(locInfo.type_id).name : locInfo.type_info
      };
    return { name: "Loading data..." };
  }

  private getTypeID(itemID: number, item: EsiAssetsItem): number | undefined {
    if (item)
      return item.type_id;
    const locInfo = this.locInfoMap.get(itemID);
    return locInfo && locInfo.type_id;
  }

  private getLocationData(locID: number) {
    const locItemData = this.getAssetsItem(locID);
    let loc = this.getNameComment(locID, locItemData);
    let type_id = this.getTypeID(locID, locItemData);
    if (type_id) loc.image = this.imageUrl + `Type/${type_id}_32.png`;
    return loc;
  }

  private getItemRouteIDs(id: number): number[] {
    if (id == 0) return [];
    const item = this.getAssetsItem(id);
    return item ? [...this.getItemRouteIDs(item.location_id), id] : [id];
  }

  private getLocation(locID: number): Observable<any> {
    const contentData = this.locationContent.get(locID); // content data for locID location, might be null
    if (contentData == null) return of({ name: 'UNKNOWN', route: [] });
    const routeIDs = this.getItemRouteIDs(locID);
    const usedItemIDs = this.getLocationContentItemIDs(locID, contentData); // location, content and children (verified) itemIDs
    return forkJoin([ // ensure data is available ...
      this.getUserNames(usedItemIDs), // ... user names
      this.getTypeInfo(usedItemIDs.map(id => this.getAssetsItem(id).type_id)) // ... typeInfo
    ]).pipe(
      map(_ => {
        const contentIDs = contentData.items; // might be top level location_id (for root) or item_id (else)
        const locItems = contentIDs.map(contentItemID => {
          const itemContentData = this.locationContent.get(contentItemID);
          const contentItem = this.getAssetsItem(contentItemID);
          return {
            ...this.getNameComment(contentItemID, contentItem),
            quantity: contentItem && contentItem.quantity,
            value: (contentItem && this.getItemPrice(contentItem) || 0) + (itemContentData && itemContentData.value || 0),
            volume: contentItem && this.getItemVol(contentItem),
            content_volume: itemContentData && this.getContentVol(itemContentData),
            content_id: itemContentData && contentItemID
          }
        });
        const locItemData = this.getAssetsItem(locID); // location item or null for top/root level location locID
        return {
          ...this.getLocationData(locID),
          route: routeIDs.map(item_id => { return { ...this.getLocationData(item_id), id: item_id }; }),
          info: [
            { title: 'Item Value (ISK)', content: locItemData && this.getItemPrice(locItemData) },
            { title: 'Item Volume (m3)', content: locItemData && this.getItemVol(locItemData) },
            { title: 'Content Value (ISK)', content: contentData.value },
            { title: 'Content Volume (m3)', content: this.getContentVol(contentData) }
          ],
          items: locItems
        }
      }));
  }

  // get unmapped items in ids
  private getUnknownIDs(ids: number[], map: Map<number, any>): number[] {
    let knownIDs = [...map.keys()];
    return [...new Set(ids)].filter(id => knownIDs.indexOf(id) < 0);
  }

  getUserNames(itemIDs: number[]): Observable<Map<number,string>> {
    let ids = this.getUnknownIDs(itemIDs, this.userNamesMap);
    if (ids.length == 0) return of(this.userNamesMap); // all names resolved
    return concat(
      this.esi.getCharacterAssetNames(this.getCharID(), ids).pipe(
        tap(id_name => this.userNamesMap.set(id_name.item_id, id_name.name != 'None' ? id_name.name : undefined)), // remove 'None' names
        ignoreElements()),
      of(this.userNamesMap));       
  }

  getTypeInfo(typeIDs: number[]): Observable<Map<number, any>> {
    let ids = this.getUnknownIDs(typeIDs, this.typeInfoMap);
    if (ids.length == 0) return of(this.typeInfoMap);
    return concat(
      from(ids).pipe(
        mergeMap(type_id => this.esi.getTypeInformation(type_id)),
        tap(v => this.typeInfoMap.set(v.type_id, { name: v.name, volume: v.volume, packaged_volume: v.packaged_volume })),
        ignoreElements()),
      of(this.typeInfoMap));
  }

  // load location data and corresponding type_id
  getLocInfo(locIDs: number[]): Observable<Map<number, any>> {
    let ids = this.getUnknownIDs(locIDs, this.locInfoMap);
    if (ids.length == 0) return of(this.locInfoMap);
    return from(ids).pipe(
      mergeMap(locID =>
        this.esi.getInformation<EsiStructureInfo | EsiStationInfo>((locID >= Math.pow(2, 32)) ? 'structures' : 'stations', locID).pipe(
          catchError((err: any) => {
//            if (err.name == 'EsiError' ...
            if (err instanceof EsiError && err.status == 403) // some structures are 'forbidden'
              return of({ name: `*** Forbidden Structure ***`, type_id: undefined, type_info: `ID = ${locID}` }); // err.error - server 403 error body
            return throwError(err);
          }),
          map(info => {
            this.locInfoMap.set(locID, info);
            return info.type_id;
          })
        )
      ),
      filter(id => !!id),
      toArray(),
      switchMap(ids => this.getTypeInfo(ids)),
      mapTo(this.locInfoMap)
    );
  }

}
