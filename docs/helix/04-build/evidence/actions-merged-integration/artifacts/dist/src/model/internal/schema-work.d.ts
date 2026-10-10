import type { ValueWork } from './value-context';
/** Resource reservation only: visits every possible branch; never accepts or
 * rejects source meaning. The original public validator remains authoritative. */
export declare function reserveSchemaWork(root: any, schema: any, value: unknown, work: ValueWork, category?: string): void;
export declare function reserveSourceSchemaWork(source: unknown, work: ValueWork): void;
export declare const reserveLiteralSchemaWork: (value: unknown, work: ValueWork) => void;
export declare const reserveInputSchemaWork: (value: unknown, work: ValueWork) => void;
export declare const reserveCompactSchemaWork: (value: unknown, work: ValueWork) => void;
