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

@Injectable()
export class NostoreInterceptorService implements HttpInterceptor {

  constructor() { }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (request.url.startsWith('https://esi.evetech.net/verify')) {
      request = request.clone({
        params: request.params.set('access_token', (new Date()).getTime().toString())
      });
    }
    return next.handle(request);
  }
}
