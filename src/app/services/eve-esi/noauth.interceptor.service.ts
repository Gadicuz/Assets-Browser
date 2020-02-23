import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { EVEESIConfig } from './eve-esi.config';
import { noAuthRoutes } from './eve-esi.public';

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
