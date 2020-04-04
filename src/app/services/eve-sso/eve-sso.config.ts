import { InjectionToken } from '@angular/core';

export interface EVESSOConfig {
  client_id: string;
  client_secret?: string;
  scopes: string[];
}
export const EVESSO_CONFIG = new InjectionToken<EVESSOConfig>('eve-sso.config');
