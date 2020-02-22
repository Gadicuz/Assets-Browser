import { NgModule, ModuleWithProviders, Injectable } from '@angular/core';
import { HttpClient, HTTP_INTERCEPTORS } from '@angular/common/http';
import { OAuthService, JwksValidationHandler } from 'angular-oauth2-oidc';

import { CodeVerifierInterceptorService } from './code-verifier.interceptor.service';

import { b64urlDecode } from '@waiting/base64'

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

export interface EVESSOAccessTokenPayload {
  kid: string;    // "JWT-Signature-Key"
  jti: string;    // "998e12c7-3241-43c5-8355-2c48822e0a1b"
  sub: string;    // "CHARACTER:EVE:123123"
  iss: string;    // "login.eveonline.com"
  exp: number;    // 1534412504
  azp: string;    // "my3rdpartyclientid"
  name: string;   // "Some Bloke"
  owner: string;  // "8PmzCeTKb4VFUDrHLc/AeZXDSWM="
  scp: string []; // [ "esi-skills.read_skills.v1", "esi-skills.read_skillqueue.v1" ]
}

@Injectable({
  providedIn: 'root'
})
export class EVESSOService {
  public atp: EVESSOAccessTokenPayload;
  public err: any;

  get charId() : number {
    return this.atp ? +this.atp.sub.split(':').pop() : null;
  }

  get charName() : string {
    return this.atp ? this.atp.name : null;
  }

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
  }

  public tryLogin() {
    // Load Discovery Document and then try to login the user
    this.oauth.loadDiscoveryDocumentAndTryLogin().then(
      () => {
        if (this.oauth.hasValidAccessToken()) {
          let at = this.oauth.getAccessToken();
          let parts = at.split('.').slice(0,2).map(s => JSON.parse(b64urlDecode(s)));
          this.oauth.tokenValidationHandler.validateSignature({
            idToken: at,
            idTokenHeader: parts[0],
            idTokenClaims: parts[1],
            accessToken: null,
            jwks: this.oauth.jwks,
            loadKeys: null,
          }).then(_ => {
              this.atp = parts[1];
              //this.oauth.timeoutFactor = 0.1;
              this.oauth.setupAutomaticSilentRefresh();
            }
          );
        }
      }
    ).catch(
      err => this.err = err
    );
  }

  login() {
    this.oauth.initLoginFlow();
  }

  logout() {
    this.atp = null;
    this.oauth.logOut();
  }

  isLoggedIn(): boolean {
    return this.oauth.hasValidAccessToken();
  }

}

@NgModule()
export class EVESSOModule {
  static forRoot(cfg: EVESSOConfig): ModuleWithProviders<EVESSOModule> {
    return {
      ngModule: EVESSOModule,
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: CodeVerifierInterceptorService, multi: true },
        { provide: EVESSOConfig, useValue: cfg }
      ]
    };
  }
}
