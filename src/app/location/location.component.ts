import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, defer, from, of, merge, throwError, concat, empty } from 'rxjs';
import { concatMap, expand, map, tap, ignoreElements, mergeMap, switchMap, catchError } from 'rxjs/operators';

import {
  EsiItem,
  EsiDataService,
  EsiDataSystemInfo,
  EsiDataCharMarketOrder,
  fltBuySell,
  EsiLocationType,
  EsiDataStationInfo,
  EsiDataStructureInfo
} from '../services/eve-esi/eve-esi-data.service';
import { EsiCacheService } from '../services/eve-esi/eve-esi-cache.service';
import { EsiService } from '../services/eve-esi/eve-esi.module';

import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';

import { LocUID, LocPosition, LocParentLink, LocTypeInfo, LocData } from './location.models';

import { set, tuple, fltRemove } from '../utils/utils';

const UNIVERSE_UID = 'universe';
const UNIVERSE_IMAGE_URL = ''; // TODO
const ASSET_IMAGE_URL = ''; // TODO
const CHARACTER_IMAGE_URL = ''; // TODO
const SYSTEM_IMAGE_URL = ''; // TODO
const PREVIEW_IMAGE_URL = ''; // TODO
const UNKNOWN_IMAGE_URL = ''; // TODO
const STRUCTURE_IMAGE_URL = ''; // TODO

interface LocationRouteNode {
  name: string;
  comment?: string;
  link: string;
}

interface LocationStat {
  title: string;
  value: number;
}

interface LocationInfo {
  name: string;
  comment?: string;
  image?: string;
  stats: LocationStat[];
  route: LocationRouteNode[];
}

interface ItemRecord {
  position: string;
  name: string;
  comment?: string;
  link?: string;
  quantity: number | '';
  value: number | '';
  volume: number | string;
}

interface LocationRecord {
  info: LocationInfo;
  data?: ItemRecord[];
  error?: unknown;
}

/** Converts LocUID to URL parameter */
function getLink(uid: LocUID): string {
  return String(uid);
}

/** Converts URL parameter to LocUID */
function getUID(link: string | null): LocUID {
  return link || UNIVERSE_UID;
}

@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.css']
})
export class LocationComponent {
  location$: Observable<LocationRecord>;

  displayedColumns: string[] = ['name', 'quantity', 'value', 'volume'];
  dataSource = new MatTableDataSource<ItemRecord>();

  @ViewChild(MatSort) sort?: MatSort;

  ngAfterViewInit(): void {
    if (this.sort != undefined) this.dataSource.sort = this.sort;
  }

  private locs = new Map<LocUID, LocData>();
  private loc(uid: LocUID): LocData {
    return this.locs.get(uid) as LocData;
  }

  constructor(
    private route: ActivatedRoute,
    private esi: EsiService,
    private data: EsiDataService,
    private cache: EsiCacheService
  ) {
    this.dataSource.sortingDataAccessor = (item: ItemRecord, property: string): string | number => {
      switch (property) {
        case 'name':
          return item.name + '\0' + item.comment;
        case 'quantity':
        case 'value':
        case 'volume': {
          const val = item[property];
          return typeof val === 'number' ? val : '';
        }
        default:
          return '';
      }
    };

    // Define 'universe' item
    this.locs.set(UNIVERSE_UID, {
      uid: UNIVERSE_UID,
      info: {
        name: 'Universe',
        comment: this.esi.serverName,
        image: UNIVERSE_IMAGE_URL
      },
      content_items: [] // empty so far
    });

    this.location$ = this.route.paramMap.pipe(
      map(params => getUID(params.get('id'))),
      switchMap(uid =>
        concat(
          this.buildLocationPreview(uid),
          this.buildLocationTree(),
          defer(() =>
            this.buildLocationData(uid).pipe(
              catchError(error => {
                console.log(error);
                return this.buildLocationPreview(uid, [], error);
              })
            )
          )
        )
      ),
      tap(loc => (this.dataSource.data = loc.data || []))
    );
  }

  /** Emits LocationRecord value (with info and error? fields only) */
  private buildLocationPreview(uid: LocUID, data?: ItemRecord[], error?: unknown): Observable<LocationRecord> {
    return of({ info: this.createLocationInfo(uid), data, error });
  }

