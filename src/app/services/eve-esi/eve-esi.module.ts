import { NgModule, ModuleWithProviders, Injectable, Inject } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse, HTTP_INTERCEPTORS } from '@angular/common/http';
import { Observable, from, throwError, timer } from 'rxjs';
import { map, mergeMap, mergeAll, bufferCount, reduce, retryWhen } from 'rxjs/operators';

import { tuple } from '../../utils/utils';

import { OAuthModuleConfig } from 'angular-oauth2-oidc';
//import { NostoreInterceptorService } from './nostore.interceptor.service';
//import { NoauthInterceptorService } from './noauth.interceptor.service';
import { XpageInterceptorService } from './xpage.interceptor.service';

import { EVEESI_CONFIG, EVEESIConfig } from './eve-esi.config';
import { noAuthRoutes } from './eve-esi.public';

import {
  EsiItem,
  EsiItemName,
  EsiInfoSelector,
  EsiInfo,
  EsiLocationType,
  EsiMarketOrderType,
  EsiMarketOrderCharacter,
  EsiMarketHistoryOrderCharacter,
  EsiMarketOrderStructure,
  EsiMarketOrderRegion,
  EsiWalletTransaction,
  EsiMarketPrice,
  EsiBlueprint,
} from './eve-esi.models';

export { EVEESIConfig } from './eve-esi.config';

export interface EsiErrorData {
  error: string;
}

export class EsiHttpErrorResponse implements Error {
  readonly name: string;
  readonly message: string;
  readonly status: number;
  readonly error: unknown;
  readonly esiData?: EsiErrorData;
  constructor(e: HttpErrorResponse) {
    this.error = e.error as unknown;
    this.status = e.status;
    if ([400, 401, 403, 420, 500, 503, 504].indexOf(e.status) >= 0) {
      this.esiData = e.error as EsiErrorData;
      this.name = 'EsiHttpErrorResponse';
      this.message = this.esiData.error;
    } else {
      this.name = e.name;
      this.message = e.message;
    }
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
  TypeRender = 'types/{}/render',
}

type EsiHttpParams = Record<string, string | undefined>;

@Injectable({
  providedIn: 'root',
})
export class EsiService {
  static TYPE_ID_AssetSafetyWrap = 60;
  static TYPE_ID_PlasticWrap = 3468;
  static LOCATION_ID_AssetSafety = 2004;
  static CATEGORY_ID_Ship = 6;

  static STD_MAIL_LABEL_ID_Inbox = 1;
  static STD_MAIL_LABEL_ID_Sent = 2;
  static STD_MAIL_LABEL_ID_Corp = 4;
  static STD_MAIL_LABEL_ID_Alliance = 8;

  private readonly commonParams: EsiHttpParams;
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

  public static getTypeById(id: number): string {
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

  public static getLocationTypeById(id: number): EsiLocationType {
    // https://github.com/esi/esi-docs/blob/master/docs/asset_location_id.md
    if (id == EsiService.LOCATION_ID_AssetSafety) return 'asset_safety';
    const idTypes = EsiService.getTypeById(id).split('.');
    if (idTypes.includes('solar_system')) return 'solar_system';
    if (idTypes.includes('station')) return 'station';
    if (idTypes.includes('character')) return 'character';
    return 'unknown'; // ItemID, StructureID, CustomOfficeID, CorporationOfficeID
  }

  public static isStationId(id: number): boolean {
    return EsiService.getLocationTypeById(id) === 'station';
  }

  public get serverName(): string {
    return this.config.datasource || '(default)';
  }

  constructor(private httpClient: HttpClient, @Inject(EVEESI_CONFIG) private config: EVEESIConfig) {
    this.commonParams = {
      datasource: config.datasource,
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
          if (attempt > count || noRetry(error.status)) return throwError(new EsiHttpErrorResponse(error));
          return timer(attempt * timeout);
        })
      );
  }

  private getUrl(route: string): string {
    return this.config.url + this.config.ver + route;
  }

  private httpParams(parameters: EsiHttpParams = {}): HttpParams {
    const params = { ...this.commonParams, ...parameters } as Record<string, string>; // TODO
    return new HttpParams({ fromObject: params });
  }

  private getData<T>(route: string, parameters: EsiHttpParams = {}, retry = EsiService.retry()): Observable<T> {
    const params = this.httpParams(parameters);
    return this.httpClient
      .get<T>(this.getUrl(route), { params })
      .pipe(retryWhen(retry));
  }

