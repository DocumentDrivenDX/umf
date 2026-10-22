export interface WireLimits {maxDepth?: number; maxValues?: number}
export declare class AdmissionError extends TypeError {readonly code: string; readonly path: string}
export declare function toWire(value: unknown, limits?: WireLimits): unknown;
export declare function encodeWire(value: unknown, limits?: WireLimits): string;
export declare function encodeRequestWire(value: unknown): string;
export declare function fromWire(value: unknown): unknown;
export declare function resultError(value: unknown): {code: string; path: string; message: string} | null;
