import { Component, OnInit } from '@angular/core';
import { Observable, of, merge, from } from 'rxjs';
import { map, mergeMap, toArray, filter } from 'rxjs/operators';

import { EsiOrder, EsiStructureOrder, EsiCharCorpOrder, EsiRegionOrder } from '../services/ESI.service';
import { EsiDataService } from '../services/ESIDATA.service';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.css']
})
export class OrdersComponent implements OnInit {

  orders$: Observable<EsiOrder[]>;

  constructor(private esiData: EsiDataService) { }

  private loadRegionOrders(region_id: number, types: number[]): Observable<EsiRegionOrder[]> {
    return from(types).pipe(
      mergeMap(type_id => this.esiData.loadRegionOrders(region_id, type_id))
    );
  }

  private loadStationOrders(orders: EsiCharCorpOrder[]): Observable<EsiOrder> {
    const locs = [...new Set(orders.map(o => o.location_id))];
    const regs = [...new Set(orders.map(o => o.region_id))];
    return from(regs).pipe(
      mergeMap(r => this.loadRegionOrders(r, [...new Set(orders.filter(o => o.region_id == r && locs.indexOf(o.location_id) >= 0).map(o => o.type_id))])),
      mergeMap(orders => from(orders.filter(o => locs.indexOf(o.location_id) >= 0)))
    );
  }

  private loadStructureOrders(orders: EsiCharCorpOrder[]): Observable<EsiOrder> {
    const locs = [...new Set(orders.map(o => o.location_id))];
    const types = [...new Set(orders.map(o => o.type_id))];
    return from(locs).pipe(
      mergeMap(id => this.esiData.loadStructureOrders(id)),
      mergeMap(orders => from(orders.filter(o => types.indexOf(o.type_id) >= 0)))
    );
  }

  private loadOrders(orders: EsiCharCorpOrder[]): Observable<EsiOrder> {
    return merge(
      this.loadStationOrders(orders.filter(o => o.location_id < Math.pow(2, 32))),
      this.loadStructureOrders(orders.filter(o => o.location_id >= Math.pow(2, 32)))
    );
  }

  ngOnInit() {
    this.orders$ = this.esiData.loadCharacterOrders().pipe(
      mergeMap(orders => this.loadOrders(orders)),
      toArray()
    );
  }

}
