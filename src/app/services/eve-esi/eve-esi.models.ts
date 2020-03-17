export type EsiLocationFlag =
  | 'AssetSafety'
  | 'AutoFit'
  | 'BoosterBay'
  | 'Cargo'
  | 'CorpseBay'
  | 'Deliveries'
  | 'DroneBay'
  | 'FighterBay'
  | 'FighterTube0'
  | 'FighterTube1'
  | 'FighterTube2'
  | 'FighterTube3'
  | 'FighterTube4'
  | 'FleetHangar'
  | 'Hangar'
  | 'HangarAll'
  | 'HiSlot0'
  | 'HiSlot1'
  | 'HiSlot2'
  | 'HiSlot3'
  | 'HiSlot4'
  | 'HiSlot5'
  | 'HiSlot6'
  | 'HiSlot7'
  | 'HiddenModifiers'
  | 'Implant'
  | 'LoSlot0'
  | 'LoSlot1'
  | 'LoSlot2'
  | 'LoSlot3'
  | 'LoSlot4'
  | 'LoSlot5'
  | 'LoSlot6'
  | 'LoSlot7'
  | 'Locked'
  | 'MedSlot0'
  | 'MedSlot1'
  | 'MedSlot2'
  | 'MedSlot3'
  | 'MedSlot4'
  | 'MedSlot5'
  | 'MedSlot6'
  | 'MedSlot7'
  | 'Module'
  | 'ServiceModule' // non-standard flag for blueprints being used
  | 'QuafeBay'
  | 'RigSlot0'
  | 'RigSlot1'
  | 'RigSlot2'
  | 'RigSlot3'
  | 'RigSlot4'
  | 'RigSlot5'
  | 'RigSlot6'
  | 'RigSlot7'
  | 'ShipHangar'
  | 'Skill'
  | 'SpecializedAmmoHold'
  | 'SpecializedCommandCenterHold'
  | 'SpecializedFuelBay'
  | 'SpecializedGasHold'
  | 'SpecializedIndustrialShipHold'
  | 'SpecializedLargeShipHold'
  | 'SpecializedMaterialBay'
  | 'SpecializedMediumShipHold'
  | 'SpecializedMineralHold'
  | 'SpecializedOreHold'
  | 'SpecializedPlanetaryCommoditiesHold'
  | 'SpecializedSalvageHold'
  | 'SpecializedShipHold'
  | 'SpecializedSmallShipHold'
  | 'SubSystemBay'
  | 'SubSystemSlot0'
  | 'SubSystemSlot1'
  | 'SubSystemSlot2'
  | 'SubSystemSlot3'
  | 'SubSystemSlot4'
  | 'SubSystemSlot5'
  | 'SubSystemSlot6'
  | 'SubSystemSlot7'
  | 'Unlocked'
  | 'Wardrobe';

export type EsiItemLocationType = 'station' | 'solar_system' | 'item' | 'other';

// see getLocationTypeById()
export type EsiLocationType = 'asset_safety' | 'station' | 'solar_system' | 'character' | 'unknown' | 'structure';

export interface EsiItem {
  is_blueprint_copy?: boolean;
  is_singleton: boolean;
  item_id: number;
  location_id: number;
  location_flag: EsiLocationFlag;
  location_type: EsiItemLocationType;
  type_id: number;
  quantity: number;
}

export interface EsiItemName {
  item_id: number;
  name: string | '' | 'None';
}

export type EsiMarketOrderRange =
  | 'station'
  | 'region'
  | 'solarsystem'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '10'
  | '20'
  | '30'
  | '40';

export type EsiMarketOrderState = 'cancelled' | 'expired';

export type EsiMarketOrderType = 'buy' | 'sell';

export interface EsiDogmaAttribute {
  attribute_id: number;
  value: number;
}

export interface EsiDogmaEffect {
  effect_id: number;
  is_default: boolean;
}

export interface EsiPosition {
  x: number;
  y: number;
  z: number;
}

export type EsiInformation =
  | { selector: 'asteroid_belts'; data: EsiBeltInfo }
  | { selector: 'categories'; data: EsiCategoryInfo }
  | { selector: 'constellations'; data: EsiConstellationInfo }
  //| { selector: 'graphics'; data:  }
  | { selector: 'groups'; data: EsiGroupInfo }
  | { selector: 'moons'; data: EsiMoonInfo }
  | { selector: 'planets'; data: EsiPlanetInfo }
  | { selector: 'regions'; data: EsiRegionInfo }
  | { selector: 'stargates'; data: EsiStargateInfo }
  //| { selector: 'stars'; data:  }
  | { selector: 'stations'; data: EsiStationInfo }
  | { selector: 'structures'; data: EsiStructureInfo }
  | { selector: 'systems'; data: EsiSystemInfo }
  | { selector: 'types'; data: EsiTypeInfo };

