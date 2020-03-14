import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest, defer, of, merge, throwError, concat, empty, Subject } from 'rxjs';
import { concatMap, map, tap, switchAll, switchMap, catchError } from 'rxjs/operators';

import {
  EsiDataService,
  EsiDataSystemInfo,
  fltBuySell,
  EsiLocationType,
  EsiDataStationInfo,
  EsiDataStructureInfo
} from '../services/eve-esi/eve-esi-data.service';
import { EsiCacheService } from '../services/eve-esi/eve-esi-cache.service';
import { EsiService } from '../services/eve-esi/eve-esi.module';

import { MatSort, Sort } from '@angular/material/sort';
import { DataSource } from '@angular/cdk/collections';

import { LocUID, LocPos, LocTypeInfo, LocData, LocPropVal, locPropVal, locPropAdd } from './location.models';

import { autoMap, set, fltRemove } from '../utils/utils';

const UNIVERSE_UID = 'universe';
const UNIVERSE_IMAGE_URL = ''; // TODO
const ASSET_IMAGE_URL = ''; // TODO
const CHARACTER_IMAGE_URL = ''; // TODO
const SYSTEM_IMAGE_URL = ''; // TODO
const PREVIEW_IMAGE_URL = ''; // TODO
const UNKNOWN_IMAGE_URL = ''; // TODO
const STRUCTURE_IMAGE_URL = ''; // TODO
const WRAP_IMAGE_ID = 3468; // Plastic Wrap

interface LocationRouteNode {
  name: string;
  comment?: string;
  link: string;
}

interface LocationStat {
  title: string;
  value: LocPropVal;
}

interface LocationInfo {
  name: string;
  comment?: string;
  image?: string;
  stats: LocationStat[];
  route: LocationRouteNode[];
}

interface ItemRecord {
  is_header?: boolean;
  position: string;
  link?: string;
  name: string;
  comment?: string;
  quantity: LocPropVal;
  value: LocPropVal;
  volume: LocPropVal;
  content_volume: LocPropVal;
}

const cmpItemRecords = (sort: Sort) => (r1: ItemRecord, r2: ItemRecord): number => {
  if (sort.direction === '') return 0;
  const fullName = (r: ItemRecord): string => [r.name, r.comment].join('\0');
  let r: number;
  switch (sort.active) {
    case 'name':
      r = fullName(r1).localeCompare(fullName(r2));
      break;
    case 'value':
      r = locPropVal(r1.value) - locPropVal(r2.value);
      break;
    case 'volume':
      r = locPropVal(r1.volume) - locPropVal(r2.volume);
      break;
    case 'content':
      r = locPropVal(r1.content_volume) - locPropVal(r2.content_volume);
      break;
    default:
      return 0;
  }
  if (r && sort.direction === 'desc') return -r;
  return r;
};

interface LocationRecord {
  info: LocationInfo;
  data?: ItemRecord[];
  error?: unknown;
}

interface LocationItem {
  is_bpc: boolean;
  is_vcont: boolean;
  item_id?: number;
  name: string;
  location: LocPos;
  type_id: number;
  quantity: number;
}
const locItemHash = (i: LocationItem): string =>
  `${i.item_id}|${i.name}|${i.type_id}|${i.location.uid}|${i.location.pos}|${i.is_bpc}`;

/** Converts LocUID to URL parameter */
function getLink(uid: LocUID | undefined): string | undefined {
  return uid && String(uid);
}

/** Converts URL parameter to LocUID */
function getUID(link: string | null): LocUID {
  return link || UNIVERSE_UID;
}

const virtualContainerTypes: number[] = [EsiService.TYPE_ID_AssetSafetyWrap, EsiService.TYPE_ID_PlasticWrap];
function isVirtualContainer(type_id: number): boolean {
  return virtualContainerTypes.includes(type_id);
}

class LocationDataSource implements DataSource<ItemRecord> {
  private _data = new BehaviorSubject<ItemRecord[]>([]);
  private _sort = new Subject<Observable<Sort>>();

  connect(): Observable<ItemRecord[]> {
    return combineLatest(this._data.asObservable(), this._sort.asObservable().pipe(switchAll())).pipe(
      map(([data, sort]) => {
        const groups = data.reduce(
          autoMap(item => item.position),
          new Map()
        );
        const items = Array.from(groups.entries())
          .map(([pos, items]) => [
            // header
            {
              is_header: true,
              position: '',
              name: pos,
              value: items.map(i => i.value).reduce(locPropAdd, ''),
              volume: items.map(i => i.volume).reduce(locPropAdd, '')
            } as ItemRecord,
            // entries
            ...items.sort(cmpItemRecords(sort))
          ])
          .sort(([p1], [p2]) => cmpItemRecords(sort)(p1, p2)) // sort headers
          .reduce((s, a) => s.concat(a), []);
        return items;
      })
    );
  }

