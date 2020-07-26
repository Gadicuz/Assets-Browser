import { Component, OnInit, InjectionToken, Inject } from '@angular/core';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';

export interface FeatureScopes {
  name: string;
  scopes?: string;
  char_scopes?: string;
  corp_scopes?: string;
  corp_roles?: string;
}
export type ComponentScopes = FeatureScopes[];
export const FEATURE_SCOPES = new InjectionToken<ComponentScopes>('feature-scopes');

export function getScopes(): string {
  return '';
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

  constructor(fb: FormBuilder, @Inject(FEATURE_SCOPES) public toolsSetup: ComponentScopes[]) {
    const fts = toolsSetup.reduce((f, ts) => f.concat(ts), []);
    this.setupForm = fb.group({
      features: fb.array(
        fts.map((t) =>
          fb.group({
            name: [t.name],
            char: [false],
            corp: [false],
          })
        )
      ),
    });
    this.dataSource = (this.setupForm.get('features') as FormArray).controls as FormGroup[];
  }

  onSubmit(): void {}
}
