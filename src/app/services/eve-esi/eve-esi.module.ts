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
  EsiCharacter,
  EsiCorporation,
  EsiItem,
  EsiItemName,
  EsiInfoSelector,
  EsiInfo,
  EsiMarketOrderType,
  EsiMarketOrderCharacter,
  EsiMarketOrderCorporation,
  EsiMarketHistoryOrderCharacter,
  EsiMarketOrderStructure,
  EsiMarketOrderRegion,
  EsiWalletTransaction,
  EsiMarketPrice,
  EsiBlueprint,
  EsiFitting,
  EsiIndustryJob,
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
    if ([400, 401, 403, 404, 420, 500, 503, 504].indexOf(e.status) >= 0) {
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

export type EsiWalletDivisionId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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

export type EsiSubjType = 'characters' | 'corporations';

enum imageResource {
  AllianceLogo = 'alliances/{}/logo',
  CharPortrait = 'characters/{}/portrait',
  CorporationLogo = 'corporations/{}/logo',
  TypeIcon = 'types/{}/icon',
  TypeRender = 'types/{}/render',
}

type EsiHttpParams = Record<string, string | undefined>;

const imageUrl = 'https://images.evetech.net/';
function getImage(resource: imageResource, id: number, size?: number): string {
  let uri = resource.replace('{}', String(id));
  if (size) uri += `?size=${size}`;
  return imageUrl + uri;
}

export function getCharacterAvatarURI(character_id: number, size: number): string {
  return getImage(imageResource.CharPortrait, character_id, size);
}
export function getCorporationLogoURI(corporation_id: number, size: number): string {
  return getImage(imageResource.CorporationLogo, corporation_id, size);
}
export function getTypeIconURI(type_id: number, size: number): string {
  return getImage(imageResource.TypeIcon, type_id, size);
}

function status_is_4xx(status: number): boolean {
  return status >= 400 && status < 500;
}
//private static readonly noRetryStatuses: number[] = [400, 401, 403, 420];

@Injectable({
  providedIn: 'root',
})
export class EsiService {
  static readonly TYPE_ID_AssetSafetyWrap = 60;
  static readonly TYPE_ID_PlasticWrap = 3468;
  static readonly LOCATION_ID_AssetSafety = 2004;
  static readonly CATEGORY_ID_Ship = 6;

  static readonly STD_MAIL_LABEL_ID_Inbox = 1;
  static readonly STD_MAIL_LABEL_ID_Sent = 2;
  static readonly STD_MAIL_LABEL_ID_Corp = 4;
  static readonly STD_MAIL_LABEL_ID_Alliance = 8;

  private readonly commonParams: EsiHttpParams;

  public get serverName(): string {
    return this.config.datasource || '(default)';
  }

  constructor(private http: HttpClient, @Inject(EVEESI_CONFIG) private config: EVEESIConfig) {
    this.commonParams = {
      datasource: config.datasource,
    };
  }

  private static retry(count = 3, timeout = 1000, noRetry: (status: number) => boolean = status_is_4xx) {
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
    return this.http
      .get<T>(this.getUrl(route), { params })
      .pipe(retryWhen(retry));
  }

  private postData<T>(route: string, data: unknown, retry = EsiService.retry()): Observable<T> {
    const params = this.httpParams();
    return this.http
      .post<T>(this.getUrl(route), data, { params })
      .pipe(retryWhen(retry));
  }

  private postEntityInformation<T>(entity: EsiSubjType, id: number, route: string, data: unknown): Observable<T> {
    return this.postData<T>(`${entity}/${id}/${route}`, data);
  }

  public getEntityInformation<T>(entity: EsiSubjType, id: number, route = '', params?: EsiHttpParams): Observable<T> {
    return this.getData<T>(`${entity}/${id}/${route}`, params);
  }
  public getCharacterInformation<T>(character_id: number, route = '', params?: EsiHttpParams): Observable<T> {
    return this.getEntityInformation<T>('characters', character_id, route, params);
  }
  public getCorporationInformation<T>(corporation_id: number, route = '', params?: EsiHttpParams): Observable<T> {
    return this.getEntityInformation<T>('corporations', corporation_id, route, params);
  }

  public getEntity<T>(entity: EsiSubjType, id: number): Observable<T> {
    return this.getEntityInformation<T>(entity, id);
  }
  public getCharacter(character_id: number): Observable<EsiCharacter> {
    return this.getEntity<EsiCharacter>('characters', character_id);
  }
  public getCorporation(corporation_id: number): Observable<EsiCorporation> {
    return this.getEntity<EsiCorporation>('corporations', corporation_id);
  }

  public getEntityItems(entity: EsiSubjType, id: number): Observable<EsiItem[]> {
    return this.getEntityInformation(entity, id, 'assets/');
  }
  public getCharacterItems(character_id: number): Observable<EsiItem[]> {
    //public getCharacterItems = this.getEntityItems.bind(this, 'characters');
    return this.getEntityItems('characters', character_id);
  }
  public getCorporationItems(corporation_id: number): Observable<EsiItem[]> {
    //public getCorporationItems = this.getEntityItems.bind(this, 'corporations');
    return this.getEntityItems('corporations', corporation_id);
  }

  public getEntityItemNames(
    entity: EsiSubjType,
    id: number,
    item_ids: number[],
    chunk = 1000
  ): Observable<EsiItemName[]> {
    return from(item_ids).pipe(
      bufferCount(chunk <= 1000 ? chunk : 1000),
      mergeMap((ids) => this.postEntityInformation<EsiItemName[]>(entity, id, 'assets/names/', ids)),
      reduce((r, n) => r.concat(n), [] as EsiItemName[])
    );
  }
  public getCharacterItemNames(character_id: number, item_ids: number[], chunk = 1000): Observable<EsiItemName[]> {
    //public getCharacterItemNames = this.getEntityItemNames.bind(this, 'characters');
    return this.getEntityItemNames('characters', character_id, item_ids, chunk);
  }
  public getCorporationItemNames(corporation_id: number, item_ids: number[], chunk = 1000): Observable<EsiItemName[]> {
    //public getCorporationItemNames = this.getEntityItemNames.bind(this, 'corporations');
    return this.getEntityItemNames('corporations', corporation_id, item_ids, chunk);
  }

  public getEntityOrders<T>(entity: EsiSubjType, id: number): Observable<T> {
    return this.getEntityInformation<T>(entity, id, 'orders/');
  }
  public getCharacterOrders(character_id: number): Observable<EsiMarketOrderCharacter[]> {
    return this.getEntityOrders<EsiMarketOrderCharacter[]>('characters', character_id);
  }
  public getCorporationOrders(corporation_id: number): Observable<EsiMarketOrderCorporation[]> {
    return this.getEntityOrders<EsiMarketOrderCorporation[]>('corporations', corporation_id);
  }

  public getEntityBlueprints(entity: EsiSubjType, id: number): Observable<EsiBlueprint[]> {
    return this.getEntityInformation<EsiBlueprint[]>(entity, id, 'blueprints/');
  }
  public getCharacterBlueprints(character_id: number): Observable<EsiBlueprint[]> {
    return this.getEntityBlueprints('characters', character_id);
  }
  public getCorporationBlueprints(corporation_id: number): Observable<EsiBlueprint[]> {
    return this.getEntityBlueprints('corporations', corporation_id);
  }

  public getEntityIndustryJobs(entity: EsiSubjType, id: number): Observable<EsiIndustryJob[]> {
    return this.getEntityInformation<EsiIndustryJob[]>(entity, id, 'industry/jobs/');
  }
  public getCharacterIndustryJobs(character_id: number): Observable<EsiIndustryJob[]> {
    return this.getEntityIndustryJobs('characters', character_id);
  }
  public getCorporationIndustryJobs(corporation_id: number): Observable<EsiIndustryJob[]> {
    return this.getEntityIndustryJobs('corporations', corporation_id);
  }

  public getCharacterOrdersHistory(character_id: number): Observable<EsiMarketHistoryOrderCharacter[]> {
    return this.getCharacterInformation<EsiMarketHistoryOrderCharacter[]>(character_id, 'orders/history/');
  }

  public getCharacterWalletTransactions(character_id: number): Observable<EsiWalletTransaction[]> {
    return this.getCharacterInformation<EsiWalletTransaction[]>(character_id, 'wallet/transactions/');
  }
  public getCorporationWalletTransaction(
    corporation_id: number,
    division: EsiWalletDivisionId
  ): Observable<EsiWalletTransaction[]> {
    return this.getCorporationInformation<EsiWalletTransaction[]>(corporation_id, `wallets/${division}/transactions/`);
  }

  public getCharacterFittings(character_id: number): Observable<EsiFitting[]> {
    return this.getCharacterInformation<EsiFitting[]>(character_id, 'fittings/');
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