  disconnect(): void {
    this._data.complete();
    this._sort.complete();
  }

  set data(data: ItemRecord[]) {
    this._data.next(data);
  }

  set sort(sort: MatSort) {
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
  dataSource = new LocationDataSource();

  @ViewChild(MatSort) sort?: MatSort;

  ngAfterViewInit(): void {
    if (this.sort != undefined) this.dataSource.sort = this.sort;
  }

  isHeader(index: number, item: ItemRecord): boolean {
    return item.is_header || false;
  }
  isNum(v: unknown): boolean {
    return typeof v === 'number';
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
    // Define 'universe' item
    this.locs.set(
      UNIVERSE_UID,
      new LocData(
        { name: 'Universe', comment: this.esi.serverName, icon: UNIVERSE_IMAGE_URL },
        undefined,
        UNIVERSE_UID,
        []
      )
    );

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
      image: typeof loc.info.icon === 'number' ? this.esi.getItemIconURI(loc.info.icon, 32) : loc.info.icon,
      stats: [
        { title: 'Value (ISK)', value: loc.Value },
        { title: 'Content Value (ISK)', value: loc.ContentValue },
        { title: 'Item Volume (m3)', value: loc.Volume },
        { title: 'Content Volume (m3)', value: loc.ContentVolume }
      ],
      route: route.map(l => ({ name: l.info.name, comment: l.info.comment, link: getLink(l.content_uid)! })) //TODO: set position as hint
    };
  }

  /** Creates LocData[] route from the top of loc's tree to the loc */
  private getRoute(loc: LocData, route: LocData[] = []): LocData[] {
    route = [loc, ...route];
    return loc.parent == undefined ? route : this.getRoute(this.loc(loc.parent.uid), route);
  }

  private buildLocationTree(): Observable<never> {
    return this.locs.size !== 1 ? empty() : this.loadLocations();
  }

  private createDataRecords(loc: LocData): ItemRecord[] {
    if (loc.content_items == undefined) return [];
    return loc.content_items.map(i => ({
      position: (i.parent as LocPos).pos || '',
      name: i.info.name,
      comment: i.info.comment,
      link: getLink(i.content_uid),
      quantity: i.quantity || '',
      value: i.TotalValue,
      volume: i.Volume,
      content_volume: i.ContentVolume
    }));
  }

  private loadLocations(): Observable<never> {
    return concat(this.cache.loadMarketPrices(), merge(this.loadAssets(), this.loadSellOrders())).pipe(
      map(locs => locs.filter(loc => loc.parent)), // console.log(`Location ${loc} has no link data. Ignored.`);
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
    if (loc.content_uid != undefined) this.locs.set(loc.content_uid, loc);
    const p_uid = loc.parent!.uid;
    const p_loc = this.locs.get(p_uid);
    if (p_loc == undefined) this.addChild(this.buildLocation(p_uid, [loc]));
    else p_loc.AddItems([loc], this.locs);
  }

  /** Preload all stations/structures/systems/contellations/regions information */
  private preloadLocations(locs: LocData[]): Observable<never> {
    const ids = locs
      .filter(loc => loc.parent != undefined)
      .map(loc => +(loc.parent as LocPos).uid)
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
      icon: UNKNOWN_IMAGE_URL
    };
  }

  private locInfo_AssetSafety(): LocTypeInfo {
    return {
      name: 'Asset Safety',
      icon: ASSET_IMAGE_URL
    };
  }

  private locInfo_Character(id: number): LocTypeInfo {
    const idn = this.data.character;
    if (idn == undefined || idn.id !== id) return this.locInfo_TxtId('Character', id);
    return {
      name: idn.name,
      icon: this.esi.getCharacterAvatarURI(id, 32)
    };
  }

  private locInfo_System(info: EsiDataSystemInfo): LocTypeInfo {
    return {
      name: info.name,
      icon: SYSTEM_IMAGE_URL
    };
  }

  private locInfo_Station(info: EsiDataStationInfo): LocTypeInfo {
    return {
      name: info.name,
      icon: info.type_id
    };
  }

  private locInfo_Structure(info: EsiDataStructureInfo): LocTypeInfo {
    return {
      name: info.name,
      icon: info.type_id || STRUCTURE_IMAGE_URL
    };
  }

