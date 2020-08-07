import { Component, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { LineChartComponent } from '@swimlane/ngx-charts';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { seq } from '../utils/utils';

export interface LocationLogisticsDataItem {
  id: string;
  value: number;
  volume: number;
  quantity: number;
}

interface RatedDataItem extends LocationLogisticsDataItem {
  rate: number;
}

export interface LocationLogisticData {
  title: string;
  name: string;
  items: LocationLogisticsDataItem[];
}

interface ChartDataItem {
  name: number;
  value: number;
}

interface ChartMainDataItem extends ChartDataItem {
  di: number; // data array index
  si: number; // chart series index
}

interface ChartDataChunk {
  name: string;
  series: ChartDataItem[];
}

interface ChunckInfo {
  volume: number;
  value: number;
  ids: string[];
}

const maxPoints = 50;
const maxCuts = maxPoints - 2;

@Component({
  selector: 'location-logistics',
  templateUrl: './location-logistics-dialog.html',
  styleUrls: ['./location-logistics-dialog.css'],
})
export class LocationLogisticsDialog {
  public title: string;
  public value: ChartDataChunk[];
  public chunks$: Observable<ChunckInfo[]>;
  public chunk = -1;

  public readonly colorScheme = {
    domain: ['#673AB7'].concat(seq(maxCuts).map(() => '#F44336')),
  };

  @ViewChild(LineChartComponent) chart: LineChartComponent | undefined;

  private ratedItems: RatedDataItem[];
  private subj = new BehaviorSubject<undefined>(undefined);
  private cuts: number[] = [];

  constructor(@Inject(MAT_DIALOG_DATA) public data: LocationLogisticData) {
    this.title = `${data.name} (${data.title})`;
    this.ratedItems = data.items
      .filter((i) => i.volume)
      .map((i) => ({ ...i, rate: i.value / i.volume }))
      .sort((a, b) => b.rate - a.rate);
    const step = Math.ceil(data.items.reduce((v, x) => v + x.volume, 0) / maxPoints);
    this.value = [
      {
        name: data.name,
        series: this.ratedItems.reduce(
          (acc, x, i) => {
            let z = acc.data[acc.data.length - 1];
            const gap = z.name + x.volume - acc.milestone;
            if (gap > 0) {
              //acc.milestone += step * Math.ceil(gap / step);
              acc.milestone += gap + step;
              z = { ...z };
              z.si = acc.data.push(z) - 1;
            }
            z.name += x.volume;
            z.value += x.value;
            z.di = i;
            return acc;
          },
          { data: [{ name: 0, value: 0, di: 0, si: 0 }], milestone: 0 }
        ).data,
      },
    ].concat(
      seq(maxCuts, 1).map((i) => ({
        name: `Chunk ${i}`,
        series: [],
      }))
    );
    this.chunks$ = this.subj.asObservable().pipe(
      tap(() => {
        this.cuts.forEach((c, i) => {
          const v = this.cutValue(c);
          this.value[i + 1].series = [{ ...v, value: 0 }, { ...v }];
        });
        for (let c = this.cuts.length; c < maxCuts; ++c) {
          this.value[c + 1].series = [];
        }
        if (this.chart) {
          this.chart.results = this.value;
          this.chart.update();
        }
      }),
      map(() =>
        [...this.cuts.map((c) => this.cutValue(c).di), this.ratedItems.length]
          .reduce(
            (acc, i) => {
              i += 1;
              acc.data.push(this.ratedItems.slice(acc.index, i));
              acc.index = i;
              return acc;
            },
            { data: [] as RatedDataItem[][], index: 0 }
          )
          .data.map((items) => this.getChunkInfo(items))
      )
    );
  }

  private getChunkInfo(items: RatedDataItem[]): ChunckInfo {
    return {
      value: items.reduce((v, i) => v + i.value, 0),
      volume: items.reduce((v, i) => v + i.volume, 0),
      ids: items.map((i) => i.id),
    };
  }

  private cutValue(c: number): ChartMainDataItem {
    return this.value[0].series[c] as ChartMainDataItem;
  }

  onSelect(ev: unknown): void {
    const pt = ev as ChartMainDataItem;
    if (pt.si == 0 || pt.si == this.value[0].series.length - 1) return;
    const pos = this.cuts.indexOf(pt.si);
    if (pos >= 0) this.cuts.splice(pos, 1);
    else {
      this.cuts.push(pt.si);
      this.cuts = this.cuts.sort((a, b) => a - b);
    }
    this.subj.next(undefined);
  }

  del(pos: number): void {
    if (!pos) return;
    if (pos <= this.chunk) this.chunk--;
    this.cuts.splice(pos - 1, 1);
    this.subj.next(undefined);
  }

  reset(): void {
    this.cuts = [];
    this.subj.next(undefined);
  }
}
