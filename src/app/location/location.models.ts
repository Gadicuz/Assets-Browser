import { Observable } from 'rxjs';

export type LocUID = string; // location unique identifer
export type LocParentLink = [LocUID, string?]; // location and position

export interface LocTypeInfo {
  loader?: (info: LocTypeInfo) => Observable<never>; // Lazy loader for the data structure
  name: string;
  comment?: string;
  image: string | number | ''; // number = type_id
  // value/volumes for item
  value?: number; // item price
  volume?: number; // simple item or packaged container
  assembled_volume?: number; // assembled container
}

export interface LocData {
  uid: LocUID | undefined; // undefined for pure item
  // Location information
  info: LocTypeInfo;
  // Link to parent container
  link?: LocParentLink;
  // Item data (item value/volume are calculated)
  quantity?: number; // undefined if pure location
  // Content (if type of uid is LocUID, value/volume are calculated and cached)
  is_virtual_container?: true;
  content_items?: LocData[];
  content_value?: number;
  content_volume?: number;
}

/*
export interface ItemLocation {
  container: ItemUID;
  position: ItemPosition;
  quantity: number;
  //value: number; - calc
  //volume: number;  - calc! = 1, empty, packaged
}

export interface ItemContent {
  value: number | undefined; // cached value = sum(children.values)
  volume: number | undefined; // cached volume = sum(children.volume) not unknown
  uids: ItemUID[];
}

export interface ItemInfo {
  uid: ItemUID;
  imageUrl: ItemImageURL;
  value: number | undefined; // undefined if BPC or unavailable, ignored on calculations (=0)
  loc?: ItemLocation;
  content?: ItemContent;
  name: string;
  comment?: string;
  incomplete?: unknown;
}
*/
