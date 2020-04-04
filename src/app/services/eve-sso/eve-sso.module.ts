import { NgModule, ModuleWithProviders, Injectable, Inject } from '@angular/core';
import { JwksValidationHandler } from 'angular-oauth2-oidc-jwks';
import { OAuthModule, ValidationParams } from 'angular-oauth2-oidc';
import { OAuthService } from 'angular-oauth2-oidc';

import { EVESSO_CONFIG, EVESSOConfig } from './eve-sso.config';
import { AccessTokenV2Payload } from './eve-sso.model';

import { b64urlDecode } from '@waiting/base64';

export { EVESSOConfig } from './eve-sso.config';

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

@Injectable({
  providedIn: 'root',
})
export class EVESSOService {
  public atp?: AccessTokenV2Payload;
  public err: unknown;

  get charIdName(): { id: number; name: string } | undefined {
    if (this.atp == undefined) return undefined;
    const id = this.atp.sub.split(':').pop();
    if (id == undefined) return undefined;
    return {
      id: +id,
      name: this.atp.name,
    };
  }

  constructor(private oauth: OAuthService, @Inject(EVESSO_CONFIG) private cfg: EVESSOConfig) {}

  public configure(): void {
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
      requestAccessToken: true,
      //showDebugInformation: true,
    });
  }

  public authorize(): void {
    // Load Discovery Document and then try to login the user
    this.oauth
      .loadDiscoveryDocumentAndTryLogin()
      .then(() => {
        if (this.oauth.hasValidAccessToken()) {
          const at = this.oauth.getAccessToken();
          const [atHeader, atPayload] = at
            .split('.')
            .slice(0, 2)
            .map(s => JSON.parse(b64urlDecode(s))) as [object, AccessTokenV2Payload];
          this.oauth.tokenValidationHandler
            .validateSignature({
              idToken: at,
              idTokenHeader: atHeader,
              idTokenClaims: atPayload,
              jwks: this.oauth.jwks,
            } as ValidationParams)
            .then(() => {
              this.atp = atPayload;
              //this.oauth.timeoutFactor = 0.1;
              this.oauth.setupAutomaticSilentRefresh();
            });
        }
      })
      .catch(err => (this.err = err));
  }

  login(): void {
    this.oauth.initLoginFlow();
  }

  logout(): void {
    this.atp = undefined;
    this.oauth.logOut();
  }

  isLoggedIn(): boolean {
    return this.oauth.hasValidAccessToken();
  }
}

@NgModule({
  imports: [OAuthModule.forRoot(undefined, JwksValidationHandler)],
})
export class EVESSOModule {
  static forRoot(cfg: EVESSOConfig): ModuleWithProviders<EVESSOModule> {
    return {
      ngModule: EVESSOModule,
      providers: [
        //{
        //  provide: HTTP_INTERCEPTORS,
        //  useClass: CodeVerifierInterceptorService,
        //  multi: true
        //},
        { provide: EVESSO_CONFIG, useValue: cfg },
      ],
    };
  }
}