  /** Builds new LocData structure for id */
  private buildLocation(uid: LocUID, items: LocData[]): LocData {
    const locData = (info: LocTypeInfo, parent: LocPos = { uid: UNIVERSE_UID }): LocData =>
      new LocData(info, parent, uid, items);
    const id = +uid;
    const locType = EsiService.getLocationTypeById(id);
    switch (locType) {
      case 'asset_safety':
        return locData(this.locInfo_AssetSafety());
      case 'character':
        return locData(this.locInfo_Character(id));
      case 'solar_system': {
        const info = this.cache.systemsInfo.get(id)!;
        return locData(this.locInfo_System(info), {
          uid: UNIVERSE_UID,
          pos: this.cache.regionsInfo.get(this.cache.constellationsInfo.get(info.constellation_id)!.region_id)!.name
        });
      }
      case 'station': {
        const info = this.cache.stationsInfo.get(id)!;
        return locData(this.locInfo_Station(info), { uid: String(info.system_id) });
      }
      case 'unknown': // try as a structure
      case 'structure': {
        const info = this.cache.structuresInfo.get(id)!;
        return info.forbidden
          ? locData(this.locInfo_TxtId('Forbidden', id))
          : locData(this.locInfo_Structure(info), { uid: String(info.solar_system_id) });
      }
      default:
        return locData(this.locInfo_TxtId('Unsupported', id));
    }
  }

  private updateLocTypeInfo(info: LocTypeInfo, type_id: number, name: string): void {
    const typeInfo = this.cache.typesInfo.get(type_id)!;
    info.name = name || typeInfo.name;
    info.comment = (name && typeInfo.name) || undefined;
    info.icon = type_id;
    //info.value = this.cache.marketPrices.get(type_id);
    info.volume = typeInfo.packaged_volume;
    info.assembled_volume = typeInfo.volume;
  }

  private typeInfos = new Map<number, LocTypeInfo>();
  private typeInfoLoader(item: LocationItem): LocTypeInfo {
    const item_name = item.name;
    const type_id = item.type_id;
    const loader = (info: LocTypeInfo): Observable<never> =>
      this.cache
        .loadTypesInfo([type_id])
        .pipe(tap({ complete: () => this.updateLocTypeInfo(info, type_id, item_name) }));
    const infoLoader = { name: '', image: '', value: this.cache.marketPrices.get(type_id), loader };
    if (item_name || item.is_bpc) return infoLoader;
    // no name, not bpc
    const info = this.typeInfos.get(type_id);
    if (info) return info;
    this.typeInfos.set(type_id, infoLoader);
    return infoLoader;
  }

  private createLocContentItems(items: LocationItem[]): LocData[] {
    return Array.from(items.reduce(autoMap(locItemHash), new Map()).values(), item_group => {
      const item = item_group.reduce((s, x) => ({ ...x, quantity: x.quantity + s.quantity }));
      const loc = new LocData(
        this.typeInfoLoader(item),
        item.location,
        item.item_id == undefined ? undefined : String(item.item_id),
        undefined
      );
      loc.quantity = item.quantity;
      loc.is_vcont = item.is_vcont;
      return loc;
    });
  }

  private loadAssets(): Observable<LocData[]> {
    return concat(
      this.cache.loadCharacterItems(),
      defer(() => {
        const items = [...this.cache.characterItems.values()];
        const cIds = set(items.map(item => item.location_id));
        let locs = this.createLocContentItems(
          items.map(item => ({
            is_bpc: item.is_blueprint_copy || false,
            is_vcont: isVirtualContainer(item.type_id),
            item_id: cIds.includes(item.item_id) ? item.item_id : undefined,
            name: item.name || '',
            location: {
              uid: String(item.location_id),
              pos: item.location_flag
                .split(/(?=[A-Z])|\d+/) // /(?=\p{Lu})|\d+/u
                .filter(w => w)
                .join(' ')
            },
            type_id: item.type_id,
            quantity: item.quantity
          }))
        );
        [...locs].forEach(loc => {
          const linked = locs.filter(unloc => (unloc.parent as LocPos).uid === loc.content_uid);
          if (linked.length) {
            loc.content_items = linked;
            locs = locs.filter(fltRemove(linked));
          }
        });
        return of(locs);
      })
    );
  }

  private loadSellOrders(): Observable<LocData[]> {
    return concat(
      this.cache.loadCharacterMarketOrders(),
      defer(() =>
        of(
          Array.from(
            this.cache.characterMarketOrders
              .filter(fltBuySell('sell'))
              .reduce(
                autoMap(o => o.location_id),
                new Map()
              )
              .entries(),
            ([l_id, orders]) => {
              const location = { uid: `ord${l_id}`, pos: 'Sell' };
              return new LocData(
                { name: 'Market orders', icon: '' },
                { uid: String(l_id), pos: 'Marketplace' },
                location.uid,
                this.createLocContentItems(
                  orders.map(o => ({
                    is_bpc: false,
                    is_vcont: false,
                    name: '',
                    location,
                    type_id: o.type_id,
                    quantity: o.volume_remain
                  }))
                ),
                true
              );
            }
          )
        )
      )
    );
  }
}
