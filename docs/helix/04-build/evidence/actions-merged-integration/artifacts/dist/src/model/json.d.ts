import { type Json } from './types';
export declare const LIMITS: {
    readonly maxDepth: 128;
    readonly maxValues: 100000;
    readonly maxTextLength: 4000000;
};
/** Copy JSON data without invoking getters, toJSON, or custom prototypes. */
export declare function copyJson(input: unknown): Json;
/** Internal copy hook; public copyJson retains its exact interface. */
export declare function copyJsonCharged(input: unknown, charge?: (visits: number) => void): Json;
