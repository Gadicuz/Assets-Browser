import { JWT } from 'ez-jwt';

export type AccessTokenV1 = string;

export type AccessTokenV2 = string;
export interface AccessTokenV2Payload extends JWT {
  azp: string; // "my3rdpartyclientid"
  name: string; // "Some Bloke"
  owner: string; // "8PmzCeTKb4VFUDrHLc/AeZXDSWM="
  scp: string[]; // [ "esi-skills.read_skills.v1", "esi-skills.read_skillqueue.v1" ]
}
