import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, from, forkJoin, concat, zip, throwError, timer } from 'rxjs';
import { map, filter, tap, switchMap, switchMapTo, mergeMap, mergeAll, concatMap, mapTo, toArray, catchError, bufferCount, ignoreElements, retryWhen } from 'rxjs/operators';

export class EsiError extends Error {
  readonly status: number;
  readonly error: any;
  constructor(e: HttpErrorResponse) {
    super(e.message);
    Object.setPrototypeOf(this, EsiError.prototype);
    this.name = 'EsiError';
    this.status = e.status;
    this.error = e.error;
  }
}

export interface EsiErrorData {
  error: string;
}
export interface /*400*/ EsiErrorData_BadRequest extends EsiErrorData {
}
export interface /*401*/ EsiErrorData_Unauthorized extends EsiErrorData {
}
export interface /*403*/ EsiErrorData_Forbidden extends EsiErrorData {
  sso_status?: number;
}
export interface /*420*/ EsiErrorData_ErrorLimited extends EsiErrorData {
}
export interface /*500*/ EsiErrorData_InternalServerError extends EsiErrorData {
}
export interface /*503*/ EsiErrorData_ServiceUnavailable extends EsiErrorData {
}
export interface /*504*/ EsiErrorData_GatewayTimeout extends EsiErrorData {
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

export interface EsiStationInfo {
  station_id: number;
  name: string;
  type_id: number;
  owner?: number;
  system_id: number;
  position: any;
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
  position?: any;
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

export class ESI_CONFIG {
  baseUrl: string;
  datasource?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EsiService {

  private readonly params: HttpParams;
  private static status_is_4xx(status: number): boolean { return status >= 400 && status < 500; }
  //private static readonly noRetryStatuses: number[] = [400, 401, 403, 420];

  constructor(private httpClient: HttpClient, private config: ESI_CONFIG) {
    this.params = config.datasource ? new HttpParams().set('datasource', config.datasource) : new HttpParams();
  }

  private retry(count: number, timeout: number = 1000, noRetry: (status: number) => boolean = EsiService.status_is_4xx) {
    return (errors:Observable<HttpErrorResponse>) => errors.pipe(
      mergeMap((error, i) => {
        const attempt = i + 1;
        if (attempt > count || noRetry(error.status)) return throwError(new EsiError(error));
        return timer(attempt * timeout);
      })
    )
  }

  private getData<T>(route: string, params = this.params, retry = this.retry(3)) {
    return <Observable<T>>this.httpClient.get(this.config.baseUrl + route, { params: params }).pipe(
      retryWhen(retry)
    );
  }

  private postData<T>(route: string, data: any, retry = this.retry(3)) {
    return <Observable<T>>this.httpClient.post(this.config.baseUrl + route, data, { params: this.params }).pipe(
      retryWhen(retry)
    );
  }

  private getCharacterInformation<T>(character_id: number, route: string): Observable<T> {
    return this.getData<T>(`characters/${character_id}/${route}/`);
  }

  public getCharacterOrders(character_id: number): Observable<EsiCharOrder[]> {
    return this.getCharacterInformation<EsiCharOrder[]>(character_id, 'orders');
  }

  public getCharacterAssets(character_id: number): Observable<EsiAssetsItem[]> {
    return this.getCharacterInformation<EsiAssetsItem[]>(character_id, 'assets');
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

  public getTypeInformation(type_id: number): Observable<EsiTypeIdInfo> {
    return this.getInformation<EsiTypeIdInfo>('types', type_id);
  }

  public getStationInformation(station_id: number): Observable<EsiStationInfo> {
    return this.getInformation<EsiStationInfo>('station', station_id);
  }

  public getStructureInformation(structure_id: number): Observable<EsiStructureInfo> {
    return this.getInformation<EsiStructureInfo>('structure', structure_id);
  }

  public getStructureOrders(structure_id: number): Observable<EsiStructureOrder[]> {
    return this.getData<EsiStructureOrder[]>(`markets/structures/${structure_id}/`);
  }

  public getCharacterAssetNames(character_id: number, item_ids: number[], chunk: number = 1000): Observable<EsiAssetsName> {
    return from(item_ids).pipe(
      bufferCount(chunk <= 1000 ? chunk : 1000),
      mergeMap(ids => this.getCharacterAssetNames_chunk(character_id, ids)),
      map(ans => from(ans)),
      mergeAll()
    );
  }

  public getCharacterAssetNamesArray(character_id: number, item_ids: number[], chunk: number = 1000): Observable<EsiAssetsName[]> {
    return this.getCharacterAssetNames(character_id, item_ids, chunk).pipe(toArray());
  }

  getRegionOrders(region_id: number, type_id: number): Observable<EsiRegionOrder[]> {
    return this.getData<EsiRegionOrder[]>(`markets/${region_id}/orders/`, this.params.set('type_id', type_id.toString(10)));
  }

}