export type EsiInfoSelector = EsiInformation['selector'];
export type EsiInfo<T> = Extract<EsiInformation, { selector: T }>['data'];

interface EsiBeltInfo {
  name: string;
  position: EsiPosition;
  system_id: number;
}
interface EsiCategoryInfo {
  category_id: number;
  groups: number[];
  name: string;
  published: boolean;
}
interface EsiConstellationInfo {
  constellation_id: number;
  name: string;
  position: EsiPosition;
  region_id: number;
  systems: number[];
}
// 'graphics'
interface EsiGroupInfo {
  category_id: number;
  group_id: number;
  name: string;
  published: boolean;
  types: number[];
}
interface EsiMoonInfo {
  moon_id: number;
  name: string;
  position: EsiPosition;
  system_id: number;
}
interface EsiPlanetInfo {
  asteroid_belts?: number[];
  moons?: number[];
  planet_id: number;
}
interface EsiRegionInfo {
  constellations: number[];
  description: string;
  name: string;
  region_id: number;
}
interface EsiStargateInfo {
  destination: {
    stargate_id: number;
    system_id: number;
  };
  name: string;
  position: EsiPosition;
  stargate_id: number;
  system_id: number;
  type_id: number;
}
// 'stars'
interface EsiStationInfo {
  max_dockable_ship_volume?: number;
  name: string;
  office_rental_cost: number;
  owner?: number;
  position: EsiPosition;
  race_id?: number;
  reprocessing_efficiency: number;
  reprocessing_stations_take: number;
  services: string[];
  station_id: number;
  system_id: number;
  type_id: number;
}
interface EsiStructureInfo {
  name: string;
  owner_id: number;
  position?: EsiPosition;
  solar_system_id: number;
  type_id?: number;
}
interface EsiSystemInfo {
  constellation_id: number;
  name: string;
  planets?: EsiPlanetInfo[];
  position: EsiPosition;
  security_class: string;
  security_status: number;
  star_id?: number;
  stargates?: number[];
  stations?: number[];
  system_id: number;
}
interface EsiTypeInfo {
  capacity?: number;
  description: string;
  dogma_attributes?: EsiDogmaAttribute[];
  dogma_effects?: EsiDogmaEffect[];
  graphic_id?: number;
  group_id: number;
  icon_id?: number;
  market_group_id?: number;
  mass?: number;
  name: string;
  packaged_volume?: number;
  portion_size?: number;
  published: boolean;
  radius?: number;
  type_id: number;
  volume?: number;
}

export interface EsiMarketPrice {
  adjusted_price?: number;
  average_price?: number;
  type_id: number;
}

export interface EsiMarketOrderCharacter {
  duration: number;
  is_buy_order?: boolean;
  issued: string;
  location_id: number;
  min_volume?: number;
  order_id: number;
  price: number;
  range: EsiMarketOrderRange;
  region_id: number;
  type_id: number;
  volume_remain: number;
  volume_total: number;
  escrow?: number;
  is_corporation: boolean;
}

export interface EsiMarketHistoryOrderCharacter extends EsiMarketOrderCharacter {
  state: EsiMarketOrderState;
}

export interface EsiMarketOrderCorporation {
  duration: number;
  is_buy_order?: boolean;
  issued: string;
  location_id: number;
  min_volume?: number;
  order_id: number;
  price: number;
  range: EsiMarketOrderRange;
  region_id: number;
  type_id: number;
  volume_remain: number;
  volume_total: number;
  escrow?: number;
  issued_by: number;
  wallet_division: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export interface EsiMarketHistoryOrderCorporation extends EsiMarketOrderCorporation {
  state: EsiMarketOrderState;
}

export interface EsiMarketOrderRegion {
  duration: number;
  is_buy_order: boolean;
  issued: string;
  location_id: number;
  min_volume: number;
  order_id: number;
  price: number;
  range: EsiMarketOrderRange;
  system_id: number;
  type_id: number;
  volume_remain: number;
  volume_total: number;
}

export interface EsiMarketOrderStructure {
  duration: number;
  is_buy_order: boolean;
  issued: string;
  location_id: number;
  min_volume: number;
  order_id: number;
  price: number;
  range: EsiMarketOrderRange;
  type_id: number;
  volume_remain: number;
  volume_total: number;
}

export interface EsiBlueprint {
  item_id: number;
  location_flag: EsiLocationFlag;
  location_id: number;
  material_efficiency: number;
  quantity: number;
  runs: number;
  time_efficiency: number;
  type_id: number;
}

export interface EsiWalletTransaction {
  client_id: number;
  date: string;
  is_buy: boolean;
  is_personal?: boolean;
  journal_ref_id: number;
  location_id: number;
  quantity: number;
  transaction_id: number;
  type_id: number;
  unit_price: number;
}
