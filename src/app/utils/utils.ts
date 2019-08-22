
export const tuple = <T extends any[]>(...args: T): T => args;

export const set = <T extends any>(items: T[]): T[] => [...new Set(items)];

