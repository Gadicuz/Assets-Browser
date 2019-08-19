import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';

import { EsiOrder } from '../services/ESI.service';
import { EsiDataService } from '../services/ESIDATA.service';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.css']
})
export class OrdersComponent implements OnInit {

  orders$: Observable<EsiOrder[]>;

  constructor(private esiData: EsiDataService) { }

  ngOnInit() {
    this.orders$ = this.esiData.getCharacterOrders();
  }

}
