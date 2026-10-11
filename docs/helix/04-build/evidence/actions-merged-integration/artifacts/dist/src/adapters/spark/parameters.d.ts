import type { Diagnostic } from '../../model/types';
/** Diagnostics for pinned JSON spellings, not DDL or execution validity. */
export declare function sparkParameterDiagnostics(value: string, path: string): Diagnostic[];
