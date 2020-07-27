import { NgModule, ModuleWithProviders, Injectable, Inject } from '@angular/core';
import { JwksValidationHandler } from 'angular-oauth2-oidc-jwks';
import { OAuthModule, ValidationParams } from 'angular-oauth2-oidc';
import { OAuthService } from 'angular-oauth2-oidc';

import { EVESSO_CONFIG, EVESSOConfig } from './eve-sso.config';
import { AccessTokenV2Payload } from './eve-sso.model';

import { b64urlDecode } from '@waiting/base64';
import { Observable, of, from } from 'rxjs';
import { catchError, filter, switchMap, map } from 'rxjs/operators';

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
        from(forced ? this.oauth.loadDiscoveryDocumentAndLogin() : this.oauth.loadDiscoveryDocumentAndTryLogin()).pipe(
          filter(() => this.isLoggedIn())
        )
      ),
      switchMap(() => {
        const at = this.oauth.getAccessToken();
        const [atHeader, atPayload] = at
          .split('.')
          .slice(0, 2)
          .map((s) => JSON.parse(b64urlDecode(s)) as unknown) as [unknown, AccessTokenV2Payload];
        return from(
          this.oauth.tokenValidationHandler.validateSignature({
            idToken: at,
            idTokenHeader: atHeader,
            idTokenClaims: atPayload,
            jwks: this.oauth.jwks,
          } as ValidationParams)
        ).pipe(
          map(() => {
            const id = atPayload.sub.split(':').pop();
            if (id == undefined || id === '') {
              this.logout();
              throw new SSOError(
                `Access token subject entry '${atPayload.sub}' is malformed. Can't extract subject id.`
              );
            }
            this._granted = atPayload.scp;
            //this.oauth.timeoutFactor = 0.1;
            this.oauth.setupAutomaticSilentRefresh();
            return +id;
          })
        );
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
