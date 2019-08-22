import { Component, OnInit, Input } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-orders-list',
  templateUrl: './orders.list.component.html',
  styleUrls: ['./orders.list.component.css'],
  /*
  animations: [
    trigger('orderExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
  */
})
export class OrdersListComponent implements OnInit {

  @Input() orders: any;

  readonly displayedColumns: string[] = ['name', 'icon', 'quantity', 'price', 'duration', 'sold'];

  isOrderRow = (index, item) => !item.name;
  expandedType: any;

  constructor() { }

  ngOnInit() {
  }

}
