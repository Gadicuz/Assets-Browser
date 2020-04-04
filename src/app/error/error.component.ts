import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-error',
  templateUrl: './error.component.html',
  styleUrls: ['./error.component.css'],
})
export class ErrorComponent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Input() err: any;
}
