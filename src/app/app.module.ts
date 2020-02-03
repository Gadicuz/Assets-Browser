import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { FlexLayoutModule } from '@angular/flex-layout';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AngularMaterialModule } from './angular-material.module';

import { HttpClientModule } from '@angular/common/http';
import { OAuthModule, OAuthModuleConfig } from 'angular-oauth2-oidc';

import { LocationComponent } from './location/location.component';
import { OrdersComponent } from './orders/orders.component';

import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { XpageInterceptorService } from './xpage.interceptor.service';
import { NostoreInterceptorService } from './nostore.interceptor.service';

import { NgLetDirective } from "./ng-let.directive";

import { ScalePipe } from './pipes/scale.pipe';
import { DurationPipe } from './pipes/duration.pipe';

import { ESI_CONFIG } from './services/ESI.service';
import { OrdersListComponent } from './orders.list/orders.list.component';
import { ErrorComponent } from './error/error.component';
import { DemandsComponent } from './demands/demands.component';
import { DemandCard } from './demands/demand.card';
import { DemandChips } from './demands/demand.chips';

const esiServiceConfig: ESI_CONFIG = {
  baseUrl: 'https://esi.evetech.net',
  version: '/latest',
  datasource: 'tranquility'
};

const authModuleConfig: OAuthModuleConfig = {
  // Inject "Authorization: Bearer ..." header for these APIs:
  resourceServer: {
    allowedUrls: [esiServiceConfig.baseUrl],
    sendAccessToken: true,
  },
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
    OAuthModule.forRoot(authModuleConfig)
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: XpageInterceptorService, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: NostoreInterceptorService, multi: true },
    { provide: OAuthModuleConfig, useValue: authModuleConfig },
    { provide: ESI_CONFIG, useValue: esiServiceConfig }
  ],
  bootstrap: [AppComponent],
  exports: [NgLetDirective]
})
export class AppModule { }
