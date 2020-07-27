import { NgModule, Injectable } from '@angular/core';

import { MatSnackBar } from '@angular/material/snack-bar';

import { Observable, Subject } from 'rxjs';
import { delay, concatMap, ignoreElements, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class SnackBarQueueService {
  public queue$: Observable<never>;

  private subj = new Subject<string>();

  constructor(private snackBar: MatSnackBar) {
    this.queue$ = this.subj.asObservable().pipe(
      concatMap((text) =>
        this.snackBar
          .open(text, '', { duration: 3000 })
          .afterDismissed()
          .pipe(
            map((dis) => dis.dismissedByAction),
            delay(500)
          )
      ),
      ignoreElements()
    );
  }

  public msg(text: string): void {
    this.subj.next(text);
  }
}

@NgModule({})
export class SnackBarQueueModule {}
