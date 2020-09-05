import { NgModule, ModuleWithProviders, Injectable, Inject } from '@angular/core';
import { OAuthModule, OAuthService } from 'angular-oauth2-oidc';

import { EVESSO_CONFIG, EVESSOConfig } from './eve-sso.config';
import { AccessTokenV2Payload } from './eve-sso.model';

import { Observable, of, from } from 'rxjs';
import { catchError, filter, switchMap, map } from 'rxjs/operators';

export { EVESSOConfig } from './eve-sso.config';

import { jwtValidate, JWKS } from 'ez-jwt';

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

class SSOError implements Error {
  readonly name = 'SSOError';
  readonly message: string;
  constructor(e: unknown) {
    this.message = typeof e === 'object' ? (e as Error).message : String(e);
  }
}

@Injectable({
  providedIn: 'root',
})
export class EVESSOService {
  private _granted: string[] = [];
  public get granted(): string[] {
    return this.isLoggedIn() ? this._granted : [];
  }

  constructor(private oauth: OAuthService, @Inject(EVESSO_CONFIG) private cfg: EVESSOConfig) {}

  public configure(scopes: string): void {
    this.oauth.configure({
      issuer: 'https://login.eveonline.com',
      skipIssuerCheck: true,
      redirectUri: window.location.origin,
      clientId: this.cfg.client_id,
      //dummyClientSecret: this.config.client_secret,
      scope: scopes,
      oidc: false,
      responseType: 'code',
      //disablePKCE: true,
      useHttpBasicAuth: false,
      requestAccessToken: true,
      //showDebugInformation: true,
    });
  }

  public login(forced: boolean): Observable<number> {
    return of(forced).pipe(
      switchMap((forced) =>
        // Load Discovery Document and then try to login the user
        from(forced ? this.oauth.loadDiscoveryDocumentAndLogin() : this.oauth.loadDiscoveryDocumentAndTryLogin())
      ),
      filter(() => this.isLoggedIn()),
      switchMap(() =>
        from(
          jwtValidate<AccessTokenV2Payload>(this.oauth.getAccessToken(), {
            keys: this.oauth.jwks as JWKS,
            grace: 300,
          })
        )
      ),
      map((at) => {
        const r = at.sub && /^CHARACTER:EVE:(\d+)$/.exec(at.sub);
        if (!r) {
          this.logout();
          throw `Access token subject entry '${at.sub ?? ''}' is malformed. Can't extract subject id.`;
        }
        this._granted = at.scp;
        //this.oauth.timeoutFactor = 0.1;
        this.oauth.setupAutomaticSilentRefresh();
        return +r[1];
      }),
      catchError((err) => {
        throw new SSOError(err);
      })
    );
  }

  fastLogin(): void {
    this.oauth.initLoginFlow();
  }

  logout(): void {
    this.oauth.logOut();
  }

  isLoggedIn(): boolean {
    return this.oauth.hasValidAccessToken();
  }
}

@NgModule({
  imports: [OAuthModule.forRoot()],
})
export class EVESSOModule {
  static forRoot(cfg: EVESSOConfig): ModuleWithProviders<EVESSOModule> {
    return {
      ngModule: EVESSOModule,
      providers: [{ provide: EVESSO_CONFIG, useValue: cfg }],
    };
  }
}
