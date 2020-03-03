import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { endWith, map, tap, ignoreElements, switchMap, delay, catchError } from 'rxjs/operators';
import { Observable, of, concat, merge, throwError, empty } from 'rxjs';

import {
  EsiItem,
  EsiDataService,
  EsiDataLocationInfo,
  EsiDataCharMarketOrder,
  fltBuySell
} from '../services/eve-esi/eve-esi-data.service';
import { EsiCacheService } from '../services/eve-esi/eve-esi-cache.service';
import { EsiService } from '../services/eve-esi/eve-esi.module';

import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

import { set, tuple } from '../utils/utils';

interface LocationData {
  items: number[]; // content item_id's
  value: number; // content gross value
  volume: number | undefined; // content volume
  parent?: number; // parent location_id
  //type: string; // "station" | "solar_system" | "other" | "?"
}

interface ItemInfo {
  id: number;
  name: string;
  comment?: string;
  type_id?: number;
  image?: string;
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
  item: ItemInfo;
  content?: {
    stat: { title: string; content: number | undefined }[];
    route: ItemInfo[];
    items: ItemData[];
  };
  error?: unknown;
}

@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.css']
})
export class LocationComponent {
  displayedColumns: string[] = ['name', 'quantity', 'value', 'volume'];
  location$: Observable<ContData>;
  dataSource: MatTableDataSource<ItemData>;

  private readonly virtualContainerTypes: number[] = [EsiService.TYPE_ID_AssetSafetyWrap];

  isVirtualContainer(type_id: number): boolean {
    return this.virtualContainerTypes.includes(type_id);
  }

  // Map  loc_id -> LocationData
  private locations = new Map<number, LocationData>([[0, { items: [], volume: undefined, value: 0 }]]);
  private loc(id: number): LocationData {
    return this.locations.get(id) as LocationData;
  }

  private maxAssetsItemId = 0;
  private isAssetItem(id: number): boolean {
    return id <= this.maxAssetsItemId;
  }

  private marketLocations: number[] = []; // loc_id for market location
  private marketItems: EsiItem[] = [];
  private marketItemNames: Map<number, string> = new Map();

  @ViewChild(MatSort) sort?: MatSort;

  constructor(
    private route: ActivatedRoute,
    private esi: EsiService,
    private data: EsiDataService,
    private cache: EsiCacheService
  ) {
    this.dataSource = new MatTableDataSource<ItemData>();
    this.dataSource.sortingDataAccessor = (item: ItemData, property): string | number => {
      switch (property) {
        case 'name':
          return item.info.name + '\0' + item.info.comment;
        case 'value':
        case 'volume':
          return item[property];
        default:
          return '';
      }
    };
    this.location$ = this.route.paramMap.pipe(
      map(params => +(params.get('id') || '0')),
      switchMap<number, Observable<ContData>>(id =>
        concat(of({ item: this.getItemInfoForId(id) }), this.getAssets(id)).pipe(
          catchError(error => {
            console.log(error);
            return of({ item: this.getItemInfoForId(id), error });
          })
        )
      ),
      tap(loc => (this.dataSource.data = (loc.content && loc.content.items) || []))
    );
  }

  ngAfterViewInit(): void {
    if (this.sort != undefined) this.dataSource.sort = this.sort;
  }

  private buildLocations(): Observable<Map<number, EsiDataLocationInfo>> {
    this.maxAssetsItemId = this.cache.characterItems.reduce((base, i) => (base > i.item_id ? base : i.item_id), 0);
    this.linkItemsData(this.cache.characterItems);
    this.linkMarketData(this.cache.characterMarketOrders.filter(fltBuySell('sell')), this.maxAssetsItemId);
    this.linkChildren();
    return this.cache.loadLocationsInfo(this.loc(0).items.filter(id => this.isAssetItem(id)));
  }

  private addLocation(id: number, parent = 0): void {
    this.locations.set(id, { items: [], volume: undefined, value: 0, parent });
  }

  private linkChildren(): void {
    [...this.locations.entries()].forEach(([loc_id, data]) => {
      if (data.parent != undefined) this.loc(data.parent).items.push(loc_id);
    });
  }

