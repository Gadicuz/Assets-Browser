import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, zip, OperatorFunction } from 'rxjs';
import { map, switchMap, toArray } from 'rxjs/operators';

import { autoMap, tuple, fromEntries } from 'src/app/utils/utils';

import {
  SDE_Blueprint,
  SDE_BlueprintActivityProp,
  SDE_BlueprintActivityProduct,
  SDE_BlueprintActivityMaterial,
  SDE_BlueprintActivitySkill,
  SDE_BlueprintActivityName,
  SDE_CSV_ActivityName,
  SDE_CSV_Blueprints_ActivityID,
  SDE_CSV_Blueprints,
  SDE_CSV_Blueprints_S,
  SDE_CSV_Blueprints_ActivityTime,
  SDE_CSV_Blueprints_ActivityTime_S,
  SDE_CSV_Blueprints_ActivityItem,
  SDE_CSV_Blueprints_ActivityItem_S,
  SDE_CSV_Blueprints_ActivityProb,
  SDE_CSV_Blueprints_ActivityProb_S,
  SDE_CSV_Blueprints_ActivitySkill,
  SDE_CSV_Blueprints_ActivitySkill_S,
} from './models/eve-sde-blueprints';

import {
  SDE_Type,
  SDE_CSV_Types,
  SDE_CSV_Types_S,
  SDE_CSV_Types_Names,
  SDE_CSV_Types_Names_S,
} from './models/eve-sde-types';

class CsvParserError extends Error {
  public readonly name = 'CsvParserError';
  constructor(message: string, public readonly position: number) {
    super(message);
    Object.setPrototypeOf(this, CsvParserError.prototype);
  }
}

type CsvType = string | undefined;
function parse(header?: false): OperatorFunction<string, CsvType[]>;
function parse(header: true): OperatorFunction<string, Record<string, CsvType>>;
function parse<T>(header: false, cnv: (values: CsvType[]) => T): OperatorFunction<string, T>;
function parse<T>(header: true, cnv: (values: CsvType[], names: string[]) => T): OperatorFunction<string, T>;
function parse<T>(
  header?: boolean,
  cnv?: ((values: CsvType[]) => T) | ((values: CsvType[], names: string[]) => T)
): OperatorFunction<string, CsvType[] | Record<string, CsvType> | T> {
  return function (csv: Observable<string>): Observable<CsvType[] | Record<string, CsvType> | T> {
    return new Observable((subscriber) => {
      const r = new RegExp(/"|,|\r\n|\n|\r|[^",\r\n]+/y);
      let pos = 0;
      let state: 'IDLE' | 'PLAIN' | 'QUOTED' | 'CLOSED' | 'ERROR' = 'IDLE';
      let value = '';
      let headers: string[] | undefined = undefined;
      let row: string[] = [];
      function err(msg: string): void {
        state = 'ERROR';
        subscriber.error(new CsvParserError(msg, pos));
      }
      function commit(eor = true): void {
        if (eor && !row.length && value === '') return; // empty row
        row.push(value);
        value = '';
        if (!eor) return;
        if (header && !headers) {
          if (row.indexOf('') >= 0) {
            err('empty header detected');
            return;
          }
          headers = [...row];
        } else {
          const values = row.map((v) => (v !== '' ? v : undefined));
          let data: T | Record<string, CsvType> | CsvType[];
          if (cnv) {
            try {
              data = headers
                ? (cnv as (values: CsvType[], names: string[]) => T)(values, headers)
                : (cnv as (values: CsvType[]) => T)(values);
            } catch (e) {
              err(`conversion failed: ${String(e)}`);
              return;
            }
          } else {
            data = headers
              ? (Object.assign({}, ...headers.map((h, i) => ({ [h]: values[i] }))) as Record<string, CsvType>)
              : values;
          }
          subscriber.next(data);
        }
        row = [];
      }
      const unsub = csv.subscribe({
        next(chunk: string): void {
          if (state === 'ERROR') return;
          let m: string | undefined;
          while ((m = r.exec(chunk)?.[0]) != undefined) {
            switch (state) {
              case 'IDLE':
              case 'PLAIN':
                switch (true) {
                  case '"' === m:
                    if (state === 'PLAIN') {
                      err('quote in plain record');
                      return;
                    }
                    state = 'QUOTED';
                    break;
                  case ',' === m:
                  case '\r\n'.includes(m[0]):
                    state = 'IDLE';
                    commit(m != ',');
                    break;
                  default:
                    state = 'PLAIN';
                    value += m;
                }
                break;
              case 'QUOTED':
                if ('"' === m) {
                  state = 'CLOSED';
                } else {
                  state = 'QUOTED';
                  value += m;
                }
                break;
              case 'CLOSED':
                switch (true) {
                  case '"' === m:
                    state = 'QUOTED';
                    value += '"';
                    break;
                  case ',' === m:
                  case '\r\n'.includes(m[0]):
                    state = 'IDLE';
                    commit(m != ',');
                    break;
                  default:
                    err('text after closing quote');
                    return;
                }
                break;
            }
            pos += m.length;
          }
        },
        complete(): void {
          switch (state) {
            case 'IDLE':
            case 'PLAIN':
            case 'CLOSED':
              if (row.length || value !== '') commit();
              subscriber.complete();
              break;
            case 'QUOTED':
              err('missed closing quote');
              break;
            case 'ERROR':
              break;
          }
        },
        error(err: unknown): void {
          subscriber.error(err);
        },
      });

      return () => {
        unsub.unsubscribe();
      };
    });
  };
}

