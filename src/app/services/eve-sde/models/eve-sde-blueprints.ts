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

export type SDE_CSV_Blueprints_ActivityType = SDE_CSV_Blueprints_ActivityID & {
  typeID: number;
};

// 'blueprints-materials.csv','blueprints-products.csv'
export type SDE_CSV_Blueprints_ActivityItem = SDE_CSV_Blueprints_ActivityType & {
  quantity: number;
};

// 'blueprints-probabilities.csv'
export type SDE_CSV_Blueprints_ActivityProb = SDE_CSV_Blueprints_ActivityType & {
  probability: number;
};

// 'blueprints-skills.csv'
export type SDE_CSV_Blueprints_ActivitySkill = SDE_CSV_Blueprints_ActivityType & {
  level: number;
};
