import { Component } from '@angular/core';
import { Observable, of, concat, zip } from 'rxjs';
import { map, mergeMap, toArray, catchError } from 'rxjs/operators';

import {
  EsiDataCharMarketOrder,
  EsiDataLocMarketTypes,
  EsiDataLocMarketOrders,
  EsiDataMarketOrder,
  EsiWalletTransaction,
  EsiDataService,
  asKeys
} from '../services/eve-esi/eve-esi-data.service';

import { EsiCacheService } from '../services/eve-esi/eve-esi-cache.service';

import { set, tuple } from '../utils/utils';

export interface OrderListItem {
  type_id: number;
  name: string; // main line only,
  quantity: number;
  price: number;
  duration: number;
  sold: number;
  owned: boolean; // child line only, false for main line
  icons: string[];
  cls?: {
    // main line only
    has_owned: boolean;
    has_other: boolean;
    best_price: boolean;
    expandable: boolean;
  };
}

interface LocationInfo {
  name: string;
  items: OrderListItem[];
}

interface SalesData {
  quantity: number;
  value: number;
  date: number;
}
type SalesHistory = Map<{ l_id: number; t_id: number }, SalesData>;

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.css']
})
export class OrdersComponent {
  orders$: Observable<{ data?: LocationInfo[]; error?: unknown }>;

  private readonly depth = 30 * 24 * 60 * 60 * 1000;

  constructor(private data: EsiDataService, private cache: EsiCacheService) {
    this.orders$ = concat(
      of({}),
      zip(
        this.data.loadCharacterMarketOrders('sell'),
        this.data
          .loadCharacterWalletTransactions()
          .pipe(
            map(wts =>
              wts.filter(wt => wt.is_personal && !wt.is_buy && Date.now() - new Date(wt.date).getTime() < this.depth)
            )
          ),
        (orders, trans) => this.analyzeData(orders, trans)
      ).pipe(
        mergeMap(([loc_types, char_orders, loc_type_sales]) => {
          const ids = char_orders.map(o => o.order_id);
          return this.cache
            .loadMarketOrders(loc_types, 'sell')
            .pipe(map(loc_orders => this.assembleLocationInfo(loc_orders, ids, loc_type_sales)));
        }),
        toArray(),
        map(data => ({ data: data.sort((a, b) => a.name.localeCompare(b.name)) })),
        catchError(err => {
          console.log(err);
          return of({ error: err });
        })
      )
    );
  }

  private analyzeData(
    orders: EsiDataCharMarketOrder[],
    trans: EsiWalletTransaction[]
  ): [EsiDataLocMarketTypes[], EsiDataCharMarketOrder[], SalesHistory] {
    const loc_id = [
      ...orders.map(o => tuple(o.location_id, o.type_id)),
      ...trans.map(t => tuple(t.location_id, t.type_id))
    ];
    const types = set(loc_id.map(([l_id]) => l_id))
      .map(asKeys(loc_id, (id, [x_id]) => id === x_id))
      .map(([l_id, loc_id]) => ({ l_id, types: loc_id.map(([, t]) => t) }));

    const sales = trans.reduce((sales: SalesHistory, wt: EsiWalletTransaction) => {
      if (wt.quantity) {
        const k = { l_id: wt.location_id, t_id: wt.type_id };
        const hItem = sales.get(k);
        const t = new Date(wt.date).getTime();
        if (hItem) {
          hItem.quantity += wt.quantity;
          hItem.value += wt.quantity * wt.unit_price;
          if (hItem.date < t) hItem.date = t;
        } else {
          sales.set(k, {
            quantity: wt.quantity,
            value: wt.quantity * wt.unit_price,
            date: t
          });
        }
      }
      return sales;
    }, new Map());

    return [types, orders, sales];
  }

  private assembleItemsInfo(
    type_id: number,
    name: string,
    type_orders: EsiDataMarketOrder[],
    ids: number[],
    sd: SalesData | undefined
  ): OrderListItem[] {
    const now = Date.now();
    const dtime = 1 * 24 * 60 * 60 * 1000;
    const lines: OrderListItem[] = type_orders
      .map(o => {
        const duration = now - o.timestamp;
        return {
          type_id,
          name: '',
          quantity: o.volume_remain,
          price: o.price,
          duration,
          sold: o.volume_total - o.volume_remain,
          owned: ids.includes(o.order_id),
          icons: duration < dtime ? ['new_releases'] : []
        };
      })
      .sort((l1, l2) => l1.price - l2.price || l2.duration - l1.duration);
    const [has_owned, has_other, best_price, expandable] = lines.reduce(
      (s, x, i) => [s[0] || x.owned, s[1] || !x.owned, s[2] || (x.owned && i === 0), true],
      [false, false, false, false]
    );
    const [quantity, total] = lines
      .filter(val => val.owned)
      .reduce((sum, val) => [sum[0] + val.quantity, sum[1] + val.quantity * val.price], [0, 0]);
    const sold = sd ? sd.quantity : 0;
    const icons = [];
    if (sd && now - sd.date < dtime) icons.push('attach_money');
    if (lines.find(x => x.icons.length)) icons.push('new_releases');
    if (!has_owned && has_other) icons.push('people_outline');
    if (has_owned && !has_other) icons.push('person');
    return [
      {
        type_id,
        name,
        quantity,
        price: quantity ? total / quantity : sd ? sd.value / sd.quantity : undefined,
        duration: (sold && this.depth) || undefined,
        sold,
        owned: false,
        icons,
        cls: { has_owned, has_other, best_price, expandable }
      } as OrderListItem
    ].concat(lines);
  }

  private assembleLocationInfo(loc_orders: EsiDataLocMarketOrders, ids: number[], sales: SalesHistory): LocationInfo {
    const items = [...loc_orders.orders]
      .map(([type_id, type_orders]) =>
        this.assembleItemsInfo(
          type_id,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.cache.typesInfo.get(type_id)!.name, // type_id loaded by loadMarketOrders()
          type_orders,
          ids,
          sales.get({ l_id: loc_orders.l_id, t_id: type_id })
        )
      )
      .sort((a, b) => a[0].name.localeCompare(b[0].name))
      .reduce((s, a) => s.concat(a), []);
    return {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      name: this.cache.locationsInfo.get(loc_orders.l_id)!.name, // loc_orders.location_id loaded by loadMarketOrders()
      items: items
    };
  }
}
