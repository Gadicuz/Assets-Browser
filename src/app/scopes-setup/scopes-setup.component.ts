import { Component, OnInit, InjectionToken, Inject } from '@angular/core';

export interface FeatureScopes {
  name: string;
  scopes?: string;
  char_scopes?: string;
  corp_scopes?: string;
  corp_roles?: string;
}
export type ComponentScopes = FeatureScopes[];
export const FEATURE_SCOPES = new InjectionToken<ComponentScopes>('feature-scopes');

@Component({
  selector: 'scopes-setup',
  templateUrl: './scopes-setup.component.html',
  styleUrls: ['./scopes-setup.component.css'],
})
export class ScopesSetupComponent implements OnInit {
  constructor(@Inject(FEATURE_SCOPES) public features: ComponentScopes[]) {}

  ngOnInit(): void {}
}
