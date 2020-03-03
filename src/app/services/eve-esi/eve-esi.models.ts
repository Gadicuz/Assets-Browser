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

export type EsiLocationType = 'station' | 'solar_system' | 'other';

export type EsiInformationType =
  | 'asteroid_belts'
  | 'categories'
  | 'constellations'
  | 'graphics'
  | 'groups'
  | 'moons'
  | 'planets'
  | 'regions'
  | 'stargates'
  | 'stars'
  | 'stations'
  | 'structures'
  | 'systems'
  | 'types';

export interface EsiItem {
  item_id: number;
  type_id: number;
  is_blueprint_copy?: boolean;
  is_singleton: boolean;
  quantity: number;
  location_id: number;
  location_type: EsiLocationType;
  location_flag: EsiLocationFlag;
}

export interface EsiItemName {
  item_id: number;
  name: string | '' | 'None';
}

export type EsiDataItemName = [number, string];

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

export interface EsiTypeIdInfo {
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

export interface EsiPosition {
  x: number;
  y: number;
  z: number;
}

export interface EsiStationInfo {
  station_id: number;
  name: string;
  type_id: number;
  owner?: number;
  system_id: number;
  position: EsiPosition;
  max_dockable_ship_volume?: number;
  office_rental_cost: number;
  race_id?: number;
  reprocessing_efficiency: number;
  reprocessing_stations_take: number;
  services: string[];
}

export interface EsiMarketPrice {
  adjusted_price?: number;
  average_price?: number;
  type_id: number;
}

export interface EsiStructureInfo {
  name: string;
  type_id?: number;
  owner_id: number;
  solar_system_id: number;
  position?: EsiPosition;
}

export interface EsiPlanetInfo {
  planet_id: number;
  moons?: number[];
  asteroid_belts?: number[];
}

export interface EsiSystemInfo {
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

export interface EsiConstellationInfo {
  constellation_id: number;
  name: string;
  position: { x: number; y: number; z: number };
  region_id: number;
  systems: number[];
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

export interface EsiDataMarketOrder {
  order_id: number;
  buy_sell: EsiMarketOrderType;
  timestamp: number;
  location_id: number;
  range: EsiMarketOrderRange;
  duration: number;
  type_id: number;
  price: number;
  min_volume: number;
  volume_remain: number;
  volume_total: number;
  region_id?: number;
}

export interface EsiDataCharMarketOrder extends EsiDataMarketOrder {
  issued_by: number;
  is_corporation: boolean;
  escrow: number;
  wallet_division: number;
  status: EsiMarketOrderState | undefined;
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

export interface EsiDataTypeInfo {
  name: string;
  volume?: number;
  packaged_volume?: number;
}
