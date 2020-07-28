import { Injectable } from '@angular/core';
import { Observable, of, empty, from, throwError, MonoTypeOperatorFunction, merge } from 'rxjs';
import {
  catchError,
  expand,
  map,
  mergeMap,
  takeWhile,
  toArray,
  scan,
  reduce,
  tap,
  ignoreElements,
} from 'rxjs/operators';

import {
  EsiService,
  EsiHttpErrorResponse,
  EsiMailRecipient,
  EsiMailHeader,
  EsiSubjType,
  EsiWalletDivisionId,
  EsiForbiddenErrorData,
  getCorporationLogoURI,
  getCharacterAvatarURI,
} from './eve-esi.module';

import {
  EsiItem,
  EsiInformation,
  EsiInfoSelector,
  EsiInfo,
  EsiMarketOrderState,
  EsiMarketOrderType,
  EsiMarketOrderCharacter,
  EsiMarketOrderCorporation,
  EsiMarketOrderStructure,
  EsiMarketOrderRegion,
  EsiWalletTransaction,
  EsiMarketOrderRange,
  EsiBlueprint,
  EsiLocationType,
} from './eve-esi.models';

import { autoMap, set, tuple } from '../../utils/utils';
import { SnackBarQueueService } from '../snackbar-queue/snackbar-queue.service';

export * from './eve-esi.models';

export interface EsiDataItemName {
  item_id: number;
  name: string | undefined;
}

export interface EsiDataBpd {
  me: number;
  te: number;
  copy?: number; // 0/undefined - original, >0 - copy
  in_use?: boolean;
}

export interface EsiDataItem extends EsiItem {
  name?: string;
  bpd?: EsiDataBpd;
}

type EsiDataInfoSelectors = 'structures' | 'types';
export type EsiDataInformation =
  | Exclude<EsiInformation, { selector: EsiDataInfoSelectors }>
  | { selector: 'structures'; data: EsiDataStructureInfo }
  | { selector: 'types'; data: EsiDataTypeInfo };

export type EsiDataInfo<T> = Extract<EsiDataInformation, { selector: T }>['data'];

interface EsiDataStructureInfo extends EsiInfo<'structures'> {
  structure_id: number;
  forbidden?: boolean;
}
interface EsiDataTypeInfo {
  name: string;
  volume?: number;
  packaged_volume?: number;
}

export interface EsiDataMarketOrder {
  order_id: number;
  buy_sell: EsiMarketOrderType;
  timestamp: number;
  location_id: number;
  range: EsiMarketOrderRange;
  duration: number;
  type_id: number;
  price: number;
  min_volume: number;
  volume_remain: number;
  volume_total: number;
  region_id?: number;
}

export interface EsiDataCharMarketOrder extends EsiDataMarketOrder {
  issued_by: number;
  is_corporation: boolean;
  escrow: number;
  wallet_division: number;
  status: EsiMarketOrderState | undefined;
}

export interface EsiDataMailHeader {
  mail_id: number;
  from: number;
  recipients: EsiMailRecipient[];
  subject: string;
  timestamp: number;
  labels: number[];
  is_read: boolean;
}

export interface EsiDataMail extends EsiDataMailHeader {
  body: string;
}

export interface EsiDataLocMarketTypes {
  l_id: number; // station or structure
  types: number[];
}

export interface EsiDataLocMarketOrders {
  l_id: number;
  orders: Map<number, EsiDataMarketOrder[]>;
}

export const fltBuySell = <T extends EsiDataMarketOrder>(buy_sell: EsiMarketOrderType) => (o: T): boolean =>
  buy_sell === o.buy_sell;

export const fltBuySellUnk = <T extends EsiDataMarketOrder>(
  buy_sell: EsiMarketOrderType | undefined
): ((o: T) => boolean) => (buy_sell == undefined ? (): boolean => true : fltBuySell(buy_sell));

export interface EsiSubject {
  id: number;
  name: string;
  type: EsiSubjType;
}

