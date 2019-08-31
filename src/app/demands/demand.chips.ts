import { Component, OnInit, Input, ViewChild, ViewChildren, QueryList } from '@angular/core';
import { Observable, of, from, fromEvent, empty, forkJoin, concat, zip, throwError, merge } from 'rxjs';
import { map, tap, switchMap, delay, switchMapTo, mergeMap, mergeAll, mergeMapTo, concatMap, filter, mapTo, toArray, catchError, bufferCount, ignoreElements } from 'rxjs/operators';

import { MatChipList, MatChip } from '@angular/material/chips';

import { DemandInfo } from './demands.models';

import { set, tuple } from '../utils/utils';

@Component({
  selector: 'app-demand-chips',
  templateUrl: './demand.chips.html',
  styleUrls: ['./demand.chips.css']
})
export class DemandChips implements OnInit {

  @ViewChild('chipList', { static: false }) chipList !: MatChipList;
//  @ViewChildren(MatChip) chips !: QueryList<MatChip>;

  private getSelectedChips(): [number[], string[]] {
    return this.chipList.chips.reduce((s, c) => {
      if (c.selected) {
        if (c.value.id) s[0].push(c.value.id);
        if (c.value.subject) s[1].push(c.value.subject);
      }
      return s;
    }, tuple([],[]))
  }

  get selectionChanges$(): Observable<[number[], string[]]> {
    return concat(
      of(this.getSelectedChips()),
      this.chipList.chipSelectionChanges.pipe(
        map(() => this.getSelectedChips())
      )
    )
  }

  @Input() chips: any[];

  ngOnInit() {}
    
  onChipClick(i) {
    this.chipList.chips.find((_, index) => index == i).toggleSelected();
  }

}
