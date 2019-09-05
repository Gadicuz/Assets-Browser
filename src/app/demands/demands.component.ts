import { Component, OnInit, OnDestroy, Directive, HostListener, ViewChild, ViewChildren, QueryList } from '@angular/core';

import { map, tap, switchMap, delay, switchMapTo, mergeMap, distinctUntilChanged, distinct, mergeAll, mergeMapTo, concatMap, filter, mapTo, toArray, catchError, bufferCount, ignoreElements } from 'rxjs/operators';
import { Observable, of, from, fromEvent, empty, forkJoin, concat, zip, throwError, merge, Subject, Subscription } from 'rxjs';

import { EsiService, EsiIdCategory, EsiIdInfo, EsiMail, EsiOrder } from '../services/ESI.service';
import { EsiDataService, TypeOrders } from '../services/ESIDATA.service';

import { set, tuple } from '../utils/utils';

import { DemandsReport, DemandInfo, DemandLocItems, DemandLocData, DemandDataItem, DemandDataChunk, DemandChip } from './demands.models';
import { DemandChips } from './demand.chips';

interface ReqLine {
  name: string;
  href: string;
  quantity: string;
}

interface ReqRecord {
  type: 'structure' | 'station' | 'character' | 'item' | 'fitting' | 'solar_system' | 'break' | 'unrecognized';
  name?: string;
  id?: number;
  comment?: string;
  quantity?: number;
}

@Component({
  selector: 'app-demands',
  templateUrl: './demands.component.html',
  styleUrls: ['./demands.component.css']
})
export class DemandsComponent implements OnInit, OnDestroy {

  static readonly marketStructureIds: number[] = [ // All tructures market module can fit to.
    35826,  // Azbel
    35827,  // Sotiyo
    35833,  // Fortizar
    35834,  // Keepstar
    35836,  // Tatara
    40340,  // Upwell Palatine Keepstar
    47512,  // 'Moreau' Fortizar
    47513,  // 'Draccous' Fortizar
    47514,  // 'Horizon' Fortizar
    47515,  // 'Marginis' Fortizar
    47516   // 'Prometheus' Fortizar
  ];

  static readonly characterTypeIds: number[] = [ // Group 1
    1373, // CharacterAmarr
    1374, // CharacterNiKunni
    1375, // CharacterCivire
    1376, // CharacterDeteis
    1377, // CharacterGallente
    1378, // CharacterIntaki
    1379, // CharacterSebiestor
    1380, // CharacterBrutor
    1381, // CharacterStatic
    1382, // CharacterModifier
    1383, // CharacterAchura
    1384, // CharacterJinMei
    1385, // CharacterKhanid
    1386, // CharacterVherokior
    34574 // CharacterDrifter
  ];

  static readonly TimeDepth: number = 45 * 24 * 60 * 60 * 1000;
  static readonly TAG: string = '[demand]'; // 'Re:'

  static getDemandName(subj: string): string {
    return subj.substring(subj.indexOf(DemandsComponent.TAG) + DemandsComponent.TAG.length).trim()
  }

  demandChips$: Observable<DemandChip[]>;
  demandReport$: Subject<DemandsReport>;

  private currentDemands: DemandInfo[];
  private marketOrders: Map<number, TypeOrders>;

  constructor(private esi: EsiService, private esiData: EsiDataService) { }

