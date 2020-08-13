import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, zip, OperatorFunction, MonoTypeOperatorFunction } from 'rxjs';
import { map, switchMap, toArray, skip, filter, takeWhile, startWith, endWith, tap } from 'rxjs/operators';

import { autoMap, tuple, fromEntries } from 'src/app/utils/utils';

import {
  SDE_Blueprint,
  SDE_BlueprintActivityProp,
  SDE_BlueprintActivityProduct,
  SDE_BlueprintActivityMaterial,
  SDE_BlueprintActivitySkill,
  SDE_BlueprintActivityName,
  SDE_CSV_ActivityName,
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

/** Basic CSV-record.
 *
 * csvRecord datatype represents single MIME Type 'text/csv' [RFC 4180](https://www.ietf.org/rfc/rfc4180.txt) data record, including header.
 * Any first record of a CSV-record stream might be header record.
 *
 * Every CSV file record just an array of string. Empty records are empty arrays. Every empty field is an empty string.
 */
type csvRecord = string[];

/**
 * CSV-record validator function type.
 * @param csvRecord CSV-record to validate
 * @param isHeader CSV-record type
 * @returns validated CSV-record
 * @throws any validation errors
 */
type csvRecordValidator = (rec: csvRecord, isHeader: boolean) => csvRecord;

/**
 * Object builder function type.
 * @template T target object type
 * @param rec source CSV-record
 * @param names fields names for the record (if available)
 * @returns object
 */
type csvObjectBuilder<T> = (rec: csvRecord, names?: string[]) => T;

/**
 * Field names extractor funcion type.
 * @template T object type
 * @param obj object to exctract names
 * @returns field names
 */
type csvHeaderExtractor<T> = (obj: T) => string[];

/**
 * CSV-record extractor function type.
 * @template T object type
 * @param obj object to extract CSV-record data
 * @param names field names array (if available)
 * @returns CSV-record
 */
type csvRecordExtractor<T> = (obj: T, names?: string[]) => csvRecord;

/**
 * CSV formatting output.
 *
 * RxJS operator converts CSV-record stream to MIME Type 'text/csv' [RFC 4180](https://www.ietf.org/rfc/rfc4180.txt) text stream.
 *
 * The operator changes stream type from 'csvRecord' to 'string'.
 *
 * @param opt Options to format output.
 */
function csvStringify(opt?: { eol?: '\r\n' | 'n'; eof?: boolean }): OperatorFunction<csvRecord, string> {
  const eol = opt?.eol || '\r\n';
  const line$: OperatorFunction<csvRecord, string> = map(
    (r, i) =>
      (i ? eol : '') + r.map((field) => (/[,"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field)).join(',')
  );
  return opt?.eof ? (data$: Observable<csvRecord>) => data$.pipe(line$, endWith(eol)) : line$;
}

/**
 * CSV formattion input.
 *
 * RxJS operator converts MIME Type 'text/csv' [RFC 4180](https://www.ietf.org/rfc/rfc4180.txt)  text stream to CSV-record stream.
 *
 * The operator changes stream type from 'string' to 'csvRecord'.
 */
function csvParse(): OperatorFunction<string, csvRecord> {
  return function (csv$: Observable<string>): Observable<csvRecord> {
    return new Observable((observer) => {
      enum S {
        IDLE,
        COMMA,
        CR,
        TEXT,
        ESCAPED,
        CLOSED,
        ERROR,
      }
      const R = new RegExp(/,|"|\n|\r\n|\r|[^,"\r\n]+/y);
      let state: S = S.IDLE;
      let r: csvRecord = [];
      let v = '';
      let rIndex = 1;
      let cIndex = 1;
      let lastToken = '';
      function err(msg: string): void {
        state = S.ERROR;
        observer.error(new SyntaxError(`CSV [${rIndex}, ${cIndex}]: ` + msg));
      }
      function next(): void {
        observer.next(r);
        r = [];
      }
      function fsm(s: string): boolean {
        switch (state) {
          case S.IDLE: // start of a line
          case S.CR: // right after <CR>
            switch (s) {
              case ',':
                r.push('');
                state = S.COMMA;
                break;
              case '"':
                state = S.ESCAPED;
                break;
              case '\r':
              case '\r\n':
                next();
                state = s === '\r' ? S.CR : S.IDLE;
                break;
              case '\n':
                if (state === S.CR) state = S.IDLE;
                else next();
                break;
              case '':
                break;
              default:
                v += s;
                state = S.TEXT;
                break;
            }
            break;
          case S.COMMA: // right after ','
            switch (s) {
              case ',':
                r.push('');
                break;
              case '"':
                state = S.ESCAPED;
                break;
              case '\r':
              case '\r\n':
              case '\n':
              case '':
                r.push('');
                next();
                state = s === '\r' ? S.CR : S.IDLE;
                break;
              default:
                v += s;
                state = S.TEXT;
                break;
            }
            break;
          case S.TEXT: // inside non-escaped text
            switch (s) {
              case ',':
                r.push(v);
                v = '';
                state = S.COMMA;
                break;
              case '"':
                err('Quote in non-escaped data.');
                return false;
              case '\r':
              case '\r\n':
              case '\n':
              case '':
                r.push(v);
                v = '';
                next();
                state = s === '\r' ? S.CR : S.IDLE;
                break;
              default:
                v += s;
                break;
            }
            break;
          case S.ESCAPED: // inside escaped text
            if (s === '"') state = S.CLOSED;
            else if (s === '') {
              err('Closing quote is missing.');
              return false;
            } else v += s;
            break;
          case S.CLOSED: // after '"' inside escaped text
            switch (s) {
              case ',':
                r.push(v);
                v = '';
                state = S.COMMA;
                break;
              case '"':
                v += s;
                state = S.ESCAPED;
                break;
              case '\r':
              case '\r\n':
              case '\n':
              case '':
                r.push(v);
                v = '';
                next();
                state = s === '\r' ? S.CR : S.IDLE;
                break;
              default:
                err('Invalid escape sequence.');
                return false;
            }
            break;
          default:
            return false;
        }
        if (s[0] === '\r' || (s === '\n' && lastToken !== '\r')) {
          rIndex++;
          cIndex = 1;
        } else cIndex += s.length;
        lastToken = s;
        return true;
      }
      return csv$.subscribe({
        next(chunk: string): void {
          if (state === S.ERROR) return;
          let m: string | undefined;
          while ((m = R.exec(chunk)?.[0]) != undefined && fsm(m));
        },
        complete(): void {
          if (state === S.ERROR) return;
          if (fsm('')) observer.complete();
        },
        error(e: unknown): void {
          if (state === S.ERROR) return;
          observer.error(e);
        },
      });
    });
  };
}

/**
 * Removes empty records.
 *
 * RxJS operator removes all empty records from CSV-record stream.
 *
 * The operator doesn't change stream type.
 */
function csvDropEmpty(): MonoTypeOperatorFunction<csvRecord> {
  return filter((r) => !!r.length);
}

/**
 * Removes the header.
 *
 * RxJS operator removes the header form CSV-record stream. It just removes first record form a stream. There is no dedicated tagging
 * for header record so one must be sure the stream has a header before removing it.
 *
 * The operator removes additional 'csvRecord' type from a stream and leaves only the main type T, which might be 'csvRecord'.
 * @template T the main stream type, might be csvRecord or any arbitrary data type
 */
function csvDropHeader<T>(): OperatorFunction<T | csvRecord, T> {
  return skip(1) as OperatorFunction<T | csvRecord, T>;
}

/**
 * Injects a header into a data stream.
 *
 * RxJS operator inserts new record into the stream at first position.
 * Inserted record might be interpreted like a header by other operators if they are instructed to.
 *
 * The operator adds 'csvRecord' type to the main stream type.
 * @template T the main stream type
 * @param header header record value
 */
function csvInjectHeader<T>(header: csvRecord): OperatorFunction<T, T | csvRecord> {
  return startWith(header);
}

function csvValidateRecord(hdr: boolean, validator: csvRecordValidator): MonoTypeOperatorFunction<csvRecord> {
  return map((r, i) => validator(r, hdr && !i));
}

function csvRebuildObject(hdr: false): OperatorFunction<csvRecord, string[]>;
function csvRebuildObject(hdr: true): OperatorFunction<csvRecord, string[] | csvRecord>;
//function csvRebuildObject(hdr: 'drop'): OperatorFunction<csvRecord, string[]>;
function csvRebuildObject<T>(hdr: false, prj: csvObjectBuilder<T>): OperatorFunction<csvRecord, T>;
function csvRebuildObject<T>(hdr: true, prj: csvObjectBuilder<T>): OperatorFunction<csvRecord, T | csvRecord>;
//function csvRebuildObject<T>(hdr: 'drop', prj: csvObjectBuilder<T>): OperatorFunction<csvRecord, T>;
function csvRebuildObject<T>(
  hdr: false | true /*| 'drop'*/,
  prj?: csvObjectBuilder<T>
):
  | OperatorFunction<csvRecord, string[]>
  | OperatorFunction<csvRecord, string[] | csvRecord>
  | OperatorFunction<csvRecord, T>
  | OperatorFunction<csvRecord, T | csvRecord> {
  if (!prj) return /*hdr === 'drop' ? csvDropHeader<T>() :*/ (o) => o;
  if (!hdr) return map((rec) => prj(rec));
  return (data$: Observable<csvRecord>) => {
    return new Observable<csvRecord | T>((observer) => {
      let names: string[] | undefined = undefined;
      return data$
        .pipe(
          map((obj, i) => {
            if (i !== 0) return prj(obj, names);
            names = obj as string[];
            return obj;
          })
          //filter((_, i) => i !== 0 || hdr !== 'drop')
        )
        .subscribe(observer);
    });
  };
}

//function csvExtractRecord(hdr: string[]): OperatorFunction<unknown[], csvRecord>;
function csvExtractRecord(hdr: false): OperatorFunction<unknown[], csvRecord>;
function csvExtractRecord(hdr: true): OperatorFunction<csvRecord | unknown[], csvRecord>;
//function csvExtractRecord<T>(hdr: string[], prj: csvRecordExtractor<T>): OperatorFunction<T, csvRecord>;
function csvExtractRecord<T>(hdr: false, prj: csvRecordExtractor<T>): OperatorFunction<T, csvRecord>;
function csvExtractRecord<T>(hdr: true, prj: csvRecordExtractor<T>): OperatorFunction<csvRecord | T, csvRecord>;
function csvExtractRecord<T>(
  hdr: /*string[] |*/ false | true,
  prj?: csvRecordExtractor<T>
):
  | OperatorFunction<unknown[], csvRecord>
  | OperatorFunction<T, csvRecord>
  | OperatorFunction<csvRecord | unknown[], csvRecord>
  | OperatorFunction<csvRecord | T, csvRecord> {
  const u2s = (obj: unknown[]) => obj.map((v) => String(v ?? ''));
  if (!hdr) return prj ? map<T, csvRecord>((obj) => prj(obj)) : map<unknown[], csvRecord>((obj) => u2s(obj));
  return (data$: Observable<unknown[]> | Observable<T>) =>
    new Observable<csvRecord>((observer) => {
      let names: string[] | undefined = /*Array.isArray(hdr) ? hdr :*/ undefined;
      return (data$ as Observable<unknown>)
        .pipe(
          map((obj, i) => {
            if (i !== 0 /*|| names*/) return prj ? prj(obj as T, names) : u2s(obj as unknown[]);
            names = obj as string[];
            return obj;
          }) as OperatorFunction<unknown, csvRecord>
        )
        .subscribe(observer);
    });
}

function csvRecordsJustifier(opt?: { hdr_length?: number; fill_empty?: true; filler?: string }): csvRecordValidator {
  let hlen = opt?.hdr_length;
  return (rec: csvRecord, isHeader: boolean) => {
    const rlen = rec.length;
    if (isHeader) hlen = rlen;
    else if (hlen && (rlen != 0 || opt?.fill_empty)) {
      if (rlen < hlen) rec = rec.concat(Array(hlen - rlen).fill(opt?.filler ?? ''));
      if (rlen > hlen) rec = rec.slice(0, hlen);
    }
    return rec;
  };
}

function csvObjAssembler(extra?: string): csvObjectBuilder<Record<string, string>> {
  const n = extra || '';
  return (rec: csvRecord, names?: string[]) => {
    const fields = names || [];
    return Object.assign({}, ...rec.map((v, i) => ({ [fields[i] || `${n}#${i}`]: v }))) as Record<string, string>;
  };
}

function csvObjPropsGetter(): csvHeaderExtractor<Record<string, unknown>> {
  return (obj: Record<string, unknown>) => Object.keys(obj).sort((a, b) => a.localeCompare(b));
}

function csvObjValuesGetter(extra?: boolean): csvRecordExtractor<Record<string, unknown>> {
  return (obj: Record<string, unknown>, names?: string[]) => {
    let listed = names || [];
    if (extra) listed = listed.concat(csvObjPropsGetter()(obj).filter((k) => !listed.includes(k)));
    return listed.map((k) => String(obj[k] ?? ''));
  };
}

import Ajv from 'ajv';

class ValidationError extends Error {
  public readonly name = 'ValidationError';
  constructor(public readonly item: unknown, message: string, public readonly e: unknown) {
    super(message);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

function jsonValidate<T>(
  schema: Record<string, unknown>,
  opt?: { coerce?: boolean },
  completeOnError?: boolean | ((e: ValidationError) => (boolean | unknown))
): OperatorFunction<unknown, T> {
  return (data$: Observable<unknown>) =>
    new Observable((observer) => {
      const ajv = new Ajv({ coerceTypes: opt?.coerce });
      const validate = ajv.compile(schema);
      if (validate.$async) throw new TypeError('Unsupported schema.');
      return data$
        .pipe(
          map((item) => {
            if (validate(item) as boolean) return item as T;
            const e = new ValidationError(item, ajv.errorsText(validate.errors), validate.errors);
            const c = typeof completeOnError === 'boolean' ? completeOnError : completeOnError ? completeOnError(e) : e;
            if (typeof c !== 'boolean') throw c; // report error (on non-boolean value) or...
            return c; // ...ignore error...
          }),
          filter((item) => item !== false) as OperatorFunction<boolean | T, true | T>, // ...and continue (on false)
          takeWhile((item) => item !== true) as OperatorFunction<true | T, T> // ...and complete (on true)
        )
        .subscribe(observer);
    });
}

const SDE_BASE = 'assets/sde/';

@Injectable({
  providedIn: 'root',
})
export class SdeService {
  constructor(private http: HttpClient) {}

  private load<T>(name: string, schema: Record<string, unknown>): Observable<T[]> {
    return this.http
      .get(SDE_BASE + name, { headers: { Accept: 'text/csv; header=present' }, responseType: 'text' })
      .pipe(
        csvParse(),
        csvRebuildObject(true, csvObjAssembler()),
        csvDropHeader(),
        jsonValidate<T>(schema, { coerce: true }, false),
        toArray()
      );
  }

  loadTypes(lang?: string): Observable<SDE_Type[]> {
    return this.load<SDE_CSV_Types>('types/types.csv', SDE_CSV_Types_S).pipe(
      map((data) =>
        data.map((d) => ({
          typeID: d.typeID,
          groupID: d.groupID,
          volume: d.volume,
          packaged: d.packaged ?? undefined,
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

  private loadBlueprintsData<
    T extends
      | SDE_CSV_Blueprints_ActivityTime
      | SDE_CSV_Blueprints_ActivityItem
      | SDE_CSV_Blueprints_ActivityProb
      | SDE_CSV_Blueprints_ActivitySkill,
    R
  >(
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
