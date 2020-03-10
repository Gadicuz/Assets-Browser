import { Pipe, PipeTransform, Inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LOCALE_ID } from '@angular/core';

@Pipe({ name: 'scale' })
export class ScalePipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private locale: string) {}

  transform(value: unknown, digitsInfo?: string, locale?: string): unknown {
    if (typeof value !== 'number') return value;
    const letter = ['', ' k', ' M', ' B'];
    let index = 0;
    while (value >= 1000 && index < letter.length - 1) {
      value /= 1000;
      index++;
    }
    const res = new DecimalPipe(this.locale).transform(value, digitsInfo, locale);
    return res && res + letter[index];
  }
}
