export interface UmfCoreEngine {
  readonly engineVersion: string;
  listKinds?(registry?: UmfCoreRegistration[]): unknown;
  getKind?(reference: unknown, registry?: UmfCoreRegistration[]): unknown;
  inspectExtensionKinds?(document: unknown, registry?: UmfCoreRegistration[]): unknown;
  copyJson(value: unknown, limits?: {maxDepth?: number; maxValues?: number}): unknown;
  readValue(source: string, format?: 'json' | 'yaml'): unknown;
  writeValue(value: unknown, format?: 'json' | 'yaml'): string;
  readJsonValue(source: string, format?: 'json' | 'yaml'): unknown;
  writeJsonValue(value: unknown, format?: 'json' | 'yaml'): string;
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
export declare function isWireAdmissionError(error: unknown): boolean;
export declare function isNativeUmfCoreError(error: unknown): boolean;
export declare function isCoreBit128FieldBindingError(error: unknown): boolean;
/** Run artifactReferences/inspect over umf.core-wire/1. The pack must be structurally validated before this call. */
export declare function executeArtifactReferencesBindingWire(module: any, wireJson: string, controlDispatcher?: Function): string;
export declare function isBit128EngineError(error: unknown): boolean;
export declare function isHostJsonResponseError(error: unknown): boolean;
export interface SemanticTypeRegistry {
  register(reference: unknown, definition: unknown, validator?: (value: unknown, definition: unknown, context: {reportWork(units: number): void}) => unknown): this;
  lookup(reference: unknown): unknown;
  check(reference: unknown, value: unknown): unknown;
  validateCoreSemanticTypeValue(resources: UmfCoreResources, source: unknown, identity: unknown, value: unknown): unknown;
}
export declare function createSemanticTypeRegistry(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): SemanticTypeRegistry;
export declare function initializeSemanticValueWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<SemanticTypeRegistry>;
export interface DefaultSemanticTypeRegistry extends Omit<SemanticTypeRegistry, 'register'> {
  register(reference: unknown, definition: unknown, validator?: (value: unknown, definition: unknown) => unknown): this;
}
export declare function createDefaultSemanticTypeRegistry(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): DefaultSemanticTypeRegistry;
export declare function initializeDefaultSemanticValueWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<DefaultSemanticTypeRegistry>;
export declare const GREGORIAN_DATE_PROFILE: 'umf-gregorian-date/1.0.0';
export declare const RFC3339_EXACT_INSTANT_PROFILE: 'umf-rfc3339-exact-instant/1.0.0';
export declare const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES: 1048576;
export declare const JAVASCRIPT_NUMERIC_PROFILE: 'umf.javascript-numeric/1.0.0';
export declare const BIT128_PROFILE: 'umf-128/1';
export declare const JSON_NUMBER_PROFILE: 'umf-json-number/0.1';
export type JavascriptNumericLiteral = {integerToken: string} | {decimalToken: string};
export interface JavascriptNumericContext { document: unknown; field: {module: string; element: string} }
export interface UmfJavascriptNumericEngine {
  exactDecimal(token: string, context?: JavascriptNumericContext): {decimalToken: string};
  integerFromBigInt(value: bigint, context?: JavascriptNumericContext): {integerToken: string};
  integerToBigInt(literal: {integerToken: string}, context?: JavascriptNumericContext): bigint;
  admitJavascriptNumber(value: number, scalarType: 'integer' | 'decimal', context?: JavascriptNumericContext): JavascriptNumericLiteral;
  numericToNumberLossless(literal: JavascriptNumericLiteral, context?: JavascriptNumericContext): number;
}
export declare function createJavascriptNumericEngine(module: any, resources?: UmfCoreResources, options?: {controls?: UmfCoreControls; setupControls?: UmfCoreControls}): UmfJavascriptNumericEngine;
export declare const SECURITY_LOGIC_PROFILE: 'umf.security-logic/1.0.0';
export type SecurityTruth = 'T'|'F'|'U';
export type SecurityDecision = 'permit'|'deny'|'indeterminate'|'conflict';
export type SecurityDisposition = {kind:'original'}|{kind:'withheld'}|{kind:'transformed';type:'string';value:string}|{kind:'transformed';type:'boolean';value:boolean};
export interface EvaluatedSecurityRule {effect:'permit'|'require'|'forbid';truth:SecurityTruth;disclosure?:Record<string,SecurityDisposition>}
export interface SecurityComposition {decision:SecurityDecision;disclosure:Record<string,SecurityDisposition>}
export interface UmfSecurityLogicEngine {
  securityNot(value: SecurityTruth): SecurityTruth;
  securityAnd(values: readonly SecurityTruth[]): SecurityTruth;
  securityOr(values: readonly SecurityTruth[]): SecurityTruth;
  composeSecurityRules(rules: readonly EvaluatedSecurityRule[], protectedFields?: readonly string[]): SecurityComposition;
}
export declare function createSecurityLogicEngine(module: any, options?: {controls?: UmfCoreControls}): UmfSecurityLogicEngine;
export declare const SECURITY_FUNCTIONS_PROFILE: 'umf.security-functions/1';
export declare const SECURITY_PROTECTION_SOURCE_PROFILE: 'umf.security-protection-source/1';
export declare const SECURITY_QUERY_PROPERTIES_PROFILE: 'umf.security-queries/1';
export declare const SECURITY_PROTECTION_PARAMETERS_PROFILE: 'umf.security-parameters/1';
export interface SecurityQueryPropertiesResult {
  readonly status: 'compatible-properties' | 'prohibited' | 'requires-original-action' | 'refused';
  readonly complete: false; readonly authority: false;
  readonly policy: unknown; readonly catalog: unknown; readonly closure: unknown; readonly use: unknown;
  readonly authoredProperties: readonly unknown[]; readonly impliedProperties: readonly unknown[];
  readonly effectiveProperties: readonly unknown[]; readonly requiredProperties: readonly unknown[];
  readonly missingProperties: readonly unknown[];
  readonly diagnostics: readonly {readonly code: string; readonly path: string; readonly message: string; readonly severity: 'error' | 'warning'}[];
}
export interface UmfSecurityQueryPropertiesEngine {
  inspectProtectionQueryProperties(policy: unknown, catalog: unknown, closure: unknown, use: unknown): SecurityQueryPropertiesResult;
}
export declare function createSecurityQueryPropertiesEngine(module: any): UmfSecurityQueryPropertiesEngine;
export interface SecurityProtectionParametersResult {
  readonly status: 'validated-parameters' | 'refused';
  readonly complete: false; readonly authority: false;
  readonly policy: unknown; readonly catalog: unknown; readonly closure: unknown;
  readonly validated: readonly {readonly path: string; readonly transformIndex: number}[];
  readonly diagnostics: readonly {readonly code: string; readonly path: string; readonly message: string; readonly severity: 'error' | 'warning'}[];
}
export interface UmfSecurityProtectionParametersEngine {
  validateProtectionParameters(policy: unknown, catalog: unknown, closure: unknown): SecurityProtectionParametersResult;
}
export declare function createSecurityProtectionParametersEngine(module: any): UmfSecurityProtectionParametersEngine;
export interface SecurityProtectionFunctionResult {
  readonly status: 'reference-ready' | 'transformed' | 'refused';
  readonly complete: false;
  readonly authority: false;
  readonly policy: unknown; readonly catalog: unknown; readonly closure: unknown;
  readonly selection: unknown; readonly input: unknown; readonly value: unknown;
  readonly inputDomain: unknown; readonly outputDomain: unknown; readonly valueProfile: string | null;
  readonly diagnostics: readonly {code: string; path: string; message: string; severity: 'error' | 'warning'}[];
}
export interface UmfSecurityFunctionsEngine {
  inspectProtectionFunction(policy: unknown, catalog: unknown, closure: unknown, selection: unknown): SecurityProtectionFunctionResult;
  evaluateProtectionValue(policy: unknown, catalog: unknown, closure: unknown, selection: unknown): SecurityProtectionFunctionResult;
}
export declare function createSecurityFunctionsEngine(module: any): UmfSecurityFunctionsEngine;
export interface SecurityProtectionSourceResult {
  readonly status: 'resolved-source' | 'refused';
  readonly complete: false;
  readonly authority: false;
  readonly policy: unknown;
  readonly catalog: unknown;
  readonly references: readonly {readonly ruleIndex: number; readonly disclosureIndex: number; readonly transformIndex: number}[];
  readonly diagnostics: readonly {readonly code: string; readonly path: string; readonly message: string; readonly severity: 'error' | 'warning'}[];
}
export interface UmfSecurityProtectionSourceEngine {
  resolveSecurityProtectionSources(policy: unknown, catalog: unknown): SecurityProtectionSourceResult;
}
export declare function createSecurityProtectionSourceEngine(module: any): UmfSecurityProtectionSourceEngine;
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
export interface UmfJsonNumberEngine { assertExactJsonNumber(token: string): void }
export declare function createJsonNumberEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfJsonNumberEngine;
export declare function initializeJsonNumberWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfJsonNumberEngine>;
export declare function initializeBit128Wasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfBit128Engine>;
export declare function initializeTemporalWasm(loader?: () => Promise<any>, host?: typeof globalThis): Promise<UmfTemporalEngine>;
export declare const ACCESS_TEMPORAL_PROFILE: 'umf-access-temporal/0.1.0';
export type AccessTemporalKind = 'date'|'instant'|'local';
export interface AccessDate {readonly profile: typeof ACCESS_TEMPORAL_PROFILE; readonly kind: 'date'; readonly originalText: string; readonly canonicalText: string}
export interface AccessLocal {readonly profile: typeof ACCESS_TEMPORAL_PROFILE; readonly kind: 'local'; readonly originalText: string; readonly canonicalText: string; readonly microsecond: number}
export interface AccessInstant {readonly profile: typeof ACCESS_TEMPORAL_PROFILE; readonly kind: 'instant'; readonly originalText: string; readonly canonicalText: string; readonly microsecond: number; readonly utcSeconds: string; readonly originalOffset: string}
export type AccessTemporal = AccessDate|AccessLocal|AccessInstant;
export interface AccessTemporalEngine { parseAccessTemporal(kind: AccessTemporalKind, token: string): AccessTemporal }
export declare function createAccessTemporalEngine(module: any): AccessTemporalEngine;
export declare function initializeAccessTemporalWasm(loader?: () => Promise<any>, host?: typeof globalThis): Promise<AccessTemporalEngine>;
export declare function initializeWasm(loader: (() => Promise<any>) | undefined, host: typeof globalThis | undefined, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreDocumentEngine>;
export declare function initializeWasm(loader?: () => Promise<any>, host?: typeof globalThis, resources?: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreEngine>;
export declare function createEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreDocumentEngine;
export declare function createEngine(module: any, resources?: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreEngine;
export interface CoreRecordIdentity {module: string; element: string}
export interface CoreKeyRequest {id: string; name: string; fields: CoreRecordIdentity[]; primary?: boolean}
export interface CoreKeyInspection {operation: 'inspect-core-keys'; version: '4.0.0'; source: unknown; identity: CoreRecordIdentity; path: string; meaning: {state: 'missing'|'inapplicable'} | {state: 'known'|'partial'; keys: unknown[]; uninterpretedPaths: string[]}; provenance: 'unverified'}
export interface CoreKeyLookup {operation: 'lookup-core-key'; version: '4.0.0'; source: unknown; identity: CoreKeyIdentity; path: string; key: unknown; uninterpretedPaths: string[]; provenance: 'unverified'}
export interface CoreKeyDeclaration {operation: 'declare-core-key'; version: '2.0.0'; source: unknown; target: unknown; identity: CoreRecordIdentity; request: CoreKeyRequest; provenance: unknown}
export interface CoreRecordMembersDeclaration {operation: 'declare-core-record-members'; version: '2.0.0'; source: unknown; target: unknown; identity: CoreRecordIdentity; request: CoreRecordIdentity[]; provenance: unknown}
export type CoreKeysOperation = CoreKeyInspection | CoreKeyLookup | CoreKeyDeclaration | CoreRecordMembersDeclaration;
export interface CsvBooleanLexicalRequest {profile: 'umf.csv-boolean-lexical/1.0.0'; field: CoreRecordIdentity; token: 'true'|'false'|'True'|'False'; sourceContext: unknown}
export interface CsvBooleanLexicalReceipt {operation: 'validate-csv-boolean-lexical'; version: '1.0.0'; source: unknown; request: CsvBooleanLexicalRequest; value: {boolean: boolean}; validation: UmfCoreValidation; provenance: 'unverified'}
export interface UmfCoreModelEngine {
  encodeCoreKeyTuple(source: unknown, identity: CoreKeyIdentity, values: CoreKeyTupleValue[], options?: {profile: 'umf-key-tuple-v1' | 'umf-key-tuple-v2'}): CoreKeyTupleReceipt;
  verifyCoreKeyTuple(receipt: CoreKeyTupleReceipt, current: unknown): CoreKeyTupleReceipt;
  readCoreKeyTupleBytes(receipt: CoreKeyTupleReceipt, current: unknown): Uint8Array;
  prepareCoreKeyTuples(source: unknown): PreparedCoreKeyTuples;
  inspectCoreKeys(source: unknown, identity: CoreRecordIdentity): CoreKeyInspection;
  lookupCoreKey(source: unknown, identity: CoreKeyIdentity): CoreKeyLookup;
  declareCoreRecordMembers(source: unknown, identity: CoreRecordIdentity, request: CoreRecordIdentity[]): CoreRecordMembersDeclaration;
  declareCoreKey(source: unknown, identity: CoreRecordIdentity, request: CoreKeyRequest): CoreKeyDeclaration;
  verifyCoreKeyOperation(receipt: CoreKeysOperation, current: unknown): CoreKeysOperation;
  admitCoreKeyIdentity(identity: unknown): unknown;
  admitCoreKeyRequest(request: unknown): unknown;
  admitCoreKeyMemberRequest(request: unknown): unknown;
  prepareCoreKeyVerification(receipt: unknown): object;
  finishCoreKeyVerification(handle: object, current: unknown): CoreKeysOperation;
  validateCoreDatasetValuesCompact(source: unknown, input: CoreDatasetCompactInput): CoreDatasetCompactReceipt;
  verifyCoreDatasetValuesCompact(receipt: CoreDatasetCompactReceipt, current: unknown, expectedInput: CoreDatasetCompactInput): CoreDatasetCompactReceipt;
  validateCoreDatasetValues(source: unknown, input: CoreDatasetCompactInput): CoreDatasetValuesReceipt;
  verifyCoreDatasetValues(receipt: CoreDatasetValuesReceipt, current: unknown, expectedInput: CoreDatasetCompactInput): CoreDatasetValuesReceipt;
  inspectCoreRelationships(source: unknown, identity: {module: string}): unknown;
  selectCoreRelationships(source: unknown, query: unknown): unknown;
  lookupCoreRelationship(source: unknown, identity: {module: string; id: string}): unknown;
  declareCoreRelationship(source: unknown, identity: {module: string}, request: unknown): unknown;
  verifyCoreRelationshipOperation(receipt: unknown, current: unknown): unknown;
  admitCoreRelationshipLookupIdentity(identity: unknown): unknown;
  admitCoreRelationshipRequest(request: unknown): unknown;
  prepareCoreRelationshipVerification(receipt: unknown): object;
  finishCoreRelationshipVerification(handle: object, current: unknown): unknown;
  inspectCoreEvolution(before: unknown, after: unknown, policy: unknown): unknown;
  verifyCoreEvolution(receipt: unknown, before: unknown, after: unknown, policy: unknown): unknown;
  validateCsvBooleanLexical(source: unknown, request: CsvBooleanLexicalRequest): CsvBooleanLexicalReceipt;
  verifyCsvBooleanLexical(receipt: CsvBooleanLexicalReceipt, source: unknown, request: CsvBooleanLexicalRequest): CsvBooleanLexicalReceipt;
  selectCoreElements(source: unknown, query: unknown, registry?: UmfCoreExtension[]): unknown;
  validateCoreFieldValue(source: unknown, field: {module: string; element: string}, value: unknown): UmfCoreValidation;
  validateCoreRecordValues(source: unknown, identity: {module: string; element: string}, values: unknown[]): unknown;
  resolveCoreDefault(source: unknown, field: {module: string; element: string}, state: UmfCoreDefaultInput): UmfCoreDefaultResolution;
  inspectCoreSchemaProperties(source: unknown, identity: {scope: 'document'} | {scope: 'module'; module: string} | {scope: 'element'; module: string; element: string}): unknown;
  inspectCoreScalarType(source: unknown, identity: {module: string; element: string}): unknown;
  inspectCoreRecordMembers(source: unknown, identity: {module: string; element: string}): unknown;
  inspectCoreReferenceLinks(source: unknown, identity: {module: string; element: string}): unknown;
  inspectCoreSemanticTypes(source: unknown, identity: {module: string; element: string}): unknown;
  getCoreSemanticTypes(source: unknown, identity: {module: string; element: string}): unknown[] | undefined;
  declareCoreSemanticTypes(source: unknown, identity: {module: string; element: string}, types?: unknown[] | null): unknown;
  verifyCoreSemanticTypeDeclaration(receipt: unknown, current: unknown): unknown;
  getSemanticTypes(document: unknown, module: string, element: string): unknown;
  setSemanticTypes(document: unknown, module: string, element: string, annotation?: unknown): unknown;
  inspectCoreFacets(source: unknown, identity: {module: string; element: string}): unknown;
  declareCoreFacets(source: unknown, identity: {module: string; element: string}, request: unknown): unknown;
  verifyCoreFacetDeclaration(receipt: unknown, current: unknown): unknown;
  admitCoreFacetRequest(request: unknown): unknown;
  prepareCoreFacetVerification(receipt: unknown): unknown;
  finishCoreFacetVerification(handle: unknown, current: unknown): unknown;
  historicalCoreFacetPatch(input: unknown): unknown;
  declareCoreSchemaProperties(source: unknown, identity: {scope: 'document'} | {scope: 'module'; module: string} | {scope: 'element'; module: string; element: string}, patch: unknown): unknown;
  inspectCoreCardinality(source: unknown, module: string, element: string): unknown;
  inspectCoreCardinalityIdentity(source: unknown, identity: unknown): unknown;
  declareCoreCardinality(source: unknown, module: string, element: string, request: unknown): unknown;
  declareCoreCardinalityIdentity(source: unknown, identity: unknown, request: unknown): unknown;
  verifyCoreCardinalityDeclaration(receipt: unknown, current: unknown): unknown;
  admitCoreCardinalityRequest(request: unknown): unknown;
  prepareCoreCardinalityVerification(receipt: unknown): unknown;
  finishCoreCardinalityVerification(handle: unknown, current: unknown): unknown;
  inspectCoreKind(source: unknown, module: string, element: string): unknown;
  declareCoreKind(source: unknown, module: string, element: string, kind: 'field' | 'record' | 'group'): unknown;
  verifyCoreKindDeclaration(receipt: unknown, current: unknown): unknown;
  inspectCoreNullability(source: unknown, module: string, element: string): unknown;
  declareCoreNullability(source: unknown, module: string, element: string, nullability: 'required' | 'absent-allowed' | 'unspecified'): unknown;
  verifyCoreNullabilityDeclaration(receipt: unknown, current: unknown): unknown;
}
export type UmfCoreRootModelEngine = Omit<UmfCoreModelEngine, 'encodeCoreKeyTuple' | 'verifyCoreKeyTuple' | 'readCoreKeyTupleBytes' | 'prepareCoreKeyTuples'>;
export interface CoreKeyIdentity {module: string; element: string; key: string}
export interface CoreDatasetCompactInput {
  scope: {id: string; closure: 'supplied-dataset-only'};
  records: unknown[];
  relationships: unknown[];
  context?: unknown;
}
export interface CoreDatasetCompactReceipt {
  operation: 'validate-core-dataset-values-compact';
  version: '1.0.0';
  scope: 'supplied-dataset-only';
  provenance: 'unverified';
  source: unknown;
  input: CoreDatasetCompactInput;
  documentValidation: unknown;
  records: unknown[];
  keys: unknown[];
  relationships: unknown[];
  datasetValidation: unknown;
  obligations: unknown[];
  residuals: unknown[];
}
export interface CoreDatasetValuesReceipt {
  operation: 'validate-core-dataset-values';
  version: '1.0.0';
  scope: 'supplied-dataset-only';
  provenance: 'unverified';
  source: unknown;
  input: CoreDatasetCompactInput;
  documentValidation: unknown;
  records: unknown[];
  keys: unknown[];
  relationships: unknown[];
  datasetValidation: unknown;
  obligations: unknown[];
  residuals: unknown[];
}

/** Opt-in Rust host-admission operations for full Dataset values. */
export interface CoreDatasetValuesHostInputEngine {
  validateCoreDatasetValues(source: unknown, input: CoreDatasetCompactInput): CoreDatasetValuesReceipt;
  verifyCoreDatasetValues(receipt: CoreDatasetValuesReceipt, current: unknown, expectedInput: CoreDatasetCompactInput): CoreDatasetValuesReceipt;
}
export declare function initializeCoreDatasetValuesHostInputWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<CoreDatasetValuesHostInputEngine>;
export type CoreKeyTupleValue = {boolean: boolean} | {integerToken: string} | {decimalToken: string} | {string: string} | {binaryHex: string} | {bits128Hex: string} | {uuid: string};
export interface CoreKeyTupleReceipt {operation: 'encode-core-key-tuple'; version: '4.0.0'; profile: 'umf-key-tuple-v1' | 'umf-key-tuple-v2'; source: unknown; identity: CoreKeyIdentity; values: CoreKeyTupleValue[]; keyPath: string; bytesHex: string}
export interface PreparedCoreKeyTuples {readonly profile: 'umf.core.key-tuples.prepared/1'; readonly source: unknown; encode(identity: CoreKeyIdentity, values: CoreKeyTupleValue[]): CoreKeyTupleReceipt; verify(receipt: CoreKeyTupleReceipt): CoreKeyTupleReceipt}
export declare function createCoreModelEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): UmfCoreEngine & UmfCoreModelEngine;
/** @internal Default-root facade while Key tuple exports remain on TypeScript. */
export declare function createCoreModelRootEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): UmfCoreEngine & UmfCoreRootModelEngine;
export declare function createCoreModelRootKeyTupleEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): UmfCoreRootModelEngine & Pick<UmfCoreModelEngine, 'readCoreKeyTupleBytes' | 'prepareCoreKeyTuples'>;
/** Private opt-in shared retained Engine for model and Kind/Nullability operations. */
export declare function initializeCoreModelRootKindNullabilityWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): Promise<UmfCoreEngine & UmfCoreRootModelEngine & Pick<UmfCoreModelEngine, 'readCoreKeyTupleBytes' | 'prepareCoreKeyTuples'> & {
  inspectCoreElementKind(source: unknown, identity: unknown): unknown;
  declareCoreElementKind(source: unknown, identity: unknown, kind: unknown): unknown;
  verifyCoreKindDeclaration(receipt: unknown, current: unknown): unknown;
  inspectCoreNullability(source: unknown, identity: unknown): unknown;
  declareCoreNullability(source: unknown, identity: unknown, nullability: unknown): unknown;
  verifyCoreNullabilityDeclaration(receipt: unknown, current: unknown): unknown;
}>;
/** Create the private Rust-owned umf.host-json/1 Core Cardinality admission engine. */
export declare function createCoreCardinalityHostInputEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): {
  inspectCoreCardinality(source: unknown, identity: unknown): unknown;
  declareCoreCardinality(source: unknown, identity: unknown, request: unknown): unknown;
  verifyCoreCardinalityDeclaration(receipt: unknown, current: unknown): unknown;
};
/** Opt-in only; authors bits128/uuid meaning on one singular Field in current core 0.10.0. */
export declare function createCoreBit128FieldEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): {
  declareCoreBit128Field(source: unknown, identity: {module: string; element: string}, scalarType: 'bits128' | 'uuid'): unknown;
};
export declare function initializeCoreBit128FieldWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<{
  declareCoreBit128Field(source: unknown, identity: {module: string; element: string}, scalarType: 'bits128' | 'uuid'): unknown;
}>;
export declare function createCoreKeyTupleEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): Pick<UmfCoreModelEngine, 'encodeCoreKeyTuple' | 'verifyCoreKeyTuple' | 'readCoreKeyTupleBytes' | 'prepareCoreKeyTuples'>;
export interface UmfCoreRecordTypeEngine {
  declareCoreRecordType(fieldAuthor: unknown, recordAuthor: unknown): unknown;
  verifyCoreRecordTypeDeclaration(receipt: unknown, current: unknown): unknown;
  prepareCoreRecordTypeVerification(receipt: unknown): object;
  finishCoreRecordTypeVerification(handle: object, current: unknown): unknown;
  discardCoreRecordTypeVerification(handle: object): void;
  dispose(): void;
}
export declare function createCoreRecordTypeEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; setupControls?: UmfCoreControls}): UmfCoreRecordTypeEngine;
export interface UmfCoreRecordMembersEngine {
  inspectCoreRecordMembers(source: unknown, identity: {module: string; element: string}): unknown;
  dispose(): void;
}
export declare function createCoreRecordMembersEngine(module: any, resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; setupControls?: UmfCoreControls}): UmfCoreRecordMembersEngine;
export declare function initializeCoreKeyTupleWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): Promise<Pick<UmfCoreModelEngine, 'encodeCoreKeyTuple' | 'verifyCoreKeyTuple' | 'readCoreKeyTupleBytes' | 'prepareCoreKeyTuples'>>;
export declare function initializeCoreModelWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreEngine & UmfCoreModelEngine>;
/** @internal Default-root facade while Key tuple exports remain on TypeScript. */
export declare function initializeCoreModelRootWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCoreEngine & UmfCoreRootModelEngine>;
/** Initialize the opt-in Rust-owned umf.host-json/1 logical Record-values route. */
export declare function initializeCoreRecordValuesHostInputWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<{validateCoreRecordValues(source: unknown, identity: unknown, values: unknown): unknown}>;
export declare function initializeCoreKindNullabilityHostInputWasm(resources: UmfCoreResources, loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): Promise<{
  inspectCoreElementKind(source: unknown, identity: unknown): unknown;
  declareCoreElementKind(source: unknown, identity: unknown, kind: unknown): unknown;
  verifyCoreKindDeclaration(receipt: unknown, current: unknown): unknown;
  inspectCoreNullability(source: unknown, identity: unknown): unknown;
  declareCoreNullability(source: unknown, identity: unknown, nullability: unknown): unknown;
  verifyCoreNullabilityDeclaration(receipt: unknown, current: unknown): unknown;
}>;
export declare const ICEBERG_SCHEMA_PROFILE: 'umf-r5-iceberg-schema/0.1.0';
export declare const ARROW_SCHEMA_PROFILE: 'umf-r8-arrow-schema/0.1.0';
export declare const ARROW_IPC_PROFILE: 'umf-r8-arrow-ipc/0.1.0';
export declare const PARQUET_CAPTURE_PROFILE: 'umf-r8-parquet-capture-inspection/0.1.0';
export declare const PROTOBUF_INSPECT_PROFILE: 'umf-r5-protobuf-inspect/0.1.0';
export declare const PROTOBUF_DOCUMENT_PROFILE: 'umf-r8-protobuf-descriptor-document/0.1.0';
export declare const AVRO_FIELDS_PROFILE: 'umf-r5-avro-fields/0.1.0';
export declare const JSON_SCHEMA_PROFILE: 'umf-r5-json-schema/0.1.0';
export declare const DOCUMENT_COMPARISON_PROFILE: 'umf.schema-comparison/1';
export interface DocumentChange { path: string; status: 'created' | 'removed' | 'changed'; before?: unknown; after?: unknown }
export interface DocumentComparisonEngine { compareDocuments(before: unknown, after: unknown): DocumentChange[] }
export declare function createDocumentComparisonEngine(module: any, options: {snapshot: (value: unknown) => unknown; profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): DocumentComparisonEngine;
/** Semantic refusals from the opt-in JSON Schema adapter retain the TypeScript UmfError name. */
export declare class UmfError extends Error { readonly code: string; readonly path: string }
export interface ProtobufInspectDiagnostic {code: string; path: string; message: string; severity: 'error' | 'warning'}
export interface ProtobufInspectResult {valid: boolean; complete: boolean; diagnostics: ProtobufInspectDiagnostic[]}
export interface ProtobufInspector {/** Inspect a UMF document containing a tagged Protobuf descriptor extension. */ inspect(document: unknown): ProtobufInspectResult}
/** Create the opt-in bounded Rust Protobuf descriptor inspector. */
export declare function createProtobufInspector(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ProtobufInspector;
/** Initialize the opt-in Protobuf descriptor inspector in a browser. */
export declare function initializeProtobufInspectWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<ProtobufInspector>;
export interface ProtobufDescriptorDocumentEngine {
  readDescriptorSet(binary: Uint8Array): unknown;
  writeDescriptorSet(descriptorSet: unknown): Uint8Array;
  importProtobufDescriptorSet(binary: Uint8Array, options: {id: string}): unknown;
  getProtobufDescriptorSet(document: unknown): unknown;
  exportProtobufDescriptorSet(document: unknown): Uint8Array;
  exportProtobufBundle(document: unknown): {descriptorSet: Uint8Array; source: unknown; diagnostics: ProtobufInspectDiagnostic[]};
  inspectProtobuf(document: unknown): ProtobufInspectResult;
}
/** Create the opt-in descriptor/document operation packet; source compiler callbacks remain separate. */
export declare function createProtobufDescriptorDocumentEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ProtobufDescriptorDocumentEngine;
export declare function initializeProtobufDescriptorDocumentWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<ProtobufDescriptorDocumentEngine>;
export declare const PROTOBUF_SOURCE_IMPORT_PROFILE: 'umf-r8-protobuf-source-import/0.1.0';
export interface ProtobufSourceCompilerResult {descriptorSet: Uint8Array; compiler: string}
export interface ProtobufSourceCompiler {compile(request: {files: Record<string, string>; roots: string[]}): Promise<ProtobufSourceCompilerResult>}
export interface ProtobufSourceImportEngine {
  readonly callbackControl: 'boundary-only';
  importProtobufSources(input: {files: Record<string, string>; roots: string[]}, compiler: ProtobufSourceCompiler, options: {id: string}): Promise<unknown>;
}
export declare function createProtobufSourceImportEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ProtobufSourceImportEngine;
export declare function initializeProtobufSourceImportWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<ProtobufSourceImportEngine>;
export interface ProtobufSourceEmitterResult {files: Record<string, string>; compiler: string; printer: string; [key: string]: unknown}
export interface ProtobufSourceEmitter {emit(descriptorSet: Uint8Array): Promise<ProtobufSourceEmitterResult>}
export interface ProtobufSourceExportEngine {
  readonly callbackControl: 'boundary-only';
  exportProtobufSources(document: unknown, emitter: ProtobufSourceEmitter): Promise<ProtobufSourceEmitterResult & {source: unknown; diagnostics: unknown[]}>
}
export declare function createProtobufSourceExportEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ProtobufSourceExportEngine;
export declare function initializeProtobufSourceExportWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<ProtobufSourceExportEngine>;
export interface AvroFieldMetadata {dependencyId?: string; path: string; record: string; nativeField: unknown; element: {id: string; name: string; description?: string; scalarType?: 'boolean' | 'integer' | 'float' | 'binary' | 'string' | 'date' | 'time' | 'timestamp' | 'decimal'; extensions: Record<string, never>}}
export interface AvroFieldsEngine {deriveAvroFields(root: unknown, dependencies?: {id: string; root: unknown}[]): AvroFieldMetadata[]}
/** Create the opt-in bounded Avro field-metadata projection over WASM. */
export declare function createAvroFieldsEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): AvroFieldsEngine;
export declare const RECORD_TYPE_BINDING_PROFILE: 'umf.record-type-binding/1.0.0';
export declare function executeRecordTypeBindingWire(module: any, wireJson: string, controlDispatcher?: (amount: number) => string | undefined): string;
export declare function initializeAvroFieldsWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<AvroFieldsEngine>;
export interface IcebergSchemaValidation {
  valid: boolean;
  complete: boolean;
  diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[];
}
export interface IcebergSchemaEngine {
  /** Import standalone Iceberg schema JSON as a tagged UMF extension document. */
  importSchema(source: string, id: string): unknown;
  /** Export a validated schema without dropping unknown representation content. */
  exportSchema(document: unknown): string;
  /** Inspect the pinned standalone schema subset; completeness remains false. */
  inspect(document: unknown): IcebergSchemaValidation;
  /** Return a copied tagged native JSON node at an RFC 6901 pointer. */
  getNode(document: unknown, pointer: string): unknown;
  /** Return a validated candidate document; this does not commit or mutate input. */
  proposeNodeEdit(document: unknown, pointer: string, replacementJson: string): {document: unknown; validation: IcebergSchemaValidation};
}
export interface JsonSchemaResource {uri: string; source: string}
export type JsonSchemaNativeJson = {kind: 'null'} | {kind: 'boolean'; value: boolean} | {kind: 'string'; value: string} | {kind: 'number'; value: string} | {kind: 'array'; items: JsonSchemaNativeJson[]} | {kind: 'object'; members: Record<string, JsonSchemaNativeJson>};
export interface JsonSchemaValidation {valid: boolean; complete: boolean; diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[]}
export interface JsonSchemaEngine {
  importJsonSchema(source: string, options: {id: string; baseUri: string; resources?: Record<string, string>}): unknown;
  inspectJsonSchema(document: unknown): JsonSchemaValidation;
  exportJsonSchema(document: unknown): string;
  exportJsonSchemaResources(document: unknown): Record<string, string>;
  exportJsonSchemaBundle(document: unknown): {schema: string; resources: Record<string, string>; source: unknown; diagnostics: JsonSchemaValidation['diagnostics']};
  getJsonSchemaNode(document: unknown, pointer: string): unknown;
  walkJsonSchema(document: unknown): {pointer: string; node: unknown}[];
  parseNativeJson(source: string): JsonSchemaNativeJson;
  /** Parse bounded JSON-compatible YAML profiles; YAML 1.1 options cover only the separately qualified subset. */
  parseNativeYaml(source: string, options?: {version?: '1.1' | '1.2'; dateOnly?: 'string'; booleanLexicon?: 'pyyaml'}): JsonSchemaNativeJson;
  editJsonSchemaNode(document: unknown, pointer: string, replacement: string): unknown;
}
/** Create the opt-in standalone Iceberg schema JSON engine using embedded pinned resources. */
export declare function createIcebergSchemaEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): IcebergSchemaEngine;