export function getTypeById(id: number): string {
  // https://github.com/esi/esi-docs/blob/master/docs/id_ranges.md
  if (id >= 2147483648) return 'unknown';
  if (id < 10000) return 'special';
  if (id >= 500000 && id < 1000000) return 'faction';
  if (id >= 1000000 && id < 2000000) return 'corporation.npc';
  if (id >= 3000000 && id < 4000000) return 'character.npc';
  if (id >= 9000000 && id < 10000000) return 'universe';
  if (id >= 10000000 && id < 11000000) return 'region';
  if (id >= 11000000 && id < 12000000) return 'region.wormhole';
  if (id >= 12000000 && id < 13000000) return 'region.abyssal';
  if (id >= 20000000 && id < 21000000) return 'constellation';
  if (id >= 21000000 && id < 22000000) return 'constellation.wormhole';
  if (id >= 22000000 && id < 23000000) return 'constellation.abyssal';
  if (id >= 30000000 && id < 31000000) return 'solar_system';
  if (id >= 31000000 && id < 32000000) return 'solar_system.wormhole';
  if (id >= 32000000 && id < 33000000) return 'solar_system.abyssal';
  if (id >= 40000000 && id < 50000000) return 'celestial';
  if (id >= 50000000 && id < 60000000) return 'stargate';
  if (id >= 60000000 && id < 61000000) return 'station.ccp';
  if (id >= 61000000 && id < 64000000) return 'station.outpost';
  if (id >= 68000000 && id < 69000000) return 'station_folder.ccp';
  if (id >= 69000000 && id < 70000000) return 'station_folder.outpost';
  if (id >= 70000000 && id < 80000000) return 'asteroid';
  if (id >= 80000000 && id < 80100000) return 'control_bunker';
  if (id >= 81000000 && id < 82000000) return 'wis_promenade';
  if (id >= 82000000 && id < 85000000) return 'planetary_district';
  if (id >= 90000000 && id < 98000000) return 'character'; // created after 2010-11-03
  if (id >= 98000000 && id < 99000000) return 'corporation'; // created after 2010-11-03
  if (id >= 99000000 && id < 100000000) return 'alliance'; // created after 2010-11-03
  if (id >= 100000000 && id < 2100000000) return 'character.corporation.alliance'; // EVE characters, corporations and alliances created before 2010-11-03
  return 'character'; // DUST characters, EVE characters created after 2016-05-30
}

export function getLocationTypeById(id: number): EsiLocationType {
  // https://github.com/esi/esi-docs/blob/master/docs/asset_location_id.md
  if (id == EsiService.LOCATION_ID_AssetSafety) return 'asset_safety';
  const idTypes = getTypeById(id).split('.');
  if (idTypes.includes('solar_system')) return 'solar_system';
  if (idTypes.includes('station')) return 'station';
  if (idTypes.includes('character')) return 'character';
  return 'unknown'; // ItemID, StructureID, CustomOfficeID, CorporationOfficeID
}

export const CATEGORY_ID_Ship = 6;
export const CATEGORY_ID_Deployable = 22;
export const CATEGORY_ID_Structure = 65;

export const GROUP_ID_Cargo_Container = 12;
export const GROUP_ID_Biomass = 14;
export const GROUP_ID_Secure_Cargo_Container = 340;
export const GROUP_ID_Audit_Log_Secure_Container = 448;
export const GROUP_ID_Freight_Container = 649;

export function isStationId(id: number): boolean {
  return getLocationTypeById(id) === 'station';
}

export function isStationService(type_id: number): boolean {
  return type_id >= 26 && type_id <= 28;
}

export function isWrapping(type_id: number): boolean {
  return type_id === EsiService.TYPE_ID_AssetSafetyWrap || type_id === EsiService.TYPE_ID_PlasticWrap;
}

export function getIconID(type_id: number): number | undefined {
  if (isStationService(type_id)) return undefined; // no icon is available for 'Station Services' types (???)
  return type_id;
}

