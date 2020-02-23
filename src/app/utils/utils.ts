export const tuple = <T extends unknown[]>(...args: T): T => args;

export const set = <T extends unknown>(items: T[]): T[] => [...new Set(items)];
