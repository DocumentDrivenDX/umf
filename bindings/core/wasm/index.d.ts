export interface UmfCoreEngine {
  readonly engineVersion: string;
  listKinds?(registry?: UmfCoreRegistration[]): unknown;
  getKind?(reference: unknown, registry?: UmfCoreRegistration[]): unknown;
  inspectExtensionKinds?(document: unknown, registry?: UmfCoreRegistration[]): unknown;
  copyJson(value: unknown, limits?: {maxDepth?: number; maxValues?: number}): unknown;
  readValue(source: string, format?: 'json' | 'yaml'): unknown;
  writeValue(value: unknown, format?: 'json' | 'yaml'): string;
  readJsonValue(source: string): unknown;
  writeJsonValue(value: unknown): string;
  validateDocument?(document: unknown, registry?: UmfCoreRegistration[]): UmfCoreValidation;
  readDocument?(source: string, format?: 'json' | 'yaml', registry?: UmfCoreRegistration[]): unknown;
  writeDocument?(document: unknown, format?: 'json' | 'yaml', registry?: UmfCoreRegistration[]): string;
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
export interface UmfCoreDocumentEngine extends UmfCoreEngine {
  listKinds(registry?: UmfCoreRegistration[]): unknown;
  getKind(reference: unknown, registry?: UmfCoreRegistration[]): unknown;
  inspectExtensionKinds(document: unknown, registry?: UmfCoreRegistration[]): unknown;
  validateDocument(document: unknown, registry?: UmfCoreRegistration[]): UmfCoreValidation;
  readDocument(source: string, format?: 'json' | 'yaml', registry?: UmfCoreRegistration[]): unknown;
  writeDocument(document: unknown, format?: 'json' | 'yaml', registry?: UmfCoreRegistration[]): string;
}
export declare class UmfCoreError extends Error {readonly code: string; readonly path: string}
export declare function initializeWasm(loader: (() => Promise<any>) | undefined, host: typeof globalThis | undefined, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreDocumentEngine>;
export declare function initializeWasm(loader?: () => Promise<any>, host?: typeof globalThis, resources?: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreEngine>;
export declare function createEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreDocumentEngine;
export declare function createEngine(module: any, resources?: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreEngine;

export interface UmfCodegenResources extends UmfCoreResources {tablesPackage: unknown; actionsPackage: unknown; bindingPackage: unknown; stableBindingPackage: unknown}
export type UmfCodegenOperation = 'generatePythonClient' | 'compileTableDeployment' | 'verifyTableDeployment' | 'compileTableMigration' | 'verifyTableMigration' | 'discoverTableMigrationChanges' | 'normalizeRowScope' | 'generateAccessPackage' | 'diffAccessPackages';
export type UmfCodegenOutcome = {ok: true; result: unknown} | {ok: false; error: {code: string; message: string; path?: string; pointer?: string}};
export interface UmfCodegenEngine {
  call(operation: UmfCodegenOperation, request: unknown): UmfCodegenOutcome;
  generatePythonClient(request: unknown): unknown;
  compileTableDeployment(request: unknown): unknown;
  verifyTableDeployment(bundle: unknown): unknown;
  compileTableMigration(request: unknown): unknown;
  verifyTableMigration(plan: unknown): unknown;
  discoverTableMigrationChanges(previous: unknown, next: unknown): unknown[];
  normalizeRowScope(input: unknown, context: unknown): unknown;
  generateAccessPackage(request: unknown, profile: unknown): unknown;
  diffAccessPackages(before: unknown, after: unknown): unknown;
}
export declare function createCodegenEngine(module: any, resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCodegenEngine;
export declare function initializeCodegenWasm(loader: (() => Promise<any>) | undefined, host: typeof globalThis | undefined, resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCodegenEngine>;

export interface UmfCorePackage { manifest: unknown; kinds?: boolean; semantics?: (payload: unknown, context: {document: unknown; path: string; scope: string}) => {code:string;path:string;message:string;severity:"error"|"warning"}[]; }
export type UmfCoreRegistration = UmfCoreExtension | UmfCorePackage;
