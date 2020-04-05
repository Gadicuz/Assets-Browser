import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'undef' })
export class UndefPipe implements PipeTransform {
  transform(value: unknown, undefValue: string): unknown {
    return value ?? undefValue;
  }
}