  private buildDemandRecord(lines: ReqLine[]): Observable<ReqRecord[]> {
    const values = lines.map(l => l && l.href.match(/(?:showinfo:(\d+)(?:\/.*?\/(\d+))?)|(?:fitting:(\d+):(.*))/i));
    return this.esiData.loadTypeInfo(values.filter(v => v && v[1] != undefined).map(v => Number(v[1]))).pipe(
      map(() => from(lines.map((l, i) => {
        if (l == null) return <ReqRecord>{ type: 'break' };
        const v = values[i];
        const q = l.quantity && Number(l.quantity);
        if (v == null) return <ReqRecord>{ type: 'unrecognized', name: l.name, comment: l.href, quantity: q };
        if (v[1] == null) return <ReqRecord>{ type: 'fitting', name: l.name, id: Number(v[3]), comment: v[4], quantity: q };
        const type_id = Number(v[1]);
        if (v[2] != undefined) {
          const item_id = Number(v[2]);
          const id_type = EsiService.getIdType(item_id);
          switch (id_type) {
            case 'station':
            case 'character':
            case 'solar_system':
              return <ReqRecord>{ type: id_type, name: l.name, id: item_id, quantity: q };
            case 'character_corporation_alliance':
              if (DemandsComponent.characterTypeIds.indexOf(type_id) >= 0) return <ReqRecord>{ type: 'character', name: l.name, id: item_id, quantity: q };
              break;
            case 'other':
              if (DemandsComponent.marketStructureIds.indexOf(type_id) >= 0)
                return <ReqRecord>{ type: 'structure', name: l.name, id: item_id, quantity: q };
          }
        }
        return <ReqRecord>{ type: 'item', name: this.esiData.typesInfo.get(type_id).name, id: type_id, comment: "", quantity: q };
      }))),
      mergeAll(),
      toArray()
    );
  }

  private static parseBody(body: string): ReqLine[] {
    return body
      .replace(/<\/?font.*?>|<\/?loc.*?>/gi, '')
      .split('<br>')
      .reduce((result, line) => {
        if (line.length == 0)
          result.push(null);
        else {
          const item = line.match(/<a href="(.*?)">(.+?)<\/a>\s*x?(\d+)?/i);
          if (item) result.push(<ReqLine>{
            href: item[1],
            name: item[2],
            quantity: item[3]
          });
          else {
            const mailing = line.match(/^mailing list\s+(.+?)\s*$/i);
            if (mailing) result.push(<ReqLine>{
              href: 'mailingList',
              name: mailing[1],
              quantity: undefined
            });
          }
        }
        return result;
      }, <ReqLine[]>[]);
  }

  private static assembleChunk(r: ReqRecord): DemandDataItem {
    return <DemandDataItem>{
      icon: (r.type == 'fitting') ? 'build' : 'category',
      name: r.name,
      quantity: r.quantity,
      chunks: [
        { type_id: r.id, quantity: 1 },
        ...r.comment
          .split(':')
          .map(v => v.match(/^(\d+);(\d+)$/))
          .filter(v => v != null)
          .map(v => <DemandDataChunk>{
            type_id: Number(v[1]),
            quantity: Number(v[2])
          })
      ]
    }
  }

  private static assembleItems(records: ReqRecord[], loc?: DemandLocData): DemandLocData[] {
    const init = loc ? tuple([{ id: loc.id, name: loc.name, items: [] }], true)
      : tuple(<DemandLocData[]>[], false);
    return records.reduce(([res, s], r) => {
      if (s) {
        if (r.type == 'item' || r.type == 'fitting') {
          res[res.length - 1].items.push(DemandsComponent.assembleChunk(r));
          return tuple(res, true);
        }
        if (r.type == 'unrecognized' && r.comment == 'mailingList') {
          res[res.length - 1].items.push(<DemandDataItem>{
            icon: 'list',
            name: r.name,
            quantity: r.quantity,
            chunks: []
          });
          return tuple(res, true);
        }
      }
      if (r.type == 'structure' || r.type == 'station') {
        res.push(<DemandLocData>{ id: r.id, name: r.name, items: [] });
        return tuple(res, true);
      }
      return tuple(res, s);
    }, init)[0].filter(v => v.items.length != 0);
  }

  private assembleDemands(hdrs: EsiMail[], mailList?: string, loc?: DemandLocData): Observable<DemandInfo> {
    return this.esi.getIdsInformation(set(hdrs.map(h => h.from))).pipe(
      toArray(),
      map(info => new Map<number, string>(info.map(v => [v.id, v.name]))),
      mergeMap(names => from(hdrs).pipe(
        mergeMap(hdr => this.esi.getCharacterMail(this.esiData.character_id, hdr.mail_id).pipe(
          mergeMap(mail => this.buildDemandRecord(DemandsComponent.parseBody(mail.body))),
          map(records => DemandsComponent.assembleItems(records, loc)),
          //filter(data => data.length != 0),
          map(data => <DemandInfo>{
            name: mailList || DemandsComponent.getDemandName(hdr.subject),
            timestamp: new Date(hdr.timestamp).getTime(),
            issuer_id: hdr.from,
            issuer_name: names.get(hdr.from),
            avatar: this.esi.getCharacterAvatarURI(hdr.from, 64),
            data: data,
            mail_id: hdr.mail_id
          })
        ))
      ))      
    );
  }

