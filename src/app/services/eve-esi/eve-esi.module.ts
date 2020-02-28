import { NgModule, ModuleWithProviders, Injectable, Inject } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse, HTTP_INTERCEPTORS } from '@angular/common/http';
import { Observable, from, throwError, timer } from 'rxjs';
import { map, mergeMap, mergeAll, toArray, bufferCount, retryWhen } from 'rxjs/operators';

import { tuple } from '../../utils/utils';

import { OAuthModuleConfig } from 'angular-oauth2-oidc';
//import { NostoreInterceptorService } from './nostore.interceptor.service';
//import { NoauthInterceptorService } from './noauth.interceptor.service';
import { XpageInterceptorService } from './xpage.interceptor.service';

import { EVEESI_CONFIG, EVEESIConfig } from './eve-esi.config';
import { noAuthRoutes } from './eve-esi.public';

export { EVEESIConfig } from './eve-esi.config';

export interface EsiErrorData {
  error: string;
}

export class EsiError extends Error {
  readonly status: number;
  readonly error: EsiErrorData | Error;
  constructor(e: HttpErrorResponse) {
    super(e.message);
    Object.setPrototypeOf(this, EsiError.prototype);
    this.name = 'EsiError';
    this.status = e.status;
    this.error = e.error;
  }
}

/*400*/
export type EsiBadRequestErrorData = EsiErrorData;
/*401*/
export type EsiUnauthorizedErrorData = EsiErrorData;
/*403*/
export interface EsiForbiddenErrorData extends EsiErrorData {
  sso_status?: number;
}
/*420*/
export type EsiErrorLimitedErrorData_ = EsiErrorData;
/*500*/
export type EsiInternalServerErrorErrorData = EsiErrorData;
/*503*/
export type EsiServiceUnavailableErrorData = EsiErrorData;
/*504*/
export interface EsiGatewayTimeoutErrorData extends EsiErrorData {
  timeout?: number;
}

export interface EsiDogmaAttribute {
  attribute_id: number;
  value: number;
}

export interface EsiDogmaEffect {
  effect_id: number;
  is_default: boolean;
}

export interface EsiTypeIdInfo {
  capacity?: number;
  description: string;
  dogma_attributes?: EsiDogmaAttribute[];
  dogma_effects?: EsiDogmaEffect[];
  graphic_id?: number;
  group_id: number;
  icon_id?: number;
  market_group_id?: number;
  mass?: number;
  name: string;
  packaged_volume?: number;
  portion_size?: number;
  published: boolean;
  radius?: number;
  type_id: number;
  volume?: number;
}

export interface EsiAssetsName {
  item_id: number;
  name: string;
}

export interface EsiPosition {
  x: number;
  y: number;
  z: number;
}

export interface EsiStationInfo {
  station_id: number;
  name: string;
  type_id: number;
  owner?: number;
  system_id: number;
  position: EsiPosition;
  max_dockable_ship_volume?: number;
  office_rental_cost: number;
  race_id?: number;
  reprocessing_efficiency: number;
  reprocessing_stations_take: number;
  services: string[];
}

export interface EsiMarketPrice {
  adjusted_price?: number;
  average_price?: number;
  type_id: number;
}

export interface EsiAssetsItem {
  is_blueprint_copy?: boolean;
  is_singleton: boolean;
  item_id: number;
  location_flag: string;
  location_id: number;
  location_type: string;
  quantity: number;
  type_id: number;
}

export interface EsiStructureInfo {
  name: string;
  type_id?: number;
  owner_id: number;
  solar_system_id: number;
  position?: EsiPosition;
}

export interface EsiPlanetInfo {
  planet_id: number;
  moons?: number[];
  asteroid_belts?: number[];
}

export interface EsiSystemInfo {
  constellation_id: number;
  name: string;
  planets?: EsiPlanetInfo[];
  position: EsiPosition;
  security_class: string;
  security_status: number;
  star_id?: number;
  stargates?: number[];
  stations?: number[];
  system_id: number;
}

