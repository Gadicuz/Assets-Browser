import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface LocationLogisticData {
  title: string;
  data: {
    name: string;
    items: { value: number; volume: number; quantity: number }[];
  }[];
}

interface ChartDataChunk {
  name: string;
  series: { name: unknown; value: unknown }[];
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
  public colorScheme: unknown;

  constructor(@Inject(MAT_DIALOG_DATA) public data: LocationLogisticData) {
    this.title = data.title;
    this.colorScheme = {
      domain: data.data.map(() => '#3F51B5'),
    };
    this.value = data.data.map((d) => {
      const step = Math.ceil(d.items.reduce((v, x) => v + x.volume, 0) / maxPoints);
      return {
        name: d.name,
        series: d.items
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
            { data: [{ name: 0, value: 0 }], milestone: 0 }
          ).data,
      };
    });
  }
}
