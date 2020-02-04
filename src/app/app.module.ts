import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { FlexLayoutModule } from '@angular/flex-layout';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AngularMaterialModule } from './angular-material.module';

import { HttpClientModule } from '@angular/common/http';
import { OAuthModule, OAuthModuleConfig } from 'angular-oauth2-oidc';
import { EVESSOModule, EVESSOConfig } from './services/evesso/EVESSO.module';
import { EVEESIModule, EVEESIConfig } from './services/eveesi/EVEESI.module';

import { LocationComponent } from './location/location.component';
import { OrdersComponent } from './orders/orders.component';

import { NgLetDirective } from "./utils/ng-let.directive";

import { ScalePipe } from './pipes/scale.pipe';
import { DurationPipe } from './pipes/duration.pipe';

import { OrdersListComponent } from './orders.list/orders.list.component';
import { ErrorComponent } from './error/error.component';
import { DemandsComponent } from './demands/demands.component';
import { DemandCard } from './demands/demand.card';
import { DemandChips } from './demands/demand.chips';

import { environment } from '../environments/environment';

const esiConfig: EVEESIConfig = {
  baseUrl: 'https://esi.evetech.net',
  version: '/latest',
  datasource: 'tranquility'
};

const authConfig: OAuthModuleConfig = {
  // Inject "Authorization: Bearer ..." header for these APIs:
  resourceServer: {
    allowedUrls: [esiConfig.baseUrl],
    sendAccessToken: true,
  },
};

const ssoConfig: EVESSOConfig = {
  client_id: environment.client_id,
  scopes: ['esi-assets.read_assets.v1',
           'esi-universe.read_structures.v1',
           'esi-markets.read_character_orders.v1',
           'esi-markets.structure_markets.v1',
           'esi-wallet.read_character_wallet.v1',
           'esi-mail.read_mail.v1']  
};

@NgModule({
  declarations: [
    AppComponent,
    LocationComponent,
    OrdersComponent,
    NgLetDirective,
    ScalePipe,
    DurationPipe,
    OrdersListComponent,
    DemandsComponent, DemandCard, DemandChips,
    ErrorComponent
  ],
  imports: [
    BrowserModule,
    FlexLayoutModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    AngularMaterialModule,
    HttpClientModule,
    OAuthModule.forRoot(authConfig),
    EVESSOModule.forRoot(ssoConfig),
    EVEESIModule.forRoot(esiConfig)
  ],
  bootstrap: [AppComponent],
  exports: [NgLetDirective]
})
export class AppModule { }
