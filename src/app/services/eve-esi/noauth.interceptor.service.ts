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
  private readonly r: RegExp;

  constructor(private cfg: EVEESIConfig) {
    this.r = new RegExp(noAuthRoutes(cfg.ver));
  }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (request.url.startsWith(this.cfg.url)) {
      if (this.r.test(request.url.substring(this.cfg.url.length))) {
        request = request.clone({
          headers: request.headers.delete('Authorization'),
        });
      }
    }
    return next.handle(request);
  }
}
