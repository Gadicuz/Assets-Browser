import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, zip } from 'rxjs';
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

import { JSONSchemaID, AjvDataValidator } from 'jsvrx-ajv';

import { csvParse, csvConvert, csvAssembler, csvDropHeader } from 'csv-rxjs-kit';

const SDE_BASE = 'assets/sde/';

@Injectable({
  providedIn: 'root',
})
export class SdeService {
  private readonly dv: AjvDataValidator;
  constructor(private http: HttpClient) {
    this.dv = new AjvDataValidator({ coerceTypes: true });
    this.dv.addSchemas([
      SDE_CSV_Blueprints_S,
      SDE_CSV_Blueprints_ActivityTime_S,
      SDE_CSV_Blueprints_ActivityItem_S,
      SDE_CSV_Blueprints_ActivityProb_S,
      SDE_CSV_Blueprints_ActivitySkill_S,
      SDE_CSV_Types_S,
      SDE_CSV_Types_Names_S,
    ]);
  }

  private load<T>(name: string, id: JSONSchemaID): Observable<T[]> {
    return this.http
      .get(SDE_BASE + name, { headers: { Accept: 'text/csv; header=present' }, responseType: 'text' })
      .pipe(csvParse(), csvConvert(true, csvAssembler()), csvDropHeader(), this.dv.validator<T>(id), toArray());
  }

  loadTypes(lang?: string): Observable<SDE_Type[]> {
    return this.load<SDE_CSV_Types>('types/types.csv', SDE_CSV_Types_S.$id).pipe(
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
          ? this.load<SDE_CSV_Types_Names>(`types/types-names.${lang}.csv`, SDE_CSV_Types_Names_S.$id).pipe(
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
    return this.load<SDE_CSV_Blueprints>('blueprints/blueprints.csv', SDE_CSV_Blueprints_S.$id).pipe(
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
      id: JSONSchemaID;
      prop: SDE_BlueprintActivityProp;
      valfn: (_: T) => R;
    }
  ): Observable<Map<number, Map<number, R[]>>> {
    if (!ids.length || !act.length || !props.includes(opt.prop)) return of(new Map<number, Map<number, R[]>>());
    return this.load<T>(opt.fname, opt.id).pipe(
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
      id: SDE_CSV_Blueprints_ActivityItem_S.$id,
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
              SDE_CSV_Blueprints_ActivityProb_S.$id
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
      id: SDE_CSV_Blueprints_ActivityItem_S.$id,
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
      id: SDE_CSV_Blueprints_ActivitySkill_S.$id,
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
      id: SDE_CSV_Blueprints_ActivityTime_S.$id,
      prop: 'time',
      valfn: (d) => d.time,
    });
  }
}
