export type AccessTokenV1 = string;

export type AccessTokenV2 = string;
export interface AccessTokenV2Payload {
  kid: string; // "JWT-Signature-Key"
  jti: string; // "998e12c7-3241-43c5-8355-2c48822e0a1b"
  sub: string; // "CHARACTER:EVE:123123"
  iss: string; // "login.eveonline.com"
  exp: number; // 1534412504
  azp: string; // "my3rdpartyclientid"
  name: string; // "Some Bloke"
  owner: string; // "8PmzCeTKb4VFUDrHLc/AeZXDSWM="
  scp: string[]; // [ "esi-skills.read_skills.v1", "esi-skills.read_skillqueue.v1" ]
}
