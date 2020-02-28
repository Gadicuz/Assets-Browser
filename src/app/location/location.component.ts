import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map, tap, switchMap, delay, mergeMap, catchError } from 'rxjs/operators';
import { Observable, of, forkJoin, concat, zip, throwError } from 'rxjs';

import {
  EsiDataService,
  EsiDataLocationInfo,
  EsiService,
  EsiAssetsItem,
  EsiOrder
} from '../services/eve-esi/eve-esi-data.service';

import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

import { set, tuple } from '../utils/utils';

interface LocationData {
  items: number[]; // content item_id's
  value: number; // content gross value
  volume: number | undefined; // content volume
  parent?: number; // parent location_id
  type: string; // "station" | "solar_system" | "other" | "?"
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
    stat: { title: string; content: number }[];
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
  private locations = new Map<number, LocationData>();
  private loc(id: number): LocationData {
    return this.locations.get(id) as LocationData;
  }

  private marketLocations: number[] = []; // loc_id for market location
  private marketAssets: EsiAssetsItem[] = [];
  private marketAssetsNames: Map<number, string> = new Map();

  @ViewChild(MatSort) sort?: MatSort;

  constructor(private route: ActivatedRoute, private esi: EsiService, private esiData: EsiDataService) {
    this.dataSource = new MatTableDataSource<ItemData>();
    this.dataSource.sortingDataAccessor = (item: ItemData, property): string | number => {
      switch (property) {
        case 'name':
          return item.info.name + '\0' + item.info.comment;
        default:
          return item[property];
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
    this.locations.set(0, { items: [], volume: undefined, value: 0, type: 'other' }); // root location
    this.linkAssetsItemsData();
    this.linkMarketOrdersData();
    this.linkChildren();
    const rootItems = this.loc(0).items;
    return this.esiData.loadLocationsInfo(rootItems.map(id => [id, this.loc(id).type]));
  }

  private addLocations(loc_ids: [number, string][], parent = 0): void {
    loc_ids.forEach(([id, type]) => this.locations.set(id, { items: [], volume: undefined, value: 0, parent, type }));
  }

  private linkChildren(): void {
    [...this.locations.entries()].forEach(([loc_id, data]) => {
      if (data.parent != undefined) this.loc(data.parent).items.push(loc_id);
    });
  }

  private processItems(items: EsiAssetsItem[]): void {
    items.forEach(item => {
      if (!this.locations.has(item.item_id)) this.loc(item.location_id).items.push(item.item_id); // add item_id to location items
      const value = this.getItemPrice(item);
      this.getLocationRoute(item.location_id).forEach(loc_id => (this.loc(loc_id).value += value));
    });
  }

  private linkAssetsItemsData(): void {
    const items = this.esiData.charAssets;
    this.addLocations(
      Array.from(new Map<number, string>(items.map(item => [item.location_id, item.location_type])).entries()) // link all item's locations to the root
    );
    items
      .map(item => tuple(this.locations.get(item.item_id), item.location_id))
      .filter(([loc]) => loc != undefined)
      .forEach(([loc, pid]) => {
        (loc as LocationData).parent = pid;
      });
    this.processItems(items);
  }

  private linkMarket(loc_id: number, orders: EsiOrder[]): void {
    const market_loc_id = this.esiData.generateCharacterAssetsItemId();
    this.marketLocations.push(market_loc_id);
    if (!this.locations.has(loc_id)) this.addLocations([[loc_id, EsiService.getAssetLocationType(loc_id)]]);
    const market_location_type = 'other';
    this.addLocations([[market_loc_id, market_location_type]], loc_id);
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
      this.marketAssetsNames.set(
        item_id,
        'Sell value: ' +
          (o.volume_remain * o.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );
    });
  }

  private linkMarketOrdersData(): void {
    const orders = this.esiData.charOrders.filter(o => !o.is_buy_order);
    const loc_ids = set(orders.map(o => o.location_id)); // all markets
    loc_ids.forEach(loc_id =>
      this.linkMarket(
        loc_id,
        orders.filter(o => o.location_id == loc_id)
      )
    );
    this.processItems(this.marketAssets);
  }

  private getEsiLocationInfo(item_id: number): EsiDataLocationInfo {
    return (
      this.esiData.locationsInfo.get(item_id) ||
      (this.marketLocations.includes(item_id)
        ? {
            name: '*** Market hangar ***', // ${this.esiData.locationsInfo.get(this.locations.get(item_id).parent).name}
            type_info: 'Sell orders'
          }
        : {
            name: 'Unknown location',
            type_info: `ID = ${item_id}`
          })
    );
  }

  private getAssetsItem(item_id: number): EsiAssetsItem | undefined {
    return this.esiData.findCharAssetsItem(item_id) || this.marketAssets.find(item => item.item_id == item_id);
  }

  private getAssetsItemName(item_id: number): string | undefined {
    return this.marketAssetsNames.get(item_id) || this.esiData.charAssetsNames.get(item_id);
  }

  private loadAssetsItemNames(ids: number[]): Observable<null> {
    const marketIds = this.marketAssets.map(item => item.item_id);
    return this.esiData.loadCharacterAssetsNames(ids.filter(id => !marketIds.includes(id)));
  }

  // get assets info for loc_id
  private getAssets(loc_id: number): Observable<ContData> {
    if (this.locations) return this.getLocation(loc_id);
    return zip(this.esiData.loadPrices(), this.esiData.loadCharacterAssets(), this.esiData.loadCharacterOrders()).pipe(
      delay(0), // just to update page
      mergeMap(() => this.buildLocations()),
      mergeMap(() => this.getLocation(loc_id))
    );
  }

  private getItemInfo(item: EsiAssetsItem | number): ItemInfo {
    if (typeof item !== 'number') {
      const assetName = this.getAssetsItemName(item.item_id);
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
    return this.getItemInfo(this.getAssetsItem(itemId) || itemId);
  }

  getTypeName(type_id: number, isBPC?: boolean): string | undefined {
    const info = this.esiData.typesInfo.get(type_id);
    if (info == undefined) return undefined;
    const name = info.name;
    return isBPC ? name + ' (Copy)' : name;
  }

  getItemPrice(item: EsiAssetsItem | undefined): number {
    return item == undefined
      ? 0
      : item.is_blueprint_copy
      ? 0
      : (this.esiData.prices.get(item.type_id) || 0) * item.quantity;
  }

  private getItemVol(item: EsiAssetsItem | undefined): number | undefined {
    if (item == undefined) return undefined;
    if (this.isVirtualContainer(item.type_id)) return this.getLocationContentVol(this.locations.get(item.item_id));
    const typeInfo = this.esiData.typesInfo.get(item.type_id);
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
        .map(id => this.getAssetsItem(id))
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

  private getLocation(loc_id: number): Observable<ContData> {
    const locData = this.locations.get(loc_id);
    if (locData == undefined) return throwError(new Error(`Unknown location '${loc_id}'`));
    const usedItem = [loc_id, ...locData.items]
      .map(id => this.getAssetsItem(id))
      .filter(item => !!item) as EsiAssetsItem[];
    return forkJoin([
      // ensure data is available ...
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
            value: (this.getItemPrice(itemItem) || 0) + ((itemLocData && itemLocData.value) || 0),
            volume: this.getItemVol(itemItem),
            content_volume: this.getLocationContentVol(itemLocData),
            content_id: itemLocData && item_id
          } as ItemData;
        });
        const locItem = this.getAssetsItem(loc_id); // location item or null for top/root level location locID
        return {
          item: this.getItemInfo(locItem || loc_id),
          content: {
            stat: [
              { title: 'Item Value (ISK)', content: this.getItemPrice(locItem) },
              { title: 'Item Volume (m3)', content: this.getItemVol(locItem) },
              { title: 'Content Value (ISK)', content: locData.value },
              { title: 'Content Volume (m3)', content: this.getLocationContentVol(locData) }
            ],
            route: this.getLocationRoute(loc_id).map(item_id => this.getItemInfoForId(item_id)),
            items: locItems
          }
        } as ContData;
      })
    );
  }
}
