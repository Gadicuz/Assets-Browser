import { Component, InjectionToken, Inject } from '@angular/core';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';
import { set } from '../utils/utils';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { MatDialogRef } from '@angular/material/dialog';

export interface FeatureScopes {
  name: string;
  scopes?: string;
  char_scopes?: string;
  corp_scopes?: string;
  corp_role?: string;
}
export type ToolScopes = FeatureScopes[];
export const TOOL_SCOPES = new InjectionToken<ToolScopes>('tool-scopes');

interface toolItem {
  head: boolean;
  id: string;
  name: string;
  char_scopes: string[];
  corp_scopes: string[];
  role: string;
}

interface setupItem {
  id: string;
  value: number;
}

const SCOPES_SETUP_KEY = 'scopes-setup';

function loadSetup(): setupItem[] {
  const setup = localStorage.getItem(SCOPES_SETUP_KEY);
  if (!setup) return [];
  return JSON.parse(setup) as setupItem[];
}

function storeSetup(setup: setupItem[]): void {
  localStorage.setItem(SCOPES_SETUP_KEY, JSON.stringify(setup));
}

function sc(s?: string): string[] {
  return s ? s.split(' ') : [];
}

function processToolsScopes(tools: ToolScopes[]): toolItem[] {
  return tools
    .map((tool) =>
      tool.map((f, i, fs) => {
        const scopes = sc(f.scopes);
        return {
          head: !i,
          id: !i ? f.name : [fs[0].name, f.name].join('.'),
          name: f.name,
          char_scopes: scopes.concat(sc(f.char_scopes)),
          corp_scopes: scopes.concat(sc(f.corp_scopes)),
          role: f.corp_role || '',
        };
      })
    )
    .reduce((a, x) => a.concat(x), []);
}

function getValues(tools: toolItem[], setup: setupItem[]): { scopes: string[]; roles: string[] } {
  const res = tools
    .map((item) => ({ item, val: setup.find((s) => s.id === item.id)?.value || 0 }))
    .map((x) => ({
      char_scopes: x.val & 1 ? x.item.char_scopes : [],
      corp_scopes: x.val & 2 ? x.item.corp_scopes : [],
      roles: x.val & 2 ? [x.item.role] : [],
    }))
    .map((x) => ({
      scopes: [...x.char_scopes, ...x.corp_scopes],
      roles: x.roles,
    }))
    .reduce((v, x) => ({ scopes: v.scopes.concat(x.scopes), roles: v.roles.concat(x.roles) }), {
      scopes: [],
      roles: [],
    });
  return {
    scopes: [...set(res.scopes)].sort((a, b) => a.localeCompare(b)),
    roles: [...set(res.roles)].sort((a, b) => a.localeCompare(b)),
  };
}

export function getScopes(tools: ToolScopes[]): string {
  return getValues(processToolsScopes(tools), loadSetup()).scopes.join(' ');
}

@Component({
  selector: 'scopes-setup',
  templateUrl: './scopes-setup.component.html',
  styleUrls: ['./scopes-setup.component.css'],
})
export class ScopesSetupComponent {
  public setupForm: FormGroup;
  public readonly displayedColumns = ['name', 'char', 'corp'];
  public dataSource: FormGroup[];

  public setup = [] as setupItem[];
  public value$: Observable<unknown>;

  private feats: toolItem[];

  constructor(
    fb: FormBuilder,
    @Inject(TOOL_SCOPES) public toolsSetup: ToolScopes[],
    private dialogRef: MatDialogRef<ScopesSetupComponent>
  ) {
    this.feats = processToolsScopes(toolsSetup);
    this.setupForm = fb.group({
      features: fb.array(
        this.feats.map((f) =>
          fb.group({
            id: f.id,
            head: f.head,
            name: [f.name],
            char: [false],
            corp: [false],
          })
        )
      ),
    });
    this.dataSource = (this.setupForm.get('features') as FormArray).controls as FormGroup[];
    this.applySetup(loadSetup());
    this.value$ = this.setupForm.valueChanges.pipe(
      startWith(undefined),
      map(() => getValues(this.feats, this.extractSetup()))
    );
  }

  private applySetup(setup: setupItem[]): void {
    setup.forEach((s) => {
      const feat = this.dataSource.find((c) => c.get('id')?.value === s.id);
      if (feat) {
        feat.patchValue({
          char: !!(s.value & 1),
          corp: !!(s.value & 2),
        });
      }
    });
  }

  private extractSetup(): setupItem[] {
    return this.dataSource
      .map((c) => ({
        id: (c.get('id')?.value as string) || '',
        value: (c.get('char')?.value ? 1 : 0) + (c.get('corp')?.value ? 2 : 0),
      }))
      .filter((i) => i.id && i.value);
  }

  save(): void {
    storeSetup(this.extractSetup());
    this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
