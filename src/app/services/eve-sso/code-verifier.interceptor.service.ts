import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor
  } from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import { OAuthService } from 'angular-oauth2-oidc';
import { b64urlEncode } from '@waiting/base64'
  
/**
 * Adds extra BASE64URL-ENCODE for code_verifier parameter.
 * FIX for EVE SSO PKCE bug.
 */
@Injectable()
export class CodeVerifierInterceptorService implements HttpInterceptor {

  constructor(private oauth: OAuthService) { }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const param_name = 'code_verifier';
    if (request.url === this.oauth.tokenEndpoint && request.method === 'POST' && request.body.has(param_name))
    {
      const cv = b64urlEncode(request.body.get(param_name));
      request = request.clone({
        body: request.body.set(param_name, cv)
      });
    }
    return next.handle(request);
  }
  
}