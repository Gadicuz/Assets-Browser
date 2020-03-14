import { Observable } from 'rxjs';

export type LocUID = string; // location unique identifer

export interface LocTypeInfo {
  loader?: (info: LocTypeInfo) => Observable<never>; // Lazy loader for the data structure
  name: string;
  comment?: string;
  icon?: string | number; // undefined, string = URI, number = type_id
  // value/volumes for item
  value?: number; // item price
  volume?: number; // simple item or packaged container/ship
  assembled_volume?: number; // assembled container/ship
}

/** Location position */
export interface LocPos {
  uid: LocUID;
  pos?: string;
}

export type LocPropVal = number | '' | string; // number - value, '' - "invisible" 0, string - text status
const implicit0 = '';

export function locPropVal(p: LocPropVal): number {
  return typeof p !== 'string' ? p : 0;
}

/** Calculates sum, propagates text status */
export function locPropAdd(s: LocPropVal, p: LocPropVal): LocPropVal {
  if (typeof s === 'string') return s === implicit0 ? p : s;
  if (typeof p === 'string') return p === implicit0 ? s : p;
  return s + p;
}

export class LocData {
  constructor(info: LocTypeInfo, parent?: LocPos, uid?: LocUID, items?: LocData[], is_vcont?: boolean) {
    this.info = info;
    this.parent = parent;
    this.content_uid = uid;
    this.content_items = items;
    this.is_vcont = is_vcont;
  }

  private calcPropVal(m: (_: LocData) => LocPropVal): LocPropVal {
    return this.content_items ? this.content_items.map(m).reduce(locPropAdd, implicit0) : implicit0;
  }

  /** Calculates LocData item q-pack value */
  get Value(): LocPropVal {
    if (!this.quantity || this.info.value == undefined) return implicit0;
    return this.quantity * this.info.value;
  }

  /** Calculates item's content value */
  get ContentValue(): LocPropVal {
    if (this.content_cache_val == undefined) this.content_cache_val = this.calcPropVal(i => i.TotalValue);
    return this.content_cache_val;
  }

  /** Calculates LocData total value */
  get TotalValue(): LocPropVal {
    return locPropAdd(this.Value, this.ContentValue);
  }

  /** Calculates LocData item q-pack volume */
  get Volume(): LocPropVal {
    if (!this.quantity) return implicit0;
    if (this.is_vcont) return this.ContentVolume;
    const volume = this.content_items ? this.info.assembled_volume : this.info.volume;
    return volume == undefined ? 'N/A' : this.quantity * volume;
  }

  /** Calculates item's content volume */
  get ContentVolume(): LocPropVal {
    if (this.content_cache_vol == undefined) {
      const vol = this.calcPropVal(i => i.Volume);
      if (typeof vol === 'string' && vol !== '') return vol;
      this.content_cache_vol = vol;
    }
    return this.content_cache_vol;
  }

  AddItems(items: LocData[], locs: Map<LocUID, LocData>): void {
    if (this.content_items) this.content_items = this.content_items.concat(items);
    else this.content_items = items;
    this.InvalidateCache(locs);
  }

  private InvalidateCache(locs: Map<LocUID, LocData>): void {
    this.content_cache_val = undefined;
    this.content_cache_vol = undefined;
    const parent = this.parent && locs.get(this.parent.uid);
    if (parent) parent.InvalidateCache(locs);
  }

  // Location information
  info: LocTypeInfo;
  // Link to parent container
  parent?: LocPos;
  // Item data (item value/volume are calculated)
  quantity?: number; // undefined if pure location
  // Content data (value/volume are calculated and cached)
  is_vcont?: boolean; // virtual container: item value/volume are equal content's value/volume
  content_uid?: LocUID;
  content_items?: LocData[];
  private content_cache_val?: LocPropVal;
  private content_cache_vol?: LocPropVal;
}
