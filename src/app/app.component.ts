import { Component, Inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import { EVESSOService } from './services/eve-sso/eve-sso.module';
import { EsiDataService, EsiSubject } from './services/eve-esi/eve-esi-data.service';

import { X_WWW_FORM_UrlEncodingCodec } from './x-www-form-codec';

import ru from '@angular/common/locales/ru';

import ccpCopyright from './ccp.copyright.json';
import { Observable, Subject, BehaviorSubject, never, merge, of } from 'rxjs';
import { catchError, map, delay, switchMap, tap } from 'rxjs/operators';

import { getScopes, TOOL_SCOPES, ToolScopes, ScopesSetupComponent } from './scopes-setup/scopes-setup.component';
import { MatDialog } from '@angular/material/dialog';

export interface SubjTab extends EsiSubject {
  avatar: string;
}

@Component({
  selector: 'app-root',
  styleUrls: ['./app.component.css'],
  templateUrl: './app.component.html',
})
export class AppComponent {
  public readonly copyright = ccpCopyright.split('{site}').join(window.location.hostname);
  public subjects$: Observable<SubjTab[]>;

  private err: unknown;
  get loginError(): unknown {
    return this.err || this.sso.err;
  }

  public readonly routes = [
    { caption: 'Assets', link: 'browse' },
    { caption: 'Orders', link: 'orders' },
  ];

  public title = '';
  private currentSubj = -1;
  private subjs: SubjTab[] = [];
  private reset = new Subject<SubjTab[]>(); // observable to reset subjects
  private relog = new BehaviorSubject<boolean>(false); // observable to relogin
  public scopes = '';
  private scopesUpdated = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private sso: EVESSOService,
    private data: EsiDataService,
    @Inject(TOOL_SCOPES) private tools: ToolScopes[]
  ) {
    X_WWW_FORM_UrlEncodingCodec.hook();
    this.updateScopes();
    this.subjects$ = this.relog.asObservable().pipe(
      switchMap((forced) =>
        merge(
          this.data.loadSubjects(this.sso.login(forced)).pipe(
            map((esiSubjs) => {
              this.subjs = esiSubjs.map((subj) => ({
                ...subj,
                avatar: this.data.getSubjectAvatarURI(subj, 64),
              }));
              const subj_param = this.route.snapshot.queryParamMap.get('subj');
              let index;
              if (subj_param) {
                const subj_id = +subj_param;
                index = this.subjs.findIndex((subj) => subj.id === subj_id);
              } else {
                index = this.subjs.findIndex((subj) => subj.type === 'characters');
              }
              this.selectSubj(index);
              const queryParams = {
                code: undefined,
                scope: undefined,
                state: undefined,
                session_state: undefined,
                subj: subj_param || this.subjs[this.currentSubj].id,
              };
              void this.router.navigate([], {
                queryParams,
                queryParamsHandling: 'merge',
                replaceUrl: true,
              });
              return this.subjs;
            }),
            catchError((err) => {
              this.err = err as unknown;
              return never();
            })
          ),
          this.reset.asObservable()
        )
      )
    );
  }

  private updateScopes(upd = false): void {
    this.scopes = getScopes(this.tools);
    this.sso.configure(this.scopes);
    this.scopesUpdated = upd;
  }

  public selectSubj(i: number): void {
    this.currentSubj = i;
    this.title = i < 0 ? '' : this.subjs[i].name;
  }

  public isSubjSelected(i: number): boolean {
    return i === this.currentSubj;
  }

  public linkR(i: number): string[] {
    return this.currentSubj === i ? [] : [''];
  }
  public linkQ(i: number): { [k: string]: unknown } {
    if (!this.subjs.length) return {};
    return {
      subj: this.subjs[i].id,
    };
  }

  ngOnInit(): void {
    registerLocaleData(ru);
  }

  login(): void {
    // ESI discovery document has invalid 'issuer' entry ('https://' is missed) so the document can't be downloaded twice.
    // The entry restored during configuration.

    // new scopes, issuer updated, full procedure includes discovery downloading
    if (this.scopesUpdated) this.relog.next(true);
    // the config hasn't been updated, issuer is corrupted, just start login flow
    else this.sso.fastLogin();
  }

  logoff(): void {
    this.reset.next([]);
    this.sso.logout();
  }

  isLoggedIn(): boolean {
    return this.sso.isLoggedIn();
  }

  settings(): void {
    const subs = of(undefined)
      .pipe(
        //delay(100),
        switchMap(() =>
          this.dialog
            .open(ScopesSetupComponent, {
              width: '800px',
              height: '80%',
            })
            .afterClosed()
        )
      )
      .subscribe((ret) => {
        if (ret) this.updateScopes(true);
        subs.unsubscribe();
      });
  }
}
