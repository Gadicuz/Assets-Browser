import { Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
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
  private currentSubj = -1;
  public title: string | undefined;

  constructor(router: Router, route: ActivatedRoute, private sso: EVESSOService, private data: EsiDataService) {
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
          this.subjs = esiSubjs.map((subj) => ({
            ...subj,
            avatar: this.data.getSubjectAvatarURI(subj, 64),
          }));
          const subj_id = +(route.snapshot.queryParamMap.get('subj') || 'NaN');
          this.selectSubj(this.subjs.findIndex((subj) => subj.id === subj_id));
          const queryParams = {
            code: undefined,
            scope: undefined,
            state: undefined,
            session_state: undefined,
          };
          if (this.currentSubj < 0)
            void router.navigate([''], {
              replaceUrl: true,
            });
          else
            void router.navigate([], {
              queryParams,
              queryParamsHandling: 'merge',
              replaceUrl: true,
            });
          return this.subjs;
        })
      ),
      this.rst.asObservable()
    );
  }

  public selectSubj(i: number): void {
    this.currentSubj = i;
    this.title = i < 0 ? undefined : this.subjs && this.subjs[i].name;
  }

  public isSubjSelected(i: number): boolean {
    return i === this.currentSubj;
  }

  public linkR(i: number): string[] {
    return this.currentSubj === i ? [] : [''];
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
