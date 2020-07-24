import { Component } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { EVESSOService } from './services/eve-sso/eve-sso.module';
import { EsiService } from './services/eve-esi/eve-esi.module';
import { EsiDataService } from './services/eve-esi/eve-esi-data.service';

import { X_WWW_FORM_UrlEncodingCodec } from './x-www-form-codec';

import ru from '@angular/common/locales/ru';

import ccpCopyright from './ccp.copyright.json';
import { Observable, Subject, never, merge } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { MatTabChangeEvent } from '@angular/material/tabs';

export interface UserTab {
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
  public userTabs$: Observable<UserTab[] | undefined>;

  private err: unknown;
  get loginError(): unknown {
    return this.err || this.sso.err;
  }

  private tabData: UserTab[] | undefined = undefined;
  private undefSubj = new Subject<undefined>();
  public activeUser = 1;
  public title: string | undefined;

  constructor(private sso: EVESSOService, private esi: EsiService, private data: EsiDataService) {
    X_WWW_FORM_UrlEncodingCodec.hook();
    this.copyright = ccpCopyright.split('{site}').join(window.location.hostname);
    this.sso.configure();
    this.userTabs$ = merge(
      this.data.loadCharacterData(this.sso.authorize()).pipe(
        catchError((err) => {
          this.err = err as unknown;
          return never();
        }),
        map((chData) => [
          {
            name: chData.corp.name,
            avatar: this.esi.getCorporationLogoURI(chData.corp.id, 64),
          },
          {
            name: chData.char.name,
            avatar: this.esi.getCharacterAvatarURI(chData.char.id, 64),
          },
        ]),
        tap((tabs) => {
          this.tabData = tabs;
          this.setActiveUser(1);
        })
      ),
      this.undefSubj.asObservable()
    );
  }

  private setActiveUser(i: number): void {
    this.activeUser = i;
    this.title = this.tabData && this.tabData[i].name;
  }

  ngOnInit(): void {
    registerLocaleData(ru);
  }

  login(): void {
    this.sso.login();
  }

  logoff(): void {
    this.undefSubj.next(undefined);
    this.sso.logout();
  }

  isLoggedIn(): boolean {
    return this.sso.isLoggedIn();
  }

  tabChanged(ev: MatTabChangeEvent): void {
    this.setActiveUser(ev.index);
  }
}