  /** Emits LocationRecord value */
  private buildLocationData(uid: LocUID): Observable<LocationRecord> {
    const loc = this.locs.get(uid);
    if (loc == undefined) return throwError(new Error(`Unknown location '${uid}'`));
    const route = this.getRoute(loc);
    const content = loc.content_items;
    const usedLocs = content ? [...route, ...content] : route;
    const lazyInfos = set(usedLocs.filter(loc => loc.info.loader).map(loc => loc.info));
    return concat(
      merge(...lazyInfos.map(info => info.loader!(info))),
      defer(() =>
        of({
          info: this.createLocationInfo(loc, route),
          data: this.createDataRecords(loc)
        })
      )
    );
  }

  /** Assembles LocationInfo structure for LocUID/LocData */
  private createLocationInfo(uid: LocUID | LocData, route: LocData[] = []): LocationInfo {
    const loc = typeof uid === 'object' ? uid : this.locs.get(uid);
    if (loc == undefined)
      return {
        name: `*** Unknown item '${uid}' *** `,
        //image: question mark
        stats: [],
        route: []
      };
    return {
      name: loc.info.name,
      comment: loc.info.comment,
      image: typeof loc.info.image === 'string' ? loc.info.image : this.esi.getItemIconURI(loc.info.image, 32),
      stats: [],
      route: route.map(l => ({ name: l.info.name, comment: l.info.comment, link: getLink(l.uid as LocUID) })) //TODO: set position as hint
    };
  }

  /** Creates LocData[] route from the top of loc's tree to the loc */
  private getRoute(loc: LocData, route: LocData[] = []): LocData[] {
    route = [loc, ...route];
    const parent = loc.link;
    return parent == undefined ? route : this.getRoute(this.loc(parent[0]), route);
  }

  private buildLocationTree(): Observable<never> {
    return this.locs.size !== 1 ? empty() : this.loadLocations();
  }

  private createDataRecords(loc: LocData): ItemRecord[] {
    if (loc.content_items == undefined) return [];
    return loc.content_items.map(l => ({
      position: (l.link as [string, string])[1],
      name: l.info.name,
      comment: l.info.comment,
      link: l.uid && getLink(l.uid),
      quantity: l.quantity || '',
      value: '',
      volume: ''
    }));
  }

  private loadLocations(): Observable<never> {
    return merge(
      this.loadAssets()
    ).pipe(
      map(locs => locs.filter(loc => loc.link != undefined)), // console.log(`Location ${loc} has no link data. Ignored.`);
      concatMap(locs =>
        this.preloadLocations(locs).pipe(
          tap({
            complete: () => locs.forEach(loc => this.addChild(loc))
          })
        )
      )
    );
  }
  private addChild(loc: LocData): void {
    if (loc.uid != undefined) this.locs.set(loc.uid, loc);
    const parentLink = loc.link![0];
    const parent = this.locs.get(parentLink);
    if (parent == undefined) this.addChild(this.buildLocation(parentLink, [loc]));
    else {
      if (parent.content_items) parent.content_items.push(loc);
      else parent.content_items = [loc];
    }
  }

  /** Preload all stations/structures/systems/contellations/regions information */
  private preloadLocations(locs: LocData[]): Observable<never> {
    const ids = locs
      .filter(loc => loc.link != undefined)
      .map(loc => +loc.link![0])
      .reduce(
        (m, id) => {
          m[EsiService.getLocationTypeById(id)].push(id);
          return m;
        },
        {
          asset_safety: [],
          station: [],
          solar_system: [],
          character: [],
          unknown: [],
          structure: []
        } as {
          [key in EsiLocationType]: number[];
        }
      );
    return this.cache.loadSSSCR({ str: [...ids.structure, ...ids.unknown], sta: ids.station, sys: ids.solar_system });
  }

  private locInfo_TxtId(txt: string, id: number): LocTypeInfo {
    return {
      name: `*** ${txt} ID=${id}' ***`,
      image: UNKNOWN_IMAGE_URL
    };
  }

  private locInfo_AssetSafety(): LocTypeInfo {
    return {
      name: 'Asset Safety',
      image: EsiService.LOCATION_ID_AssetSafety
    };
  }

  private locInfo_Character(id: number): LocTypeInfo {
    const idn = this.data.character;
    if (idn == undefined || idn.id !== id) return this.locInfo_TxtId('Character', id);
    return {
      name: idn.name,
      image: this.esi.getCharacterAvatarURI(id, 32)
    };
  }

