import { JSONSchema7 } from 'json-schema';

type JSONSchema7$id = JSONSchema7 & { $id: string };

export type SDE_Type = {
  typeID: number;
  groupID: number;
  name: string;
  volume: number;
  packaged?: number;
};

export type SDE_CSV_Types = {
  typeID: number;
  groupID: number;
  volume: number;
  packaged: number | null;
};
export const SDE_CSV_Types_S: JSONSchema7$id = {
  $id: 'sde:types/types.csv',
  type: 'object',
  properties: {
    typeID: { type: 'integer' },
    groupID: { type: 'integer' },
    volume: { type: 'number' },
    packaged: { type: ['number', 'null'] },
  },
  additionalProperties: false,
  required: ['typeID', 'groupID', 'volume'],
};

export type SDE_CSV_Types_Names = {
  typeID: number;
  name: string;
};
export const SDE_CSV_Types_Names_S: JSONSchema7$id = {
  $id: 'sde:types/types-names.csv',
  type: 'object',
  properties: {
    typeID: { type: 'integer' },
    name: { type: 'string' },
  },
  additionalProperties: false,
  required: ['typeID', 'name'],
};