export interface EsiConstellationInfo {
  constellation_id: number;
  name: string;
  position: { x: number; y: number; z: number };
  region_id: number;
  systems: number[];
}

export interface EsiOrder {
  duration: number;
  is_buy_order?: boolean;
  issued: string;
  location_id: number;
  min_volume?: number;
  order_id: number;
  price: number;
  range: string;
  type_id: number;
  volume_remain: number;
  volume_total: number;
}

export interface EsiCharCorpOrder extends EsiOrder {
  escrow?: number;
  region_id: number;
  state?: string; // 'cancelled', 'expired' for history, absent for current
}

export interface EsiCharOrder extends EsiCharCorpOrder {
  is_corporation: boolean;
}

export interface EsiCorpOrder extends EsiCharCorpOrder {
  issued_by: number;
  wallet_division: number;
}

export interface EsiRegionOrder extends EsiOrder {
  system_id: number;
}

export type EsiStructureOrder = EsiOrder;

export interface EsiWalletTransaction {
  client_id: number;
  date: string;
  is_buy: boolean;
  is_personal?: boolean;
  journal_ref_id: number;
  location_id: number;
  quantity: number;
  transaction_id: number;
  type_id: number;
  unit_price: number;
}

export interface EsiMailRecipient {
  recipient_id: number;
  recipient_type: 'alliance' | 'character' | 'corporation' | 'mailing_list';
}

export interface EsiMailHeader {
  from: number;
  is_read: boolean;
  labels: number[];
  mail_id: number;
  recipients: EsiMailRecipient[];
  subject: string;
  timestamp: string;
}

export interface EsiMailBody {
  body: string;
  from: number;
  labels: number[];
  read: boolean;
  recipients: EsiMailRecipient[];
  subject: string;
  timestamp: string;
}

export interface EsiMailMailingList {
  mailing_list_id: number;
  name: string;
}

type EsiLabelColor =
  | '#0000fe'
  | '#006634'
  | '#0099ff'
  | '#00ff33'
  | '#01ffff'
  | '#349800'
  | '#660066'
  | '#666666'
  | '#999999'
  | '#99ffff'
  | '#9a0000'
  | '#ccff9a'
  | '#e6e6e6'
  | '#fe0000'
  | '#ff6600'
  | '#ffff01'
  | '#ffffcd'
  | '#ffffff';

export interface EsiMailLabel {
  color?: EsiLabelColor;
  label_id?: number;
  name?: string;
  unread_count?: number;
}

export interface EsiMailLabels {
  labels?: EsiMailLabel[];
  total_unread_count?: number;
}

export type EsiIdCategory =
  | 'alliance'
  | 'character'
  | 'constellation'
  | 'corporation'
  | 'inventory_type'
  | 'region'
  | 'solar_system'
  | 'station'
  | 'faction';

export interface EsiIdInfo {
  id: number;
  category: EsiIdCategory;
  name: string;
}

enum imageResource {
  AllianceLogo = 'alliances/{}/logo',
  CharPortrait = 'characters/{}/portrait',
  CorporationLogo = 'corporations/{}/logo',
  TypeIcon = 'types/{}/icon',
  TypeRender = 'types/{}/render'
}

@Injectable({
  providedIn: 'root'
})
export class EsiService {
  static TYPE_ID_AssetSafetyWrap = 60;
  static LOCATION_ID_AssetSafety = 2004;

  static STD_MAIL_LABEL_ID_Inbox = 1;
  static STD_MAIL_LABEL_ID_Sent = 2;
  static STD_MAIL_LABEL_ID_Corp = 4;
  static STD_MAIL_LABEL_ID_Alliance = 8;

  private readonly defParams: object;
  private static status_is_4xx(status: number): boolean {
    return status >= 400 && status < 500;
  }
  //private static readonly noRetryStatuses: number[] = [400, 401, 403, 420];