export function isScopedOut(e: unknown): string {
  if (!e || typeof e !== 'object' || (e as Error).name !== 'EsiHttpErrorResponse') return '';
  const err = e as EsiHttpErrorResponse;
  if (err.status !== 403 || !err.esiData) return '';
  const d = err.esiData as EsiForbiddenErrorData;
  if (d.sso_status !== 200) return '';
  // d.error message example: "token is not valid for scope: esi-characters.read_blueprints.v1"
  const val = /^token is not valid for scope: ([\w.-]+)$/.exec(d.error);
  return (val && val[1]) || '';
}

interface NamedItemTypesIDs {
  ids: number[];
}

@Injectable({
  providedIn: 'root',
})
export class EsiDataService {
  private missedIDs(ids: number[], knownIDs: IterableIterator<number>): number[] {
    return set(ids).filter((id) => ![...knownIDs].includes(id));
  }

  constructor(private esi: EsiService, private sbq: SnackBarQueueService) {}

  public scoped<T>(val: T): MonoTypeOperatorFunction<T> {
    return catchError((err) => {
      const scope = isScopedOut(err);
      if (scope === '') throw err;
      this.sbq.msg(`ESI scope '${scope}' is not granted.`);
      return of(val);
    });
  }

  public subjs: EsiSubject[] = [];
  public findSubject(subj_id: number | undefined, subj_type?: EsiSubjType): EsiSubject | undefined {
    return this.subjs.find((subj) => subj_id === subj.id && (subj_type == undefined || subj_type == subj.type));
  }
  public getSubjectType(subj_id: number): EsiSubjType {
    const subj = this.findSubject(subj_id);
    if (subj == undefined) throw Error(`Unknown subject (${subj_id})`);
    return subj.type;
  }
  public parseSubjectId(value: string | null | undefined): number {
    if (value == undefined || value === '') throw Error('Subject is missed');
    const id = +value;
    if (isNaN(id) || value === 'true' || value === 'false') throw Error(`Invalid subject ID '${id}'`);
    if (!this.findSubject(id)) throw Error(`Unknown subject '${id}'`);
    return id;
  }

  public getSubjectAvatarURI(subj: EsiSubject, size: number): string {
    return subj.type === 'characters' ? getCharacterAvatarURI(subj.id, size) : getCorporationLogoURI(subj.id, size);
  }

  loadSubjects(id$: Observable<number>): Observable<EsiSubject[]> {
    return id$.pipe(
      mergeMap((id) =>
        this.esi.getCharacter(id).pipe(
          mergeMap((ch) =>
            this.esi.getCorporation(ch.corporation_id).pipe(
              map((crp) => {
                const char = { id, name: ch.name, type: 'characters' } as EsiSubject;
                const corp = { id: ch.corporation_id, name: crp.name, type: 'corporations' } as EsiSubject;
                return (this.subjs = [char, corp]);
              })
            )
          )
        )
      )
    );
  }

  // Generics extending unions cannot be narrowed #13995
  // https://github.com/microsoft/TypeScript/issues/13995
  //
  // This code, doesn't work. TS doesn't narrow 'T extends ...' parameter. Separate methods for EsiDataXXXInfo are implemented.
  //
  // loadInfo<T extends EsiInfoSelector>(selector: T, id: number): Observable<EsiDataInfo<T>> {
  //   if (selector === 'structures') ...
  //   else if (selector === 'types') ...
  //   else ...
  // }

  loadInfo<T extends Exclude<EsiInfoSelector, EsiDataInfoSelectors>>(selector: T, id: number): Observable<EsiInfo<T>> {
    return this.esi.getInformation<T>(selector, id);
  }

