import { Component } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { EVESSOService } from './services/EVESSO.service';

import { HttpUrlEncodingCodec, HttpParameterCodec } from '@angular/common/http';

import ru from '@angular/common/locales/ru';

import ccpCopyright from '../assets/ccp.copyright.json';

class X_WWW_FORM_UrlEncodingCodec implements HttpParameterCodec {

  static hook() {
    HttpUrlEncodingCodec.prototype.decodeKey = X_WWW_FORM_UrlEncodingCodec.prototype.decodeKey;
    HttpUrlEncodingCodec.prototype.encodeKey = X_WWW_FORM_UrlEncodingCodec.prototype.encodeKey;
    HttpUrlEncodingCodec.prototype.decodeValue = X_WWW_FORM_UrlEncodingCodec.prototype.decodeValue;
    HttpUrlEncodingCodec.prototype.encodeValue = X_WWW_FORM_UrlEncodingCodec.prototype.encodeValue;
  }

  private static encode(v: string): string {
    return encodeURIComponent(v).replace(/%20/gi, '+');
  }

  private static decode(v: string): string {
    return decodeURIComponent(v.replace(/\\+/gi, '%20'));
  }

  encodeKey(key: string): string {
    return X_WWW_FORM_UrlEncodingCodec.encode(key);
  }
  encodeValue(value: string): string {
    return X_WWW_FORM_UrlEncodingCodec.encode(value);
  }
  decodeKey(key: string): string {
    return X_WWW_FORM_UrlEncodingCodec.decode(key);
  }
  decodeValue(value: string): string {
    return X_WWW_FORM_UrlEncodingCodec.decode(value);
  }
}

@Component({
  selector: 'app-root',
  styleUrls: ['./app.component.css'],
  templateUrl: './app.component.html',
})
export class AppComponent {

  public readonly copyright: string;

  get charData()
  {
    return this.sso.charData;
  }

  constructor(private sso: EVESSOService) {
    X_WWW_FORM_UrlEncodingCodec.hook();
    this.copyright = ccpCopyright.split('{site}').join(window.location.hostname);
    this.sso.configure();
    this.sso.tryLogin();
  }

  ngOnInit() {
    registerLocaleData(ru);
  }  

  ngAfterViewInit() {
  }

  login() {
    this.sso.login();
  }

  logoff() {
    this.sso.logout();
  }
 
  isLoggedIn(): boolean {
    return this.sso.isLoggedIn();
  }  
  
}
