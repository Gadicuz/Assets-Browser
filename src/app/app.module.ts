import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { FlexLayoutModule } from '@angular/flex-layout';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AngularMaterialModule } from './angular-material.module';

import { HttpClientModule } from '@angular/common/http';
import { EVESSOModule, EVESSOConfig } from './services/eve-sso/eve-sso.module';
import { EVEESIModule, EVEESIConfig } from './services/eve-esi/eve-esi.module';

import { LocationComponent } from './location/location.component';
import { OrdersComponent } from './orders/orders.component';

import { AppLetDirective } from './utils/applet.directive';

import { ScalePipe } from './pipes/scale.pipe';
import { DurationPipe } from './pipes/duration.pipe';

import { OrdersListComponent } from './orders.list/orders.list.component';
import { ErrorComponent } from './error/error.component';

import { ssoClientId } from '../environments/sso.client';

const esiConfig: EVEESIConfig = {
  url: 'https://esi.evetech.net/',
  ver: 'latest/',
  datasource: 'tranquility'
};

const ssoConfig: EVESSOConfig = {
  client_id: ssoClientId,
  scopes: [
    'esi-assets.read_assets.v1',
    'esi-universe.read_structures.v1',
    'esi-markets.read_character_orders.v1',
    'esi-markets.structure_markets.v1',
    'esi-wallet.read_character_wallet.v1',
    'esi-mail.read_mail.v1'
  ]
};

@NgModule({
  declarations: [
    AppComponent,
    LocationComponent,
    OrdersComponent,
    AppLetDirective,
    ScalePipe,
    DurationPipe,
    OrdersListComponent,
    ErrorComponent
  ],
  imports: [
    BrowserModule,
    FlexLayoutModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    AngularMaterialModule,
    HttpClientModule,
    EVESSOModule.forRoot(ssoConfig),
    EVEESIModule.forRoot(esiConfig)
  ],
  bootstrap: [AppComponent],
  exports: [AppLetDirective]
})
export class AppModule {}
