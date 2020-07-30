import { Observable } from 'rxjs';

export type LocUID = string | ''; // location unique identifer

export type fnInfoLoader = (info: LocTypeInfo) => Observable<never>;

export interface LocTypeInfo {
  loader?: fnInfoLoader; // Lazy loader for the data structure
  name: string;
  comment?: string;
  icon?: string | number; // undefined, string = URI, number = type_id
  // value/volumes for item
  value?: number; // item price
  volume?: number; // simple item or packaged container/ship
  assembled_volume?: number; // assembled container/ship, undefined for simple items
  do_not_pack?: boolean; // keep assembled volume
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

export function locPropDiv(s: LocPropVal, p: LocPropVal): LocPropVal {
  if (typeof s === 'string' || typeof p === 'string') return implicit0;
  return s / p;
}

export class LocData {
  constructor(info: LocTypeInfo, ploc: LocPos, uid?: LocUID, items?: LocData[], is_vcont?: boolean) {
    this.info = info;
    this.ploc = ploc;
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
    if (this.content_cache_val == undefined) this.content_cache_val = this.calcPropVal((i) => i.TotalValue);
    return this.content_cache_val;
  }

  /** Calculates LocData total value */
  get TotalValue(): LocPropVal {
    return locPropAdd(this.Value, this.ContentValue);
  }

  /** item packaged volume */
  public VolumePackaged(): LocPropVal {
    if (this.is_vcont || !this.quantity) return implicit0;
    if (this.info.volume == undefined) return 'n/a';
    return this.quantity * this.info.volume;
  }

  /** item's assembled volume (for container/ship)*/
  public VolumeAssembled(self = false): LocPropVal {
    if (!this.content_items) return implicit0; // auto pack any empty item
    if (this.info.do_not_pack) return this.info.assembled_volume ?? 'n/a'; // can't be repacked
    if (self) return implicit0; // not empty, but can be repacked
    return this.VolumeContentAssembled(); // auto pack item and return content assembled volume
  }

  /** item's content assembled volume */
  public VolumeContentAssembled(): LocPropVal {
    return this.calcPropVal((i) => i.VolumeAssembled());
  }

  /** item's volume as packaged cargo (self + content) */
  public VolumeCargo(self = false): LocPropVal {
    let vol = this.VolumePackaged();
    if (!this.content_items) return vol; // empty items can be packaged
    if (this.info.do_not_pack) return implicit0; // marked 'do not pack if not empty' can't be packed
    if (self) return vol;
    vol = locPropAdd(vol, this.VolumeContentCargo()); // packaged content
    if (typeof vol === 'string') return vol;
    if (this.info.assembled_volume && vol > this.info.assembled_volume) vol = this.info.assembled_volume;
    return vol;
  }

  /** item's content total volume */
  public VolumeContentCargo(): LocPropVal {
    if (this.content_cache_vol == undefined) {
      const vol = this.calcPropVal((i) => i.VolumeCargo());
      if (typeof vol === 'string' && vol !== '') return vol;
      this.content_cache_vol = vol;
    }
    return this.content_cache_vol;
  }

  /** Returns URL parameter for this location, undefined if no content is available */
  get Link(): string | undefined {
    return this.content_uid;
  }

  AddItems(items: LocData[]): void {
    if (this.content_items) this.content_items = this.content_items.concat(items);
    else this.content_items = items;
  }

  InvalidateCache(): void {
    this.content_cache_val = undefined;
    this.content_cache_vol = undefined;
  }

  // Location information
  info: LocTypeInfo;
  // Link to parent container
  ploc: LocPos;
  // Item data (item value/volume are calculated)
  quantity?: number; // undefined if pure location
  // Content data (value/volume are calculated and cached)
  is_vcont?: boolean; // virtual container: item value/volume are equal content's value/volume
  content_uid?: LocUID;
  content_items?: LocData[];
  private content_cache_val?: LocPropVal;
  private content_cache_vol?: LocPropVal;
}
