import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest, defer, from, fromEvent, of, merge, throwError, concat, empty, Subject } from 'rxjs';
import { concatMap, expand, map, tap, ignoreElements, mergeMap, switchAll, switchMap, catchError } from 'rxjs/operators';

import {
  EsiDataItem,
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

import { MatSort, Sort } from '@angular/material/sort';
import { CollectionViewer, DataSource } from '@angular/cdk/collections';
import { MatTableDataSource } from '@angular/material/table';

import { LocUID, LocPosition, LocParentLink, LocTypeInfo, LocData } from './location.models';

import { autoMap, set, tuple, fltRemove } from '../utils/utils';

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
  value: number | ''; // '' - no data
}

interface LocationInfo {
  name: string;
  comment?: string;
  image?: string;
  stats: LocationStat[];
  route: LocationRouteNode[];
}

type ItemVolume = number | undefined; // number - volume, NaN - 'n/a', undefined - 'not ready'

interface ItemRecord {
  position: string;
  name: string;
  comment?: string;
  link?: string;
  quantity?: number;
  value?: number;
  volume: number | '' | 'NaN';
  content_volume: number | '' | 'NaN';
  is_header?: boolean;
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

const virtualContainerTypes: number[] = [EsiService.TYPE_ID_AssetSafetyWrap];
function isVirtualContainer(type_id: number): boolean {
  return virtualContainerTypes.includes(type_id);
}

class LocationDataSource implements DataSource<ItemRecord> {
  private _data = new BehaviorSubject<ItemRecord[]>([]);
  private _sort = new BehaviorSubject<Observable<Sort>>(of({ active: '', direction: '' }));

  
  private sumItems(
    items: ItemRecord[]
  ): { value?: number; volume: number | '' | 'NaN'; content_volume: number | '' | 'NaN' } {
    const r = (s: number | '' | 'NaN', v: number | '' | 'NaN'): number | '' | 'NaN' => {
      if (v === 'NaN') return s;
      if (v === '' || s === '') return '';
      if (s === 'NaN') return v;
      return s + v;
    };
    return {
      value: items
        .map(i => i.value)
        .reduce((s, v) => {
          if (v === undefined) return s;
          if (s === undefined) return v;
          return s + v;
        }, undefined),
      volume: items.map(i => i.volume).reduce(r, 'NaN'),
      content_volume: 'NaN'
    };
  }
  /*
  private sumItems(
    items: ItemRecord[]
  ): { value?: number; volume: number | '' | 'NaN'; content_volume: number | '' | 'NaN' } {
    return {
      value: undefined,
      volume: 'NaN',
      content_volume: 'NaN'
    };
  }
  */
  connect(): Observable<ItemRecord[]> {
    console.log('connect');
    return combineLatest(
      this._data.asObservable().pipe(tap(d=>console.log(`data=${d.length}`))),
      this._sort.asObservable().pipe(switchAll(), tap(s=>console.log(`sort=${JSON.stringify(s)}`)))
    ).pipe(
      tap(([data, sort]) => console.log(`d=${data.length} s=${JSON.stringify(sort)}`)),
      map(([data, sort]) => {
        const cmpItems = (r1: ItemRecord, r2: ItemRecord): number => {
          if (sort.direction === '') return 0;
          let r;
          switch (sort.active) {
            case 'name': {
              const s1 = r1.name + '\0' + r1.comment;
              const s2 = r2.name + '\0' + r2.comment;
              r = s1.localeCompare(s2);
              break;
            }
            case 'value':
              r = (r1.value || 0) - (r2.value || 0);
              break;
            case 'volume':
              r = (typeof r1.volume === 'number' ? r1.volume : 0) - (typeof r2.volume === 'number' ? r2.volume : 0);
              break;
            case 'content':
              r = (typeof r1.content_volume === 'number' ? r1.content_volume : 0) - (typeof r2.content_volume === 'number' ? r2.content_volume : 0);
              break;
            default:
              return 0;
          }
          if (r && sort.direction === 'desc') return -r;
          return r;
        };
        const groups = data.reduce(
          autoMap(item => item.position),
          new Map()
        );
        const items = Array.from(groups.entries())
          .map(([pos, items]) => [
            { position: '', name: pos, ...this.sumItems(items), is_header: true } as ItemRecord,
            ...items.sort(cmpItems)
          ])
          .sort(([p1], [p2]) => cmpItems(p1, p2))
          .reduce((s, a) => s.concat(a), []);
        return items;
      })
    );
  }

