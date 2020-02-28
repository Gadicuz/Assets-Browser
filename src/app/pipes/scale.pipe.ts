import { Pipe, PipeTransform, Inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LOCALE_ID } from '@angular/core';

@Pipe({ name: 'scale' })
export class ScalePipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private locale: string) {}

  transform(value: unknown, digitsInfo?: string, locale?: string): unknown {
    if (value == undefined) return undefined;
    let v = Number(value);
    if (isNaN(v)) return new DecimalPipe(this.locale).transform(value, digitsInfo, locale);
    const letter = ['', ' k', ' M', ' B'];
    let index = 0;
    while (v >= 1000 && index < letter.length - 1) {
      v /= 1000;
      index++;
    }
    const res = new DecimalPipe(this.locale).transform(v, digitsInfo, locale);
    return res && res + letter[index];
  }
}