  loadBeltInfo = (id: number): Observable<EsiInfo<'asteroid_belts'>> => this.loadInfo('asteroid_belts', id);
  loadCategoryInfo = (id: number): Observable<EsiInfo<'categories'>> => this.loadInfo('categories', id);
  loadConstellationInfo = (id: number): Observable<EsiInfo<'constellations'>> => this.loadInfo('constellations', id);
  loadGroupInfo = (id: number): Observable<EsiInfo<'groups'>> => this.loadInfo('groups', id);
  loadMoonInfo = (id: number): Observable<EsiInfo<'moons'>> => this.loadInfo('moons', id);
  loadPlanetInfo = (id: number): Observable<EsiInfo<'planets'>> => this.loadInfo('planets', id);
  loadRegionInfo = (id: number): Observable<EsiInfo<'regions'>> => this.loadInfo('regions', id);
  loadStationInfo = (id: number): Observable<EsiInfo<'stations'>> => this.loadInfo('stations', id);
  loadStargateInfo = (id: number): Observable<EsiInfo<'stargates'>> => this.loadInfo('stargates', id);
  loadStructureInfo(id: number): Observable<EsiDataStructureInfo> {
    return this.esi.getInformation('structures', id).pipe(
      map((info) => ({
        ...info,
        structure_id: id,
      })),
      catchError((err: unknown) => {
        // some structures IDs are 'forbidden', status == 403
        if (err instanceof EsiHttpErrorResponse && err.status == 403)
          return of({
            name: '',
            owner_id: 0,
            solar_system_id: 0,
            structure_id: id,
            forbidden: true,
          });
        return throwError(err);
      })
    );
  }
  loadSystemInfo = (id: number): Observable<EsiInfo<'systems'>> => this.loadInfo('systems', id);
  loadTypeInfo(id: number): Observable<EsiDataTypeInfo> {
    return this.esi.getInformation('types', id).pipe(
      map((info) => ({
        name: info.name,
        volume: info.volume,
        packaged_volume: info.packaged_volume,
      }))
    );
  }

  private loadGroupTypes(gid: number): Observable<number[]> {
    return this.loadGroupInfo(gid).pipe(map((grp) => grp.types));
  }

  private loadCategoryTypes(cid: number): Observable<number[]> {
    return this.loadCategoryInfo(cid).pipe(
      mergeMap((cat) => merge(...cat.groups.map((gid) => this.loadGroupTypes(gid)))),
      reduce((c, g) => [...c, ...g], [] as number[])
    );
  }

  private shipTIDs: number[] = [];
  private namedTIDs: number[] = [];
  public loadCategories(): Observable<never> {
    if (this.shipTIDs.length && this.namedTIDs.length) return empty();
    return merge(
      this.loadCategoryTypes(CATEGORY_ID_Ship).pipe(tap((types) => (this.shipTIDs = types))),
      this.loadCategoryTypes(CATEGORY_ID_Structure),
      this.loadCategoryTypes(CATEGORY_ID_Deployable),
      this.loadGroupTypes(GROUP_ID_Audit_Log_Secure_Container),
      this.loadGroupTypes(GROUP_ID_Cargo_Container),
      this.loadGroupTypes(GROUP_ID_Freight_Container),
      this.loadGroupTypes(GROUP_ID_Secure_Cargo_Container),
      this.loadGroupTypes(GROUP_ID_Biomass)
    ).pipe(
      reduce((c, g) => [...c, ...g], [] as number[]),
      tap((types) => (this.namedTIDs = types)),
      ignoreElements()
    );
  }
  public isShipType(tid: number): boolean {
    return this.shipTIDs.includes(tid);
  }
  public isUserNameSupported(tid: number): boolean {
    return this.namedTIDs.includes(tid);
  }

  loadItems(subj_id: number): Observable<EsiItem[]> {
    return this.esi.getEntityItems(this.getSubjectType(subj_id), subj_id);
  }

  getNameApplicableIDs(items: EsiDataItem[]): number[] {
    const named = [...items.values()].filter((i) => i.is_singleton && this.isUserNameSupported(i.type_id));
    const ids = named.map((i) => i.item_id);
    ((ids as unknown) as NamedItemTypesIDs).ids = set(named.map((i) => i.type_id));
    return ids;
  }

  loadItemNames(subj_id: number, ids: number[]): Observable<EsiDataItemName[]> {
    return this.esi.getEntityItemNames(this.getSubjectType(subj_id), subj_id, ids).pipe(
      map((names) =>
        names.map((n) => ({
          item_id: n.item_id,
          name: n.name === 'None' ? undefined : n.name,
        }))
      ),
      catchError((err) => {
        if (err && typeof err === 'object' && (err as Error).name === 'EsiHttpErrorResponse') {
          const esiError = err as EsiHttpErrorResponse;
          if (esiError.status === 404 && esiError.message === 'Invalid IDs in the request') {
            console.log(ids);
            console.log(((ids as unknown) as NamedItemTypesIDs).ids);
            this.sbq.msg('Failed to get assets names. Item ID list has been logged.', 'snack-bar-error');
            return of([]);
          }
        }
        throw err;
      })
    );
  }