  private getMailingLists(hdrs: EsiMail[], demand: DemandInfo): Observable<DemandInfo> {
    const mailingLists = demand.data
      .map(loc => loc.items.filter(item => item.icon == 'list').map(item => tuple(item.name, loc)))
      .filter(v => v.length != 0)
      .reduce((s,t) => [...s, ...t], []);
    return from(mailingLists).pipe(
      distinct(([listName, loc]) => `${listName}/${loc.name}`),
      mergeMap(([listName, loc]) => {
        return this.esiData.service.getCharacterMailingLists(this.esiData.character_id).pipe(
          map(lists => lists.find(list => list.name.localeCompare(listName) == 0)),
          map(list => list && hdrs.filter(h => h.recipients.find(r => r.recipient_id == list.mailing_list_id && r.recipient_type == 'mailing_list'))),
          mergeMap(hdr => this.assembleDemands(hdr, listName, loc))
        );
      })
    );
  }

  private getDemands(date: number): Observable<DemandInfo> {
    return this.esiData.getCharacterMailHeaders([], date).pipe(
      toArray(),
      mergeMap(hdrs => {
        const h = hdrs
          .filter(hdr => hdr.subject.indexOf(DemandsComponent.TAG) >= 0)
          .filter(hdr => hdr.labels.length != 1 || hdr.labels[0] != EsiService.STD_MAIL_LABEL_ID_Sent)
          .reduce((result, hdr) => {
            if (!result.find(x => x.from == hdr.from && !DemandsComponent.getDemandName(x.subject).localeCompare(DemandsComponent.getDemandName(hdr.subject)))) result.push(hdr);
            return result;
          }, <EsiMail[]>[]);
        return this.assembleDemands(h).pipe(
          mergeMap(demand => merge(of(demand), this.getMailingLists(hdrs, demand))),
        );
      }),
      tap(demand => {
        demand.data.forEach(loc => loc.items = loc.items.filter(item => item.icon != 'list'));
        demand.data = demand.data.filter(loc => loc.items.length != 0);
      }),
      filter(demand => demand.data.length != 0)
      //tap(r => console.log(r))
    );
  }

  private processDemandsCards(cards: DemandInfo[]): DemandLocItems[] {
    //.map(...).reduce((s,x) => [...s, ...x])
    //.map(...).flat();
    //.flatMap(...);
    return cards.map(c => c.data).reduce((s, t) => [...s, ...t], [])
      .reduce((locItems, locData) => {
        const locDataItems = locData.items
          .map(item => item.chunks.map(c => ({ type_id: c.type_id, quantity: c.quantity * item.quantity })))
          .reduce((s, t) => [...s, ...t], []);
        const item = locItems.find(i => i.id == locData.id);
        if (item) item.items = [...item.items, ...locDataItems]; else locItems.push({ id: locData.id, items: locDataItems });
        return locItems;
      }, <DemandLocItems[]>[])
      .map(x => ({
        id: x.id,
        items: x.items.reduce((s, i) => {
          const item = s.find(si => si.type_id == i.type_id);
          if (item) item.quantity += i.quantity; else s.push(i);
          return s;
        }, <DemandDataChunk[]>[])
      }));
  }

  private calcRatio(quantity: number, price: number, orders: EsiOrder[]): number | undefined {
    const [m_short, m_value] = orders.sort((a, b) => a.price - b.price).reduce(([q, v], ord) => {
      if (q == 0) return tuple(q, v);
      const ord_q = ord.volume_remain > q ? q : ord.volume_remain;
      return tuple(q - ord_q, v + ord_q * ord.price);
    }, tuple(quantity, 0));
    quantity -= m_short;
    const value = quantity * price;
    return value ? (m_value / value) - 1 : undefined;
  }

