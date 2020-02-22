import { Component } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { EVESSOService } from './services/eve-sso/eve-sso.module';
import { EsiService } from './services/eve-esi/eve-esi.module';

import { X_WWW_FORM_UrlEncodingCodec } from './x-www-form-codec';

import ru from '@angular/common/locales/ru';

import ccpCopyright from './ccp.copyright.json';

@Component({
  selector: 'app-root',
  styleUrls: ['./app.component.css'],
  templateUrl: './app.component.html',
})
export class AppComponent {

  public readonly copyright: string;

  get charData()
  {
    if (this.sso.charData)
      return {
        id: this.sso.charData.CharacterID,
        name: this.sso.charData.CharacterName,
        avatar: this.esi.getCharacterAvatarURI(this.sso.charData.CharacterID, 64)
      };
    else
      return null;
  }

  get loginError() {
    return this.sso.error;
  }

  constructor(private sso: EVESSOService, private esi: EsiService) {
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
