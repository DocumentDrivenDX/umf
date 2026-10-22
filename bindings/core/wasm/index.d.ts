export interface UmfCoreEngine {
  readonly engineVersion: string;
  copyJson(value: unknown, limits?: {maxDepth?: number; maxValues?: number}): unknown;
  readValue(source: string, format?: 'json' | 'yaml'): unknown;
  writeValue(value: unknown, format?: 'json' | 'yaml'): string;
  readJsonValue(source: string): unknown;
  writeJsonValue(value: unknown): string;
  validateDocument?(document: unknown, registry?: UmfCoreExtension[]): UmfCoreValidation;
  readDocument?(source: string, format?: 'json' | 'yaml', registry?: UmfCoreExtension[]): unknown;
  writeDocument?(document: unknown, format?: 'json' | 'yaml', registry?: UmfCoreExtension[]): string;
}
export interface UmfCoreExtension {
  id: string; version: string; scopes: string[]; schema?: unknown;
  semantics?: (payload: unknown, context: {document: unknown; path: string; scope: string}) => {code: string; path: string; message: string; severity: 'error' | 'warning'}[];
}
export interface UmfCoreValidation {valid: boolean; complete: boolean; diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[]}
export interface UmfCoreResources {coreSchema: unknown; referenceSchema: unknown; packageSchema: unknown; constraints: unknown; domainPolicy: unknown}
export interface UmfCoreControls {
  /** Maximum cumulative Rust work units charged during each operation. */
  maxWork?: number;
  /** Called synchronously for each charged Rust work amount. */
  meter?: (work: number) => void;
  /** Synchronously polled during Rust work; true cancels the operation. */
  isCancelled?: () => boolean;
  /** Monotonic clock in milliseconds, polled when deadlineMs is set. */
  now?: () => number;
  /** Absolute deadline in the same millisecond units returned by now(). */
  deadlineMs?: number;
}
export declare class UmfCoreError extends Error {readonly code: string; readonly path: string}
export declare function initializeWasm(loader?: () => Promise<any>, host?: typeof globalThis, resources?: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreEngine>;
export declare function createEngine(module: any, resources?: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreEngine;
