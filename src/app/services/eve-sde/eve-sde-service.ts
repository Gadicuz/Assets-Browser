import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, zip } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { autoMap, san, tuple, fromEntries } from 'src/app/utils/utils';

import {
  SDE_Blueprint,
  SDE_CSV_ActivityName,
  SDE_CSV_Blueprints_ActivityItem,
  SDE_BlueprintActivityProp,
  SDE_BlueprintActivities,
  SDE_BlueprintActivityProduct,
  SDE_BlueprintActivityMaterial,
  SDE_BlueprintActivitySkill,
  SDE_BlueprintActivityName,
  SDE_CSV_Blueprints_ActivityProb,
  SDE_CSV_Blueprints,
  SDE_CSV_Blueprints_ActivityID,
  SDE_CSV_Blueprints_ActivitySkill,
  SDE_CSV_Blueprints_ActivityTime,
} from './models/eve-sde-blueprints';

import { SDE_Type, SDE_CSV_Types, SDE_CSV_Types_Names } from './models/eve-sde-types';

import * as CSV from '@vanillaes/csv';
type CsvItemType = number | string;
function convert(value: string): CsvItemType {
  return /^[-+]?[0-9]*\.?[0-9]+$/.test(value) ? (value.includes('.') ? parseFloat(value) : parseInt(value)) : value;
}
function parse<T>(csv_data: string): Observable<T[]> {
  const data = CSV.parse(csv_data) as string[][];
  const result =
    data.length <= 1
      ? []
      : data
          .slice(1)
          .map((row) => fromEntries(row.map((v, i) => tuple(data[0][i], convert(v))).filter(([, v]) => v !== '')) as T);
  return of(result);
}

const SDE_BASE = 'assets/sde/';

@Injectable({
  providedIn: 'root',
})
export class SdeService {
  constructor(private http: HttpClient) {}

  private load<T>(name: string): Observable<T[]> {
    return this.http
      .get(SDE_BASE + name, { headers: { Accept: 'text/csv; header=present' }, responseType: 'text' })
      .pipe(switchMap((csv_data) => parse<T>(csv_data)));
  }

  loadTypes(lang?: string): Observable<SDE_Type[]> {
    return this.load<SDE_CSV_Types>('types/types.csv').pipe(
      map((data) =>
        data.map((d) => ({
          ...d,
          name: '',
        }))
      ),
      switchMap((types) =>
        lang
          ? this.load<SDE_CSV_Types_Names>(`types/types-names.${lang}.csv`).pipe(
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
    return this.load<SDE_CSV_Blueprints>('blueprints/blueprints.csv').pipe(
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
        return blueprintTypeIDs.map((blueprintTypeID) => {
          const activities = act.reduce((v, a) => {
            const products = p.get(blueprintTypeID)?.get(a);
            const materials = m.get(blueprintTypeID)?.get(a);
            const skills = s.get(blueprintTypeID)?.get(a);
            const time = correctTime(t.get(blueprintTypeID)?.get(a));
            if (products || materials || skills || time) {
              v[SDE_CSV_ActivityName[a]] = san({
                products,
                materials,
                skills,
                time,
              });
            }
            return v;
          }, {} as SDE_BlueprintActivities);
          return {
            blueprintTypeID,
            activities,
          };
        });
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
      prop: SDE_BlueprintActivityProp;
      valfn: (_: T) => R;
    }
  ): Observable<Map<number, Map<number, R[]>>> {
    if (!ids.length || !act.length || !props.includes(opt.prop)) return of(new Map<number, Map<number, R[]>>());
    return this.load<T>(opt.fname).pipe(
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
      prop: 'products',
      valfn: (d) => ({
        typeID: d.typeID,
        quantity: d.quantity,
      }),
    }).pipe(
      switchMap((data) =>
        !props.includes('probabilities')
          ? of(data)
          : this.load<SDE_CSV_Blueprints_ActivityProb>('blueprints/blueprints-probabilities.csv').pipe(
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
      prop: 'time',
      valfn: (d) => d.time,
    });
  }
}
