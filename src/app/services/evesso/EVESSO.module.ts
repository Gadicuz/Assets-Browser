import { NgModule, ModuleWithProviders, Injectable } from '@angular/core';
import { HttpClient, HTTP_INTERCEPTORS } from '@angular/common/http';
import { OAuthService, JwksValidationHandler } from 'angular-oauth2-oidc';

import { CodeVerifierInterceptorService } from './code-verifier.interceptor.service';

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

export class EVESSOConfig {
  client_id: string;
  client_secret?: string;
  scopes: string[];
}

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
export class EVESSOService {
  public charData: EVESSOVerifyResponse;
  public error: any;

  constructor(private oauth: OAuthService, private http: HttpClient, private cfg: EVESSOConfig) { }

  public configure() {
    this.oauth.configure({
      issuer: 'https://login.eveonline.com',
      skipIssuerCheck: true,
      redirectUri: window.location.origin,
      clientId: this.cfg.client_id,
      //dummyClientSecret: this.config.client_secret,
      scope: this.cfg.scopes.join(' '),
      oidc: false,
      responseType: 'code',
      //disablePKCE: true,
      useHttpBasicAuth: false,
      requestAccessToken: true
      //showDebugInformation: true,  
    });
    this.oauth.tokenValidationHandler = new JwksValidationHandler();
  }

  public tryLogin() {
    // Load Discovery Document and then try to login the user
    this.oauth.loadDiscoveryDocumentAndTryLogin().then(
      () => {
        if (this.oauth.hasValidAccessToken()) {
          this.http.get('https://esi.evetech.net/verify/').subscribe(
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

}

@NgModule()
export class EVESSOModule {
  static forRoot(cfg: EVESSOConfig): ModuleWithProviders {
    return {
      ngModule: EVESSOModule,
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: CodeVerifierInterceptorService, multi: true },
        { provide: EVESSOConfig, useValue: cfg }
      ]
    };
  }
}