  private static imageUrl = 'https://images.evetech.net/';
  private static getImage(resource: imageResource, id: number, size?: number): string {
    let uri = resource.replace('{}', String(id));
    if (size) uri += `?size=${size}`;
    return EsiService.imageUrl + uri;
  }
  public getCharacterAvatarURI(character_id: number, size: number): string {
    return EsiService.getImage(imageResource.CharPortrait, character_id, size);
  }
  public getItemIconURI(type_id: number, size: number): string {
    return EsiService.getImage(imageResource.TypeIcon, type_id, size);
  }

  public static getAssetLocationType(id: number): string {
    // https://github.com/esi/esi-docs/blob/master/docs/asset_location_id.md
    if (id == EsiService.LOCATION_ID_AssetSafety) return 'asset_safety';
    if (id >= 30000000 && id < 32000000) return 'solar_system';
    if (id >= 32000000 && id < 33000000) return 'solar_system'; // Abyssal
    if (id >= 60000000 && id < 64000000) return 'station';
    return 'other';
  }

  public static getIdType(id: number): string {
    // https://github.com/esi/esi-docs/blob/master/docs/id_ranges.md
    if (id >= 2147483648) return 'other';
    if (id < 10000) return 'special';
    if (id >= 500000 && id < 1000000) return 'faction';
    if (id >= 1000000 && id < 2000000) return 'corporation'; //NPC
    if (id >= 3000000 && id < 4000000) return 'character'; //NPC
    if (id >= 9000000 && id < 10000000) return 'universe';
    if (id >= 10000000 && id < 11000000) return 'region';
    if (id >= 11000000 && id < 12000000) return 'region'; //wormhole
    if (id >= 12000000 && id < 13000000) return 'region'; //abyssal
    if (id >= 20000000 && id < 21000000) return 'constellation';
    if (id >= 21000000 && id < 22000000) return 'constellation'; //wormhole
    if (id >= 22000000 && id < 23000000) return 'constellation'; //abyssal
    if (id >= 30000000 && id < 31000000) return 'solar_system';
    if (id >= 31000000 && id < 32000000) return 'solar_system'; //wormhole
    if (id >= 32000000 && id < 33000000) return 'solar_system'; //abyssal
    if (id >= 40000000 && id < 50000000) return 'celestial';
    if (id >= 50000000 && id < 60000000) return 'stargate';
    if (id >= 60000000 && id < 61000000) return 'station'; //CCP
    if (id >= 61000000 && id < 64000000) return 'station'; //outpost
    if (id >= 68000000 && id < 69000000) return 'folder_station'; //CCP
    if (id >= 69000000 && id < 70000000) return 'folder_station'; //outpost
    if (id >= 70000000 && id < 80000000) return 'asteroid';
    if (id >= 80000000 && id < 80100000) return 'control_bunker';
    if (id >= 81000000 && id < 82000000) return 'wis_promenade';
    if (id >= 82000000 && id < 85000000) return 'planetary_district';
    if (id >= 90000000 && id < 98000000) return 'character'; // created after 2010 - 11 - 03
    if (id >= 98000000 && id < 99000000) return 'corporation'; // created after 2010 - 11 - 03
    if (id >= 99000000 && id < 100000000) return 'alliance'; // created after 2010 - 11 - 03
    if (id >= 100000000 && id < 2100000000) return 'character_corporation_alliance'; // EVE characters, corporations and alliances created before 2010 - 11 - 03
    return 'character';
  }

  public static isLocationLocID(id: number): boolean {
    return EsiService.getAssetLocationType(id) === 'station';
  }

  constructor(private httpClient: HttpClient, @Inject(EVEESI_CONFIG) private config: EVEESIConfig) {
    this.defParams = {
      datasource: config.datasource
    };
  }

