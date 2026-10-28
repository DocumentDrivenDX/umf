export declare class UmfCoreError extends Error { readonly code: string; readonly path: string }
export declare function isWireAdmissionError(error: unknown): boolean;
export declare function isNativeUmfCoreError(error: unknown): boolean;
export interface SemanticTypeReference { vocabulary: string; version: string; term: string; [key: string]: unknown }
export interface SemanticTypeCheck { status: 'valid'|'invalid'|'unknown'; complete: boolean; issues: string[] }
export type TrustedSemanticTypeValidator = (value: unknown, definition: Record<string, unknown>, context: {reportWork(units: number): void}) => SemanticTypeCheck;
export interface UmfSemanticTypeRegistry {
  register(reference: SemanticTypeReference, definition: Record<string, unknown>, validator?: TrustedSemanticTypeValidator): this;
  lookup(reference: SemanticTypeReference): Record<string, unknown>|undefined;
  check(reference: SemanticTypeReference, value: unknown): SemanticTypeCheck & {reference: SemanticTypeReference};
  validateCoreSemanticTypeValue(resources: UmfCoreResources, source: unknown, identity: {module: string; element: string}, value: unknown): unknown;
}
export declare function createSemanticTypeRegistry(options?: {profile?: 'cooperative'|'hard-isolated'; controls?: UmfCoreControls}): UmfSemanticTypeRegistry;
export interface DefaultSemanticTypeRegistry extends Omit<UmfSemanticTypeRegistry, 'register'> {
  register(reference: SemanticTypeReference, definition: Record<string, unknown>, validator?: (value: unknown, definition: Record<string, unknown>) => unknown): this;
}
export declare function createDefaultSemanticTypeRegistry(options?: {profile?: 'cooperative'|'hard-isolated'; controls?: UmfCoreControls}): DefaultSemanticTypeRegistry;
/** Semantic refusals from the opt-in JSON Schema adapter retain the TypeScript UmfError name. */
export declare class UmfError extends Error { readonly code: string; readonly path: string }
export declare function copyJson(value: unknown, limits?: {maxDepth?: number; maxValues?: number}): unknown;
/** Run artifactReferences/inspect over umf.core-wire/1. The pack must be structurally validated before this call. */
export declare function executeArtifactReferencesBindingWire(wireJson: string, controlDispatcher?: (work: number) => string): string;
export declare const engineVersion: string;
/** Rust-computed schema graph JSON with alias groups for Node V4 defaults. */
export declare function domainPackSchemaGraphJson(): string;
export declare function datasetSourceSchemaGraphJson(): string;
export declare function artifactCollectionSchemaGraphJson(): string;
export declare function domainPackLoaderSchemaGraphJson(): string;
/** Pure Rust CONTRACT-057 metadata inspection over JSON text admitted by the host wrapper. */
export declare function inspectDomainPackLoaderWire(inputJson: string): string;
/** Pure Rust CONTRACT-052/053 profile inspection over JSON text admitted by the host wrapper. */
export declare function inspectDomainPackProfileWire(inputJson: string): string;
export declare function projectSecSubmissionsUtf16Wire(input: Buffer, sourceId: Buffer): string;
export declare function projectSecCompanyFactsUtf16Wire(input: Buffer, sourceId: Buffer): string;
export declare function loaderInventorySchemaGraphJson(): string;
export declare const JAVASCRIPT_NUMERIC_PROFILE: 'umf.javascript-numeric/1.0.0';
export declare const BIT128_PROFILE: 'umf-128/1';
export declare const JSON_NUMBER_PROFILE: 'umf-json-number/0.1';
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
export declare function createBit128Engine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfBit128Engine;
export declare function isBit128EngineError(error: unknown): boolean;
export declare function isHostJsonResponseError(error: unknown): boolean;
export interface UmfJsonNumberEngine { assertExactJsonNumber(token: string): void }
export declare function createJsonNumberEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfJsonNumberEngine;
export type JavascriptNumericLiteral = {integerToken: string} | {decimalToken: string};
export interface JavascriptNumericContext { document: unknown; field: {module: string; element: string} }
export interface UmfJavascriptNumericEngine {
  exactDecimal(token: string, context?: JavascriptNumericContext): {decimalToken: string};
  integerFromBigInt(value: bigint, context?: JavascriptNumericContext): {integerToken: string};
  integerToBigInt(literal: {integerToken: string}, context?: JavascriptNumericContext): bigint;
  admitJavascriptNumber(value: number, scalarType: 'integer' | 'decimal', context?: JavascriptNumericContext): JavascriptNumericLiteral;
  numericToNumberLossless(literal: JavascriptNumericLiteral, context?: JavascriptNumericContext): number;
}
export declare function createJavascriptNumericEngine(resources?: UmfCoreResources, options?: {controls?: UmfCoreControls; setupControls?: UmfCoreControls}): UmfJavascriptNumericEngine;
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
export declare function createSecurityLogicEngine(options?: {controls?: UmfCoreControls}): UmfSecurityLogicEngine;
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
export declare function createSecurityQueryPropertiesEngine(): UmfSecurityQueryPropertiesEngine;
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
export declare function createSecurityProtectionParametersEngine(): UmfSecurityProtectionParametersEngine;
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
export declare function createSecurityFunctionsEngine(): UmfSecurityFunctionsEngine;
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
export declare function createSecurityProtectionSourceEngine(): UmfSecurityProtectionSourceEngine;
export declare const GREGORIAN_DATE_PROFILE: 'umf-gregorian-date/1.0.0';
export declare const RFC3339_EXACT_INSTANT_PROFILE: 'umf-rfc3339-exact-instant/1.0.0';
export declare const RFC3339_EXACT_INSTANT_MAXIMUM_BYTES: 1048576;
export type GregorianDateUnit = 'year' | 'quarter' | 'month' | 'day';
export interface GregorianDate { readonly profile: typeof GREGORIAN_DATE_PROFILE; readonly originalText: string; readonly year: number; readonly month: number; readonly day: number }
export interface Rfc3339ExactInstant { readonly profile: typeof RFC3339_EXACT_INSTANT_PROFILE; readonly originalText: string; readonly utcSeconds: string; readonly fractionalDigits: string; readonly originalOffset: string; readonly localOffsetKnown: boolean }
export interface UmfTemporalEngine {
  parseGregorianDate(token: string): GregorianDate;
  truncateGregorianDate(token: string, unit: string): string;
  parseRfc3339ExactInstant(token: string): Rfc3339ExactInstant;
  sameRfc3339ExactInstant(left: string, right: string): boolean;
}
export declare function createTemporalEngine(): UmfTemporalEngine;
export interface UmfCoreResources {
  coreSchema: unknown;
  referenceSchema: unknown;
  packageSchema: unknown;
  constraints: unknown;
  domainPolicy: unknown;
}
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
export interface UmfCoreExtension {
  id: string;
  version: string;
  scopes: string[];
  schema?: unknown;
  semantics?: (payload: unknown, context: {document: unknown; path: string; scope: string}) => {code: string; path: string; message: string; severity: 'error' | 'warning'}[];
}
export interface UmfCoreEngine {
  readonly engineVersion: string;
  listKinds(registry?: UmfCoreRegistration[]): unknown;
  getKind(reference: unknown, registry?: UmfCoreRegistration[]): unknown;
  inspectExtensionKinds(document: unknown, registry?: UmfCoreRegistration[]): unknown;
  validateDocument(document: unknown, registry?: UmfCoreRegistration[]): {valid: boolean; complete: boolean; diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[]};
  readDocument(source: string, format?: 'json' | 'yaml', registry?: UmfCoreRegistration[]): unknown;
  writeDocument(document: unknown, format?: 'json' | 'yaml', registry?: UmfCoreRegistration[]): string;
  readValue(source: string, format?: 'json' | 'yaml'): unknown;
  writeValue(value: unknown, format?: 'json' | 'yaml'): string;
  readJsonValue(source: string, format?: 'json' | 'yaml'): unknown;
  writeJsonValue(value: unknown, format?: 'json' | 'yaml'): string;
}
export interface UmfCoreValidation { valid: boolean; complete: boolean; diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[] }
export type UmfCoreDefaultInput = {state: 'missing'} | {state: 'present'; value: unknown};
export type UmfCoreDefaultState = {state: 'missing'} | {state: 'present'; value: unknown};
export interface UmfCoreDefaultResolution {
  operation: 'resolve-core-default';
  version: '2.0.0';
  source: unknown;
  identity: {module: string; element: string};
  input: UmfCoreDefaultInput;
  result: UmfCoreDefaultState;
  applied: boolean;
}
export declare function createEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreEngine;
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
export interface UmfCoreRecordTypeEngine {
  declareCoreRecordType(fieldAuthor: unknown, recordAuthor: unknown): unknown;
  verifyCoreRecordTypeDeclaration(receipt: unknown, current: unknown): unknown;
  prepareCoreRecordTypeVerification(receipt: unknown): object;
  finishCoreRecordTypeVerification(handle: object, current: unknown): unknown;
  discardCoreRecordTypeVerification(handle: object): void;
  dispose(): void;
}
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
export declare function createCoreDatasetValuesHostInputEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): CoreDatasetValuesHostInputEngine;
export type CoreKeyTupleValue = {boolean: boolean} | {integerToken: string} | {decimalToken: string} | {string: string} | {binaryHex: string} | {bits128Hex: string} | {uuid: string};
export interface CoreKeyTupleReceipt {operation: 'encode-core-key-tuple'; version: '4.0.0'; profile: 'umf-key-tuple-v1' | 'umf-key-tuple-v2'; source: unknown; identity: CoreKeyIdentity; values: CoreKeyTupleValue[]; keyPath: string; bytesHex: string}
export interface PreparedCoreKeyTuples {readonly profile: 'umf.core.key-tuples.prepared/1'; readonly source: unknown; encode(identity: CoreKeyIdentity, values: CoreKeyTupleValue[]): CoreKeyTupleReceipt; verify(receipt: CoreKeyTupleReceipt): CoreKeyTupleReceipt}
export declare function createCoreModelEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): UmfCoreEngine & UmfCoreModelEngine;
export declare function createCoreRecordTypeEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; setupControls?: UmfCoreControls}): UmfCoreRecordTypeEngine;
/** Create an opt-in retained Rust inspector with pinned resources and fresh per-call controls. */
export declare function createCoreRecordMembersEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; setupControls?: UmfCoreControls}): {
  inspectCoreRecordMembers(source: unknown, identity: {module: string; element: string}): unknown;
  dispose(): void;
};
/** @internal Default-root facade while Key tuple exports remain on TypeScript. */
export declare function createCoreModelRootEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): UmfCoreEngine & UmfCoreRootModelEngine;
export declare function createCoreModelRootKeyTupleEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): UmfCoreRootModelEngine & Pick<UmfCoreModelEngine, 'readCoreKeyTupleBytes' | 'prepareCoreKeyTuples'>;
/** Private opt-in shared retained Engine for model and Kind/Nullability operations. */
export declare function createCoreModelRootKindNullabilityEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): UmfCoreEngine & UmfCoreRootModelEngine & {
  inspectCoreElementKind(source: unknown, identity: unknown): unknown;
  declareCoreElementKind(source: unknown, identity: unknown, kind: unknown): unknown;
  verifyCoreKindDeclaration(receipt: unknown, current: unknown): unknown;
  inspectCoreNullability(source: unknown, identity: unknown): unknown;
  declareCoreNullability(source: unknown, identity: unknown, nullability: unknown): unknown;
  verifyCoreNullabilityDeclaration(receipt: unknown, current: unknown): unknown;
};
export declare function createCoreKeyTupleEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): Pick<UmfCoreModelEngine, 'encodeCoreKeyTuple' | 'verifyCoreKeyTuple' | 'readCoreKeyTupleBytes' | 'prepareCoreKeyTuples'>;
/** Create the opt-in Rust-owned umf.host-json/1 schema-property declaration route. */
export declare function createCoreSchemaPropertiesHostInputEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCoreEngine & UmfCoreModelEngine;
/** Create the private Rust-owned umf.host-json/1 Core Cardinality admission engine. */
export declare function createCoreCardinalityHostInputEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): {
  inspectCoreCardinality(source: unknown, identity: unknown): unknown;
  declareCoreCardinality(source: unknown, identity: unknown, request: unknown): unknown;
  verifyCoreCardinalityDeclaration(receipt: unknown, current: unknown): unknown;
};
/** Create the opt-in Rust-owned umf.host-json/1 logical Record-value admission route. */
export declare function createCoreRecordValuesHostInputEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): {validateCoreRecordValues(source: unknown, identity: unknown, values: unknown): unknown};
export declare function createCoreKindNullabilityHostInputEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): {
  inspectCoreElementKind(source: unknown, identity: unknown): unknown;
  declareCoreElementKind(source: unknown, identity: unknown, kind: unknown): unknown;
  verifyCoreKindDeclaration(receipt: unknown, current: unknown): unknown;
  inspectCoreNullability(source: unknown, identity: unknown): unknown;
  declareCoreNullability(source: unknown, identity: unknown, nullability: unknown): unknown;
  verifyCoreNullabilityDeclaration(receipt: unknown, current: unknown): unknown;
};
export declare const ICEBERG_SCHEMA_PROFILE: 'umf-r5-iceberg-schema/0.1.0';
export declare const ARROW_SCHEMA_PROFILE: 'umf-r8-arrow-schema/0.1.0';
export declare const ARROW_IPC_PROFILE: 'umf-r8-arrow-ipc/0.1.0';
export declare const PROTOBUF_INSPECT_PROFILE: 'umf-r5-protobuf-inspect/0.1.0';
export declare const PROTOBUF_DOCUMENT_PROFILE: 'umf-r8-protobuf-descriptor-document/0.1.0';
export declare const AVRO_FIELDS_PROFILE: 'umf-r5-avro-fields/0.1.0';
export declare const AVRO_INSPECT_PROFILE: 'umf-r5-avro-inspect/0.1.0';
export declare const AVRO_CANDIDATE_PROFILE: 'umf-r5-avro-candidate/0.1.0';
export declare const JSON_SCHEMA_PROFILE: 'umf-r5-json-schema/0.1.0';
export declare const DOCUMENT_COMPARISON_PROFILE: 'umf.schema-comparison/1';
export interface DocumentChange { path: string; status: 'created' | 'removed' | 'changed'; before?: unknown; after?: unknown }
export interface DocumentComparisonEngine { compareDocuments(before: unknown, after: unknown): DocumentChange[] }
export declare function createDocumentComparisonEngine(options: {snapshot: (value: unknown) => unknown; profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): DocumentComparisonEngine;
export interface ProtobufInspectDiagnostic {code: string; path: string; message: string; severity: 'error' | 'warning'}
export interface ProtobufInspectResult {valid: boolean; complete: boolean; diagnostics: ProtobufInspectDiagnostic[]}
export interface ProtobufInspector {/** Inspect a UMF document containing a tagged Protobuf descriptor extension. */ inspect(document: unknown): ProtobufInspectResult}
/** Create the opt-in bounded Rust Protobuf descriptor inspector. */
export declare function createProtobufInspector(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ProtobufInspector;
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
export declare function createProtobufDescriptorDocumentEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ProtobufDescriptorDocumentEngine;
export declare const PROTOBUF_SOURCE_IMPORT_PROFILE: 'umf-r8-protobuf-source-import/0.1.0';
export interface ProtobufSourceCompilerResult {descriptorSet: Uint8Array; compiler: string}
export interface ProtobufSourceCompiler {compile(request: {files: Record<string, string>; roots: string[]}): Promise<ProtobufSourceCompilerResult>}
export interface ProtobufSourceImportEngine {
  readonly callbackControl: 'boundary-only';
  importProtobufSources(input: {files: Record<string, string>; roots: string[]}, compiler: ProtobufSourceCompiler, options: {id: string}): Promise<unknown>;
}
export declare function createProtobufSourceImportEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ProtobufSourceImportEngine;
export interface ProtobufSourceEmitterResult {files: Record<string, string>; compiler: string; printer: string; [key: string]: unknown}
export interface ProtobufSourceEmitter {emit(descriptorSet: Uint8Array): Promise<ProtobufSourceEmitterResult>}
export interface ProtobufSourceExportEngine {
  readonly callbackControl: 'boundary-only';
  exportProtobufSources(document: unknown, emitter: ProtobufSourceEmitter): Promise<ProtobufSourceEmitterResult & {source: unknown; diagnostics: unknown[]}>
}
export declare function createProtobufSourceExportEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ProtobufSourceExportEngine;
export interface AvroFieldMetadata {dependencyId?: string; path: string; record: string; nativeField: unknown; element: {id: string; name: string; description?: string; scalarType?: 'boolean' | 'integer' | 'float' | 'binary' | 'string' | 'date' | 'time' | 'timestamp' | 'decimal'; extensions: Record<string, never>}}
export interface AvroFieldsEngine {deriveAvroFields(root: unknown, dependencies?: {id: string; root: unknown}[]): AvroFieldMetadata[]}
/** Create the opt-in bounded Avro field-metadata projection. */
export interface AvroInspectDiagnostic {code: string; path: string; message: string; severity: 'error' | 'warning'}
export interface AvroInspectResult {valid: boolean; complete: false; diagnostics: AvroInspectDiagnostic[]}
export interface AvroInspector {inspect(root: unknown, dependencies?: {id: string; root: unknown}[]): AvroInspectResult}
/** Create the opt-in incomplete Avro structural inspector. */
export declare function createAvroInspector(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): AvroInspector;
export declare function createAvroFieldsEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): AvroFieldsEngine;
export declare const RECORD_TYPE_BINDING_PROFILE: 'umf.record-type-binding/1.0.0';
export declare function executeRecordTypeBindingWire(wireJson: string, controlDispatcher?: (amount: number) => string | undefined): string;
export interface AvroCandidateAdmission {valid: boolean; complete: boolean; diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[]}
export interface AvroCandidateEditReport {
  profile: typeof AVRO_CANDIDATE_PROFILE;
  status: 'candidate';
  source: unknown;
  document: unknown;
  edit: {path: string; dependencyId?: string; replacement: unknown};
  admission: {source: AvroCandidateAdmission; candidate: AvroCandidateAdmission};
  nativeInspection: {source: AvroCandidateAdmission; candidate: AvroCandidateAdmission};
}
export interface AvroCandidateEditor {
  /** Propose a detached candidate; replacementJson is exact JSON text and is parsed only by Rust. */
  proposeNodeEdit(document: unknown, path: string, replacementJson: string, dependencyId?: string): AvroCandidateEditReport;
}
/** Create the opt-in Avro document candidate editor; this does not activate the default adapter. */
export declare function createAvroCandidateEditor(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): AvroCandidateEditor;
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
/** Create the opt-in standalone Iceberg schema JSON engine using embedded pinned resources. */
export declare function createIcebergSchemaEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): IcebergSchemaEngine;

