import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { EVEESIConfig } from './eve-esi.config';

/**
 * Force cache miss for https://esi.evetech.net/verify/ (ETAG validation)
 */
@Injectable()
export class NostoreInterceptorService implements HttpInterceptor {
  constructor(private cfg: EVEESIConfig) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (request.url === this.cfg.url + 'verify/') {
      request = request.clone({
        //params: request.params.set('access_token', (new Date()).getTime().toString())
        headers: request.headers.set('If-None-Match', '"Just a random text to force ETAG validation"'),
      });
    }
    return next.handle(request);
  }
}
