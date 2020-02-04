import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { of, range, forkJoin } from 'rxjs';
import { tap, filter, map, mergeMap, toArray } from 'rxjs/operators';
import { EVEESIConfig } from './EVEESI.config';

@Injectable()
export class XpageInterceptorService implements HttpInterceptor {

  private readonly host: string;

  constructor(cfg: EVEESIConfig) {
    this.host = cfg.baseUrl + '/';
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      mergeMap((event: HttpEvent<any>) => {
        if (request.params.has('page') || !request.url.startsWith(this.host)) return of(event);
        let response = event as HttpResponse<any>;
        if (response.headers == null) return of(event);
        let maxPage = +response.headers.get('X-Pages'); // null converts to 0
        if (maxPage <= 1) return of(event);
        return range(2, maxPage - 1).pipe(
          mergeMap(page => next.handle(request.clone({ params: request.params.set('page', String(page)) }))),
          filter(ev => ev instanceof HttpResponse),
          map(ev => (ev as HttpResponse<any>).body),
          toArray(),
          map(tail => response.clone({ body: response.body.concat(...tail) }))
        );
      })
    );
  }
}