  private processItems(items: EsiItem[]): void {
    items.forEach(item => {
      if (!this.locations.has(item.item_id)) this.loc(item.location_id).items.push(item.item_id); // add item_id to location items
      const value = this.getItemPrice(item);
      this.getLocationRoute(item.location_id).forEach(loc_id => (this.loc(loc_id).value += value));
    });
  }

  private linkItemsData(items: EsiItem[]): void {
    set(items.map(item => item.location_id)).forEach(id => this.addLocation(id));
    items
      .map(item => tuple(this.locations.get(item.item_id), item.location_id))
      .filter(([loc]) => loc != undefined)
      .forEach(([loc, pid]) => ((loc as LocationData).parent = pid));
    this.processItems(items);
  }

  private linkMarket(loc_id: number, orders: EsiDataCharMarketOrder[], id: number): number {
    const market_loc_id = ++id;
    this.marketLocations.push(market_loc_id);
    if (!this.locations.has(loc_id)) this.addLocation(loc_id);
    this.addLocation(market_loc_id, loc_id);
    orders.forEach(o => {
      const item_id = ++id;
      this.marketItems.push({
        is_singleton: true,
        item_id,
        location_flag: 'Locked', //'Market',
        location_id: market_loc_id,
        location_type: 'other',
        quantity: o.volume_remain,
        type_id: o.type_id
      });
      this.marketItemNames.set(
        item_id,
        'Sell value: ' +
          (o.volume_remain * o.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    });
    return id;
  }

  private linkMarketData(orders: EsiDataCharMarketOrder[], id: number): void {
    const loc_ids = set(orders.map(o => o.location_id)); // all markets
    loc_ids.forEach(
      loc_id =>
        (id = this.linkMarket(
          loc_id,
          orders.filter(o => o.location_id == loc_id),
          id
        ))
    );
    this.processItems(this.marketItems);
  }

  private getEsiLocationInfo(id: number): EsiDataLocationInfo {
    const unk = {
      name: 'Unknown location',
      type_info: `ID = ${id}`
    };
    if (this.isAssetItem(id)) return this.cache.locationsInfo.get(id) || unk;
    return this.marketLocations.includes(id)
      ? {
          name: '*** Market hangar ***', // ${this.esiData.locationsInfo.get(this.locations.get(item_id).parent).name}
          type_info: 'Sell orders'
        }
      : unk;
  }

  private getItem(id: number): EsiItem | undefined {
    return this.isAssetItem(id)
      ? this.cache.findChararacterItem(id)
      : this.marketItems.find(item => item.item_id == id);
  }

  private getItemName(id: number): string | undefined {
    return this.isAssetItem(id) ? this.cache.characterItemNames.get(id) : this.marketItemNames.get(id);
  }

  private loadItemNames(ids: number[]): Observable<Map<number, string | undefined>> {
    return this.cache.loadCharacterItemNames(ids.filter(id => this.isAssetItem(id)));
  }

  // get assets info for loc_id
  private getAssets(loc_id: number): Observable<ContData> {
    return concat(
      this.locations
        ? empty()
        : concat(
            merge(
              this.cache.loadMarketPrices(),
              this.cache.loadCharacterItems(),
              this.cache.loadCharacterMarketOrders()
            ),
            this.buildLocations()
          ).pipe(delay(0), ignoreElements()),
      this.getLocation(loc_id)
    );
  }

  private getItemInfo(item: EsiItem | number): ItemInfo {
    if (typeof item !== 'number') {
      const assetName = this.getItemName(item.item_id);
      const typeName = this.getTypeName(item.type_id, item.is_blueprint_copy);
      return {
        id: item.item_id,
        name: assetName || typeName || '*undefined*',
        comment: assetName && typeName,
        type_id: item.type_id,
        image: this.esi.getItemIconURI(item.type_id, 32)
      };
    }
    const locInfo = this.getEsiLocationInfo(item);
    return locInfo.type_id
      ? {
          id: item,
          name: locInfo.name,
          comment: this.getTypeName(locInfo.type_id),
          type_id: locInfo.type_id,
          image: this.esi.getItemIconURI(locInfo.type_id, 32)
        }
      : {
          id: item,
          name: locInfo.name,
          comment: locInfo.type_info
        };
  }

  private getItemInfoForId(itemId: number): ItemInfo {
    return this.getItemInfo(this.getItem(itemId) || itemId);
  }

  getTypeName(type_id: number, isBPC?: boolean): string | undefined {
    const info = this.cache.typesInfo.get(type_id);
    if (info == undefined) return undefined;
    const name = info.name;
    return isBPC ? name + ' (Copy)' : name;
  }

  getItemPrice(item: EsiItem | undefined): number {
    return item == undefined
      ? 0
      : item.is_blueprint_copy
      ? 0
      : (this.cache.marketPrices.get(item.type_id) || 0) * item.quantity;
  }

  private getItemVol(item: EsiItem | undefined): number | undefined {
    if (item == undefined) return undefined;
    if (this.isVirtualContainer(item.type_id)) return this.getLocationContentVol(this.locations.get(item.item_id));
    const typeInfo = this.cache.typesInfo.get(item.type_id);
    if (typeInfo == undefined) return undefined;
    const isEmpty = !this.locations.has(item.item_id);
    const vol = (isEmpty && typeInfo.packaged_volume) || typeInfo.volume;
    if (vol == undefined) return undefined;
    return vol * item.quantity;
  }

  private getLocationContentVol(locData: LocationData | undefined): number | undefined {
    if (locData == undefined) return undefined;
    if (locData.volume == undefined)
      locData.volume = locData.items
        .map(id => this.getItem(id))
        .filter(item => !!item) // ???
        .map(item => this.getItemVol(item))
        .reduce((acc, v) => (acc == undefined || v == undefined ? undefined : acc + v), 0);
    return locData.volume;
  }

  private getLocationRoute(loc_id: number): number[] {
    let loc: number | undefined = loc_id;
    let route: number[] = [];
    do {
      route = [loc, ...route];
      loc = this.loc(loc).parent;
    } while (loc != undefined);
    return route;
  }

  private assembleItemData(item_id: number): ItemData {
    const itemLocData = this.locations.get(item_id);
    const itemItem = this.getItem(item_id);
    return {
      info: this.getItemInfo(itemItem || item_id),
      quantity: itemItem && itemItem.quantity,
      value: (this.getItemPrice(itemItem) || 0) + ((itemLocData && itemLocData.value) || 0),
      volume: this.getItemVol(itemItem),
      content_volume: this.getLocationContentVol(itemLocData),
      content_id: itemLocData && item_id
    } as ItemData;
  }

  private getLocation(loc_id: number): Observable<ContData> {
    const locData = this.locations.get(loc_id);
    if (locData == undefined) return throwError(new Error(`Unknown location '${loc_id}'`));
    const locItem = this.getItem(loc_id); // location item or null for top/root level location locID
    const locItems = locData.items.map(id => this.getItem(id));
    const usedItems = [locItem, ...locItems].filter(item => !!item) as EsiItem[];
    return merge(
      // ensure data is available ...
      this.loadItemNames(usedItems.map(item => item.item_id)), // ... user names
      this.cache.loadTypesInfo(usedItems.map(item => item.type_id)) // ... typeInfo
    ).pipe(
      ignoreElements(),
      endWith({
        item: this.getItemInfo(locItem || loc_id),
        content: {
          stat: [
            { title: 'Item Value (ISK)', content: this.getItemPrice(locItem) },
            { title: 'Item Volume (m3)', content: this.getItemVol(locItem) },
            { title: 'Content Value (ISK)', content: locData.value },
            { title: 'Content Volume (m3)', content: this.getLocationContentVol(locData) }
          ],
          route: this.getLocationRoute(loc_id).map(item_id => this.getItemInfoForId(item_id)),
          items: locData.items.map(item_id => this.assembleItemData(item_id))
        }
      })
    );
  }
}
