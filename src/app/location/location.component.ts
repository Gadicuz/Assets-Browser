import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map, tap, switchMap, delay, mergeMap, catchError } from 'rxjs/operators';
import { Observable, of, forkJoin, concat, zip, throwError } from 'rxjs';

import { EsiDataService, EsiDataLocationInfo, EsiService, EsiAssetsItem, EsiOrder } from '../services/eve-esi/eve-esi-data.service';

import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

import { set } from '../utils/utils';

interface LocationData {
  items: number[];                 // content item_id's
  value: number;                   // content gross value
  volume: number | null;           // content volume
  parent?: number;                 // parent location_id
  type: string | null;             // "station" | "solar_system" | "other"
}

interface ItemInfo {
  id: number;
  name: string;
  comment: string;
  type_id: number; 
  image: string;
}

interface ItemData {
  info: ItemInfo;
  quantity: number;
  value: number;
  volume: number;
  content_volume: number;
  content_id: number;
}

interface ContData {
  error?: unknown;
  item: ItemInfo;
  route?: ItemInfo[];
  items?: ItemData[];
  stat?: { title: string; content: number }[];
}

@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.css']
})
export class LocationComponent implements OnInit {

  displayedColumns: string[] = ['name', 'quantity', 'value', 'volume'];
  location$: Observable<ContData> = null;
  locationItems: MatTableDataSource<ItemData> = null;

  private readonly virtualContainerTypes: number[] = [
    EsiService.TYPE_ID_AssetSafetyWrap
  ];

  isVirtualContainer(type_id: number): boolean {
    return type_id == EsiService.TYPE_ID_AssetSafetyWrap;
  }

  private locations: Map<number, LocationData> = null; // Map  loc_id -> LocationData

  private marketLocations: number[] = []; // loc_id for market location
  private marketAssets: EsiAssetsItem[] = [];
  private marketAssetsNames: Map<number, string> = new Map();

  @ViewChild(MatSort) sort: MatSort;

  constructor(private route: ActivatedRoute, private esi: EsiService, private esiData: EsiDataService) { }

  private buildLocations(): Observable<Map<number, EsiDataLocationInfo>> {
    this.locations = new Map( [[0, { items: [], volume: undefined, value: 0, type: 'other' }]] ); // root location
    this.linkAssetsItemsData();
    this.linkMarketOrdersData();
    this.linkChildren();
    return this.esiData.loadLocationsInfo(this.locations.get(0).items.map(id => [id, this.locations.get(id).type]));
  }

  private addLocations(loc_ids: number[], type: string = null, parent = 0): void {
    loc_ids.forEach(loc_id => this.locations.set(loc_id, { items: [], volume: undefined, value: 0, parent: parent, type: type }));
  }

  private linkChildren(): void {
    [...this.locations.entries()].forEach(([loc_id, data]) => { if (data.parent != null) this.locations.get(data.parent).items.push(loc_id); });
  }

  private processItems(items: EsiAssetsItem[]): void {
    items.forEach(item => {
      if (!this.locations.has(item.item_id))
        this.locations.get(item.location_id).items.push(item.item_id); // add item_id to location items
      const value = this.getItemPrice(item);
      this.getLocationRoute(item.location_id).forEach(loc_id => this.locations.get(loc_id).value += value);
    });
  }

  private linkAssetsItemsData(): void {
    const items = this.esiData.charAssets;
    this.addLocations(set(items.map(item => item.location_id))); // link all to the root
    items.forEach(item => { 
      if (this.locations.has(item.item_id)) this.locations.get(item.item_id).parent = item.location_id; // relink items
      this.locations.get(item.location_id).type = item.location_type;
    }); 
    this.processItems(items);
  }

