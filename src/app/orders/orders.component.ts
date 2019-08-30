import { Component, OnInit } from '@angular/core';
import { Observable, of, merge, concat, from, zip } from 'rxjs';
import { tap, map, reduce, mergeMap, toArray, filter, ignoreElements, catchError } from 'rxjs/operators';

import { EsiService, EsiOrder, EsiStructureOrder, EsiCharOrder, EsiCharCorpOrder, EsiRegionOrder, EsiWalletTransaction } from '../services/ESI.service';
import { EsiDataService, TypeOrders, LocationOrdersTypes, LocationOrders } from '../services/ESIDATA.service';

import { set, tuple } from '../utils/utils';

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

interface SalesHistroy {
  location_id: number;
  type_id: number;
  quantity: number;
  value: number;
  date: number;
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
    
  private loadOrders(locs: LocationOrdersTypes[]): Observable<LocationOrders> {
    const loc_ids = locs.map(loc => loc.location_id);
    const typ_ids = locs.map(loc => loc.types).reduce((s,a) => [...s, ...a]);
    return concat(
      merge(
        this.esiData.loadLocationsInfo(loc_ids.map(id => [id, EsiService.getAssetLocationType(id)])),
        this.esiData.loadTypeInfo(typ_ids)
      ).pipe(ignoreElements()),
      merge(
        this.esiData.loadStationOrders(locs.filter(loc => EsiService.isLocationLocID(loc.location_id))),
        this.esiData.loadStructureOrders(locs.filter(loc => !EsiService.isLocationLocID(loc.location_id)))
      )
    );
  }

  private analyzeData(orders: EsiCharOrder[], trans: EsiWalletTransaction[]): [number[], LocationOrdersTypes[], SalesHistroy[]] {
    const sales = trans.reduce((sum: SalesHistroy[], t: EsiWalletTransaction) => {
      const s = sum.find(s => t.location_id == s.location_id && t.type_id == s.type_id);
      if (s) {
        s.quantity += t.quantity;
        s.value += t.quantity * t.unit_price;
        if (s.date < new Date(t.date).getTime()) s.date = new Date(t.date).getTime();
      }
      else {
        sum.push(<SalesHistroy>{
          location_id: t.location_id,
          type_id: t.type_id,
          quantity: t.quantity,
          value: t.quantity * t.unit_price,
          date: new Date(t.date).getTime()
        });
      }
      return sum;
    }, []);
    const loc_id_types = [...orders.map(o => tuple(o.location_id, o.type_id)), ...trans.map(t => tuple(t.location_id, t.type_id))];
    const loc_ids = set(loc_id_types.map(([location_id,]) => location_id));
    return [
      orders.map(o => o.order_id),
      loc_ids.map(id => ({
        location_id: id,
        types: set(loc_id_types.filter(([location_id,]) => location_id == id).map(([, type_id]) => type_id)),
        region_id: (orders.filter(o => o.location_id == id).find(o => !!o.region_id) || { region_id: null }).region_id
      })),
      sales
    ];
  }

  private assembleItemsInfo(type_id: number, type_orders: EsiOrder[], ids: number[], sale: SalesHistroy): OrderListItem[] {
    const now = Date.now();
    const dtime = 1 * 24 * 60 * 60 * 1000;
    const lines = type_orders.map(o => {
      const duration = now - new Date(o.issued).getTime();
      return <OrderListItem>{
        type_id: type_id,
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
    const sold = sale && sale.quantity || 0;
    let icons = [];
    if (sold && (now - sale.date) < dtime) icons.push('attach_money');
    if (lines.find(x => x.icons.length)) icons.push('new_releases');
    if (!has_owned && has_other) icons.push('people_outline');
    if (has_owned && !has_other) icons.push('person');
    return [<OrderListItem>{
      type_id: type_id,
      name: this.esiData.typesInfo.get(type_id).name,
      quantity: quantity || null,
      price: quantity ? total / quantity : (sold ? sale.value / sale.quantity : null),
      duration: sold && this.depth || null,
      sold: sold || null,
      icons: icons,
      cls: { has_owned, has_other, best_price, expandable }
    }].concat(lines);
  }

  private assembleLocationInfo(orders: LocationOrders, ids: number[], sales: SalesHistroy[]): LocationInfo {
    const items = [...orders.orders]
      .map(([type_id, type_orders]) => this.assembleItemsInfo(type_id, type_orders, ids, sales.find(t => t.type_id == type_id && t.location_id == orders.location_id)))
      .sort((a, b) => a[0].name.localeCompare(b[0].name))
      .reduce((s, a) => s.concat(a), []);
    return <LocationInfo>{
      name: this.esiData.locationsInfo.get(orders.location_id).name,
      items: items
    };
  }

  ngOnInit() {
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
        mergeMap(([ids, locs, sales]) => this.loadOrders(locs).pipe(
          map(orders => this.assembleLocationInfo(orders, ids, sales))
        )),
        toArray(),
        map(data => ({ data: data.sort((a, b) => a.name.localeCompare(b.name)) })),
        catchError(err => {
          console.log(err);
          return of({ error: err });
        })
      )
    );
  }

}