  private static retry(
    count = 3,
    timeout = 1000,
    noRetry: (status: number) => boolean = EsiService.status_is_4xx.bind(EsiService)
  ) {
    return (errors: Observable<HttpErrorResponse>): Observable<number> =>
      errors.pipe(
        mergeMap((error, i) => {
          const attempt = i + 1;
          if (attempt > count || noRetry(error.status)) return throwError(new EsiError(error));
          return timer(attempt * timeout);
        })
      );
  }

  private getUrl(route: string): string {
    return this.config.url + this.config.ver + route;
  }

  private getData<T>(route: string, parameters: object = {}, retry = EsiService.retry()): Observable<T> {
    const params = new HttpParams({ fromObject: { ...this.defParams, ...parameters } });
    return this.httpClient
      .get<T>(this.getUrl(route), { params: params })
      .pipe(retryWhen(retry));
  }

  private postData<T>(route: string, data: unknown, retry = EsiService.retry()): Observable<T> {
    const params = new HttpParams({ fromObject: { ...this.defParams } });
    return this.httpClient
      .post<T>(this.getUrl(route), data, { params })
      .pipe(retryWhen(retry));
  }

  private getCharacterInformation<T>(character_id: number, route: string, params?: object): Observable<T> {
    return this.getData<T>(`characters/${character_id}/${route}`, params);
  }

  public getCharacterOrders(character_id: number, historical = false): Observable<EsiCharOrder[]> {
    return this.getCharacterInformation<EsiCharOrder[]>(character_id, historical ? 'orders/history/' : 'orders/');
  }

  public getCharacterAssets(character_id: number): Observable<EsiAssetsItem[]> {
    return this.getCharacterInformation<EsiAssetsItem[]>(character_id, 'assets/');
  }

  public getCharacterWalletTransactions(character_id: number): Observable<EsiWalletTransaction[]> {
    return this.getCharacterInformation<EsiWalletTransaction[]>(character_id, 'wallet/transactions/');
  }

  public getCharacterMailHeaders(
    character_id: number,
    labels?: number[],
    last_mail_id?: number
  ): Observable<EsiMailHeader[]> {
    return this.getCharacterInformation<EsiMailHeader[]>(character_id, 'mail/', {
      labels: labels && labels.length != 0 ? labels.map(id => String(id)).join(',') : undefined,
      last_mail_id: last_mail_id != undefined ? String(last_mail_id) : undefined
    });
  }

  public getCharacterMail(character_id: number, mail_id: number): Observable<EsiMailBody> {
    return this.getCharacterInformation<EsiMailBody>(character_id, `mail/${mail_id}/`);
  }

  public getCharacterMailLabels(character_id: number): Observable<EsiMailLabels> {
    return this.getCharacterInformation<EsiMailLabels>(character_id, 'mail/labels/');
  }

  public getCharacterMailingLists(character_id: number): Observable<EsiMailMailingList[]> {
    return this.getCharacterInformation<EsiMailMailingList[]>(character_id, 'mail/lists/');
  }

  private getCharacterAssetNames_chunk(character_id: number, item_ids: number[]): Observable<EsiAssetsName[]> {
    return this.postData<EsiAssetsName[]>(`characters/${character_id}/assets/names/`, item_ids);
  }

  public listMarketPrices(): Observable<EsiMarketPrice[]> {
    return this.getData<EsiMarketPrice[]>('markets/prices/');
  }

  public getInformation<T>(type: string, id: number): Observable<T> {
    return this.getData<T>(`universe/${type}/${id}/`);
  }

  public getIdsInformation(item_ids: number[]): Observable<EsiIdInfo> {
    return from(item_ids).pipe(
      bufferCount(1000),
      mergeMap(ids => this.postData<EsiIdInfo[]>('universe/names/', ids)),
      map(ans => from(ans)),
      mergeAll()
    );
  }

