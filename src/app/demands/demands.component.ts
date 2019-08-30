import { Component, OnInit } from '@angular/core';

import { map, tap, switchMap, delay, switchMapTo, mergeMap, mergeAll, mergeMapTo, concatMap, filter, mapTo, toArray, catchError, bufferCount, ignoreElements } from 'rxjs/operators';
import { Observable, of, from, forkJoin, concat, zip, throwError, merge } from 'rxjs';

import { EsiService, EsiIdCategory, EsiIdInfo, EsiMail } from '../services/ESI.service';
import { EsiDataService } from '../services/ESIDATA.service';

import { set, tuple } from '../utils/utils';

import { DemandsReport, DemandInfo, DemandLocData, DemandDataItem, DemandDataChunk } from './demands.models';

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
export class DemandsComponent implements OnInit {

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
  
  static readonly TAG: string = 'Re:'; // '[demand]'

  static getDemandName(subj: string): string {
    return subj.substring(subj.indexOf(DemandsComponent.TAG) + DemandsComponent.TAG.length).trim()
  }

  demandsReport$: Observable<DemandsReport>;

  constructor(private esi: EsiService, private esiData: EsiDataService) { }

  private buildDemandRecord(lines: ReqLine[]): Observable<ReqRecord[]> {
    const values = lines.map(l => l && l.href.match(/(?:showinfo:(?<type_id>\d+)(?:\/.*?\/(?<item_id>\d+))?)|(?:fitting:(?<ship_id>\d+):(?<fitting_data>.*))/i));
    return this.esiData.loadTypeInfo(values.filter(v => v && v.groups.type_id != undefined).map(v => Number(v.groups.type_id))).pipe(
      map(() => from(lines.map((l, i) => {
        if (l == null) return <ReqRecord>{ type: 'break' };
        const v = values[i];
        const q = l.quantity && Number(l.quantity);
        if (v == null) return <ReqRecord>{ type: 'unrecognized', name: l.name, comment: l.href, quantity: q };
        if (v.groups.type_id == null) return <ReqRecord>{ type: 'fitting', name: l.name, id: Number(v.groups.ship_id), comment: v.groups.fitting_data, quantity: q };
        const type_id = Number(v.groups.type_id);
        if (v.groups.item_id != undefined) {
          const item_id = Number(v.groups.item_id);
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
      .replace(/<font.*?>|<\/font>/gi, '')
      .split('<br>')
      .reduce((result, line) => {
        if (line.length == 0)
          result.push(null);
        else {
          const item = line.match(/<a href="(?<href>.*?)">(?<name>.+?)<\/a>\s*x?(?<quantity>\d+)?/i);
          if (item) result.push(<any>item.groups);
        }
        return result;
      }, <ReqLine[]>[]);
  }

  private static assembleChunk(r: ReqRecord): DemandDataItem {
    return <DemandDataItem>{
      icon: (r.type == 'fitting') ? 'build' : 'category',
      name: r.name,
      quantity: r.quantity || 1,
      chunks: [
        { type_id: r.id, quantity: 1 },
        ...r.comment
          .split(':')
          .map(v => v.match(/^(?<type_id>\d+);(?<quantity>\d+)$/))
          .filter(v => v != null)
          .map(v => <DemandDataChunk>{
            type_id: Number(v.groups.type_id),
            quantity: Number(v.groups.quantity)
          })
      ]
    }
  }

  private static assembleItems(records: ReqRecord[]): DemandLocData[] {
    return records.reduce(([res,s], r) => {
      if (s) {
        if (r.type == 'item' || r.type == 'fitting') {
          res[res.length - 1].items.push(DemandsComponent.assembleChunk(r));
          return tuple(res,true);
        }
      }
      if (r.type == 'structure' || r.type == 'station') {
        res.push(<DemandLocData>{ id: r.id, name: r.name, items: [] });
        return tuple(res, true);
      }
      return tuple(res, false);
    }, tuple(<DemandLocData[]>[],false))[0].filter(v => v.items.length != 0);
  }

  getReports(date: number): Observable<DemandInfo> {
    return this.esiData.getCharacterMailHeaders([], date).pipe(
      toArray(),
      map(hdrs => hdrs
        .filter(hdr => hdr.subject.indexOf(DemandsComponent.TAG) >= 0)
        .filter(hdr => hdr.labels.length != 1 || hdr.labels[0] != EsiService.STD_MAIL_LABEL_ID_Sent)
        .reduce((result, hdr) => {
          if (!result.find(x => x.from == hdr.from && x.subject == hdr.subject)) result.push(hdr);
          return result;
        }, <EsiMail[]>[])),
      mergeMap(hdrs => this.esi.getIdsInformation(set(hdrs.map(h => h.from))).pipe(
        toArray(),
        map(info => new Map<number, string>(info.map(v => [v.id, v.name]))),
        mergeMap(names => from(hdrs).pipe(
          mergeMap(hdr => this.esi.getCharacterMail(this.esiData.character_id, hdr.mail_id).pipe(
            mergeMap(mail => this.buildDemandRecord(DemandsComponent.parseBody(mail.body))),
            map(records => DemandsComponent.assembleItems(records)),
            filter(data => data.length != 0),
            map(data => <DemandInfo>{
              name: DemandsComponent.getDemandName(hdr.subject),
              timestamp: new Date(hdr.timestamp).getTime(),
              issuer_id: hdr.from,
              issuer_name: names.get(hdr.from),
              avatar: this.esi.getCharacterAvatarURI(hdr.from, 64),
              data: data,
              mail_id: hdr.mail_id
            })
          ))
        ))
      ))
      //tap(r => console.log(r))
    );
  }

  ngOnInit() {
    this.demandsReport$ = concat(
      of(<DemandsReport>{ cards: [], markets: [] }),
      this.getReports(Date.UTC(2019, 7, 1)).pipe(
        toArray(),
        map(cards => ({ cards: cards, markets: [] }))
      )
    );
  }

}
