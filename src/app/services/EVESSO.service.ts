import { Injectable } from '@angular/core';
import { OAuthService, JwksValidationHandler, AuthConfig } from 'angular-oauth2-oidc';
import { environment } from '../../environments/environment'

export const authConfig: AuthConfig = {
  issuer: 'https://login.eveonline.com/',
  skipIssuerCheck: true,
  redirectUri: window.location.origin,
  clientId: environment.client.id,
  dummyClientSecret: environment.client.secret,
  oidc: false,
  disablePKCE: true,
  scope: 'esi-assets.read_assets.v1 esi-universe.read_structures.v1 esi-markets.read_character_orders.v1 esi-markets.structure_markets.v1 esi-wallet.read_character_wallet.v1 esi-mail.read_mail.v1',
  responseType: "code",
  useHttpBasicAuth: true,
  requestAccessToken: true,
  userinfoEndpoint: 'https://esi.evetech.net/verify', // will be overwritten by Discovery doc
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
export class EVESSOService {
  public charData: EVESSOVerifyResponse;

  constructor(private oauth: OAuthService) { }

  public configure() {
    this.oauth.configure(authConfig);
    this.oauth.tokenValidationHandler = new JwksValidationHandler();
  }

  public tryLogin() {
    // Load Discovery Document and then try to login the user
    this.oauth.loadDiscoveryDocumentAndTryLogin().then(
      () => {
        if (this.oauth.hasValidAccessToken()) {
          //this.oauth.timeoutFactor = 0.1;
          this.oauth.setupAutomaticSilentRefresh();
          this.oauth.userinfoEndpoint = 'https://esi.evetech.net/verify'; // reset by discovery doc
          this.oauth.loadUserProfile().then(
            profile => {
              this.charData = <EVESSOVerifyResponse>profile;
              // this.oauth.getIdentityClaims() returns EVESSOVerifyResponse
              //console.log(profile);  profile['Scopes'] is granted scopes for the token
            }
          );
        }
      }
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
