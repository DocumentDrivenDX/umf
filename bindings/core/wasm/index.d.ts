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
export declare const GREGORIAN_DATE_PROFILE: 'umf-gregorian-date/1.0.0';
export declare const RFC3339_EXACT_INSTANT_PROFILE: 'umf-rfc3339-exact-instant/1.0.0';
export declare const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES: 1048576;
export declare const JAVASCRIPT_NUMERIC_PROFILE: 'umf.javascript-numeric/1.0.0';
export declare const BIT128_PROFILE: 'umf-128/1';
export type JavascriptNumericLiteral = {integerToken: string} | {decimalToken: string};
export interface JavascriptNumericContext { document: unknown; field: {module: string; element: string} }
export interface UmfJavascriptNumericEngine {
  exactDecimal(token: string, context?: JavascriptNumericContext): {decimalToken: string};
  integerFromBigInt(value: bigint, context?: JavascriptNumericContext): {integerToken: string};
  integerToBigInt(literal: {integerToken: string}, context?: JavascriptNumericContext): bigint;
  admitJavascriptNumber(value: number, scalarType: 'integer' | 'decimal', context?: JavascriptNumericContext): JavascriptNumericLiteral;
  numericToNumberLossless(literal: JavascriptNumericLiteral, context?: JavascriptNumericContext): number;
}
export declare function createJavascriptNumericEngine(module: any, resources?: UmfCoreResources, options?: {controls?: UmfCoreControls}): UmfJavascriptNumericEngine;
export type GregorianDateUnit = 'year' | 'quarter' | 'month' | 'day';
export interface GregorianDate { readonly profile: typeof GREGORIAN_DATE_PROFILE; readonly originalText: string; readonly year: number; readonly month: number; readonly day: number }
export interface Rfc3339ExactInstant { readonly profile: typeof RFC3339_EXACT_INSTANT_PROFILE; readonly originalText: string; readonly utcSeconds: string; readonly fractionalDigits: string; readonly originalOffset: string; readonly localOffsetKnown: boolean }
export interface UmfTemporalEngine {
  parseGregorianDate(token: string): GregorianDate;
  truncateGregorianDate(token: string, unit: string): string;
  parseRfc3339ExactInstant(token: string): Rfc3339ExactInstant;
  sameRfc3339ExactInstant(left: string, right: string): boolean;
}
export declare function createTemporalEngine(module: any): UmfTemporalEngine;
export interface Bit128Value { readonly profile: typeof BIT128_PROFILE; readonly hex: string }
export interface UuidValue extends Bit128Value { readonly canonicalText: string; readonly originalText: string }
export interface UmfBit128Engine {
  parseBits128(text: string): Bit128Value;
  parseUuid(text: string): UuidValue;
  bits128FromBytes(bytes: Uint8Array): Bit128Value;
  bits128ToBytes(value: Bit128Value): Uint8Array;
  uuidFromBits128(value: Bit128Value): UuidValue;
  uuidToBits128(value: UuidValue): Bit128Value;
  compareBits128(left: Bit128Value, right: Bit128Value): -1 | 0 | 1;
  bits128ToWords(value: Bit128Value, signed: boolean): {high: string; low: string};
  bits128FromWords(words: {high: string; low: string}, signed: boolean): Bit128Value;
  bits128ToInteger(value: Bit128Value, signed: boolean): {integerToken: string};
  bits128FromInteger(literal: {integerToken: string}, signed: boolean): Bit128Value;
}
export declare function createBit128Engine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfBit128Engine;
export declare function initializeBit128Wasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfBit128Engine>;
export declare function initializeTemporalWasm(loader?: () => Promise<any>, host?: typeof globalThis): Promise<UmfTemporalEngine>;
export declare function initializeWasm(loader?: () => Promise<any>, host?: typeof globalThis, resources?: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreEngine>;
export declare function createEngine(module: any, resources?: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreEngine;
export interface UmfCoreModelEngine {
  selectCoreElements(source: unknown, query: unknown, registry?: UmfCoreExtension[]): unknown;
  validateCoreFieldValue(source: unknown, field: {module: string; element: string}, value: unknown): UmfCoreValidation;
  inspectCoreCardinality(source: unknown, module: string, element: string): unknown;
  declareCoreCardinality(source: unknown, module: string, element: string, request: unknown): unknown;
  verifyCoreCardinalityDeclaration(receipt: unknown, current: unknown): unknown;
  inspectCoreKind(source: unknown, module: string, element: string): unknown;
  declareCoreKind(source: unknown, module: string, element: string, kind: 'field' | 'record' | 'group'): unknown;
  verifyCoreKindDeclaration(receipt: unknown, current: unknown): unknown;
  inspectCoreNullability(source: unknown, module: string, element: string): unknown;
  declareCoreNullability(source: unknown, module: string, element: string, nullability: 'required' | 'absent-allowed' | 'unspecified'): unknown;
  verifyCoreNullabilityDeclaration(receipt: unknown, current: unknown): unknown;
}
export declare function createCoreModelEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreEngine & UmfCoreModelEngine;
export declare function initializeCoreModelWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreEngine & UmfCoreModelEngine>;

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
