import { Component, Input, ViewChild } from '@angular/core';
import { Observable, of, concat } from 'rxjs';
import { map } from 'rxjs/operators';

import { MatChipList } from '@angular/material/chips';

import { DemandChip } from './demands.models';

import { tuple } from '../utils/utils';

@Component({
  selector: 'app-demand-chips',
  templateUrl: './demand.chips.html',
  styleUrls: ['./demand.chips.css']
})
export class DemandChips {
  @ViewChild('chipList') chipList!: MatChipList;
  //  @ViewChildren(MatChip) chips !: QueryList<MatChip>;

  private getSelectedChips(): [number[], string[]] {
    return this.chipList.chips.reduce((s, c) => {
      if (c.selected) {
        if (c.value.id) s[0].push(c.value.id);
        if (c.value.subject) s[1].push(c.value.subject);
      }
      return s;
    }, tuple([], []));
  }

  get selectionChanges$(): Observable<[number[], string[]]> {
    return concat(
      of(this.getSelectedChips()),
      this.chipList.chipSelectionChanges.pipe(map(() => this.getSelectedChips()))
    );
  }

  @Input() chips: DemandChip[];

  onChipClick(i: number): void {
    this.chipList.chips.find((_, index) => index == i).toggleSelected();
  }
}
