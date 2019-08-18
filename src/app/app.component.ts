import { Component } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { OAuthService, JwksValidationHandler, AuthConfig } from 'angular-oauth2-oidc';

import ru from '@angular/common/locales/ru';

import ccpCopyright from '../assets/ccp.copyright.json';

interface InvironmentData {
  production: boolean;
  client: { id: string, secret: string };
}

import { environment } from '../environments/environment'

export const authConfig: AuthConfig = {
  issuer: 'https://login.eveonline.com/',
  skipIssuerCheck: true,
  redirectUri: window.location.origin,
  clientId: environment.client.id,
  dummyClientSecret: environment.client.secret,
  oidc: false,
  disablePKCE: true,
  scope: 'esi-assets.read_assets.v1 esi-universe.read_structures.v1',
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

@Component({
  selector: 'app-root',
  styleUrls: ['./app.component.css'],
  templateUrl: './app.component.html',
})
export class AppComponent {

  public charData;
  public readonly copyright: string;

  constructor(private oauthService: OAuthService) {
    this.copyright = ccpCopyright.split('{site}').join(window.location.hostname);
    this.oauthService.configure(authConfig);
    this.oauthService.setupAutomaticSilentRefresh();
    this.oauthService.tokenValidationHandler = new JwksValidationHandler();
    // Load Discovery Document and then try to login the user
    this.oauthService.loadDiscoveryDocumentAndTryLogin().then(
      res => {
        if ( this.oauthService.hasValidAccessToken() ) {
          this.oauthService.userinfoEndpoint = 'https://esi.evetech.net/verify'; // reset by discovery doc
          this.oauthService.loadUserProfile().then(
            profile => this.charData = profile
          );
        }
      }
    );
  }

  ngOnInit() {
    registerLocaleData(ru);
  }  

  ngAfterViewInit() {
  }

  login() {
    this.oauthService.initLoginFlow();
  }

  logoff() {
    this.charData = null;
    this.oauthService.logOut();
  }
 
  isLoggedIn() {
    return this.oauthService.hasValidAccessToken();
  }  
  
}
