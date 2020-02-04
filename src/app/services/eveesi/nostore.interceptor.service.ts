import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { EVEESIConfig } from './EVEESI.config';

/**
 * Force cache miss for https://esi.evetech.net/verify/ (ETAG validation)
 */
@Injectable()
export class NostoreInterceptorService implements HttpInterceptor {

  private readonly host: string;

  constructor(cfg: EVEESIConfig) {
    this.host = cfg.baseUrl + '/';
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (request.url === this.host + 'verify/') {
      request = request.clone({
        //params: request.params.set('access_token', (new Date()).getTime().toString())
        headers: request.headers.set('If-None-Match', '"Just a random text to force ETAG validation"')
      });
    }
    return next.handle(request);
  }
}
