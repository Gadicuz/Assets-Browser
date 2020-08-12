export type SDE_BlueprintActivityName =
  | 'copying'
  | 'invention'
  | 'manufacturing'
  | 'research_material'
  | 'research_time'
  | 'reaction';

export type SDE_BlueprintActivityProp = 'materials' | 'products' | 'probabilities' | 'skills' | 'time';

export type SDE_BlueprintActivityMaterial = { typeID: number; quantity: number };
export type SDE_BlueprintActivityProduct = { typeID: number; quantity: number; probability?: number };
export type SDE_BlueprintActivitySkill = { typeID: number; level: number };

export type SDE_BlueprintActivityData = {
  materials?: SDE_BlueprintActivityMaterial[];
  products?: SDE_BlueprintActivityProduct[];
  skills?: SDE_BlueprintActivitySkill[];
  time?: number;
};

export type SDE_BlueprintActivities = {
  [K in SDE_BlueprintActivityName]?: SDE_BlueprintActivityData;
};

export type SDE_Blueprint = {
  blueprintTypeID: number;
  activities: SDE_BlueprintActivities;
  maxProductionLimit?: number;
};

type SDE_CSV_Blueprints_ID = {
  blueprintTypeID: number;
};

// 'blueprints.csv'
export type SDE_CSV_Blueprints = SDE_CSV_Blueprints_ID & {
  maxProductionLimit: number;
};
export const SDE_CSV_Blueprints_S = {
  type: 'object',
  properties: {
    blueprintTypeID: { type: 'integer' },
    maxProductionLimit: { type: 'integer' },
  },
  additionalProperties: false,
  required: ['blueprintTypeID', 'maxProductionLimit'],
};

export const SDE_CSV_ActivityName: SDE_BlueprintActivityName[] = [
  'manufacturing',
  'copying',
  'research_material',
  'research_time',
  'invention',
  'reaction',
];

export type SDE_CSV_Blueprints_ActivityID = SDE_CSV_Blueprints_ID & {
  activity: number;
};

// 'blueprints-activities.csv'
export type SDE_CSV_Blueprints_ActivityTime = SDE_CSV_Blueprints_ActivityID & {
  time: number;
};
export const SDE_CSV_Blueprints_ActivityTime_S = {
  type: 'object',
  properties: {
    blueprintTypeID: { type: 'integer' },
    activity: { type: 'integer', minimum: 0, maximum: 5 },
    time: { type: 'integer' },
  },
  additionalProperties: false,
  required: ['blueprintTypeID', 'activity', 'time'],
};

export type SDE_CSV_Blueprints_ActivityType = SDE_CSV_Blueprints_ActivityID & {
  typeID: number;
};

// 'blueprints-materials.csv','blueprints-products.csv'
export type SDE_CSV_Blueprints_ActivityItem = SDE_CSV_Blueprints_ActivityType & {
  quantity: number;
};
export const SDE_CSV_Blueprints_ActivityItem_S = {
  type: 'object',
  properties: {
    blueprintTypeID: { type: 'integer' },
    activity: { type: 'integer', minimum: 0, maximum: 5 },
    typeID: { type: 'integer' },
    quantity: { type: 'integer' },
  },
  additionalProperties: false,
  required: ['blueprintTypeID', 'activity', 'typeID', 'quantity'],
};

// 'blueprints-probabilities.csv'
export type SDE_CSV_Blueprints_ActivityProb = SDE_CSV_Blueprints_ActivityType & {
  probability: number;
};
export const SDE_CSV_Blueprints_ActivityProb_S = {
  type: 'object',
  properties: {
    blueprintTypeID: { type: 'integer' },
    activity: { type: 'integer', minimum: 0, maximum: 5 },
    typeID: { type: 'integer' },
    probability: { type: 'number' },
  },
  additionalProperties: false,
  required: ['blueprintTypeID', 'activity', 'typeID', 'probability'],
};

// 'blueprints-skills.csv'
export type SDE_CSV_Blueprints_ActivitySkill = SDE_CSV_Blueprints_ActivityType & {
  level: number;
};
export const SDE_CSV_Blueprints_ActivitySkill_S = {
  type: 'object',
  properties: {
    blueprintTypeID: { type: 'integer' },
    activity: { type: 'integer', minimum: 0, maximum: 5 },
    typeID: { type: 'integer' },
    level: { type: 'integer' },
  },
  additionalProperties: false,
  required: ['blueprintTypeID', 'activity', 'typeID', 'level'],
};