  disconnect(): void {
    console.log('disconnect');
    this._data.complete();
    this._sort.complete();
  }

  set data(data: ItemRecord[]) {
    console.log('set(data)');
    this._data.next(data);
  }

  set sort(sort: MatSort) {
    console.log('set(sort)');
    this._sort.next(sort.sortChange.asObservable());
    sort.sortChange.emit({ active: sort.active, direction: sort.direction });
  }
}

@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.css']
})
export class LocationComponent {
  location$: Observable<LocationRecord>;

  displayedColumns: string[] = ['link', 'name', 'quantity', 'value', 'volume', 'content'];
  displayedHeaderColumns: string[] = ['name'];
  //displayedHeaderColumns: string[] = ['name', 'value', 'volume', 'content'];
  dataSource = new LocationDataSource();

  @ViewChild(MatSort) sort?: MatSort;

  ngAfterViewInit(): void {
    if (this.sort != undefined) this.dataSource.sort = this.sort;
  }

  isHeader(index: number, item: ItemRecord): boolean {
    return item.is_header || false;
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
    /*
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
    */
    // Define 'universe' item
    this.locs.set(UNIVERSE_UID, {
      uid: UNIVERSE_UID,
      info: {
        name: 'Universe',
        comment: this.esi.serverName,
        image: UNIVERSE_IMAGE_URL
      }
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
    return concat(
      merge(...set(usedLocs.map(loc => loc.info).filter(info => info.loader)).map(info => info.loader!(info))),
      defer(() =>
        of({
          info: this.createLocationInfo(loc, route),
          data: this.createDataRecords(loc)
        })
      )
    );
  }

  private convetVolume(volume: ItemVolume): number | '' | 'NaN' {
    if (volume == undefined) return '';
    if (Number.isNaN(volume)) return 'NaN';
    return volume;
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
    const stats: LocationStat[] = [];
    const totalValue = this.calcItemValue(loc) == undefined ? undefined : this.calcTotalValue(loc);
    if (totalValue != undefined) stats.push({ title: 'Value (ISK)', value: totalValue });
    const contValue = this.calcContentValue(loc);
    if (contValue != undefined) stats.push({ title: 'Content Value (ISK)', value: contValue });
    if (!loc.is_virtual_container) {
      const itemVolume = this.calcItemVolume(loc);
      if (itemVolume == undefined || !Number.isNaN(itemVolume))
        stats.push({ title: 'Item Volume (m3)', value: this.convetVolume(itemVolume) as number | '' });
    }
    const contVolume = this.calcContentVolume(loc);
    if (contVolume == undefined || !Number.isNaN(contVolume))
      stats.push({ title: 'Content Volume (m3)', value: this.convetVolume(contVolume) as number | '' });
    return {
      name: loc.info.name,
      comment: loc.info.comment,
      image: typeof loc.info.image === 'string' ? loc.info.image : this.esi.getItemIconURI(loc.info.image, 32),
      stats,
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

  /** Calculates item q-pack value */
  private calcItemValue(item: LocData): number | undefined {
    if (item.quantity == undefined) return undefined; // N/A
    if (item.info.value == undefined) return NaN; // error
    return item.quantity * item.info.value;
  }

  /** Calculates total item value */
  private calcTotalValue(item: LocData): number {
    return (this.calcContentValue(item) || 0) + (this.calcItemValue(item) || 0);
  }

  /** Calculates item's content value */
  private calcContentValue(item: LocData): number | undefined {
    if (item.content_value == undefined)
      item.content_value = item.content_items && item.content_items.reduce((s, i) => s + this.calcTotalValue(i), 0);
    return item.content_value;
  }

  /** Calculates item q-pack volume */
  private calcItemVolume(item: LocData): ItemVolume {
    if (!item.quantity) return NaN;
    if (item.is_virtual_container) return this.calcContentVolume(item);
    const volume = item.content_items ? item.info.assembled_volume : item.info.volume;
    return volume && volume * item.quantity;
  }

  /** Calculates item's content volume */
  private calcContentVolume(item: LocData): ItemVolume {
    if (!item.content_items) return NaN;
    if (item.content_volume == undefined) {
      item.content_volume = item.content_items.reduce<ItemVolume>((s, i) => {
        if (s == undefined) return undefined;
        const v = this.calcItemVolume(i);
        if (v == undefined) return undefined;
        if (Number.isNaN(s) && Number.isNaN(v)) return NaN; // NaN + NaN => NaN
        return (Number.isNaN(s) ? 0 : s) + (Number.isNaN(v) ? 0 : v); // NaN + number => number
      }, NaN);
    }
    return item.content_volume;
  }

  private createDataRecords(loc: LocData): ItemRecord[] {
    if (loc.content_items == undefined) return [];
    return loc.content_items.map(l => ({
      position: (l.link as [string, string])[1],
      name: l.info.name,
      comment: l.info.comment,
      link: l.uid && getLink(l.uid),
      quantity: l.quantity,
      value: this.calcTotalValue(l),
      volume: this.convetVolume(this.calcItemVolume(l)),
      content_volume: this.convetVolume(this.calcContentVolume(l))
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
      this.resetContentCache(parent);
    }
  }
  private resetContentCache(loc: LocData | undefined): void {
    while (loc != undefined) {
      loc.content_value = undefined;
      loc.content_volume = undefined;
      loc = loc.link && this.locs.get(loc.link[0]);
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
      name: `*** ${txt} ID=${id} ***`,
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

  private updateLocTypeInfo(info: LocTypeInfo, type_id: number, name: string): void {
    const typeInfo = this.cache.typesInfo.get(type_id)!;
    info.name = name || typeInfo.name;
    info.comment = (name && typeInfo.name) || undefined;
    info.image = type_id;
    //info.value = this.cache.marketPrices.get(type_id);
    info.volume = typeInfo.packaged_volume;
    info.assembled_volume = typeInfo.volume;
  }

  private typeInfos = new Map<number, LocTypeInfo>();
  private typeInfoLoader(item: EsiDataItem): LocTypeInfo {
    const item_name = item.name;
    const type_id = item.type_id;
    const loader = (info: LocTypeInfo): Observable<never> =>
      this.cache
        .loadTypesInfo([type_id])
        .pipe(tap({ complete: () => this.updateLocTypeInfo(info, type_id, item_name) }));
    const infoLoader = { name: '', image: '', value: this.cache.marketPrices.get(type_id) || 0, loader };
    if (item_name || item.is_blueprint_copy) return infoLoader;
    // no name, not bpc
    const info = this.typeInfos.get(type_id);
    if (info) return info;
    this.typeInfos.set(type_id, infoLoader);
    return infoLoader;
  }

  private loadAssets(): Observable<LocData[]> {
    return concat(
      merge(this.cache.loadMarketPrices(), this.cache.loadCharacterItems()),
      defer(() => {
        const itemKey = (i: EsiDataItem): string =>
          `${i.item_id}|${i.name}|${i.type_id}|${i.location_id}|${i.location_flag}|${i.is_blueprint_copy || false}`;
        const items = [...this.cache.characterItems.values()];
        const cIds = set(items.map(item => item.location_id));
        const locs = Array.from(
          items
            .map(item => ({
              ...item,
              item_id: cIds.includes(item.item_id) ? item.item_id : NaN
            }))
            .reduce(autoMap(itemKey), new Map())
            .values(),
          items => items.reduce((s, x) => ({ ...x, quantity: x.quantity + s.quantity }))
        ).map(
          item =>
            ({
              uid: Number.isNaN(item.item_id) ? undefined : String(item.item_id),
              info: this.typeInfoLoader(item),
              link: [String(item.location_id), item.location_flag],
              quantity: item.quantity,
              is_virtual_container: isVirtualContainer(item.type_id) || undefined
            } as LocData)
        );
        let unlinked = [...locs];
        locs.forEach(loc => {
          const linked = unlinked.filter(unloc => (unloc.link as LocParentLink)[0] === loc.uid);
          if (linked.length) {
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
}
*/
