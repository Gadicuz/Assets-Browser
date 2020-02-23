import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { of, range } from 'rxjs';
import { filter, map, mergeMap, toArray } from 'rxjs/operators';
import { EVEESIConfig } from './eve-esi.config';

@Injectable()
export class XpageInterceptorService implements HttpInterceptor {
  constructor(private cfg: EVEESIConfig) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      mergeMap(event => {
        if (!(event instanceof HttpResponse) || request.params.has('page') || !request.url.startsWith(this.cfg.url))
          return of(event);
        const response: HttpResponse<unknown[]> = event;
        if (response.headers == null) return of(event);
        const maxPage = +response.headers.get('X-Pages'); // null converts to 0
        if (maxPage <= 1) return of(event);
        return range(2, maxPage - 1).pipe(
          mergeMap(page => next.handle(request.clone({ params: request.params.set('page', String(page)) }))),
          filter(ev => ev instanceof HttpResponse),
          map(ev => (ev as HttpResponse<unknown[]>).body),
          toArray(),
          map(tail => response.clone({ body: response.body.concat(...tail) }))
        );
      })
    );
  }
}
