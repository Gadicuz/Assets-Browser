import { Component, OnInit } from '@angular/core';
import { Observable, of, merge, concat, from, zip } from 'rxjs';
import { tap, map, mergeMap, toArray, filter, ignoreElements } from 'rxjs/operators';

import { EsiService, EsiOrder, EsiStructureOrder, EsiCharOrder, EsiCharCorpOrder, EsiRegionOrder, EsiWalletTransaction } from '../services/ESI.service';
import { EsiDataService } from '../services/ESIDATA.service';

import { set, tuple } from '../utils/utils';

interface LocationOrdersScheme {
  location_id: number;
  region_id: number;
  type_ids: number[];
}

interface TypeOrders {
  type_id: number;
  orders: EsiOrder[];
}

interface LocationOrders {
  location_id: number;
  types: TypeOrders[];
}

interface OrderListItem {
  type_id: number;
  name: string;
  quantity: number;
  price: number;
  duration: number;
  sold: number;
  owned: boolean;
  time: number;
  icons: string[];
  cls: any;
}

interface LocationInfo {
  name: string;
  items: OrderListItem[];
}


@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.css']
})
export class OrdersComponent implements OnInit {

  orders$: Observable<LocationInfo[]>;

  private readonly depth = 30 * 24 * 60 * 60 * 1000; 

  constructor(private esiData: EsiDataService) { }

  /*
  private processLocationOrders([loc, orders]: LocationOrders, owned: number[]): { name: string, orders: any } {
    return {
      name: this.esiData.structuresInfo.get(loc).name,
      orders: set(orders.map(o => o.type_id))
        .map(t => {
          return [{
            name: this.esiData.typesInfo.get(t).name,
            quantity: null,
            price: null
          }].concat(
            orders
              .filter(o => o.type_id == t)
              .sort((o1, o2) => ((o1.price > o2.price) ? -1 : ((o1.price < o2.price) ? 1 : 0)))
              .map(o => ({ name: null, quantity: o.volume_remain, price: o.price }))
          );
        }).flat()      
    };
  }
  */

  private loadRegionOrders(region_id: number, types: number[]): Observable<TypeOrders> {
    return from(types).pipe(
      mergeMap(type_id => this.esiData.service.getRegionOrders(region_id, type_id, "sell").pipe(
        map(region_orders => <TypeOrders>{
          type_id: type_id,
          orders: region_orders
        })
      ))
    );
  }

  private loadStationOrders(locs: LocationOrdersScheme[]): Observable<LocationOrders> {
    return from(set(locs.map(loc => loc.region_id).filter(region_id => !!region_id))).pipe(
      mergeMap(region_id => this.loadRegionOrders(region_id, set(locs.filter(loc => loc.region_id == region_id).map(loc => loc.type_ids).reduce((s, a) => s.concat(a), []))).pipe(
        toArray(),
        mergeMap(region_orders => from(locs.filter(loc => loc.region_id == region_id)).pipe(
          map(loc => <LocationOrders>{
            location_id: loc.location_id,
            types: region_orders.map(type_orders => <TypeOrders>{
              type_id: type_orders.type_id,
              orders: type_orders.orders.filter(o => o.location_id == loc.location_id)
            })
          })
        ))
      ))
    );
  }

  private loadStructureOrders(locs: LocationOrdersScheme[]): Observable<LocationOrders> {
    return from(locs).pipe(
      mergeMap(loc => this.esiData.service.getStructureOrders(loc.location_id).pipe(
        map(loc_orders => loc_orders.filter(o => !o.is_buy_order)),
        mergeMap(loc_sell_orders => from(loc.type_ids).pipe(
          map(type_id => <TypeOrders>{
            type_id: type_id,
            orders: loc_sell_orders.filter(o => o.type_id == type_id)
          }),
          toArray(),
          map(type_orders => <LocationOrders>{
            location_id: loc.location_id,
            types: type_orders
          })
        ))
      ))
    );
  }

  private loadOrders(locs: LocationOrdersScheme[]): Observable<LocationOrders> {
    const loc_ids = locs.map(loc => loc.location_id);
    const typ_ids = locs.map(loc => loc.type_ids).reduce((s,a) => s.concat(a), []);
    return concat(
      merge(
        this.esiData.loadStructuresInfo(loc_ids),
        this.esiData.loadTypeInfo(typ_ids)
      ).pipe(ignoreElements()),
      merge(
        this.loadStationOrders(locs.filter(loc => loc.location_id < Math.pow(2, 32))),
        this.loadStructureOrders(locs.filter(loc => loc.location_id >= Math.pow(2, 32)))
      )
    );
  }