  public getTypeInformation(type_id: number): Observable<EsiTypeIdInfo> {
    return this.getInformation<EsiTypeIdInfo>('types', type_id);
  }

  public getStationInformation(station_id: number): Observable<EsiStationInfo> {
    return this.getInformation<EsiStationInfo>('stations', station_id);
  }

  public getStructureInformation(structure_id: number): Observable<EsiStructureInfo> {
    return this.getInformation<EsiStructureInfo>('structures', structure_id);
  }

  public getSolarSystemInformation(solar_system_id: number): Observable<EsiSystemInfo> {
    return this.getInformation<EsiSystemInfo>('systems', solar_system_id);
  }

  public getStructureOrders(structure_id: number): Observable<EsiStructureOrder[]> {
    return this.getData<EsiStructureOrder[]>(`markets/structures/${structure_id}/`);
  }

  public getStructureOrdersEx(
    structure_id: number,
    type_ids: number[],
    order_type?: string
  ): Observable<[number, EsiStructureOrder[]]> {
    order_type = order_type || 'any';
    return this.getStructureOrders(structure_id).pipe(
      map(orders => orders.filter(o => order_type == 'any' || order_type == (o.is_buy_order ? 'buy' : 'sell'))),
      mergeMap(orders =>
        from(type_ids).pipe(
          map(type_id =>
            tuple(
              type_id,
              orders.filter(o => o.type_id == type_id)
            )
          )
        )
      )
    );
  }

  public getCharacterAssetNames(character_id: number, item_ids: number[], chunk = 1000): Observable<EsiAssetsName> {
    return from(item_ids).pipe(
      bufferCount(chunk <= 1000 ? chunk : 1000),
      mergeMap(ids => this.getCharacterAssetNames_chunk(character_id, ids)),
      map(ans => from(ans)),
      mergeAll()
    );
  }

  public getCharacterAssetNamesArray(
    character_id: number,
    item_ids: number[],
    chunk = 1000
  ): Observable<EsiAssetsName[]> {
    return this.getCharacterAssetNames(character_id, item_ids, chunk).pipe(toArray());
  }

  public getRegionOrders(region_id: number, type_id?: number, order_type?: string): Observable<EsiRegionOrder[]> {
    return this.getData<EsiRegionOrder[]>(`markets/${region_id}/orders/`, {
      type_id: type_id != undefined ? String(type_id) : undefined,
      order_type
    });
  }

  public getRegionOrdersEx(
    region_id: number,
    type_ids: number[],
    order_type?: string
  ): Observable<[number, EsiRegionOrder[]]> {
    return from(type_ids).pipe(
      mergeMap(type_id =>
        this.getRegionOrders(region_id, type_id, order_type).pipe(
          map(region_type_orders => tuple(type_id, region_type_orders))
        )
      )
    );
  }
}

// OAuth service injects "Authorization: Bearer ..." header for these APIs
function oauthCfg(serviceUrl: string, routes: RegExp): OAuthModuleConfig {
  return {
    resourceServer: {
      allowedUrls: [],
      customUrlValidation: (url: string): boolean =>
        url.startsWith(serviceUrl) && !routes.test(url.substring(serviceUrl.length)),
      sendAccessToken: true
    }
  };
}

@NgModule()
export class EVEESIModule {
  static forRoot(cfg: EVEESIConfig): ModuleWithProviders<EVEESIModule> {
    return {
      ngModule: EVEESIModule,
      providers: [
        //{ provide: HTTP_INTERCEPTORS, useClass: NoauthInterceptorService, multi: true },
        //{ provide: HTTP_INTERCEPTORS, useClass: NostoreInterceptorService, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: XpageInterceptorService, multi: true },
        { provide: OAuthModuleConfig, useValue: oauthCfg(cfg.url, new RegExp(noAuthRoutes(cfg.ver))) },
        { provide: EVEESI_CONFIG, useValue: cfg }
      ]
    };
  }
}