export interface ArrowSchemaValidation {
  valid: boolean;
  complete: boolean;
  diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[];
}
export interface ArrowSchemaEngine {
  dispose(): void;
  importSchema(source: string, id: string): unknown;
  exportSchema(document: unknown): string;
  inspect(document: unknown): ArrowSchemaValidation;
  getNode(document: unknown, pointer: string): unknown;
  proposeNodeEdit(document: unknown, pointer: string, replacementJson: string): {document: unknown; validation: ArrowSchemaValidation};
}
/** Create the opt-in Arrow integration-schema JSON preservation engine; this does not activate a default route. */
export declare function createArrowSchemaEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; setupControls?: UmfCoreControls; controls?: UmfCoreControls}): ArrowSchemaEngine;

export interface ArrowIpcEngine {
  readonly profile: typeof ARROW_IPC_PROFILE;
  readonly capabilities: Readonly<{profile: typeof ARROW_IPC_PROFILE; maxBytes: 1_000_000; exactSource: true; complete: false}>;
  captureArrowIpc(bytes: Uint8Array, options: {id: string}): unknown;
  exportArrowIpcCapture(document: unknown): Uint8Array;
  inspectArrowIpcCapture(document: unknown): unknown;
}
export interface ParquetCaptureEngine {
  readonly profile: typeof PARQUET_CAPTURE_PROFILE;
  readonly capabilities: Readonly<{profile: typeof PARQUET_CAPTURE_PROFILE; maxBytes: 1_000_000; exactSource: true; complete: false}>;
  captureParquet(bytes: Uint8Array, options: {id: string}): unknown;
  importParquetSchema(bytes: Uint8Array, options: {id: string}): unknown;
  encodeParquetWire(value: unknown): Uint8Array;
  exportParquetCapture(document: unknown): Uint8Array;
  inspectParquetFraming(document: unknown): unknown;
  decodeParquetFooter(document: unknown): unknown;
  inspectParquetMetadata(document: unknown): unknown;
  inspectParquetSchema(document: unknown): unknown;
  inspectParquetPages(document: unknown): unknown;
  decodeParquetPageBodies(document: unknown): unknown;
  decodeParquetLevels(document: unknown): unknown;
  decodeParquetPhysical(document: unknown): unknown;
  inspectParquetLogicalTypes(document: unknown): unknown;
  inspectParquetContainers(document: unknown): unknown;
  getParquetFieldMetadata(document: unknown): unknown;
  appendParquetKeyValueMetadata(document: unknown, entries: unknown[]): unknown;
  renameParquetField(document: unknown, index: number, name: string): unknown;
}
export declare const ACCESS_RRF_PROFILE: 'umf-r8-access-rrf/0.1.0';
export interface AccessRrfRequest { constant: string; topK: number; keyCount: number; /** Identity indexes ordered by ascending complete key for tie breaking. */ keyOrder: number[]; legs: number[][] }
export interface AccessRrfResult { ordered: {identity: number; score: number}[] }
export interface AccessRrfEngine { readonly profile: typeof ACCESS_RRF_PROFILE; score(request: AccessRrfRequest): AccessRrfResult }
/** Create the opt-in pure RRF scorer; no default search route is changed. */
export declare function createAccessRrfEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): AccessRrfEngine;
/** Create the opt-in exact-source Arrow IPC capture engine; no default route is changed. */
export declare function createArrowIpcEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ArrowIpcEngine;
/** Create the opt-in bounded Parquet capture/inspection engine; no default route is changed. */
export declare function createParquetCaptureEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ParquetCaptureEngine;
export declare function createJsonSchemaEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): JsonSchemaEngine;
/** Private string-input staged import profile; the default route is unchanged. */
export declare const JSON_SCHEMA_STAGED_IMPORT_PROFILE: 'umf-r8-json-schema-staged-wasm-private/0.1.0';
export interface JsonSchemaStagedImportEngine extends Pick<JsonSchemaEngine, 'importJsonSchema'> {
  /** Private finite host-coercion profile; unsupported non-string inputs fail closed. */
  importJsonSchemaHostCoercion(source: unknown, options: {id: string; baseUri: string; resources?: Record<string, unknown>}): unknown;
}
export declare function createJsonSchemaStagedImportEngine(module: any): JsonSchemaStagedImportEngine;
export declare function createPreparedJsonSchemaEngine(module: any, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): JsonSchemaEngine;
export declare function initializeJsonSchemaWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<JsonSchemaEngine>;
/** Initialize the opt-in standalone Iceberg schema JSON engine in a browser. */
export declare function initializeIcebergSchemaWasm(loader?: () => Promise<any>, host?: typeof globalThis, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<IcebergSchemaEngine>;

export interface UmfCodegenResources extends UmfCoreResources {tablesPackage: unknown; actionsPackage: unknown; bindingPackage: unknown; stableBindingPackage: unknown}
export type UmfCodegenOperation = 'generatePythonClient' | 'compileTableDeployment' | 'verifyTableDeployment' | 'compileTableMigration' | 'verifyTableMigration' | 'discoverTableMigrationChanges' | 'normalizeRowScope' | 'generateAccessPackage' | 'diffAccessPackages';
export type UmfCodegenOutcome = {ok: true; result: unknown} | {ok: false; error: {code: string; message: string; path?: string; pointer?: string}};
export type UmfCodegenHostReadEventV3 = 'InitialPackage' | 'ParseText' | 'ParseFormat' | 'DigestText' | 'SelectRecords' | 'NativeFormat' | 'SelectActions' | 'OutputPackageSuffix' | 'OutputSourceText';
export interface UmfCodegenEngine {
  call(operation: UmfCodegenOperation, request: unknown): UmfCodegenOutcome;
  generatePythonClient(request: unknown): unknown;
  generatePythonClientWithHost(readHost: (event: UmfCodegenHostReadEventV3, argument?: string) => unknown): unknown;
  compileTableDeployment(request: unknown): unknown;
  verifyTableDeployment(bundle: unknown): unknown;
  compileTableMigration(request: unknown): unknown;
  verifyTableMigration(plan: unknown): unknown;
  discoverTableMigrationChanges(previous: unknown, next: unknown): unknown[];
  normalizeRowScope(input: unknown, context: unknown): unknown;
  generateAccessPackage(request: unknown, profile: unknown): unknown;
  diffAccessPackages(before: unknown, after: unknown): unknown;
}
export interface RetainedUmfCodegenEngine extends UmfCodegenEngine { dispose(): void; }
export declare function createCodegenEngine(module: any, resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCodegenEngine;
export declare function createRetainedCodegenEngine(module: any, resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; setupControls?: UmfCoreControls; controls?: UmfCoreControls}): RetainedUmfCodegenEngine;
export declare function initializeCodegenWasm(loader: (() => Promise<any>) | undefined, host: typeof globalThis | undefined, resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): Promise<UmfCodegenEngine>;

export interface UmfCorePackage { manifest: unknown; kinds?: boolean; semantics?: (payload: unknown, context: {document: unknown; path: string; scope: string}) => {code:string;path:string;message:string;severity:"error"|"warning"}[]; }
export type UmfCoreRegistration = UmfCoreExtension | UmfCorePackage;