import Ajv from 'ajv';

function validate<T>(schema: Record<string, unknown>, coerce: true): OperatorFunction<unknown, T>;
function validate<T>(schema: Record<string, unknown>, coerce: false): OperatorFunction<T, T>;
function validate<T>(schema: Record<string, unknown>, coerce = false): OperatorFunction<unknown | T, T> {
  return function (data: Observable<unknown | T>): Observable<T> {
    return new Observable((subscriber) => {
      const ajv = new Ajv({ coerceTypes: coerce ? 'array' : false });
      const validate = ajv.compile(schema);
      if (validate.$async) throw new Error('unsupported schema');
      const unsub = data.subscribe({
        next(item: unknown | T): void {
          const r = validate(item) as boolean;
          if (!r) subscriber.error(new Error(ajv.errorsText()));
          else subscriber.next(item as T);
        },
        complete(): void {
          subscriber.complete();
        },
        error(err: unknown): void {
          subscriber.error(err);
        },
      });

      return () => {
        unsub.unsubscribe();
      };
    });
  };
}

const SDE_BASE = 'assets/sde/';

@Injectable({
  providedIn: 'root',
})
export class SdeService {
  constructor(private http: HttpClient) {}

  private load<T>(name: string, schema: Record<string, unknown>): Observable<T[]> {
    /*
    function cnvNumUndef(val: string | undefined): string | number | undefined {
      if (val == undefined) return undefined;
      const v = val.trim();
      if (v === '') return undefined;
      return /^[-+]?[0-9]*\.?[0-9]+$/.test(v) ? (v.includes('.') ? parseFloat(v) : parseInt(v)) : val;
    }
    function cnv<T>(values: string[], names: string[]): T {
      return fromEntries(names.map((n, i) => [n, cnvNumUndef(values[i])])) as T;
    }
    */
    return this.http
      .get(SDE_BASE + name, { headers: { Accept: 'text/csv; header=present' }, responseType: 'text' })
      .pipe(parse(true), validate<T>(schema, true), toArray());
  }

  loadTypes(lang?: string): Observable<SDE_Type[]> {
    return this.load<SDE_CSV_Types>('types/types.csv', SDE_CSV_Types_S).pipe(
      map((data) =>
        data.map((d) => ({
          ...d,
          name: '',
        }))
      ),
      switchMap((types) =>
        lang
          ? this.load<SDE_CSV_Types_Names>(`types/types-names.${lang}.csv`, SDE_CSV_Types_Names_S).pipe(
              map((names) => {
                names.forEach((n) => {
                  const t = types.find((t) => t.typeID === n.typeID);
                  if (t) t.name = n.name;
                });
                return types;
              })
            )
          : of(types)
      )
    );
  }

  loadBlueprintIDs(): Observable<number[]> {
    return this.load<SDE_CSV_Blueprints>('blueprints/blueprints.csv', SDE_CSV_Blueprints_S).pipe(
      map((data) => data.map((d) => d.blueprintTypeID))
    );
  }

  loadBlueprints(
    blueprintTypeIDs: number[],
    opt: { activities?: SDE_BlueprintActivityName[]; properties?: SDE_BlueprintActivityProp[] } = {}
  ): Observable<SDE_Blueprint[]> {
    if (!blueprintTypeIDs.length) return of([]);
    const act = opt.activities?.map((a) => SDE_CSV_ActivityName.indexOf(a)) || [];
    const prop = opt.properties || [];

    function correctTime(t: number[] | undefined): number | undefined {
      if (t?.length === 1) return t[0];
      return undefined;
    }

    return zip(
      this.loadBlueprintsProducts(blueprintTypeIDs, act, prop),
      this.loadBlueprintsMaterials(blueprintTypeIDs, act, prop),
      this.loadBlueprintsSkills(blueprintTypeIDs, act, prop),
      this.loadBlueprintsTime(blueprintTypeIDs, act, prop),
      (p, m, s, t) => {
        return blueprintTypeIDs.map((blueprintTypeID) => ({
          blueprintTypeID,
          activities: fromEntries(
            act
              .map(
                (a) =>
                  [
                    a,
                    [
                      tuple('products', p.get(blueprintTypeID)?.get(a)),
                      tuple('materials', m.get(blueprintTypeID)?.get(a)),
                      tuple('skills', s.get(blueprintTypeID)?.get(a)),
                      tuple('time', correctTime(t.get(blueprintTypeID)?.get(a))),
                    ].filter(([, v]) => v != undefined),
                  ] as [number, [string, unknown][]] // [ activity index, (activity data properties array) ]
              )
              .filter(([, d]) => d.length) // remove activities with empty data
              .map(([a, d]) => [SDE_CSV_ActivityName[a], fromEntries(d)]) // lookup activity name and assemble data object
          ),
        }));
      }
    );
  }

