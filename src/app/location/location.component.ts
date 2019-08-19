import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { map, tap, switchMap, switchMapTo, mergeMap, mergeMapTo, concatMap, filter, mapTo, toArray, catchError, bufferCount, ignoreElements } from 'rxjs/operators';
import { Observable, of, from, forkJoin, concat, zip, throwError } from 'rxjs';

import { EVESSOService } from '../services/EVESSO.service';
import { EsiService, EsiError, EsiAssetsItem, EsiMarketPrice, EsiStructureInfo, EsiStationInfo } from '../services/ESI.service';
import { EsiDataService } from '../services/ESIDATA.service';

import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

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

  private locationContent: Map<number, LocationContentData> = null;    // Map  location_id -> LocationContentData

  @ViewChild(MatSort, { static: false }) sort: MatSort;

  constructor(private route: ActivatedRoute, private esiData: EsiDataService) { }

  // fill initial data
  private initLocationContent(): Observable<any> {
    const locIDs = [...new Set(this.esiData.charAssets.map(v => v.location_id))]; // all unique locations
    this.locationContent = new Map<number, any>(locIDs.map(id => [id, { items: [], volume: undefined, value: 0 }])); // top level items
    this.locationContent.set(0, { items: locIDs.filter(loc => !this.esiData.findCharAssetsItem(loc)), volume: 0, value: 0 }); 
    this.esiData.charAssets.forEach(a => {
      this.locationContent.get(a.location_id).items.push(a.item_id); // add item_id to location
      const val = this.getItemPrice(a);
      do {
        const loc_id = a.location_id;
        this.locationContent.get(loc_id).value += val;
        a = this.esiData.findCharAssetsItem(loc_id);
      } while (a);
      this.locationContent.get(0).value += val; // root item value
    });
    return this.esiData.loadStructuresInfo(this.locationContent.get(0).items);
  }

  private getAssetsFast(locID: number): Observable<any> {
    return of(this.getLocationData(locID));
  }

  // get assets info for locID
  private getAssets(locID: number): Observable<any> {
    if (this.locationContent) return this.getLocation(locID);
    return zip(
      this.esiData.loadPrices(),
      this.esiData.loadCharacterAssets()
    ).pipe(
      mergeMap(() => this.initLocationContent()),
      mergeMap(() => this.getLocation(locID))
    );
  }

  ngOnInit() {
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
    item = item || this.esiData.findCharAssetsItem(itemID);
    if (item)
      return {
        name: this.getItemName(item),
        comment: this.esiData.charAssetsNames.get(itemID),
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
    if (loc.type_id) loc.image = this.imageUrl + `Type/${loc.type_id}_32.png`;
    return loc;
  }

  private getItemRouteIDs(id: number): number[] {
    if (id == 0) return [];
    const item = this.esiData.findCharAssetsItem(id);
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
    if (item.type_id == this.TYPE_ID_AssetSafetyWrap)
      return this.getContentVol(this.locationContent.get(item.item_id));
    const typeInfo = this.esiData.typesInfo.get(item.type_id);
    return typeInfo ? (hasNoContent && typeInfo.packaged_volume || typeInfo.volume) * item.quantity : 0;
  }

  private getContentVol(contentData: LocationContentData): number | null {
    if (contentData == null) return null;
    if (!contentData.volume) {
      const vols = contentData.items.map(id => this.esiData.findCharAssetsItem(id)).filter(item => item != null).map(item => this.getItemVol(item)); // content volumes
      if (vols.findIndex(v => !v) == -1)
        contentData.volume = vols.reduce((acc, v) => acc + v, 0);
    }
    return contentData.volume || null;
  }

  // get (verified) itemIDs for location and contentData items
  private getLocationContentItemIDs(locID: number, contentData?: LocationContentData): number[] {
    if (contentData == null) contentData = this.locationContent.get(locID);
    return [locID].concat(contentData.items).filter(id => this.esiData.findCharAssetsItem(id) != null);
  }

  private getLocation(locID: number): Observable<any> {
    const contentData = this.locationContent.get(locID); // content data for locID location, might be null
    if (contentData == null) return throwError(new Error(`Unknown location '${locID}'`));
    const routeIDs = this.getItemRouteIDs(locID);
    const usedItemIDs = this.getLocationContentItemIDs(locID, contentData); // location, content and children (verified) itemIDs
    return forkJoin([ // ensure data is available ...
      this.esiData.loadCharacterAssetsNames(usedItemIDs), // ... user names
      this.esiData.loadTypeInfo(usedItemIDs.map(id => this.esiData.findCharAssetsItem(id).type_id)) // ... typeInfo
    ]).pipe(
      map(_ => {
        const contentIDs = contentData.items; // might be top level location_id (for root) or item_id (else)
        const locItems = contentIDs.map(contentItemID => {
          const itemContentData = this.locationContent.get(contentItemID);
          const contentItem = this.esiData.findCharAssetsItem(contentItemID);
          return {
            ...this.getNameCommentType(contentItemID, contentItem),
            quantity: contentItem && contentItem.quantity,
            value: (contentItem && this.getItemPrice(contentItem) || 0) + (itemContentData && itemContentData.value || 0),
            volume: contentItem && this.getItemVol(contentItem),
            content_volume: itemContentData && this.getContentVol(itemContentData),
            content_id: itemContentData && contentItemID
          }
        });
        const locItemData = this.esiData.findCharAssetsItem(locID); // location item or null for top/root level location locID
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
