import { Component } from '@angular/core';
import { Observable, of, concat, zip, merge, defer } from 'rxjs';
import { map, mergeMap, toArray, catchError } from 'rxjs/operators';

import {
  EsiDataCharMarketOrder,
  EsiDataLocMarketTypes,
  EsiDataLocMarketOrders,
  EsiDataMarketOrder,
  EsiWalletTransaction,
  EsiDataService,
  EsiMarketOrderType,
  EsiDataInfo,
} from '../services/eve-esi/eve-esi-data.service';

import { EsiCacheService } from '../services/eve-esi/eve-esi-cache.service';
import { EsiService } from '../services/eve-esi/eve-esi.module';

import { autoMap, set, tuple, updateMapValues } from '../utils/utils';

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
  tstamp: number;
}
interface LocSales {
  l_id: number;
  tid_sales: Map<number, SalesData>;
}

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.css'],
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
            map((wts) =>
              wts.filter((wt) => wt.is_personal && !wt.is_buy && Date.now() - new Date(wt.date).getTime() < this.depth)
            )
          ),
        (orders, trans) => this.analyzeData(orders, trans)
      ).pipe(
        mergeMap(([loc_types, char_sales, ids]) => {
          const sales = new Map(char_sales.map((s) => [s.l_id, s.tid_sales]));
          return this.loadMarketOrders(loc_types, 'sell').pipe(
            map((loc_orders) => this.assembleLocationInfo(loc_orders, sales.get(loc_orders.l_id), ids))
          );
        }),
        toArray(),
        map((data) => ({ data: data.sort((a, b) => a.name.localeCompare(b.name)) })),
        catchError((err) => {
          console.log(err);
          return of({ error: err });
        })
      )
    );
  }

  private loadMarketOrders(
    locs: EsiDataLocMarketTypes[],
    buy_sell?: EsiMarketOrderType
  ): Observable<EsiDataLocMarketOrders> {
    const l = locs.reduce<{ stations: EsiDataLocMarketTypes[]; others: EsiDataLocMarketTypes[] }>(
      (s, x) => {
        (EsiService.isStationId(x.l_id) ? s.stations : s.others).push(x);
        return s;
      },
      { stations: [], others: [] }
    );
    const sta = set(l.stations.map((loc) => loc.l_id));
    const str = set(l.others.map((loc) => loc.l_id));
    return concat(
      this.cache.loadSSSCR({ sta, str }),
      defer(() => {
        const sta_types = sta.map((id) => (this.cache.stationsInfo.get(id) as EsiDataInfo<'stations'>).type_id);
        const str_types = str
          .map((id) => (this.cache.structuresInfo.get(id) as EsiDataInfo<'structures'>).type_id)
          .filter((tid) => tid != undefined) as number[];
        const types = set([...EsiDataService.pluckLocMarketTypes(locs), ...sta_types, ...str_types]);
        return this.cache.loadTypesInfo(types);
      }),
      defer(() =>
        merge(
          this.cache.loadStationsMarketOrders(l.stations, buy_sell),
          this.cache.loadStructuresMarketOrders(l.others, buy_sell)
        )
      )
    );
  }

  private analyzeData(
    orders: EsiDataCharMarketOrder[],
    trans: EsiWalletTransaction[]
  ): [EsiDataLocMarketTypes[], LocSales[], number[]] {
    const loc_id = [
      ...orders.map((o) => tuple(o.location_id, o.type_id)),
      ...trans.map((t) => tuple(t.location_id, t.type_id)),
    ];
    const types = Array.from(
      loc_id.reduce(
        autoMap(([l_id]) => l_id),
        new Map<number, [number, number][]>()
      ),
      ([l_id, l_types]) => ({ l_id, types: set(l_types.map(([, t]) => t)) })
    );

    const sales = Array.from(
      trans
        .filter((wt) => wt.quantity)
        .reduce(
          autoMap((wt) => wt.location_id),
          new Map<number, EsiWalletTransaction[]>()
        )
    ).map(([l_id, wts]) => ({
      l_id,
      tid_sales: updateMapValues(
        wts.reduce(
          autoMap((wt) => wt.type_id),
          new Map<number, EsiWalletTransaction[]>()
        ),
        (wts) =>
          wts.reduce(
            (sd, wt) => ({
              quantity: sd.quantity + wt.quantity,
              value: sd.value + wt.quantity * wt.unit_price,
              tstamp: Math.max(sd.tstamp, new Date(wt.date).getTime()),
            }),
            { quantity: 0, value: 0, tstamp: 0 }
          )
      ),
    }));

    return [types, sales, orders.map((o) => o.order_id)];
  }

  private assembleItemsInfo(
    type_id: number,
    name: string,
    t_orders: EsiDataMarketOrder[],
    ids: number[],
    sd: SalesData | undefined
  ): OrderListItem[] {
    const now = Date.now();
    const dtime = 1 * 24 * 60 * 60 * 1000;
    const lines: OrderListItem[] = t_orders
      .map((o) => {
        const duration = now - o.timestamp;
        return {
          type_id,
          name: '',
          quantity: o.volume_remain,
          price: o.price,
          duration,
          sold: o.volume_total - o.volume_remain,
          owned: ids.includes(o.order_id),
          icons: duration < dtime ? ['new_releases'] : [],
        };
      })
      .sort((l1, l2) => l1.price - l2.price || l2.duration - l1.duration);
    const [has_owned, has_other, best_price, expandable] = lines.reduce(
      (s, x, i) => [s[0] || x.owned, s[1] || !x.owned, s[2] || (x.owned && i === 0), true],
      [false, false, false, false]
    );
    const [quantity, total] = lines
      .filter((val) => val.owned)
      .reduce((sum, val) => [sum[0] + val.quantity, sum[1] + val.quantity * val.price], [0, 0]);
    const sold = sd ? sd.quantity : 0;
    const icons = [];
    if (sd && now - sd.tstamp < dtime) icons.push('attach_money');
    if (lines.find((x) => x.icons.length)) icons.push('new_releases');
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
        cls: { has_owned, has_other, best_price, expandable },
      } as OrderListItem,
    ].concat(lines);
  }

  private assembleLocationInfo(
    orders: EsiDataLocMarketOrders,
    sales: Map<number, SalesData> | undefined,
    ids: number[]
  ): LocationInfo {
    const l_id = orders.l_id;
    const name = EsiService.isStationId(l_id)
      ? (this.cache.stationsInfo.get(l_id) as EsiDataInfo<'stations'>).name
      : (this.cache.structuresInfo.get(l_id) as EsiDataInfo<'structures'>).name;

    const items = Array.from(orders.orders, ([t_id, t_orders]) =>
      this.assembleItemsInfo(
        t_id,
        (this.cache.typesInfo.get(t_id) as EsiDataInfo<'types'>).name, // type_id loaded by loadMarketOrders()
        t_orders,
        ids,
        sales?.get(t_id)
      )
    )
      .sort((a, b) => a[0].name.localeCompare(b[0].name))
      .reduce((s, a) => s.concat(a), []);

    return { name, items };
  }
}
