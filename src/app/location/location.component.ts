import { Component, ViewChild, NgModule } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { combineLatest, defer, of, merge, throwError, concat, EMPTY } from 'rxjs';
import { concatMap, map, tap, switchAll, switchMap, catchError } from 'rxjs/operators';

import {
  EsiDataService,
  fltBuySell,
  EsiLocationType,
  EsiDataItem,
  EsiDataInfo,
  EsiDataBpd,
  EsiDataCharMarketOrder,
  isWrapping,
  getIconID,
  getLocationTypeById,
  EsiIndustryJob,
  ESI_MANUFACTURING,
  ESI_REACTION,
} from '../services/eve-esi/eve-esi-data.service';
import { EsiCacheService } from '../services/eve-esi/eve-esi-cache.service';
import { EsiService, getCharacterAvatarURI, getTypeIconURI } from '../services/eve-esi/eve-esi.module';

import { MatSort, Sort } from '@angular/material/sort';
import { DataSource } from '@angular/cdk/collections';

import {
  LocUID,
  LocPos,
  LocTypeInfo,
  fnInfoLoader,
  LocData,
  LocPropVal,
  locPropVal,
  locPropAdd,
  locPropDiv,
} from './location.models';

import { autoMap, set, mapGet } from '../utils/utils';
import { ToolScopes, TOOL_SCOPES } from '../scopes-setup/scopes-setup.component';
import { LocationLogisticsDialog, LocationLogisticData, LocationLogisticsDataItem } from './location-logistics-dialog';
import { MatDialog } from '@angular/material/dialog';
import { SdeService } from '../services/eve-sde/eve-sde-service';
import { SDE_BlueprintActivityName } from '../services/eve-sde/models/eve-sde-blueprints';

const UNIVERSE_UID = 'universe';
const UNIVERSE_IMAGE_URL = ''; // TODO
const ASSET_IMAGE_URL = ''; // TODO
const SYSTEM_IMAGE_URL = ''; // TODO
const UNKNOWN_IMAGE_URL = ''; // TODO
const STRUCTURE_IMAGE_URL = ''; // TODO
const MARKET_IMAGE_URL = ''; // TODO
const INDUSTRY_IMAGE_URL = ''; // TODO

const TRADE_POS = 'Trade Hangar';

interface LocationRouteNode {
  name: string;
  comment?: string;
  link: string;
}

interface LocationStat {
  title: string[];
  value: LocPropVal;
  actions: { name: string; value: string }[];
}

interface LocationInfo {
  name: string;
  comment?: string;
  image?: string;
  stats: LocationStat[];
  route: LocationRouteNode[];
  data?: LocData;
  done?: boolean;
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
  volume_assembled: LocPropVal;
  value_average: LocPropVal;
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
    case 'assembled':
      r = locPropVal(r1.volume_assembled) - locPropVal(r2.volume_assembled);
      break;
    case 'average':
      r = locPropVal(r1.value_average) - locPropVal(r2.value_average);
      break;
    default:
      return 0;
  }
  if (r && sort.direction === 'desc') return -r;
  return r;
};

interface LocationRecord {
  info?: LocationInfo;
  data?: ItemRecord[];
  error?: unknown;
}

interface LocationItem {
  is_vcont: boolean;
  item_id?: number;
  name: string;
  comment: string;
  location: LocPos;
  type_id: number;
  quantity: number;
  bp_type?: 'original' | 'copy' | undefined; // undefined for nonBP, also can be undefined for BPO
  bp_data?: EsiDataBpd; // undefined fot nonBP or no blueprints data available
}
const locItemHash = (i: LocationItem): string =>
  `${i.item_id || 0}|${i.name}|${i.comment}|${i.type_id}|${i.location.uid}|${i.location.pos || ''}`;

class LocationDataSource implements DataSource<ItemRecord> {
  private _data = new BehaviorSubject<ItemRecord[]>([]);
  private _sort = new Subject<Observable<Sort>>();

