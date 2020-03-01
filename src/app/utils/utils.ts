export const tuple = <T extends unknown[]>(...args: T): T => args;

export const set = <T extends unknown>(items: T[]): T[] => [...new Set(items)];

export const fltRemove = <T extends unknown>(items: T[]) => (i: T): boolean => !items.includes(i);

export const fltRemoveKeys = <T extends unknown>(map: Map<T, unknown>): ((i: T) => boolean) =>
  fltRemove([...map.keys()]);
