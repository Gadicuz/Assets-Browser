import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { OAuthService } from 'angular-oauth2-oidc';
import { b64urlEncode } from '@waiting/base64';

/**
 * Adds extra BASE64URL-ENCODE for code_verifier parameter.
 * FIX for EVE SSO PKCE bug.
 */
@Injectable()
export class CodeVerifierInterceptorService implements HttpInterceptor {
  constructor(private oauth: OAuthService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (request.url === this.oauth.tokenEndpoint && request.method === 'POST' && typeof request.body === 'object') {
      const param_name = 'code_verifier';
      const params = request.body as HttpParams;
      const cv = params.get(param_name);
      if (cv) request = request.clone({ body: params.set(param_name, b64urlEncode(cv)) });
    }
    return next.handle(request);
  }
}
