import { Pipe, PipeTransform, Inject } from '@angular/core';
import { formatNumber } from '@angular/common';
import { LOCALE_ID } from '@angular/core';

@Pipe({ name: 'scale' })
export class ScalePipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private locale: string) {}

  transform(value: unknown, sfx: string, digitsInfo?: string, locale?: string): string | undefined {
    if (value == undefined || value === '' || value !== value) return undefined;
    locale = locale || this.locale;
    if (typeof value === 'string') value = Number(value);
    if (typeof value !== 'number') throw new Error(value + 'is not a number');
    let i = 0;
    while (value >= 1000 && i < sfx.length) {
      value /= 1000;
      i++;
    }
    const r = formatNumber(value, locale, digitsInfo);
    return r ? (i ? r + ' ' + sfx[i - 1] : r) : undefined;
  }
}