  private reassembleData<T>(data: { id: number; act: number; data: T }[]): Map<number, Map<number, T[]>> {
    return new Map(
      Array.from(
        data
          .reduce(
            autoMap((d) => d.id),
            new Map<number, { id: number; act: number; data: T }[]>()
          )
          .entries(),
        ([id, data]) => [
          id,
          new Map(
            Array.from(
              data
                .reduce(
                  autoMap((d) => d.act),
                  new Map<number, { id: number; act: number; data: T }[]>()
                )
                .entries(),
              ([act, data]) => [act, data.map((d) => d.data)]
            )
          ),
        ]
      )
    );
  }

  private loadBlueprintsData<T extends SDE_CSV_Blueprints_ActivityID, R>(
    ids: number[],
    act: number[],
    props: SDE_BlueprintActivityProp[],
    opt: {
      fname: string;
      schema: Record<string, unknown>;
      prop: SDE_BlueprintActivityProp;
      valfn: (_: T) => R;
    }
  ): Observable<Map<number, Map<number, R[]>>> {
    if (!ids.length || !act.length || !props.includes(opt.prop)) return of(new Map<number, Map<number, R[]>>());
    return this.load<T>(opt.fname, opt.schema).pipe(
      map((data) =>
        this.reassembleData(
          data
            .filter((d) => ids.includes(d.blueprintTypeID) && act.includes(d.activity))
            .map((d) => ({
              id: d.blueprintTypeID,
              act: d.activity,
              data: opt.valfn(d),
            }))
        )
      )
    );
  }

  private loadBlueprintsProducts(
    ids: number[],
    act: number[],
    props: SDE_BlueprintActivityProp[]
  ): Observable<Map<number, Map<number, SDE_BlueprintActivityProduct[]>>> {
    return this.loadBlueprintsData<SDE_CSV_Blueprints_ActivityItem, SDE_BlueprintActivityProduct>(ids, act, props, {
      fname: 'blueprints/blueprints-products.csv',
      schema: SDE_CSV_Blueprints_ActivityItem_S,
      prop: 'products',
      valfn: (d) => ({
        typeID: d.typeID,
        quantity: d.quantity,
      }),
    }).pipe(
      switchMap((data) =>
        !props.includes('probabilities')
          ? of(data)
          : this.load<SDE_CSV_Blueprints_ActivityProb>(
              'blueprints/blueprints-probabilities.csv',
              SDE_CSV_Blueprints_ActivityProb_S
            ).pipe(
              map((prob) => {
                prob.forEach((p) => {
                  const d = data
                    .get(p.blueprintTypeID)
                    ?.get(p.activity)
                    ?.find((d) => d.typeID === p.typeID);
                  if (d) d.probability = p.probability;
                });
                return data;
              })
            )
      )
    );
  }

  private loadBlueprintsMaterials(
    ids: number[],
    act: number[],
    props: SDE_BlueprintActivityProp[]
  ): Observable<Map<number, Map<number, SDE_BlueprintActivityMaterial[]>>> {
    return this.loadBlueprintsData<SDE_CSV_Blueprints_ActivityItem, SDE_BlueprintActivityMaterial>(ids, act, props, {
      fname: 'blueprints/blueprints-materials.csv',
      schema: SDE_CSV_Blueprints_ActivityItem_S,
      prop: 'materials',
      valfn: (d) => ({
        typeID: d.typeID,
        quantity: d.quantity,
      }),
    });
  }

  private loadBlueprintsSkills(
    ids: number[],
    act: number[],
    props: SDE_BlueprintActivityProp[]
  ): Observable<Map<number, Map<number, SDE_BlueprintActivitySkill[]>>> {
    return this.loadBlueprintsData<SDE_CSV_Blueprints_ActivitySkill, SDE_BlueprintActivitySkill>(ids, act, props, {
      fname: 'blueprints/blueprints-skills.csv',
      schema: SDE_CSV_Blueprints_ActivitySkill_S,
      prop: 'skills',
      valfn: (d) => ({
        typeID: d.typeID,
        level: d.level,
      }),
    });
  }

  private loadBlueprintsTime(
    ids: number[],
    act: number[],
    props: SDE_BlueprintActivityProp[]
  ): Observable<Map<number, Map<number, number[]>>> {
    return this.loadBlueprintsData<SDE_CSV_Blueprints_ActivityTime, number>(ids, act, props, {
      fname: 'blueprints/blueprints-activities.csv',
      schema: SDE_CSV_Blueprints_ActivityTime_S,
      prop: 'time',
      valfn: (d) => d.time,
    });
  }
}
