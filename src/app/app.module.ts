import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import { FlexLayoutModule } from '@angular/flex-layout';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgxChartsModule } from '@swimlane/ngx-charts';

import { AngularMaterialModule } from './angular-material.module';

import { HttpClientModule } from '@angular/common/http';
import { EVESSOModule, EVESSOConfig } from './services/eve-sso/eve-sso.module';
import { EVEESIModule, EVEESIConfig } from './services/eve-esi/eve-esi.module';

import { LocationComponent, LocationModule } from './location/location.component';
import { OrdersComponent, OrdersModule } from './orders/orders.component';

import { DefVarDirective } from './utils/defvar.directive';

import { ScalePipe } from './pipes/scale.pipe';
import { DurationPipe } from './pipes/duration.pipe';
import { UndefPipe } from './pipes/undef.pipe';

import { OrdersListComponent } from './orders.list/orders.list.component';
import { ErrorComponent } from './error/error.component';

import { ssoClientId } from '../environments/sso.client';

import { ScopesSetupComponent } from './scopes-setup/scopes-setup.component';
import { LocationLogisticsDialog } from './location/location-logistics-dialog';

const esiConfig: EVEESIConfig = {
  url: 'https://esi.evetech.net/',
  ver: 'latest/',
  datasource: 'tranquility',
};

const ssoConfig: EVESSOConfig = {
  client_id: ssoClientId,
};

@NgModule({
  declarations: [
    AppComponent,
    LocationComponent,
    OrdersComponent,
    DefVarDirective,
    ScalePipe,
    DurationPipe,
    UndefPipe,
    OrdersListComponent,
    ErrorComponent,
    ScopesSetupComponent,
    LocationLogisticsDialog,
  ],
  imports: [
    BrowserModule,
    FlexLayoutModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    AngularMaterialModule,
    HttpClientModule,
    ReactiveFormsModule,
    EVESSOModule.forRoot(ssoConfig),
    EVEESIModule.forRoot(esiConfig),
    LocationModule,
    OrdersModule,
    NgxChartsModule,
  ],
  bootstrap: [AppComponent],
  exports: [DefVarDirective],
  entryComponents: [ScopesSetupComponent],
})
export class AppModule {}