  private locInfo_System(info: EsiDataSystemInfo): LocTypeInfo {
    return {
      name: info.name,
      image: SYSTEM_IMAGE_URL
    };
  }

  private locInfo_Station(info: EsiDataStationInfo): LocTypeInfo {
    return {
      name: info.name,
      image: info.type_id
    };
  }

  private locInfo_Structure(info: EsiDataStructureInfo): LocTypeInfo {
    return {
      name: info.name,
      image: info.type_id || STRUCTURE_IMAGE_URL
    };
  }

  /** Builds new LocData structure for id */
  private buildLocation(uid: LocUID, content_items: LocData[]): LocData {
    const id = +uid;
    const locType = EsiService.getLocationTypeById(id);
    const data = {
      uid,
      content_items
    };
    switch (locType) {
      case 'asset_safety':
        return {
          ...data,
          info: this.locInfo_AssetSafety(),
          link: [UNIVERSE_UID]
        };
      case 'character':
        return {
          ...data,
          info: this.locInfo_Character(id),
          link: [UNIVERSE_UID]
        };
      case 'solar_system': {
        const info = this.cache.systemsInfo.get(id)!;
        return {
          ...data,
          info: this.locInfo_System(info),
          link: [
            UNIVERSE_UID,
            this.cache.regionsInfo.get(this.cache.constellationsInfo.get(info.constellation_id)!.region_id)!.name
          ]
        };
      }
      case 'station': {
        const info = this.cache.stationsInfo.get(id)!;
        return {
          ...data,
          info: this.locInfo_Station(info),
          link: [String(info.system_id)]
        };
      }
      case 'unknown': // try as a structure
      case 'structure': {
        const info = this.cache.structuresInfo.get(id)!;
        return info.forbidden
          ? {
              ...data,
              info: this.locInfo_TxtId('Forbidden', id),
              link: [UNIVERSE_UID]
            }
          : {
              ...data,
              info: this.locInfo_Structure(info),
              link: [String(info.solar_system_id)]
            };
      }
      default:
        return {
          ...data,
          info: this.locInfo_TxtId('Unsupported', id),
          link: [UNIVERSE_UID]
        };
    }
  }

  private loadAssets(): Observable<LocData[]> {
    return concat(
      merge(
        this.cache.loadMarketPrices(),
        concat(
          this.cache.loadCharacterItems(),
          defer(() => this.cache.loadCharacterItemNames())
        )
      ),
      defer(() => {
        const locs = this.cache.characterItems.map(
          item =>
            ({
              uid: String(item.item_id),
              info: {
                name: `type_id=${item.type_id}`,
                image: item.type_id
              },
              link: [String(item.location_id), item.location_flag],
              quantity: item.quantity
            } as LocData)
        );
        let unlinked = [...locs];
        locs.forEach(loc => {
          const linked = unlinked.filter(unloc => (unloc.link as LocParentLink)[0] === loc.uid);
          if (!linked.length) loc.uid = undefined;
          else {
            loc.content_items = linked;
            unlinked = unlinked.filter(fltRemove(linked));
          }
        });
        return of(unlinked);
      })
    );
  }
}

////////
////////
////////
////////
////////
////////

