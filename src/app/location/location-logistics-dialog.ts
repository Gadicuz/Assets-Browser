import { Component, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { LineChartComponent } from '@swimlane/ngx-charts';

export interface LocationLogisticsDataItem {
  id: string;
  value: number;
  volume: number;
  quantity: number;
}

export interface LocationLogisticData {
  title: string;
  name: string;
  items: LocationLogisticsDataItem[];
}

interface ChartDataItem {
  name: unknown;
  value: unknown;
}

interface ChartDataChunk {
  name: string;
  series: ChartDataItem[];
}

const maxPoints = 100;

@Component({
  selector: 'location-logistics',
  templateUrl: './location-logistics-dialog.html',
  styleUrls: ['./location-logistics-dialog.css'],
})
export class LocationLogisticsDialog {
  public title: string;
  public value: ChartDataChunk[];
  public readonly colorScheme = {
    domain: ['#673AB7', '#F44336'],
  };

  @ViewChild(LineChartComponent) chart: LineChartComponent | undefined;

  constructor(@Inject(MAT_DIALOG_DATA) public data: LocationLogisticData) {
    this.title = data.title;
    const step = Math.ceil(data.items.reduce((v, x) => v + x.volume, 0) / maxPoints);
    this.value = [
      {
        name: data.name,
        series: data.items
          .filter((i) => i.volume)
          .map((i) => ({ ...i, rate: i.value / i.volume }))
          .sort((a, b) => b.rate - a.rate)
          .reduce(
            (acc, x) => {
              let z = acc.data[acc.data.length - 1];
              if (z.name >= acc.milestone) {
                z = { ...z };
                acc.data.push(z);
                acc.milestone += step * Math.ceil((z.name - acc.milestone) / step);
              }
              z.name += x.volume;
              z.value += x.value;
              return acc;
            },
            { data: [{ name: 0, value: 0, k: 1 }], milestone: 0 }
          ).data,
      },
      {
        name: 'chunks',
        series: [],
      },
    ];
  }

  onSelect(ev: unknown): void {
    console.log(ev);
    if (!this.chart) return;
    const i = ev as ChartDataItem;
    this.value[1].series = [{ name: i.name, value: 0 }, { ...i }];
    this.chart.results = this.value;
    this.chart.update();
  }
}
