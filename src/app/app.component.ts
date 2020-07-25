import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import { EVESSOService } from './services/eve-sso/eve-sso.module';
import { EsiDataService } from './services/eve-esi/eve-esi-data.service';

import { X_WWW_FORM_UrlEncodingCodec } from './x-www-form-codec';

import ru from '@angular/common/locales/ru';

import ccpCopyright from './ccp.copyright.json';
import { Observable, Subject, never, merge } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface SubjTab {
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
  public subjects$: Observable<SubjTab[] | undefined>;

  private err: unknown;
  get loginError(): unknown {
    return this.err || this.sso.err;
  }

  public readonly routes = [
    { caption: 'Assets', link: 'browse' },
    { caption: 'Orders', link: 'orders' },
  ];

  private subjs: SubjTab[] | undefined = undefined;
  private rst = new Subject<undefined>();
  public currentSubj?: number;
  public title: string | undefined;

  constructor(router: Router, private sso: EVESSOService, private data: EsiDataService) {
    X_WWW_FORM_UrlEncodingCodec.hook();
    this.copyright = ccpCopyright.split('{site}').join(window.location.hostname);
    this.sso.configure();
    this.subjects$ = merge(
      this.data.loadSubjects(this.sso.authorize()).pipe(
        catchError((err) => {
          this.err = err as unknown;
          return never();
        }),
        map((esiSubjs) => {
          void router.navigate([], { replaceUrl: true });
          return (this.subjs = esiSubjs.map((subj) => ({
            ...subj,
            avatar: this.data.getSubjectAvatarURI(subj, 64),
          })));
        })
      ),
      this.rst.asObservable()
    );
  }

  public selectSubj(i: number): void {
    this.currentSubj = i;
    this.title = this.subjs && this.subjs[i].name;
  }

  public linkQ(i: number): { [k: string]: unknown } {
    if (this.subjs == undefined) return {};
    return {
      subj: this.subjs[i].id,
    };
  }

  ngOnInit(): void {
    registerLocaleData(ru);
  }

  login(): void {
    this.sso.login();
  }

  logoff(): void {
    this.rst.next();
    this.sso.logout();
  }

  isLoggedIn(): boolean {
    return this.sso.isLoggedIn();
  }
}
