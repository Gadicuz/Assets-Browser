import { Injectable } from '@angular/core';

import {
  HttpRequest,
  HttpHandler,
  HttpParams,
  HttpEvent,
  HttpInterceptor,
  HttpResponse
} from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { of, range, forkJoin } from 'rxjs';
import { tap, filter, map, mergeMap, toArray } from 'rxjs/operators';

const publicRoutes: string =
  '(alliances/)|' +
  '(alliances/\\d+/)|' +
  '(alliances/\\d+/corporations/)|' +
  '(alliances/\\d+/icons/)|' +
  '(characters/affiliation/)|' +
  '(characters/\\d+/)|' +
  '(characters/\\d+/corporationhistory/)|' +
  '(characters/\\d+/portrait/)|' +
  '(contracts/public/\\d+)|' +
  '(contracts/public/bids/\\d+/)|' +
  '(contracts/public/items/\\d+/)|' +
  '(corporations/\\d+/)|' +
  '(corporations/\\d+/alliancehistory/)|' +
  '(corporations/\\d+/icons/)|' +
  '(corporations/npccorps/)|' +
  '(dogma/attributes/)|' +
  '(dogma/attributes/\\d+/)|' +
  '(dogma/dynamic/items/\\d+/\\d+/)|' +
  '(dogma/effects/)|' +
  '(dogma/effects/\\d+/)|' +
  '(fw/leaderboards/)|' +
  '(fw/leaderboards/characters/)|' +
  '(fw/leaderboards/corporations/)|' +
  '(fw/stats/)|' +
  '(fw/systems/)|' +
  '(fw/wars/)|' +
  '(incursions/)|' +
  '(industry/facilities/)|' +
  '(industry/systems/)|' +
  '(insurance/prices/)|' +
  '(killmails/\\d+/\\w+/)|' +
  '(loyalty/stores/\\d+/offers/)|' +
  '(markets/\\d+/history/)|' +
  '(markets/\\d+/orders/)|' +
  '(markets/\\d+/types/)|' +
  '(markets/groups/)|' +
  '(markets/groups/\\d+/)|' +
  '(markets/prices/)|' +
  '(opportunities/groups/)|' +
  '(opportunities/groups/\\d+/)|' +
  '(opportunities/tasks/)|' +
  '(opportunities/tasks/\\d+/)|' +
  '(route/\\d+/\\d+/)|' +
  '(search/)|' +
  '(sovereignty/campaigns/)|' +
  '(sovereignty/map/)|' +
  '(sovereignty/structures/)|' +
  '(universe/ancestries/)|' +
  '(universe/asteroid_belts/\\d+/)|' +
  '(universe/bloodlines/)|' +
  '(universe/categories/)|' +
  '(universe/categories/\\d+/)|' +
  '(universe/constellations/)|' +
  '(universe/constellations/\\d+/)|' +
  '(universe/factions/)|' +
  '(universe/graphics/)|' +
  '(universe/graphics/\\d+/)|' +
  '(universe/groups/)|' +
  '(universe/groups/\\d+/)|' +
  '(universe/ids/)|' +
  '(universe/moons/\\d+/)|' +
  '(universe/names/)|' +
  '(universe/planets/\\d+/)|' +
  '(universe/races/)|' +
  '(universe/regions/)|' +
  '(universe/regions/\\d+/)|' +
  '(universe/schematics/\\d+/)|' +
  '(universe/stargates/\\d+/)|' +
  '(universe/stars/\\d+/)|' +
  '(universe/stations/\\d+/)|' +
  '(universe/structures/)|' +
  '(universe/system_jumps/)|' +
  '(universe/system_kills/)|' +
  '(universe/systems/)|' +
  '(universe/systems/\\d+/)|' +
  '(universe/types/)|' +
  '(universe/types/\\d+/)|' +
  '(wars/)|' +
  '(wars/\\d+/)|' +
  '(wars/\\d+/killmails/)';

const metaRoutes: string =
  '(headers/)|' +
  '(ping)|' +
  '(status/)|' +
  '(status.json)|' +
  '(versions/)';

const noAuthRoutes: string =
  '^(' +
    `(latest/(${publicRoutes}))|` +
    `(${metaRoutes})` +
  ')$'
  ;

@Injectable()
export class NostoreInterceptorService implements HttpInterceptor {

  private readonly r: RegExp;

  constructor() {
    this.r = new RegExp(noAuthRoutes);
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const host = 'https://esi.evetech.net/';
    if (request.url.startsWith(host)) {
      const route = request.url.substring(host.length);
      if (this.r.test(route)) {
        request = request.clone({
          headers: request.headers.delete('Authorization')
        });
      }
      if (request.method == 'GET' && route == 'verify') {
        request = request.clone({
          //params: request.params.set('access_token', (new Date()).getTime().toString())
          headers: request.headers.set('If-None-Match', '"Just a random text to force ETAG validation"')
        });
      }
    }
    return next.handle(request);
  }
}
