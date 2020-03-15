export const tuple = <T extends unknown[]>(...args: T): T => args;

export const set = <T extends unknown>(items: T[]): T[] => [...new Set(items)];

export const fltRemove = <T extends unknown>(items: T[]) => (i: T): boolean => !items.includes(i);

export const fltRemoveKeys = <T extends unknown>(map: Map<T, unknown>): ((i: T) => boolean) =>
  fltRemove([...map.keys()]);

export const removeKeys = <T>(arr: T[], m: Map<T, unknown>): T[] => arr.filter(fltRemoveKeys(m));

/** Splits an array to a Map for key(), the keys from flt[] are allowed */
export const autoMap = <T, K>(key: (_: T) => K, flt?: K[]) => (m: Map<K, T[]>, x: T): Map<K, T[]> => {
  const k = key(x);
  if (flt && !flt.includes(k)) return m;
  const a = m.get(k);
  if (!a) return m.set(k, [x]);
  a.push(x);
  return m;
};

export const updateMapValues = <K, T, U>(m: Map<K, T>, upd: (_: T) => U): Map<K, U> =>
  new Map(Array.from(m).map(([k, v]) => tuple(k, upd(v))));

export function mapGet<A, T>(m: Map<A, T>, k: A): T {
  const v = m.get(k);
  if (!v) throw new Error(`Unknown key ${k}`);
  return v;
}
