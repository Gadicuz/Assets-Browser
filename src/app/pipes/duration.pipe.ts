import { Pipe, PipeTransform, Inject } from '@angular/core';
import { LOCALE_ID } from '@angular/core';

@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private locale: string) {}

  transform(value: number | undefined): string | undefined {
    if (value == undefined) return undefined;
    value = value / 1000;
    if (value > 24 * 60 * 60) return (value / (24 * 60 * 60)).toFixed(0) + ' d';
    if (value > 60 * 60) return (value / (60 * 60)).toFixed(0) + ' h';
    if (value > 60) return (value / 60).toFixed(0) + ' m';
    return (value / 1).toFixed(0) + ' s';
  }
}
