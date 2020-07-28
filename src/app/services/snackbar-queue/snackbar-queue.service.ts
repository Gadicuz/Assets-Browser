import { NgModule, Injectable } from '@angular/core';

import { MatSnackBar } from '@angular/material/snack-bar';

import { Observable, Subject } from 'rxjs';
import { delay, concatMap, ignoreElements, map } from 'rxjs/operators';

interface Snack {
  text: string;
  cls: string;
}

@Injectable({
  providedIn: 'root',
})
export class SnackBarQueueService {
  public queue$: Observable<never>;

  private subj = new Subject<Snack>();

  constructor(private snackBar: MatSnackBar) {
    this.queue$ = this.subj.asObservable().pipe(
      concatMap((s) =>
        this.snackBar
          .open(s.text, 'CLOSE', { duration: 5000, panelClass: s.cls })
          .afterDismissed()
          .pipe(
            map((dis) => dis.dismissedByAction),
            delay(500)
          )
      ),
      ignoreElements()
    );
  }

  public msg(text: string, cls = ''): void {
    this.subj.next({ text, cls });
  }
}

@NgModule({})
export class SnackBarQueueModule {}
