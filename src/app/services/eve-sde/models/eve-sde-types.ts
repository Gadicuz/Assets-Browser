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
  packaged?: number;
};
export const SDE_CSV_Types_S = {
  type: 'object',
  properties: {
    typeID: { type: 'integer' },
    groupID: { type: 'integer' },
    volume: { type: 'number' },
    packaged: { type: 'number' },
  },
  additionalProperties: false,
  required: ['typeID', 'groupID', 'volume'],
};

export type SDE_CSV_Types_Names = {
  typeID: number;
  name: string;
};
export const SDE_CSV_Types_Names_S = {
  type: 'object',
  properties: {
    typeID: { type: 'integer' },
    name: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
  required: ['typeID', 'name'],
};