  loadMarketPrices(): Observable<Map<number, number>> {
    return this.esi
      .listMarketPrices()
      .pipe(
        map(
          (prices) => new Map<number, number>(prices.map((v) => [v.type_id, v.average_price || v.adjusted_price || 0]))
        )
      );
  }

  static pluckLocMarketTypes(locs: EsiDataLocMarketTypes[]): number[] {
    return set(locs.reduce<number[]>((s, x) => [...s, ...x.types], []));
  }

  private fromEsiMarketOrderCharacter(
    id: number,
    o: EsiMarketOrderCharacter,
    status?: EsiMarketOrderState
  ): EsiDataCharMarketOrder {
    return {
      order_id: o.order_id,
      buy_sell: o.is_buy_order ? 'buy' : 'sell',
      timestamp: new Date(o.issued).getTime(),
      location_id: o.location_id,
      range: o.range,
      duration: o.duration,
      type_id: o.type_id,
      price: o.price,
      min_volume: o.min_volume || 1,
      volume_remain: o.volume_remain,
      volume_total: o.volume_total,
      region_id: o.region_id,
      issued_by: id,
      is_corporation: o.is_corporation,
      escrow: o.escrow || 0,
      wallet_division: 0,
      status,
    };
  }

  private fromEsiMarketOrderCorporation(
    o: EsiMarketOrderCorporation,
    status?: EsiMarketOrderState
  ): EsiDataCharMarketOrder {
    return {
      order_id: o.order_id,
      buy_sell: o.is_buy_order ? 'buy' : 'sell',
      timestamp: new Date(o.issued).getTime(),
      location_id: o.location_id,
      range: o.range,
      duration: o.duration,
      type_id: o.type_id,
      price: o.price,
      min_volume: o.min_volume || 1,
      volume_remain: o.volume_remain,
      volume_total: o.volume_total,
      region_id: o.region_id,
      issued_by: o.issued_by,
      is_corporation: true,
      escrow: o.escrow || 0,
      wallet_division: o.wallet_division,
      status,
    };
  }

  private fromEsiMarketOrderStructureOrRegion(o: EsiMarketOrderStructure | EsiMarketOrderRegion): EsiDataMarketOrder {
    // o.system_id ignored for EsiMarketOrderRegion
    return {
      order_id: o.order_id,
      buy_sell: o.is_buy_order ? 'buy' : 'sell',
      timestamp: new Date(o.issued).getTime(),
      location_id: o.location_id,
      range: o.range,
      duration: o.duration,
      type_id: o.type_id,
      price: o.price,
      min_volume: o.min_volume || 1,
      volume_remain: o.volume_remain,
      volume_total: o.volume_total,
      region_id: undefined,
    };
  }

  loadCharacterMarketOrders(character_id: number, buy_sell?: EsiMarketOrderType): Observable<EsiDataCharMarketOrder[]> {
    return this.esi
      .getCharacterOrders(character_id)
      .pipe(
        map((orders) =>
          orders.map((o) => this.fromEsiMarketOrderCharacter(character_id, o)).filter(fltBuySellUnk(buy_sell))
        )
      );
  }