export interface ArrowSchemaValidation {
  valid: boolean;
  complete: boolean;
  diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[];
}
export interface ArrowSchemaEngine {
  /** Dispose the prepared schema resources retained by this opt-in engine. */
  dispose(): void;
  /** Import exact Arrow integration-schema JSON into a tagged UMF document. */
  importSchema(source: string, id: string): unknown;
  /** Export schema JSON while preserving source number lexemes and unknown fields. */
  exportSchema(document: unknown): string;
  inspect(document: unknown): ArrowSchemaValidation;
  /** Return a copied tagged native JSON subtree at an RFC 6901 pointer. */
  getNode(document: unknown, pointer: string): unknown;
  /** Return a detached candidate document after validating a replacement JSON string. */
  proposeNodeEdit(document: unknown, pointer: string, replacementJson: string): {document: unknown; validation: ArrowSchemaValidation};
}
/** Create the opt-in Arrow integration-schema JSON preservation engine; this does not activate a default route. */
export declare function createArrowSchemaEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; setupControls?: UmfCoreControls; controls?: UmfCoreControls}): ArrowSchemaEngine;

export interface ArrowIpcEngine {
  readonly profile: typeof ARROW_IPC_PROFILE;
  readonly capabilities: Readonly<{profile: typeof ARROW_IPC_PROFILE; maxBytes: 1_000_000; exactSource: true; complete: false}>;
  /** Capture an exact copy of up to one million source bytes, including invalid or unsupported content. */
  captureArrowIpc(bytes: Uint8Array, options: {id: string}): unknown;
  /** Return an owned copy of the exact captured source bytes. */
  exportArrowIpcCapture(document: unknown): Uint8Array;
  /** Validate capture representation and report incomplete interpretation. */
  inspectArrowIpcCapture(document: unknown): unknown;
}
export declare const ACCESS_RRF_PROFILE: 'umf-r8-access-rrf/0.1.0';
export interface AccessRrfRequest { constant: string; topK: number; keyCount: number; /** Identity indexes ordered by ascending complete key for tie breaking. */ keyOrder: number[]; legs: number[][] }
export interface AccessRrfResult { ordered: {identity: number; score: number}[] }
export interface AccessRrfEngine { readonly profile: typeof ACCESS_RRF_PROFILE; score(request: AccessRrfRequest): AccessRrfResult }
/** Create the opt-in pure RRF scorer; no default search route is changed. */
export declare function createAccessRrfEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): AccessRrfEngine;
/** Create the opt-in exact-source Arrow IPC capture engine; no default route is changed. */
export declare function createArrowIpcEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ArrowIpcEngine;

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
/** Create the opt-in CONTRACT-002 Rust binding. */
export declare function createJsonSchemaEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): JsonSchemaEngine;
export declare function createPreparedJsonSchemaEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): JsonSchemaEngine;

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
export declare function createCodegenEngine(resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCodegenEngine;
export declare function createRetainedCodegenEngine(resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; setupControls?: UmfCoreControls; controls?: UmfCoreControls}): RetainedUmfCodegenEngine;

export interface UmfCorePackage { manifest: unknown; kinds?: boolean; semantics?: (payload: unknown, context: {document: unknown; path: string; scope: string}) => {code:string;path:string;message:string;severity:"error"|"warning"}[]; }
export type UmfCoreRegistration = UmfCoreExtension | UmfCorePackage;

/** Private opt-in staged Rust import profile; source parity is limited to string inputs and remains unqualified. */
export declare const JSON_SCHEMA_STAGED_IMPORT_PROFILE: 'umf-r8-json-schema-staged-node-private/0.1.0';
export interface JsonSchemaStagedImportSessionEngine {
  importJsonSchema(source: string, options: {id: string; baseUri: string; resources?: Record<string, string>}): unknown;
  /** Private finite host-coercion profile; unsupported non-string inputs fail closed. */
  importJsonSchemaHostCoercion(source: unknown, options: {id: string; baseUri: string; resources?: Record<string, unknown>}): unknown;
}
/** Create a private opt-in staged importer. The default JSON Schema route is unchanged. */
export declare function createJsonSchemaStagedImportSessionEngine(): JsonSchemaStagedImportSessionEngine;
