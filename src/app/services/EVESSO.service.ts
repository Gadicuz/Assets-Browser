import { Injectable } from '@angular/core';
import { OAuthService, JwksValidationHandler, AuthConfig } from 'angular-oauth2-oidc';
import { environment } from '../../environments/environment'

import {
  HttpClient,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable } from 'rxjs/Observable';

export const authConfig: AuthConfig = {
  issuer: 'https://login.eveonline.com',
  skipIssuerCheck: true,
  redirectUri: window.location.origin,
  clientId: environment.client_id,
//  dummyClientSecret: environment.client_secret,
  scope: 'esi-assets.read_assets.v1 esi-universe.read_structures.v1 esi-markets.read_character_orders.v1 esi-markets.structure_markets.v1 esi-wallet.read_character_wallet.v1 esi-mail.read_mail.v1',
  oidc: false,
  responseType: 'code',
//  disablePKCE: true,
  useHttpBasicAuth: false,
  requestAccessToken: true
  //showDebugInformation: true,  
};

/*
{
 "issuer":"login.eveonline.com",
 "authorization_endpoint":"https://login.eveonline.com/v2/oauth/authorize",
 "token_endpoint":"https://login.eveonline.com/v2/oauth/token",
 "response_types_supported":["code","token"],
 "jwks_uri":"https://login.eveonline.com/oauth/jwks",
 "revocation_endpoint":"https://login.eveonline.com/v2/oauth/revoke",
 "revocation_endpoint_auth_methods_supported":["client_secret_basic","client_secret_post","client_secret_jwt"],
 "token_endpoint_auth_methods_supported":["client_secret_basic","client_secret_post","client_secret_jwt"],
 "token_endpoint_auth_signing_alg_values_supported":["HS256"],
 "code_challenge_methods_supported":["S256"]
}
*/

export interface EVESSOVerifyResponse {
  CharacterID: number;
  CharacterName?: string;
  CharacterOwnerHash?: string;
  ExpiresOn?: string;
  IntellectualProperty?: string;
  Scopes?: string;
  TokenType?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EVESSOService implements HttpInterceptor {
  public charData: EVESSOVerifyResponse;
  public error;

  constructor(private oauth: OAuthService, private http: HttpClient) { }

  public configure() {
    this.oauth.configure(authConfig);
    this.oauth.tokenValidationHandler = new JwksValidationHandler();
  }

  public tryLogin() {
    // Load Discovery Document and then try to login the user
    this.oauth.loadDiscoveryDocumentAndTryLogin().then(
      () => {
        if (this.oauth.hasValidAccessToken()) {
          this.http.get('https://esi.evetech.net/verify').subscribe(
            resp => {
              //console.log(resp);  resp['Scopes'] is granted scopes for the token
              this.charData = <EVESSOVerifyResponse>resp;
              //this.oauth.timeoutFactor = 0.1;
              this.oauth.setupAutomaticSilentRefresh();
            }
          );
        }
      }
    ).catch(
      err => this.error = err
    );
  }

  login() {
    this.oauth.initLoginFlow();
  }

  logout() {
    this.charData = null;
    this.oauth.logOut();
  }

  isLoggedIn(): boolean {
    return this.oauth.hasValidAccessToken();
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const param_name = 'code_verifier';
    if (request.url === this.oauth.tokenEndpoint && request.method === 'POST' && request.body.has(param_name))
      request = request.clone({
        body: request.body.set(param_name, btoa(request.body.get(param_name)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''))
      });
    return next.handle(request);
  }

}