  loadCorporationMarketOrders(
    corporation_id: number,
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataCharMarketOrder[]> {
    return this.esi
      .getCorporationOrders(corporation_id)
      .pipe(map((orders) => orders.map((o) => this.fromEsiMarketOrderCorporation(o)).filter(fltBuySellUnk(buy_sell))));
  }

  loadMarketOrders(subj_id: number, buy_sell?: EsiMarketOrderType): Observable<EsiDataCharMarketOrder[]> {
    return this.getSubjectType(subj_id) === 'characters'
      ? this.loadCharacterMarketOrders(subj_id, buy_sell)
      : this.loadCorporationMarketOrders(subj_id, buy_sell);
  }

  loadStructureMarketOrders(
    loc: EsiDataLocMarketTypes,
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return this.esi.getStructureOrders(loc.l_id).pipe(
      map((orders) =>
        orders
          .map((o) => this.fromEsiMarketOrderStructureOrRegion(o))
          .filter(fltBuySellUnk(buy_sell))
          .reduce(
            autoMap((ord) => ord.type_id, loc.types),
            new Map<number, EsiDataMarketOrder[]>()
          )
      ),
      map((orders) => ({ l_id: loc.l_id, orders }))
    );
  }

  loadRegionMarketOrders(
    reg: number,
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    return this.esi.getRegionOrdersEx(reg, EsiDataService.pluckLocMarketTypes(locs), buy_sell).pipe(
      toArray(),
      mergeMap((r_orders) =>
        from(locs).pipe(
          map((loc) => ({
            l_id: loc.l_id,
            orders: new Map(
              r_orders
                .filter(([t_id]) => loc.types.includes(t_id)) // remove type_id
                .map(([t_id, t_orders]) =>
                  tuple(
                    t_id,
                    t_orders
                      .filter((o) => o.location_id === loc.l_id) // remove locations
                      .map((o) => this.fromEsiMarketOrderStructureOrRegion(o))
                  )
                )
            ),
          }))
        )
      )
    );
  }

  loadBlueprints(subj_id: number): Observable<EsiBlueprint[]> {
    return this.esi.getEntityBlueprints(this.getSubjectType(subj_id), subj_id);
  }

  loadCharacterWalletTransactions(character_id: number, personal?: boolean): Observable<EsiWalletTransaction[]> {
    return this.esi
      .getCharacterWalletTransactions(character_id)
      .pipe(map((wts) => wts.filter((wt) => personal == undefined || personal == wt.is_personal)));
  }

  loadCorporationWalletsTransactions(corporation_id: number, personal?: boolean): Observable<EsiWalletTransaction[]> {
    if (personal) return of([]);
    return from([1, 2, 3, 4, 5, 6, 7] as EsiWalletDivisionId[]).pipe(
      mergeMap((div) => this.esi.getCorporationWalletTransaction(corporation_id, div)),
      scan((wts, wt) => wts.concat(wt), [] as EsiWalletTransaction[])
    );
  }

  loadWalletTransactions(subj_id: number, personal?: boolean): Observable<EsiWalletTransaction[]> {
    return this.getSubjectType(subj_id) === 'characters'
      ? this.loadCharacterWalletTransactions(subj_id, personal)
      : this.loadCorporationWalletsTransactions(subj_id, personal);
  }

  private static convertEsiDataMailHeader(h: EsiMailHeader): EsiDataMailHeader {
    return {
      mail_id: h.mail_id,
      from: h.from,
      recipients: h.recipients,
      subject: h.subject,
      timestamp: new Date(h.timestamp).getTime(),
      labels: h.labels,
      is_read: h.is_read,
    };
  }

  private getCharacterMailHeadersFromId(
    character_id: number,
    mail_id: number | undefined,
    labels: number[] | undefined,
    up_to_date = 0
  ): Observable<EsiDataMailHeader[]> {
    return this.esi.getCharacterMailHeaders(character_id, labels, mail_id).pipe(
      map((headers) =>
        headers.map((h) => EsiDataService.convertEsiDataMailHeader(h)).filter((h) => h.timestamp >= up_to_date)
      ),
      takeWhile((headers) => headers.length > 0) // ???
    );
  }

  getCharacterMailHeaders(character_id: number, labels?: number[], up_to_date?: number): Observable<EsiDataMailHeader> {
    return this.getCharacterMailHeadersFromId(character_id, undefined, labels, up_to_date).pipe(
      expand((headers) =>
        headers.length < 50
          ? empty()
          : this.getCharacterMailHeadersFromId(
              character_id,
              Math.min(...headers.map((h) => h.mail_id)),
              labels,
              up_to_date
            )
      ),
      mergeMap((headers) => from(headers))
    );
  }
}
