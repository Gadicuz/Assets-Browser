import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { map, tap, switchMap, delay, switchMapTo, mergeMap, mergeMapTo, concatMap, filter, mapTo, toArray, catchError, bufferCount, ignoreElements } from 'rxjs/operators';
import { Observable, of, from, forkJoin, concat, zip, throwError } from 'rxjs';

import { EVESSOService } from '../services/EVESSO.service';
import { EsiService, EsiError, EsiAssetsItem, EsiMarketPrice, EsiStructureInfo, EsiStationInfo } from '../services/ESI.service';
import { EsiDataService, EsiDataTypeInfo } from '../services/ESIDATA.service';

import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

import { set, tuple } from '../utils/utils';

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

  private readonly TYPE_ID_AssetSafetyWrap = 60;
  private readonly TYPE_ID_StructueMarket = Math.pow(2, 32);
  private readonly virtualContainerTypes: number[] = [
    this.TYPE_ID_AssetSafetyWrap,
    this.TYPE_ID_StructueMarket
  ];

  private imageUrl = 'https://image.eveonline.com/';

  private locationContent: Map<number, LocationContentData> = null;    // Map  location_id -> LocationContentData

  private marketAssets: EsiAssetsItem[] = [];
  private marketAssetsNames: Map<number, string> = new Map();

  @ViewChild(MatSort, { static: false }) sort: MatSort;

  constructor(private route: ActivatedRoute, private esiData: EsiDataService) { }

  private findAssetsItem(item_id: number): EsiAssetsItem | null {
    return this.esiData.findCharAssetsItem(item_id) || this.marketAssets.find(item => item.item_id == item_id);
  }

  private getAssetsItems(): EsiAssetsItem[] {
    return this.esiData.charAssets.concat(this.marketAssets);
  }

  private getAssetsItemName(item_id: number): string | null {
    return this.marketAssetsNames.get(item_id) || this.esiData.charAssetsNames.get(item_id);
  }

  private loadAssetsNames(ids: number[]): Observable<null> {
    const marketIds = this.marketAssets.map(item => item.item_id);
    return this.esiData.loadCharacterAssetsNames(ids.filter(id => marketIds.indexOf(id) < 0));
  }

  private addMarketItem(item: EsiAssetsItem, name?: string) {
    this.marketAssets.push(item);
    this.marketAssetsNames.set(item.item_id, name);
  }

  // fill initial data
  private initLocationContent(): Observable<any> {
    const assetsItems = this.getAssetsItems();
    const locIDs = set(assetsItems.map(v => v.location_id)); // all unique locations
    this.locationContent = new Map<number, any>(locIDs.map(id => [id, { items: [], volume: undefined, value: 0 }])); // top level items
    this.locationContent.set(0, { items: locIDs.filter(loc => !this.findAssetsItem(loc)), volume: 0, value: 0 }); 
    assetsItems.forEach(a => {
      this.locationContent.get(a.location_id).items.push(a.item_id); // add item_id to location
      const val = this.getItemPrice(a);
      do {
        const loc_id = a.location_id;
        this.locationContent.get(loc_id).value += val;
        a = this.findAssetsItem(loc_id);
      } while (a);
      this.locationContent.get(0).value += val; // root item value
    });
    return this.esiData.loadStructuresInfo(this.locationContent.get(0).items);
  }

  private updateMarketAssetsData() {
    const orders = this.esiData.charOrders.filter(o => !o.is_buy_order);
    set(orders.map(o => o.location_id)).forEach(location_id => {
      const market = <EsiAssetsItem>{
        is_singleton: true,
        item_id: this.esiData.generateCharacterAssetsItemId(),
        location_flag: 'StructureMarket',
        location_id: location_id,
        location_type: 'other',
        quantity: 1,
        type_id: this.TYPE_ID_StructueMarket
      };
      this.addMarketItem(market, 'Sell orders');
      orders.filter(o => o.location_id == location_id).forEach(o => this.addMarketItem(
        <EsiAssetsItem>{
          is_singleton: true,
          item_id: this.esiData.generateCharacterAssetsItemId(),
          location_flag: 'MarketOrder',
          location_id: market.item_id,
          location_type: 'other',
          quantity: o.volume_remain,
          type_id: o.type_id
        }
      ));
    });
  }

  private updateMarketAssetsDataNames() {
    const markets = [...this.marketAssetsNames.entries()].filter(([, name]) => name != null).map(([id,]) => this.marketAssets.find(m => m.item_id == id));
    markets.forEach(m => this.marketAssetsNames.set(m.item_id, 'Sell orders at ' + this.esiData.structuresInfo.get(m.location_id).name));
  }

  private getAssetsFast(locID: number): Observable<any> {
    return of(this.getLocationData(locID));
  }

  // get assets info for locID
  private getAssets(locID: number): Observable<any> {
    if (this.locationContent) return this.getLocation(locID);
    return zip(
      this.esiData.loadPrices(),
      this.esiData.loadCharacterAssets(),
      this.esiData.loadCharacterOrders()
    ).pipe(
      delay(0), // just to update page
      tap(() => this.updateMarketAssetsData()),
      mergeMap(() => this.initLocationContent()),
      tap(() => this.updateMarketAssetsDataNames()),
      mergeMap(() => this.getLocation(locID))
    );
  }

  ngOnInit() {
    this.esiData.typesInfo.set(this.TYPE_ID_StructueMarket, <EsiDataTypeInfo>{ name: "*** Structure market ***", volume: 0 });
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

  private getNameCommentType(itemID: number, item?: EsiAssetsItem): any {
    item = item || this.findAssetsItem(itemID);
    if (item)
      return {
        name: this.getItemName(item),
        comment: this.getAssetsItemName(itemID),
        type_id: item.type_id
      };
    const locInfo = this.esiData.structuresInfo.get(itemID);
    if (locInfo)
      return {
        name: locInfo.name,
        comment: locInfo.type_id ? this.esiData.typesInfo.get(locInfo.type_id).name : locInfo.type_info,
        type_id: locInfo.type_id
      };
    return { name: 'Unknown location', comment: `ID = ${itemID}`, type_id: undefined };
  }
    
  private getLocationData(locID: number) {
    let loc = this.getNameCommentType(locID);
    if (loc.type_id && loc.type_id < Math.pow(2,32)) loc.image = this.imageUrl + `Type/${loc.type_id}_32.png`;
    return loc;
  }

  private getItemRouteIDs(id: number): number[] {
    if (id == 0) return [];
    const item = this.findAssetsItem(id);
    return item ? [...this.getItemRouteIDs(item.location_id), id] : [id];
  }

  getItemName(item: EsiAssetsItem): string {
    const name = this.esiData.typesInfo.get(item.type_id).name;
    return item.is_blueprint_copy ? name + ' (Copy)' : name;
  }

  getItemPrice(item: EsiAssetsItem): number {
    return item.is_blueprint_copy ? 0 : (this.esiData.prices.get(item.type_id) || 0) * item.quantity;
  }

  private getItemVol(item: EsiAssetsItem): number {
    const hasNoContent = this.locationContent.get(item.item_id) == null;
    if (this.virtualContainerTypes.indexOf(item.type_id) >= 0)
      return this.getContentVol(this.locationContent.get(item.item_id));
    const typeInfo = this.esiData.typesInfo.get(item.type_id);
    return typeInfo ? (hasNoContent && typeInfo.packaged_volume || typeInfo.volume) * item.quantity : 0;
  }

  private getContentVol(contentData: LocationContentData): number | null {
    if (contentData == null) return null;
    if (!contentData.volume) {
      const vols = contentData.items.map(id => this.findAssetsItem(id)).filter(item => item != null).map(item => this.getItemVol(item)); // content volumes
      if (vols.findIndex(v => !v) == -1)
        contentData.volume = vols.reduce((acc, v) => acc + v, 0);
    }
    return contentData.volume || null;
  }

  // get (verified) itemIDs for location and contentData items
  private getLocationContentItemIDs(locID: number, contentData?: LocationContentData): number[] {
    if (contentData == null) contentData = this.locationContent.get(locID);
    return [locID].concat(contentData.items).filter(id => this.findAssetsItem(id) != null);
  }

  private getLocation(locID: number): Observable<any> {   
    const contentData = this.locationContent.get(locID); // content data for locID location, might be null
    if (contentData == null) return throwError(new Error(`Unknown location '${locID}'`));
    const routeIDs = this.getItemRouteIDs(locID);
    const usedItemIDs = this.getLocationContentItemIDs(locID, contentData); // location, content and children (verified) itemIDs
    return forkJoin([ // ensure data is available ...
      this.loadAssetsNames(usedItemIDs), // ... user names
      this.esiData.loadTypeInfo(usedItemIDs.map(id => this.findAssetsItem(id).type_id)) // ... typeInfo
    ]).pipe(
      map(() => {
        const contentIDs = contentData.items; // might be top level location_id (for root) or item_id (else)
        const locItems = contentIDs.map(contentItemID => {
          const itemContentData = this.locationContent.get(contentItemID);
          const contentItem = this.findAssetsItem(contentItemID);
          return {
            ...this.getNameCommentType(contentItemID, contentItem),
            quantity: contentItem && contentItem.quantity,
            value: (contentItem && this.getItemPrice(contentItem) || 0) + (itemContentData && itemContentData.value || 0),
            volume: contentItem && this.getItemVol(contentItem),
            content_volume: itemContentData && this.getContentVol(itemContentData),
            content_id: itemContentData && contentItemID
          }
        });
        const locItemData = this.findAssetsItem(locID); // location item or null for top/root level location locID
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

}
