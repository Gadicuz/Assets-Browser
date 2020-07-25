import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import { EVESSOService } from './services/eve-sso/eve-sso.module';
import { EsiService } from './services/eve-esi/eve-esi.module';
import { EsiDataService } from './services/eve-esi/eve-esi-data.service';

import { X_WWW_FORM_UrlEncodingCodec } from './x-www-form-codec';

import ru from '@angular/common/locales/ru';

import ccpCopyright from './ccp.copyright.json';
import { Observable, Subject, never, merge } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface UserTab {
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
  public userTabs$: Observable<UserTab[] | undefined>;

  private err: unknown;
  get loginError(): unknown {
    return this.err || this.sso.err;
  }

  public readonly routes = [
    { caption: 'Assets', link: 'browse' },
    { caption: 'Orders', link: 'orders' },
  ];

  private tabData: UserTab[] | undefined = undefined;
  private undefSubj = new Subject<undefined>();
  public activeUser?: number;
  public title: string | undefined;

  constructor(
    private router: Router,
    private sso: EVESSOService,
    private esi: EsiService,
    private data: EsiDataService
  ) {
    X_WWW_FORM_UrlEncodingCodec.hook();
    this.copyright = ccpCopyright.split('{site}').join(window.location.hostname);
    this.sso.configure();
    this.userTabs$ = merge(
      this.data.loadUsers(this.sso.authorize()).pipe(
        catchError((err) => {
          this.err = err as unknown;
          return never();
        }),
        map((chData) => {
          void router.navigate([], { replaceUrl: true });
          return (this.tabData = chData.map((u) => ({
            ...u,
            avatar:
              u.entity === 'characters'
                ? this.esi.getCharacterAvatarURI(u.id, 64)
                : this.esi.getCorporationLogoURI(u.id, 64),
          })));
        })
      ),
      this.undefSubj.asObservable()
    );
  }

  public setActiveUser(i: number): void {
    this.activeUser = i;
    this.title = this.tabData && this.tabData[i].name;
  }

  public linkQ(i: number): { [k: string]: unknown } {
    if (this.tabData == undefined) return {};
    return {
      id: this.tabData[i].id,
    };
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

  // tabChanged(ev: MatTabChangeEvent): void {
  //   this.setActiveUser(ev.index);
  // }
}
