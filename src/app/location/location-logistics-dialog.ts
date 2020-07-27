import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface LocationLogisticData {
  items: { value: number; volume: number }[];
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
  public value: ChartDataChunk[];

  constructor(@Inject(MAT_DIALOG_DATA) public data: LocationLogisticData) {
    const step = Math.ceil(data.items.reduce((v, x) => v + x.volume, 0) / maxPoints);
    this.value = [
      {
        name: 'Value',
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
            { data: [{ name: 0, value: 0 }], milestone: 0 }
          ).data,
      },
    ];
  }

  colorScheme = {
    domain: ['#9370DB', '#87CEFA', '#FA8072', '#FF7F50', '#90EE90', '#9370DB']
  };

onSelect(event){}
}
