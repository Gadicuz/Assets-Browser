import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';

import { EVESSOService } from '../services/EVESSO.service';
import { EsiServer, EsiError, EsiOrder } from '../services/ESI.service';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.css']
})
export class OrdersComponent implements OnInit {

  orders$: Observable<EsiOrder[]>;

  constructor(private sso: EVESSOService, private esi: EsiServer) { }

  private get character_id(): number {
    return this.sso.charData.CharacterID;
  }

  ngOnInit() {
    this.orders$ = this.esi.getCharacterOrders(this.character_id);
  }

}
