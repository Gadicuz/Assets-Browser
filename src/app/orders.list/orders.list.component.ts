import { Component, Input } from '@angular/core';
import { OrderListItem } from '../orders/orders.component';

@Component({
  selector: 'app-orders-list',
  templateUrl: './orders.list.component.html',
  styleUrls: ['./orders.list.component.css']
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
export class OrdersListComponent {
  @Input() orders?: OrderListItem[];

  readonly displayedColumns: string[] = ['name', 'icon', 'quantity', 'price', 'duration', 'sold'];

  isOrderRow = (_index: number, item: OrderListItem): boolean => !item.name;
  expandedType?: number;
}