/*

  private assembleUID(id: number): ItemUID {
    return `item${id}`;
  }

  private parseUID(uid: ItemUID): number | false {
    const prefix = 'item';
    return uid.startsWith(prefix) && +uid.substring(prefix.length);
  }
  
  private getItemMarketPrice(item: EsiItem): number | undefined {
    return item.is_blueprint_copy ? undefined : this.cache.marketPrices.get(item.type_id);
  }

  private addChildren(item: ItemInfo, uids: ItemUID[]): void {
    if (item.content == undefined) item.content = { value: 0, volume: 0, uids };
    else item.content.uids = [...item.content.uids, ...uids];
  }

  private assembleTypeName(item: EsiItem): string | undefined {
    const info = this.cache.typesInfo.get(item.type_id);
    if (info == undefined) return undefined;
    const name = info.name;
    return item.is_blueprint_copy ? name + ' (Copy)' : name;
  }

  private updateCharacterItemInfo(item: EsiItem, info: ItemInfo): void {
    const typeName = this.assembleTypeName(item);
    if (typeName == undefined) return;
    const assetName = this.cache.characterItemNames.get(item.item_id);
    if (assetName == undefined) return;
    info.name = assetName || typeName;
    info.comment = (assetName && typeName) || undefined;
    info.incomplete = undefined;
  }

  private linkCharacterItems(parent: ItemInfo): Observable<never> {
    const items = this.cache.characterItems;
    // add all items
    items.forEach(item => {
      const info = {
        uid: this.assembleUID(item.item_id),
        name: `Item #${item.item_id}`,
        imageUrl: item.type_id,
        value: this.getItemMarketPrice(item),
        incomplete: true
      };
      this.updateCharacterItemInfo(item, info);
      this.items.set(info.uid, info);
    });
    // connect children
    const locIds = set(items.map(item => item.location_id));
    locIds.map(asKeys(items, (l_id, item) => l_id === item.location_id)).forEach(([l_id, items]) => {
      const l_uid = this.assembleUID(l_id);
      const l_item = this.item(l_uid);
      this.addChildren(
        l_item,
        items.map(item => this.assembleUID(item.item_id))
      );
      items.forEach(item => {
        this.item(this.assembleUID(item.item_id)).loc = {
          container: l_uid,
          position: item.location_flag,
          quantity: item.quantity
        };
      });
    });
    // connect to parent
    this.addChildren(
      parent,
      items
        .map(item => item.item_id)
        .filter(fltRemove(locIds))
        .map(id => this.assembleUID(id))
    );
    //return this.cache.loadLocationsInfo(this.loc(root).items.filter(id => this.isAssetItem(id)));  TODO
    return empty();
  }

  private updateCharacterItems(items: ItemInfo[]): Observable<never> {
    const pairs = items
      .map(i => tuple(this.parseUID(i.uid), i))
      .filter(([id]) => id !== false)
      .map(([id, i]) => tuple(this.cache.characterItems.find(i => id === i.item_id) as EsiItem, i));
    return concat(
      merge(
        this.cache.loadCharacterItemNames(pairs.map(([i]) => i.item_id)),
        this.cache.loadTypesInfo(pairs.map(([i]) => i.type_id))
      ),
      defer(() => {
        pairs.forEach(([esiItem, item]) => this.updateCharacterItemInfo(esiItem, item));
        return empty();
      })
    );
  }

  //////////////////////
  //////////////////////
  //////////////////////
  //////////////////////
  //////////////////////
  
    /*
      call(() =>
        of({
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
      )
    );
    ()
    */
/*
  
  }


  private processItems(items: EsiItem[]): void {
    items.forEach(item => {
      if (!this.locations.has(item.item_id)) this.loc(item.location_id).items.push(item.item_id); // add item_id to location items
      const value = this.getItemPrice(item);
      this.getLocationRoute(item.location_id).forEach(loc_id => (this.loc(loc_id).value += value));
    });
  }

  private addLocation(id: number, parent = 0): void {
    this.locations.set(id, { items: [], volume: undefined, value: 0, parent });
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

  private getItemInfo(item: EsiItem | number): ItemInfo {
    if (typeof item !== 'number') {
      const assetName = this.getItemName(item.item_id);
      const typeName = this.getTypeName(item.type_id, item.is_blueprint_copy);
      const name = (this.isAssetItem(item.item_id) ? assetName || typeName : typeName) || '*undefined*';
      const comment = this.isAssetItem(item.item_id) ? assetName && typeName : assetName;
      return {
        id: item.item_id,
        name,
        comment,
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

  //  private marketLocations: number[] = []; // loc_id for market location
//  private marketItems: EsiItem[] = [];
//  private marketItemNames: Map<number, string> = new Map();

/*
this.locationsInfo = new Map<number, EsiDataLocationInfo>([
  [0, { name: 'Universe', type_info: 'Tranquility' }],
  [EsiService.LOCATION_ID_AssetSafety, { name: 'Asset Safety', type_info: '' }]
]);
*/

/*
const virtualContainerTypes: number[] = [EsiService.TYPE_ID_AssetSafetyWrap];

function isVirtualContainer(type_id: number): boolean {
  return virtualContainerTypes.includes(type_id);
}
*/

//const observe = <T>(f: () => Observable<T>): Observable<T> => of(f).pipe(switchMap(f => f()));

/*
}
*/