  private analyzeData(orders: EsiCharOrder[], trans: EsiWalletTransaction[]): [number[], LocationOrdersScheme[], EsiWalletTransaction[]] {
    trans = trans.reduce((sum: EsiWalletTransaction[], t: EsiWalletTransaction) => {
      const i = sum.findIndex(x => t.location_id == x.location_id && t.type_id == x.type_id);
      if (i >= 0) {
        sum[i].quantity += t.quantity;
        sum[i].unit_price += t.quantity * t.unit_price;
        if (new Date(sum[i].date).getTime() < new Date(t.date).getTime()) sum[i].date = t.date;
      }
      else {
        t.unit_price *= t.quantity;
        sum = [...sum, t];
      }
      return sum;
    }, []);
    const loc_id_types = [...orders.map(o => tuple(o.location_id, o.type_id)), ...trans.map(t => tuple(t.location_id, t.type_id))];
    const loc_ids = set(loc_id_types.map(([location_id,]) => location_id));
    return [
      orders.map(o => o.order_id),
      loc_ids.map(id => ({
        location_id: id,
        region_id: (orders.filter(o => o.location_id == id).find(o => !!o.region_id) || { region_id: null }).region_id,
        type_ids: set(loc_id_types.filter(([location_id,]) => location_id == id).map(([, type_id]) => type_id))
      })),
      trans
    ];
  }

  private assembleItemsInfo(type_order: TypeOrders, ids: number[], trans: EsiWalletTransaction): OrderListItem[] {
    const now = Date.now();
    const dtime = 1 * 24 * 60 * 60 * 1000;
    const lines = type_order.orders.map(o => {
      const duration = now - new Date(o.issued).getTime();
      return <OrderListItem>{
        type_id: type_order.type_id,
        quantity: o.volume_remain,
        price: o.price,
        duration: duration,
        sold: o.volume_total - o.volume_remain,
        owned: ids.indexOf(o.order_id) >= 0,
        icons: (duration < dtime) ? ['new_releases'] : []
      }
    }).sort((l1, l2) => ((l1.price < l2.price) ? -1 : ((l1.price > l2.price) ? 1 : 0)));
    const [has_owned, has_other, best_price, expandable] = lines.reduce((s, x, i) => [s[0] || x.owned, s[1] || !x.owned, s[2] || (x.owned && i == 0), true], [false, false, false, false]);
    const [quantity, total] = lines.filter(val => val.owned).reduce((sum, val) => [sum[0] + val.quantity, sum[1] + val.quantity * val.price], [0, 0]);
    const sold = trans && trans.quantity || 0;
    let icons = [];
    if (sold && (now - new Date(trans.date).getTime()) < dtime) icons.push('attach_money');
    if (lines.find(x => x.icons.length)) icons.push('new_releases');
    if (!has_owned && has_other) icons.push('people_outline');
    if (has_owned && !has_other) icons.push('person');
    return [<OrderListItem>{
      type_id: type_order.type_id,
      name: this.esiData.typesInfo.get(type_order.type_id).name,
      quantity: quantity || null,
      price: quantity ? total / quantity : (sold ? trans.unit_price / trans.quantity : null),
      duration: sold && this.depth || null,
      sold: sold || null,
      icons: icons,
      cls: { has_owned, has_other, best_price, expandable }
    }].concat(lines);
  }

  private assembleLocationInfo(orders: LocationOrders, ids: number[], trans: EsiWalletTransaction[]): LocationInfo {
    const items = orders.types
      .map(type_order => this.assembleItemsInfo(type_order, ids, trans.find(t => t.type_id == type_order.type_id && t.location_id == orders.location_id)))
      .sort((a, b) => a[0].name.localeCompare(b[0].name))
      .reduce((s, a) => s.concat(a), []);
    return <LocationInfo>{
      name: this.esiData.structuresInfo.get(orders.location_id).name,
      items: items
    };
  }

  ngOnInit() {
    const character_id = this.esiData.character_id;
    this.orders$ = concat(
      of(null),
      zip(
        this.esiData.loadCharacterOrders().pipe(
          map(orders => orders.filter(o => !o.is_buy_order))
        ),
        this.esiData.loadCharacterWalletTransactions().pipe(
          map(trans => trans.filter(t => t.is_personal && !t.is_buy && ((Date.now() - new Date(t.date).getTime()) < this.depth)))
        ),
        (orders, trans) => this.analyzeData(orders, trans)
      ).pipe(
        mergeMap(([ids, locs, trans]) => this.loadOrders(locs).pipe(
          map(orders => this.assembleLocationInfo(orders, ids, trans))
        )),
        toArray(),
        map(data => data.sort((a, b) => a.name.localeCompare(b.name)))
      )
    );
  }

}