  private buildMarkets(items: DemandLocItems[]): any {
    if (items.length == 0) return []; // TODO
    return items.map(locItems => ({
      name: this.esiData.locationsInfo.get(locItems.id).name,
      items: locItems.items.map(i => {
        const type_id_orders = this.marketOrders.get(locItems.id).get(i.type_id);
        const q_market = type_id_orders.reduce((s, a) => s + a.volume_remain, 0);
        const ratio = this.calcRatio(i.quantity, this.esiData.prices.get(i.type_id), type_id_orders);
        return {
          id: i.type_id,
          name: this.esiData.typesInfo.get(i.type_id).name,
          q_demand: i.quantity || undefined,
          q_market: q_market || undefined,
          ratio: ratio,
          shortage: !q_market || i.quantity > q_market
        };
      }).sort((a, b) => a.name.localeCompare(b.name))
    })).sort((a, b) => a.name.localeCompare(b.name));
  }
    
  private extractChips(cards: DemandInfo[]): DemandChip[] {
    const issuers = cards.reduce((s, c) => {
      if (!s.find(x => x.issuer_id == c.issuer_id)) s.push(c);
      return s;
    }, <DemandInfo[]>[]).map(c => ({
      caption: c.issuer_name,
      avatar: this.esiData.service.getCharacterAvatarURI(c.issuer_id, 32),
      id: c.issuer_id
    })).sort((a, b) => a.caption.localeCompare(b.caption));
    const subjects = set(cards.map(c => c.name)).map(name => ({
      caption: name,
      subject: name
    })).sort((a, b) => a.caption.localeCompare(b.caption));
    return [...issuers, ...subjects];
  }

  ngOnInit() {
    this.demandChips$ = concat(
      of(null),
      this.esiData.loadPrices().pipe(
        mergeMap(() => this.getDemands(Date.now() - DemandsComponent.TimeDepth).pipe(
          toArray(),
          tap(demand => this.currentDemands = demand
            .sort((a, b) => a.name.localeCompare(b.name) || a.issuer_name.localeCompare(b.issuer_name) || a.timestamp - b.timestamp)
            .reduce((r, d) => {
              const cnt = r.length;
              if (cnt == 0) return [d];
              const v = r[cnt - 1];
              if (v.issuer_id == d.issuer_id && v.name == d.name) {
                d.data[0].timestamp = d.timestamp;
                if (v.timestamp) v.data[0].timestamp = v.timestamp;
                v.timestamp = undefined;
                v.data = [...d.data, ...v.data];
                v.mail_id = undefined;
              }
              else
                r.push(d);
              return r;
            }, <DemandInfo[]>[])
          ),
          mergeMap(() => this.esiData.loadOrders(this.processDemandsCards(this.currentDemands).map(i => ({ location_id: i.id, types: i.items.map(c => c.type_id) }))).pipe(
            map(locOrders => tuple(locOrders.location_id, locOrders.orders)),
            toArray(),
            tap(orders => this.marketOrders = new Map(orders))
          ))          
        )),
        map(() => this.extractChips(this.currentDemands)),
        catchError(err => {
          console.log(err);
          return of({ error: err });
        })
      )
    );
    this.demandReport$ = new Subject<DemandsReport>();
  }

  ngOnDestroy() {
    this.chips = undefined;
  }

  private filterDemands(f) {
    const cards = this.currentDemands.filter(c => f[0].indexOf(c.issuer_id) >= 0 && f[1].indexOf(c.name) >= 0);
    let report = <DemandsReport>{
      cards: cards,
      markets: this.buildMarkets(this.processDemandsCards(cards))
    }
    if (report.cards.length == 0)
      report = {
        ...report,
        message: this.currentDemands.length ? 'Nothing to display' : 'No demands found',
        comment: this.currentDemands.length ? undefined : 'Create a new demand by sending an EVE- mail!'
      }
    this.demandReport$.next(report);
  }

  private _chips: DemandChips = undefined;
  private _chips_sub: Subscription = undefined;
  @ViewChild('demandChips', { static: false }) set chips(chips: DemandChips) {
    if (this._chips === chips) return;
    if (this._chips_sub) this._chips_sub.unsubscribe();
    this._chips = chips;
    this._chips_sub = this._chips ? this._chips.selectionChanges$.subscribe(f => this.filterDemands(f)) : undefined;
  }

}
