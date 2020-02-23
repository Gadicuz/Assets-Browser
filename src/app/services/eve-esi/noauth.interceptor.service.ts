import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { EVEESIConfig } from './eve-esi.config';

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

/**
 * Remove unnecessary Authorization header for selected ESI endpoints.
 */
@Injectable()
export class NoauthInterceptorService implements HttpInterceptor {

  private readonly host: string;
  private readonly r: RegExp;

  constructor(cfg: EVEESIConfig) {
    this.host = cfg.baseUrl + '/';
    this.r = new RegExp(noAuthRoutes);
  }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (request.url.startsWith(this.host)) {
      if (this.r.test(request.url.substring(this.host.length))) {
        request = request.clone({
          headers: request.headers.delete('Authorization')
        });
      }
    }
    return next.handle(request);
  }
}
