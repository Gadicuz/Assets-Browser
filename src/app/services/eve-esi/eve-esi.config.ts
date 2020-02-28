import { InjectionToken } from '@angular/core';

export interface EVEESIConfig {
  url: string;
  ver: string;
  datasource?: string;
}
export const EVEESI_CONFIG = new InjectionToken<EVEESIConfig>('eve-esi.config');