  connect(): Observable<ItemRecord[]> {
    return combineLatest([this._data.asObservable(), this._sort.asObservable().pipe(switchAll())]).pipe(
      map(([data, sort]) => {
        const groups = data.reduce(
          autoMap((item) => item.position),
          new Map()
        );
        const items = Array.from(groups.entries())
          .map(([pos, items]) => [
            // header
            {
              is_header: true,
              position: '',
              name: pos,
              value: items.map((i) => i.value).reduce(locPropAdd, ''),
              volume: items.map((i) => i.volume).reduce(locPropAdd, ''),
            } as ItemRecord,
            // entries
            ...items.sort(cmpItemRecords(sort)),
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

const features: ToolScopes = [
  {
    name: 'Assets Browser',
    scopes: 'esi-universe.read_structures.v1',
    char_scopes: 'esi-assets.read_assets.v1',
    corp_scopes: 'esi-assets.read_corporation_assets.v1',
    corp_role: 'Director',
  },
  {
    name: 'blueprints details',
    char_scopes: 'esi-characters.read_blueprints.v1',
    corp_scopes: 'esi-corporations.read_blueprints.v1',
    corp_role: 'Director',
  },
  {
    name: 'market orders',
    char_scopes: 'esi-markets.read_character_orders.v1',
    corp_scopes: 'esi-markets.read_corporation_orders.v1',
    corp_role: 'Accountant,Trader',
  },
  {
    name: 'industry products',
    char_scopes: 'esi-industry.read_character_jobs.v1',
    corp_scopes: 'esi-industry.read_corporation_jobs.v1',
    corp_role: 'Factory_Manager',
  },
];

@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.css'],
})
export class LocationComponent {
  location$: Observable<LocationRecord>;

  displayedColumns: string[] = ['link', 'name', 'quantity', 'volume', 'assembled', 'average', 'value'];
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
    private sde: SdeService,
    private data: EsiDataService,
    private cache: EsiCacheService,
    private dialog: MatDialog
  ) {
    // Define 'universe' item
    this.locs.set(
      UNIVERSE_UID,
      new LocData(
        { name: 'Universe', comment: this.esi.serverName, icon: UNIVERSE_IMAGE_URL },
        { uid: '' },
        UNIVERSE_UID,
        []
      )
    );

    this.location$ = combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([p, q]) => ({
        uid: p.get('id') || UNIVERSE_UID,
        mode: p.get('mode'),
        subj_id: this.data.parseSubjectId(q.get('subj')),
      })),
      switchMap((params) =>
        concat(
          this.buildLocationNoData(params.uid),
          this.buildLocationTree(params.subj_id),
          defer(() =>
            this.buildLocationData(params.uid, params.mode === 'deep').pipe(
              catchError((error) => this.buildLocationNoData(params.uid, error))
            )
          )
        )
      ),
      tap((loc) => (this.dataSource.data = loc.data || [])),
      catchError((error) => of({ error: error as unknown }))
    );
  }

  /** Emits LocationRecord value (with info and error? fields only) */
  private buildLocationNoData(uid: LocUID, error?: unknown): Observable<LocationRecord> {
    return of({ info: this.createLocationInfo(uid, [], false, !!error), undefined, error });
  }

  /** Emits LocationRecord value */
  private buildLocationData(uid: LocUID, all: boolean): Observable<LocationRecord> {
    const loc = this.locs.get(uid);
    if (loc == undefined) return throwError(new Error(`Unknown location '${uid}'`));
    const route = this.getRoute(loc, undefined);
    let content = loc.content_items || [];
    if (all) content = LocationComponent.flatten(content);
    return concat(
      LocationComponent.loadInfo([...route, ...content]),
      defer(() =>
        of({
          info: this.createLocationInfo(loc, route, true, true),
          data: this.createDataRecords(loc),
        })
      )
    );
  }

  /** Assembles LocationInfo structure for LocUID/LocData */
  private createLocationInfo(uid: LocUID | LocData, route: LocData[], totals: boolean, done: boolean): LocationInfo {
    const loc = typeof uid === 'object' ? uid : this.locs.get(uid);
    return loc == undefined
      ? {
          name: `*** Unknown item '${uid as LocUID}' *** `,
          //image: question mark
          stats: [],
          route: [],
          done,
        }
      : {
          name: loc.info.name,
          comment: loc.info.comment,
          image: typeof loc.info.icon === 'number' ? getTypeIconURI(loc.info.icon, 32) : loc.info.icon,
          stats: totals
            ? [
                { title: ['Item Value', '(ISK)'], value: loc.Value, actions: [] },
                { title: ['Item Packaged', '(m3)'], value: loc.VolumePackaged(), actions: [] },
                { title: ['Cont. Value', '(ISK)'], value: loc.ContentValue, actions: [] },
                {
                  title: ['Cont. Packaged', '(m3)'],
                  value: loc.VolumeContentCargo(),
                  actions: [{ name: 'insert_chart_outlined', value: 'packaged' }],
                },
                {
                  title: ['Cont. Assembled', '(m3)'],
                  value: loc.VolumeContentAssembled(),
                  actions: [{ name: 'insert_chart_outlined', value: 'assembled' }],
                },
              ]
            : [],
          route: route.map((l) => ({ name: l.info.name, comment: l.info.comment, link: l.Link as string })), //TODO: set position as hint
          data: loc,
          done,
        };
  }

  /** Creates LocData[] route from the top of loc's tree to the loc */
  private getRoute(loc: LocData | undefined, root: LocData | undefined, route: LocData[] = []): LocData[] {
    return loc != root && loc != undefined ? this.getRoute(this.locs.get(loc.ploc.uid), root, [loc, ...route]) : route;
  }

  private buildLocationTree(subj_id: number): Observable<never> {
    return this.locs.size !== 1 ? EMPTY : this.loadLocations(subj_id);
  }

  private createDataRecords(loc: LocData): ItemRecord[] {
    if (loc.content_items == undefined) return [];
    return loc.content_items.map((i) => {
      const value = i.TotalValue;
      const volume = i.VolumeCargo();
      const volume_assembled = i.VolumeAssembled();
      return {
        position: i.ploc.pos || '',
        name: i.info.name,
        comment: i.info.comment,
        link: i.Link,
        quantity: i.quantity || '',
        value,
        volume,
        volume_assembled,
        value_average: locPropDiv(value, locPropAdd(volume, volume_assembled)),
      };
    });
  }

  private invalidateLoc(loc: LocData): void {
    const path = (p: LocData[]): LocData[] => {
      const p_uid = p[0].ploc.uid;
      const p_loc = p_uid ? this.locs.get(p_uid) : undefined;
      return p_loc == undefined ? p : path([p_loc, ...p]);
    };
    path([loc]).forEach((l) => l.InvalidateCache());
  }

  private addChild(loc: LocData): void {
    const p_uid = loc.ploc.uid;
    const p_loc = this.locs.get(p_uid);
    if (p_loc != undefined) {
      p_loc.AddItems([loc]);
      this.invalidateLoc(p_loc);
    } else {
      loc = this.buildStdLocation(p_uid, [loc]);
      this.locs.set(p_uid, loc);
      this.addChild(loc);
    }
  }
  /** nodes: only locations with content, assm: don't flatten assembled items */
  private static flatten(
    l: LocData[],
    opt: { nodes?: boolean; assm?: boolean } = { nodes: false, assm: false }
  ): LocData[] {
    if (opt.nodes) l = l.filter((i) => i.content_uid);
    return l.length
      ? l
          .map((i) => {
            if (!i.content_items || (opt.assm && i.info.do_not_pack)) return [i];
            return [i, ...LocationComponent.flatten(i.content_items, opt)];
          })
          .reduce((s, i) => s.concat(i))
      : [];
  }
  private loadLocations(subj_id: number): Observable<never> {
    return concat(
      this.cache.loadMarketPrices(),
      merge(this.loadAssets(subj_id), this.loadSellOrders(subj_id), this.loadIndustryProducts(subj_id))
    ).pipe(
      map((locs) => locs.filter((loc) => loc.ploc.uid)), // console.log(`Location ${loc} has no link data. Ignored.`);
      concatMap((locs) =>
        this.preloadLocations(locs).pipe(
          tap({
            complete: () => {
              locs.forEach((loc) => this.addChild(loc));
              LocationComponent.flatten(locs, { nodes: true }).forEach((loc) =>
                this.locs.set(loc.content_uid as LocUID, loc)
              );
            },
          })
        )
      )
    );
  }

  /** Preload all stations/structures/systems/contellations/regions information */
  private preloadLocations(locs: LocData[]): Observable<never> {
    const ids = locs
      .map((loc) => +loc.ploc.uid)
      .reduce(
        (m, id) => {
          m[getLocationTypeById(id)].push(id);
          return m;
        },
        {
          asset_safety: [],
          station: [],
          solar_system: [],
          character: [],
          unknown: [],
          structure: [],
        } as {
          [key in EsiLocationType]: number[];
        }
      );
    return this.cache.loadSSSCR({ str: [...ids.structure, ...ids.unknown], sta: ids.station, sys: ids.solar_system });
  }

  private locInfo_TxtId(txt: string, id: number): LocTypeInfo {
    return {
      name: `*** ${txt} ID=${id} ***`,
      icon: UNKNOWN_IMAGE_URL,
    };
  }

  private locInfo_AssetSafety(): LocTypeInfo {
    return {
      name: 'Asset Safety Delivery System',
      icon: ASSET_IMAGE_URL,
    };
  }

  private locInfo_Character(id: number): LocTypeInfo {
    const char_subj = this.data.findSubject(id, 'characters');
    return {
      name: char_subj ? char_subj.name : `Character #${id}`,
      icon: getCharacterAvatarURI(id, 32),
    };
  }

  private locInfo_System(info: EsiDataInfo<'systems'>): LocTypeInfo {
    return {
      name: info.name,
      icon: SYSTEM_IMAGE_URL,
    };
  }

  private locInfo_Station(info: EsiDataInfo<'stations'>): LocTypeInfo {
    return {
      name: info.name,
      icon: info.type_id,
    };
  }

  private locInfo_Structure(info: EsiDataInfo<'structures'>): LocTypeInfo {
    return {
      name: info.name,
      icon: info.type_id || STRUCTURE_IMAGE_URL,
    };
  }

  /** Builds new LocData structure for id */
  private buildStdLocation(uid: LocUID, items: LocData[]): LocData {
    const locData = (info: LocTypeInfo, parent: LocPos = { uid: UNIVERSE_UID }): LocData =>
      new LocData(info, parent, uid, items);
    const id = +uid;
    const locType = getLocationTypeById(id);
    switch (locType) {
      case 'asset_safety':
        return locData(this.locInfo_AssetSafety());
      case 'character':
        return locData(this.locInfo_Character(id));
      case 'solar_system': {
        const info = mapGet(this.cache.systemsInfo, id);
        return locData(this.locInfo_System(info), {
          uid: UNIVERSE_UID,
          pos: mapGet(this.cache.regionsInfo, mapGet(this.cache.constellationsInfo, info.constellation_id).region_id)
            .name,
        });
      }
      case 'station': {
        const info = mapGet(this.cache.stationsInfo, id);
        return locData(this.locInfo_Station(info), { uid: String(info.system_id) });
      }
      case 'unknown': // try as a structure
      case 'structure': {
        const info = mapGet(this.cache.structuresInfo, id);
        return info.forbidden
          ? locData(this.locInfo_TxtId('Forbidden', id))
          : locData(this.locInfo_Structure(info), { uid: String(info.solar_system_id) });
      }
      default:
        return locData(this.locInfo_TxtId('Unsupported', id));
    }
  }

  private updateLocTypeInfo(info: LocTypeInfo, type_id: number, item: LocationItem): void {
    const typeInfo = mapGet(this.cache.typesInfo, type_id);
    info.name = item.name || typeInfo.name;
    info.comment = item.comment || (item.name && typeInfo.name) || undefined;
    info.icon = getIconID(type_id) || UNKNOWN_IMAGE_URL;
    //info.value = this.cache.marketPrices.get(type_id);
    info.volume = typeInfo.packaged_volume || typeInfo.volume; // (packaged) item's volume
    if (typeInfo.packaged_volume) info.assembled_volume = typeInfo.volume; // assembled volume
    info.loader = undefined;
  }

  private typeInfos = new Map<number, LocTypeInfo>();
  private typeInfoLoader(item: LocationItem): LocTypeInfo {
    const type_id = item.type_id;
    const loader = (info: LocTypeInfo): Observable<never> =>
      this.cache.loadTypeInfo(type_id).pipe(tap({ complete: () => this.updateLocTypeInfo(info, type_id, item) }));
    const infoLoader = {
      name: '',
      image: '',
      value: item.bp_type === 'copy' ? undefined : this.cache.marketPrices.get(type_id),
      do_not_pack: this.data.isShipType(type_id), // keep assembled for ships
      loader,
    };
    if (item.name || item.comment || item.bp_type || item.bp_data) return infoLoader;
    // common type_id loader
    const info = this.typeInfos.get(type_id);
    if (info) return info;
    this.typeInfos.set(type_id, infoLoader);
    return infoLoader;
  }

  private static loadInfo(locs: LocData[]): Observable<never> {
    const infos = set(locs.map((loc) => loc.info).filter((info) => info.loader));
    return merge(...infos.map((info) => (info.loader as fnInfoLoader)(info)));
  }

  private createLocContentItems(items: LocationItem[]): LocData[] {
    return Array.from(items.reduce(autoMap(locItemHash), new Map()).values(), (item_group) => {
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

  private moveShips(items: EsiDataItem[]): void {
    items
      .filter((i) => i.location_flag === 'Hangar' && this.data.isShipType(i.type_id)) // move all ships from 'Hangar' ...
      .forEach((i) => (i.location_flag = 'ShipHangar')); // ... to 'ShipHangar'
  }
  private loadAssets(subj_id: number): Observable<LocData[]> {
    function bpComment(d?: EsiDataBpd, isCopy?: boolean): string {
      if (!d && !isCopy) return '';
      const [c, r, m, t] = d ? [d.runs, d.runs || '?', d.me, d.te] : [isCopy, '?', '?', '?'];
      return (c ? `Copy (${r})` : 'Original') + ` - ${m}/${t}`;
    }
    return concat(this.data.loadCategories(), this.cache.loadItems(subj_id)).pipe(
      map((cache) => {
        const items = [...cache.values()];
        this.moveShips(items);
        const cIds = set(items.map((item) => item.location_id));
        let locs = this.createLocContentItems(
          items.map((item) => ({
            is_vcont: isWrapping(item.type_id),
            item_id: cIds.includes(item.item_id) ? item.item_id : undefined,
            name: item.name || '',
            comment: bpComment(item.bp_data, item.is_blueprint_copy),
            location: {
              uid: String(item.location_id),
              pos: item.location_flag
                .split(/(?=[A-Z])|\d+/) // /(?=\p{Lu})|\d+/u
                .filter((w) => w)
                .join(' '),
            },
            type_id: item.type_id,
            quantity: item.quantity,
            bp_type: item.is_blueprint_copy
              ? 'copy'
              : item.bp_data || this.data.isBlueprintType(item.type_id)
              ? 'original'
              : undefined,
            bp_data: item.bp_data,
          }))
        );
        locs
          .filter((loc) => loc.content_uid)
          .forEach((loc) => {
            [loc.content_items, locs] = locs.reduce(
              (s, l) => {
                s[l.ploc.uid === loc.content_uid ? 0 : 1].push(l);
                return s;
              },
              [[], []] as [LocData[], LocData[]]
            );
          });
        return locs; // unlinked top level locations
      })
    );
  }

  private loadSellOrders(subj_id: number): Observable<LocData[]> {
    return this.cache.loadMarketOrders(subj_id).pipe(
      this.data.scoped([] as EsiDataCharMarketOrder[]),
      map((orders) => {
        return Array.from(
          orders
            .filter(fltBuySell('sell'))
            .reduce(
              autoMap((o) => o.location_id),
              new Map()
            )
            .entries(),
          ([l_id, orders]) => {
            const location = { uid: `ord${l_id}`, pos: 'Sell' };
            return new LocData(
              { name: 'Market orders', icon: MARKET_IMAGE_URL },
              { uid: String(l_id), pos: TRADE_POS },
              location.uid,
              this.createLocContentItems(
                orders.map((o) => ({
                  is_vcont: false,
                  name: '',
                  comment: `Price: ${o.price}, total: ${o.volume_total}`,
                  location,
                  type_id: o.type_id,
                  quantity: o.volume_remain,
                }))
              ),
              true
            );
          }
        );
      })
    );
  }

  private loadIndustryProducts(subj_id: number): Observable<LocData[]> {
    return this.data.loadIndustryJobs(subj_id).pipe(
      this.data.scoped([] as EsiIndustryJob[]),
      map((jobs) => jobs.filter((j) => ['active', 'paused', 'ready'].includes(j.status))),
      map((jobs) => jobs.filter((j) => [ESI_MANUFACTURING, ESI_REACTION].includes(j.activity_id))),
      map((jobs) => jobs.filter((j) => j.product_type_id)),
      switchMap((jobs) =>
        this.sde
          .loadBlueprints(set(jobs.map((j) => j.blueprint_type_id)), {
            activities: ['manufacturing', 'reaction'],
            properties: ['products'],
          })
          .pipe(
            map((bps) => {
              function getProductsQuantity(j: EsiIndustryJob): number {
                const n: SDE_BlueprintActivityName = j.activity_id === ESI_MANUFACTURING ? 'manufacturing' : 'reaction';
                const q =
                  bps
                    .find((bp) => bp.blueprintTypeID === j.blueprint_type_id)
                    ?.activities?.[n]?.products?.find((p) => p.typeID === j.product_type_id)?.quantity || 0;
                return q * j.runs;
              }
              return Array.from(
                jobs
                  .reduce(
                    autoMap((j) => j.station_id),
                    new Map()
                  )
                  .entries(),
                ([l_id, jobs]) => {
                  const l_uid = `ind${l_id}`;
                  return new LocData(
                    { name: 'Industry Jobs Outcome', icon: INDUSTRY_IMAGE_URL },
                    { uid: String(l_id), pos: 'Service Facility' },
                    l_uid,
                    this.createLocContentItems(
                      jobs.map((j) => ({
                        is_vcont: false,
                        name: '',
                        comment: `Status: ${j.status}`,
                        location: {
                          uid: l_uid,
                          pos: j.activity_id === ESI_MANUFACTURING ? 'Manufacturing' : 'Reaction',
                        },
                        type_id: j.product_type_id || 0,
                        quantity: getProductsQuantity(j),
                      }))
                    ),
                    true
                  );
                }
              );
            })
          )
      )
    );
  }

  public viewLogistics(loc: LocData, value: string): void {
    const cargo = value === 'packaged';
    const locs = LocationComponent.flatten(loc.content_items || [], { assm: true });
    const data: LocationLogisticData = {
      title: cargo ? 'packaged content' : 'assembled content',
      name: loc.info.name,
      items: locs
        .map((l) => {
          const id = this.getRoute(l, loc)
            .map((l) => l.info.name)
            .join(' > ');
          const quantity = l.quantity;
          return cargo
            ? { id, value: l.Value, volume: l.VolumeCargo(true), quantity }
            : { id, value: l.TotalValue, volume: l.VolumeAssembled(true), quantity };
        })
        .filter(
          (x) => x.quantity && typeof x.value === 'number' && typeof x.volume === 'number'
        ) as LocationLogisticsDataItem[],
    };
    this.dialog.open(LocationLogisticsDialog, {
      width: '1000px',
      data,
    });
  }
}

@NgModule({
  providers: [{ provide: TOOL_SCOPES, useValue: features, multi: true }],
})
export class LocationModule {}
