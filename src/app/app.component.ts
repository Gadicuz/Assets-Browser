import { Component } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { EVESSOService } from './services/eve-sso/eve-sso.module';
import { EsiService } from './services/eve-esi/eve-esi.module';

import { X_WWW_FORM_UrlEncodingCodec } from './x-www-form-codec';

import ru from '@angular/common/locales/ru';

import ccpCopyright from './ccp.copyright.json';

export interface CharacterData {
  id: number;
  name: string;
  avatar: string;
}

@Component({
  selector: 'app-root',
  styleUrls: ['./app.component.css'],
  templateUrl: './app.component.html',
})
export class AppComponent {

  public readonly copyright: string;

  get charData(): CharacterData
  {
    if (this.sso.atp)
    {
      const id = this.sso.charId;
      return {
        id: id,
        name: this.sso.charName,
        avatar: this.esi.getCharacterAvatarURI(id, 64)
      };
    }
    else
      return null;
  }

  get loginError(): unknown {
    return this.sso.err;
  }

  constructor(private sso: EVESSOService, private esi: EsiService) {
    X_WWW_FORM_UrlEncodingCodec.hook();
    this.copyright = ccpCopyright.split('{site}').join(window.location.hostname);
    this.sso.configure();
    this.sso.authorize();
  }

  ngOnInit(): void {
    registerLocaleData(ru);
  }  

  login(): void {
    this.sso.login();
  }

  logoff(): void {
    this.sso.logout();
  }
 
  isLoggedIn(): boolean {
    return this.sso.isLoggedIn();
  }  
  
}