  private postData<T>(route: string, data: unknown, retry = EsiService.retry()): Observable<T> {
    const params = this.httpParams();
    return this.httpClient
      .post<T>(this.getUrl(route), data, { params })
      .pipe(retryWhen(retry));
  }

  private getCharacterInformation<T>(character_id: number, route: string, params?: EsiHttpParams): Observable<T> {
    return this.getData<T>(`characters/${character_id}/${route}`, params);
  }

  public getCharacterOrders(character_id: number): Observable<EsiMarketOrderCharacter[]> {
    return this.getCharacterInformation<EsiMarketOrderCharacter[]>(character_id, 'orders/');
  }

  public getCharacterOrdersHistory(character_id: number): Observable<EsiMarketHistoryOrderCharacter[]> {
    return this.getCharacterInformation<EsiMarketHistoryOrderCharacter[]>(character_id, 'orders/history/');
  }

  public getCharacterItems(character_id: number): Observable<EsiItem[]> {
    return this.getCharacterInformation<EsiItem[]>(character_id, 'assets/');
  }

  public getCharacterWalletTransactions(character_id: number): Observable<EsiWalletTransaction[]> {
    return this.getCharacterInformation<EsiWalletTransaction[]>(character_id, 'wallet/transactions/');
  }

  public getCharacterBlueprints(character_id: number): Observable<EsiBlueprint[]> {
    return this.getCharacterInformation<EsiBlueprint[]>(character_id, 'blueprints/');
  }

  public getCharacterMailHeaders(
    character_id: number,
    labels?: number[],
    last_mail_id?: number
  ): Observable<EsiMailHeader[]> {
    return this.getCharacterInformation<EsiMailHeader[]>(character_id, 'mail/', {
      labels: labels?.length ? labels.map((id) => String(id)).join(',') : undefined,
      last_mail_id: last_mail_id != undefined ? String(last_mail_id) : undefined,
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

  private _getCharacterItemNames(character_id: number, item_ids: number[]): Observable<EsiItemName[]> {
    return this.postData<EsiItemName[]>(`characters/${character_id}/assets/names/`, item_ids);
  }

  public getCharacterItemNames(character_id: number, item_ids: number[], chunk = 1000): Observable<EsiItemName[]> {
    return from(item_ids).pipe(
      bufferCount(chunk <= 1000 ? chunk : 1000),
      mergeMap((ids) => this._getCharacterItemNames(character_id, ids)),
      reduce((r, n) => r.concat(n), [] as EsiItemName[])
    );
  }

  public listMarketPrices(): Observable<EsiMarketPrice[]> {
    return this.getData<EsiMarketPrice[]>('markets/prices/');
  }

  //public getInformation<T>(type: EsiInformationType, id: number): Observable<T> {
  //  return this.getData<T>(`universe/${type}/${id}/`);
  //}
  public getInformation<T extends EsiInfoSelector>(selector: T, id: number): Observable<EsiInfo<T>> {
    return this.getData<EsiInfo<T>>(`universe/${selector}/${id}/`);
  }

  public getIdsInformation(item_ids: number[]): Observable<EsiIdInfo> {
    return from(item_ids).pipe(
      bufferCount(1000),
      mergeMap((ids) => this.postData<EsiIdInfo[]>('universe/names/', ids)),
      map((ans) => from(ans)),
      mergeAll()
    );
  }

  public getStructureOrders(structure_id: number): Observable<EsiMarketOrderStructure[]> {
    return this.getData<EsiMarketOrderStructure[]>(`markets/structures/${structure_id}/`);
  }

  public getRegionOrders(
    region_id: number,
    type_id?: number,
    order_type: EsiMarketOrderType | 'all' = 'all'
  ): Observable<EsiMarketOrderRegion[]> {
    if (type_id == undefined && order_type !== 'all')
      throw Error(`Invalid parameters: order_type = ${order_type} without type_id`);
    return this.getData<EsiMarketOrderRegion[]>(`markets/${region_id}/orders/`, {
      type_id: type_id != undefined ? String(type_id) : undefined,
      order_type,
    });
  }

  public getRegionOrdersEx(
    region_id: number,
    type_ids: number[],
    order_type: EsiMarketOrderType | 'all' = 'all'
  ): Observable<[number, EsiMarketOrderRegion[]]> {
    return from(type_ids).pipe(
      mergeMap((type_id) =>
        this.getRegionOrders(region_id, type_id, order_type).pipe(
          map((region_type_orders) => tuple(type_id, region_type_orders))
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
      sendAccessToken: true,
    },
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
        { provide: EVEESI_CONFIG, useValue: cfg },
      ],
    };
  }
}