  private linkMarket(loc_id: number, orders: EsiOrder[]): void {
    const market_loc_id = this.esiData.generateCharacterAssetsItemId();
    this.marketLocations.push(market_loc_id);
    if (!this.locations.has(loc_id)) this.addLocations([loc_id], EsiService.getAssetLocationType(loc_id));
    const market_location_type = 'other';
    this.addLocations([market_loc_id], market_location_type, loc_id);
    orders.forEach(o => {
      const item_id = this.esiData.generateCharacterAssetsItemId();
      this.marketAssets.push({
        is_singleton: true,
        item_id: item_id,
        location_flag: 'MarketHangar',
        location_id: market_loc_id,
        location_type: market_location_type,
        quantity: o.volume_remain,
        type_id: o.type_id
      });
      this.marketAssetsNames.set(item_id,
        'Sell value: ' + (o.volume_remain * o.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    });
  }

  private linkMarketOrdersData(): void {
    const orders = this.esiData.charOrders.filter(o => !o.is_buy_order);
    const loc_ids = set(orders.map(o => o.location_id)); // all markets
    loc_ids.forEach(loc_id => this.linkMarket(loc_id, orders.filter(o => o.location_id == loc_id)));
    this.processItems(this.marketAssets);
  }


  private getEsiLocationInfo(item_id: number): EsiDataLocationInfo {
    return this.esiData.locationsInfo.get(item_id) || (
      this.marketLocations.includes(item_id) ? {
          name: '*** Market hangar ***', // ${this.esiData.locationsInfo.get(this.locations.get(item_id).parent).name}
          type_info: 'Sell orders'
        } : {
          name: 'Unknown location',
          type_info: `ID = ${item_id}`
        });   
  }  

  private getAssetsItem(item_id: number): EsiAssetsItem | null {
    return this.esiData.findCharAssetsItem(item_id) || this.marketAssets.find(item => item.item_id == item_id);
  }

  private getAssetsItemName(item_id: number): string | null {
    return this.marketAssetsNames.get(item_id) || this.esiData.charAssetsNames.get(item_id);
  }

  private loadAssetsItemNames(ids: number[]): Observable<null> {
    const marketIds = this.marketAssets.map(item => item.item_id);
    return this.esiData.loadCharacterAssetsNames(ids.filter(id => !marketIds.includes(id)));
  }
  
  // get assets info for loc_id
  private getAssets(loc_id: number): Observable<ContData> {
    if (this.locations) return this.getLocation(loc_id);
    return zip(
      this.esiData.loadPrices(),
      this.esiData.loadCharacterAssets(),
      this.esiData.loadCharacterOrders()
    ).pipe(
      delay(0), // just to update page
      mergeMap(() => this.buildLocations()),
      mergeMap(() => this.getLocation(loc_id))
    );
  }

  ngOnInit(): void {
    this.locationItems = new MatTableDataSource<ItemData>();
    this.locationItems.sortingDataAccessor = (item: ItemData, property): string | number => {
      switch(property) {
        case 'name': return item.info.name + '\0' + item.info.comment;
        default: return item[property];
      }
    };
    this.location$ = this.route.paramMap.pipe(
      map(params => +params.get('id')),
      switchMap((id): Observable<ContData> => concat(
        of({ item: this.getItemInfo(id) }),
        this.getAssets(id)).pipe(
          catchError(err => {
            console.log(err);
            return of({ error: err, item: this.getItemInfo(id) });
          })
        )
      ),
      tap(loc => this.locationItems.data = loc.items || [])
    );
  }

  ngAfterViewInit(): void {
    this.locationItems.sort = this.sort;
  }

  private getItemInfo(item: number | EsiAssetsItem): ItemInfo {
    if (typeof item !== 'number')
      return {
        id: item.item_id,
        name: this.getItemName(item),
        comment: this.getAssetsItemName(item.item_id),
        type_id: item.type_id,
        image: this.esi.getItemIconURI(item.type_id, 32)
      };
    const locInfo = this.getEsiLocationInfo(item);
    return locInfo.type_id ? {
      id: item,
      name: locInfo.name,
      comment: this.esiData.typesInfo.get(locInfo.type_id).name,
      type_id: locInfo.type_id,
      image: this.esi.getItemIconURI(locInfo.type_id, 32)
    } : {
      id: item,
      name: locInfo.name,
      comment: locInfo.type_info,
      type_id: null,
      image: null
    };
  }

  getItemName(item: EsiAssetsItem): string {
    const name = this.esiData.typesInfo.get(item.type_id).name;
    return item.is_blueprint_copy ? name + ' (Copy)' : name;
  }

  getItemPrice(item: EsiAssetsItem): number {
    return item && (item.is_blueprint_copy ? 0 : (this.esiData.prices.get(item.type_id) || 0) * item.quantity);
  }

  private getItemVol(item: EsiAssetsItem): number {
    if (item == null) return null;
    if (this.isVirtualContainer(item.type_id))
      return this.getLocationContentVol(this.locations.get(item.item_id));
    const typeInfo = this.esiData.typesInfo.get(item.type_id);
    const isEmpty = this.locations.get(item.item_id) == null;
    return typeInfo ? (isEmpty && typeInfo.packaged_volume || typeInfo.volume) * item.quantity : 0;
  }

  private getLocationContentVol(locData: LocationData): number | null {
    if (locData == null) return undefined;
    if (locData.volume == null)
      locData.volume = locData.items
        .map(id => this.getAssetsItem(id))
        .filter(item => item != null)
        .map(item => this.getItemVol(item))
        .reduce((acc, v) => (acc === null || v === null ? null : acc + v), 0);
    return locData.volume;
  }

  private getLocationRoute(loc_id: number): number[] {
    let route = [];
    do {
      route = [loc_id, ...route];
      loc_id = this.locations.get(loc_id).parent;
    } while (loc_id != null);
    return route;
  }

  private getLocation(loc_id: number): Observable<ContData> {
    const locData = this.locations.get(loc_id);
    if (locData == null) return throwError(new Error(`Unknown location '${loc_id}'`));
    const route = this.getLocationRoute(loc_id);
    const usedItem = [loc_id, ...locData.items].map(id => this.getAssetsItem(id)).filter(item => !!item);
    return forkJoin([ // ensure data is available ...
      this.loadAssetsItemNames(usedItem.map(item => item.item_id)), // ... user names
      this.esiData.loadTypeInfo(usedItem.map(item => item.type_id)) // ... typeInfo
    ]).pipe(
      map(() => {
        // might be top level location_id (for root) or item_id (else)
        const locItems = locData.items.map(item_id => {
          const itemLocData = this.locations.get(item_id);
          const itemItem = this.getAssetsItem(item_id);
          return {
            info: this.getItemInfo(itemItem || item_id),
            quantity: itemItem && itemItem.quantity,
            value: (this.getItemPrice(itemItem) || 0) + (itemLocData && itemLocData.value || 0),
            volume: this.getItemVol(itemItem),
            content_volume: this.getLocationContentVol(itemLocData),
            content_id: itemLocData && item_id
          } as ItemData;
        });
        const locItem = this.getAssetsItem(loc_id); // location item or null for top/root level location locID
        return {
          item: this.getItemInfo(locItem || loc_id),
          route: route.map(item_id => this.getItemInfo(this.getAssetsItem(item_id) || item_id)),
          stat: [
            { title: 'Item Value (ISK)', content: this.getItemPrice(locItem) },
            { title: 'Item Volume (m3)', content: this.getItemVol(locItem) },
            { title: 'Content Value (ISK)', content: locData.value },
            { title: 'Content Volume (m3)', content: this.getLocationContentVol(locData) }
          ],
          items: locItems
        } as ContData
      }));
  }

}
