export declare class UmfCoreError extends Error { readonly code: string; readonly path: string }
export declare function isWireAdmissionError(error: unknown): boolean;
export declare function isNativeUmfCoreError(error: unknown): boolean;
export declare function isDbtHostError(error: unknown): boolean;
export declare function isCoreBit128FieldBindingError(error: unknown): boolean;
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
export interface Bit128NativeTypeInput { system: 'postgresql'|'sqlserver'|'avro'|'parquet'; version: string; definition: unknown }
export interface Bit128NativeTypeClassification { source: Bit128NativeTypeInput; scalarType?: 'uuid'|'bits128'; basis: 'native-type-identity'|'unclassified' }
export type UmfJson = null|boolean|number|string|UmfJson[]|{[key:string]:UmfJson};
export type Bit128ModelLiteral = null|{boolean:boolean}|{integerToken:string}|{decimalToken:string}|{string:string}|{binaryHex:string}|{floatToken:string}|{date:string}|{time:string}|{timestamp:string}|{bits128Hex:string}|{uuid:string}|{array:Bit128ModelLiteral[]}|{map:{[key:string]:Bit128ModelLiteral}}|{group:{field:{module:string;element:string};value:Bit128ModelLiteral}[]};
export interface Bit128RecordValue { field: {module:string;element:string}; value: Bit128ModelLiteral }
export interface Bit128ModelProjection { operation:'project-bit128-model'; version:'1.0.0'; source:unknown; binding:unknown; lossPolicy:'strict'|'report'; status:'projected'|'reported'|'blocked'; nativeRequirements:{scope:'connection';statements:string[]}[]; residuals:{path:string;reason:string}[]; mappings:{record:{module:string;element:string};table:string;fields:{identity:{module:string;element:string};slots:string[];paths:string[][]}[]}[]; compositeMappings?:{record:{module:string;element:string};root:{module:string;element:string};field:{module:string;element:string};column:string;storage:'json-column'|'native-nested';path:({kind:'member';name:string}|{kind:'array-item'}|{kind:'map-value'})[];slots:string[]}[]; candidate?:{format:'sql'|'avro'|'parquet'|'tablespec';text:string} }
export interface Bit128NativeProjection { operation:'project-bit128-carrier-schema'; version:'1.0.0'; source:unknown; binding:unknown; identity:{module:string;element:string}; policy:{lossPolicy:'strict'|'report';obligations:('bits'|'availability'|'equality'|'ordering'|'enforcement')[]}; outcomes:{obligation:'bits'|'availability'|'equality'|'ordering'|'enforcement';outcome:'exact'|'unknown'|'not-expressible';reason:string}[]; diagnostics:{code:string;path:string;message:string;severity:'error'|'warning'}[]; mapping:{idealPath:string;targetSlots:string[];bindingVersion:'0.3.0';target:{system:string;version:string;subset:string}}; status:'projected'|'reported'|'blocked'; candidate?:{format:'sql'|'avro'|'parquet'|'tablespec';text:string} }
export interface UmfBit128Engine {
  classifyNativeType(input: Bit128NativeTypeInput): Bit128NativeTypeClassification;
  inspectBit128Binding(binding: unknown, logical: unknown): unknown;
  encodeBit128CarrierValue(binding: unknown, logical: unknown, identity: unknown, literal: unknown): unknown;
  decodeBit128CarrierValue(binding: unknown, logical: unknown, identity: unknown, slots: unknown): unknown;
  encodeBit128Record(binding: unknown, logical: unknown, identity: {module:string;element:string}, values: Bit128RecordValue[]): Record<string,string|null>;
  decodeBit128Record(binding: unknown, logical: unknown, identity: {module:string;element:string}, slots: Record<string,string|null>): Bit128RecordValue[];
  projectBit128Model(binding: unknown, logical: unknown, lossPolicy: 'strict'|'report'): Bit128ModelProjection;
  recoverBit128ModelProjection(report: Bit128ModelProjection, text: string): {logical:unknown;binding:unknown};
  encodeBit128FileRecord(binding: unknown, logical: unknown, identity: {module:string;element:string}, values: Bit128RecordValue[]): Record<string,UmfJson>;
  decodeBit128FileRecord(binding: unknown, logical: unknown, identity: {module:string;element:string}, datum: Record<string,UmfJson>): Bit128RecordValue[];
  projectBit128CarrierSchema(binding: unknown, logical: unknown, identity: {module:string;element:string}, policy: unknown): Bit128NativeProjection;
  recoverBit128CarrierProjection(report: Bit128NativeProjection, text: string): {logical:unknown;binding:unknown};
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
  securityRefIdentity(ref: {documentId:string;moduleId:string;elementId:string}): string;
}
export declare function createSecurityLogicEngine(options?: {controls?: UmfCoreControls}): UmfSecurityLogicEngine;
export declare const SECURITY_FUNCTIONS_PROFILE: 'umf.security-functions/1';
export declare const SECURITY_PROTECTION_SOURCE_PROFILE: 'umf.security-protection-source/1';
export declare const SECURITY_POLICY_SOURCE_PROFILE: 'umf.security-policy-source/1';
export interface SecurityActionPurposeInspection { readonly status: 'resolved-purposes'|'refused'; readonly ontology: unknown; readonly documents: unknown; readonly purposes: readonly {readonly action:string; readonly purposes: readonly ('read'|'field'|'original-authorized'|'reverse'|'vault-write'|'other')[]}[]; readonly complete:false; readonly authority:false; readonly diagnostics: readonly {readonly code:string;readonly path:string;readonly message:string;readonly severity:'error'|'warning'}[] }
export interface ProtectionDeclarationInspection { readonly status:'declared-obligations'|'refused'; readonly complete:false; readonly authority:false; readonly policy:unknown; readonly catalog:unknown; readonly closure:unknown; readonly ontology:unknown; readonly purposes:SecurityActionPurposeInspection['purposes']; readonly obligations:readonly {readonly transform:{readonly id:string;readonly version:string};readonly kind:'hash-algorithm'|'salt-custody'|'dictionary-attack-warning'|'stored-custody'|'propagation'|'reverse-action'|'vault-write-action';readonly status:'unverified';readonly declaration:unknown}[]; readonly diagnostics:SecurityActionPurposeInspection['diagnostics'] }
export interface UmfSecurityPolicySourceEngine {
  inspectSecurityActionPurposes(ontology: unknown, documents: unknown): SecurityActionPurposeInspection;
  inspectProtectionObligations(policy: unknown, catalog: unknown, closure: unknown, ontology: unknown): ProtectionDeclarationInspection;
  validateSecurityDisclosure(batch: unknown, policy: unknown, resolution: unknown): unknown;
  encodeSecurityDisclosure(batch: unknown, policy: unknown, resolution: unknown): string;
  decodeSecurityDisclosure(source: string, policy: unknown, resolution: unknown): unknown;
  inspectSecurityDisclosureV2(source: unknown, policy: unknown, catalog: unknown, closure: unknown): unknown;
  encodeSecurityDisclosureV2(source: unknown, policy: unknown, catalog: unknown, closure: unknown, format?: 'json'|'yaml'): string;
  decodeSecurityDisclosureV2(source: string, policy: unknown, catalog: unknown, closure: unknown, format?: 'json'|'yaml'): unknown;
  inspectSecurityPolicy(source: unknown, resolution?: unknown): unknown;
  inspectSecurityPolicyPayload(payload: unknown, path: string): unknown;
  requireSecurityInterpretation(source: unknown, resolution: unknown): unknown;
  securityPolicyDependencies(source: unknown, resolution: unknown): unknown;
  securityIdentityTransportDependencies(source: unknown, resolution: unknown): unknown;
  evaluateSecurityAccess(policy: unknown, resolution: unknown, cut: unknown, request: unknown, resource: unknown): unknown;
  evaluateSecurityCollection(policy: unknown, resolution: unknown, cut: unknown, request: unknown): unknown;
  evaluateSecurityWrite(policy: unknown, resolution: unknown, writeProfile: unknown, request: unknown): unknown;
  evaluateSecurityPolicyV2LegacyAccess(source: unknown, resolution: unknown, cut: unknown, request: unknown, resource: unknown): unknown;
  inspectSecurityPolicyV2Source(source: unknown): unknown;
  upgradeSecurityPolicySource(source: unknown, revision: unknown): unknown;
  downgradeSecurityPolicySource(source: unknown, revision: unknown): unknown;
  readSecuritySource(source: string, format?: 'json' | 'yaml'): unknown;
  writeSecuritySource(value: unknown, format?: 'json' | 'yaml'): string;
}
export declare function createSecurityPolicySourceEngine(): UmfSecurityPolicySourceEngine;
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
export interface ProtectionCatalogInspection {
  readonly source: unknown;
  readonly valid: boolean;
  readonly complete: false;
  readonly diagnostics: readonly {readonly code:string; readonly path:string; readonly message:string; readonly severity:'error'|'warning'}[];
}
export interface UmfSecurityProtectionSourceEngine {
  resolveSecurityProtectionSources(policy: unknown, catalog: unknown): SecurityProtectionSourceResult;
  inspectProtectionCatalog(input: unknown): ProtectionCatalogInspection;
  requireProtectionInterpretation(input: unknown): never;
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
  importLakeviewDashboard(source: string, options: {id:string;title?:string;namespace?:string}): unknown;
  exportLakeviewDashboard(document: unknown): string;
  lakeviewDiagnostics(document: unknown): {code:string;path:string;message:string;severity:'error'|'warning'}[];
  validateExtensionPayload(id: string, version: string, payload: unknown, registry?: UmfCoreRegistration[]): unknown;
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
  prepareCoreInspection(source: unknown): {source: unknown; validation: UmfCoreValidation};
  coreInspectionView(source: unknown, identity: CoreRecordIdentity, view: 'keys'|'facets'|'schemaProperties'): unknown;
  editExtension(source: unknown, module: string, element: string, extension: string, update: (payload: unknown) => unknown, registry?: UmfCoreRegistration[]): unknown;
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
  selectCoreRelationships(source: unknown, query: unknown, registry?: UmfCoreRegistration[]): unknown;
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
  selectCoreElements(source: unknown, query: unknown, registry?: UmfCoreRegistration[]): unknown;
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
export declare function createCoreModelRootKindNullabilityEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls; resourceControls?: UmfCoreControls}): UmfCoreEngine & UmfCoreRootModelEngine & Pick<UmfCoreModelEngine, 'readCoreKeyTupleBytes' | 'prepareCoreKeyTuples'> & {
  inspectCoreElementKind(source: unknown, identity: unknown): unknown;
  declareCoreElementKind(source: unknown, identity: unknown, kind: unknown): unknown;
  verifyCoreKindDeclaration(receipt: unknown, current: unknown): unknown;
  inspectCoreNullability(source: unknown, identity: unknown): unknown;
  declareCoreNullability(source: unknown, identity: unknown, nullability: unknown): unknown;
  verifyCoreNullabilityDeclaration(receipt: unknown, current: unknown): unknown;
  getSemanticTypes(document: unknown, module: unknown, element: unknown): unknown;
  setSemanticTypes(document: unknown, module: unknown, element: unknown, annotation: unknown): unknown;
  inspectSemanticTypePayload(payload: unknown, path: string): unknown;
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
/** Opt-in only; authors bits128/uuid meaning on one singular Field in current core 0.10.0. */
export declare function createCoreBit128FieldEngine(resources: UmfCoreResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): {
  declareCoreBit128Field(source: unknown, identity: {module: string; element: string}, scalarType: 'bits128' | 'uuid'): unknown;
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
export declare const ICEBERG_TABLE_PROFILE: 'umf.iceberg-table-wire/1';
export declare const DELTA_SCHEMA_TABLE_PROFILE: 'umf-r8-delta-source/0.1.0';
export declare const DELTA_LOG_PROFILE: 'umf-r8-delta-log/0.1.0';
export declare function createDeltaSchemaTableEngine(options?: {profile?: 'cooperative'|'hard-isolated'; controls?: UmfCoreControls}): DeltaSchemaTableEngine;
export interface DeltaSchemaTableEngine {
  importSchema(source:string,id:string): any; inspectSchema(document:unknown):any; inspectSchemaPayload(payload:unknown):any; exportSchema(document:unknown):string; getSchemaNode(document:unknown,pointer:string):any; editSchemaNode(document:unknown,pointer:string,replacement:string):any;
  importTable(source:string,id:string):any; inspectTable(document:unknown):any; inspectTablePayload(payload:unknown):any; exportTable(document:unknown):string; getTableNode(document:unknown,pointer:string):any; getTableSchema(document:unknown):any; editTableNode(document:unknown,pointer:string,replacement:string):any; renameMappedField(document:unknown,options:unknown):any;
}
export declare function createDeltaLogEngine(options?: {profile?: 'cooperative'|'hard-isolated'; controls?: UmfCoreControls}): DeltaLogEngine;
export interface DeltaLogEngine {capture(source:string,id:string):any;export(document:unknown):string;inspect(document:unknown):any;inspectActions(document:unknown):any;reconcileCommits(commits:unknown[]):any;reconcileCheckpointSidecars(checkpoint:unknown,commits:unknown[],sidecars:unknown[]):any;}
export declare function createIcebergTableEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): IcebergTableEngine;
export interface IcebergTableEngine {
  importTable(source: string, id: string): any;
  inspect(document: unknown): any;
  inspectPayload(payload: unknown): any;
  exportTable(document: unknown): string;
  getNode(document: unknown, path: string): any;
  editNode(document: unknown, path: string, replacementJson: string): any;
  inspectContext(document: unknown): any;
  inspectTransforms(document: unknown): any;
  inspectTransformType(sourceType: string, transform: string): any;
  proposeRename(document: unknown, fieldId: number, newName: string, nextSchemaId: number): any;
  proposePromotion(document: unknown, fieldId: number, targetType: string, nextSchemaId: number): any;
}
export declare const ARROW_SCHEMA_PROFILE: 'umf-r8-arrow-schema/0.1.0';
export declare const ARROW_IPC_PROFILE: 'umf-r8-arrow-ipc/0.1.0';
export declare const PARQUET_CAPTURE_PROFILE: 'umf-r8-parquet-capture-inspection/0.1.0';
export declare const PROTOBUF_INSPECT_PROFILE: 'umf-r5-protobuf-inspect/0.1.0';
export declare const PROTOBUF_DOCUMENT_PROFILE: 'umf-r8-protobuf-descriptor-document/0.1.0';
export declare const AVRO_FIELDS_PROFILE: 'umf-r5-avro-fields/0.1.0';
export declare const AVRO_INSPECT_PROFILE: 'umf-r5-avro-inspect/0.1.0';
export declare const AVRO_DOCUMENT_INSPECT_PROFILE: 'umf-r5-avro-document-inspect/0.1.0';
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
  proposeProtobufDescriptorEdit(document: unknown, descriptorSet: unknown): {document: unknown; diagnostics: ProtobufInspectDiagnostic[]};
  exportProtobufDescriptorSet(document: unknown): Uint8Array;
  exportProtobufBundle(document: unknown): {descriptorSet: Uint8Array; source: unknown; diagnostics: ProtobufInspectDiagnostic[]};
  inspectProtobuf(document: unknown): ProtobufInspectResult;
  inspectProtobufPayload(payload: unknown): ProtobufInspectResult;
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
export interface AvroDocumentInspectResult {
  profile: typeof AVRO_DOCUMENT_INSPECT_PROFILE;
  admission: {valid: boolean; complete: boolean; diagnostics: AvroInspectDiagnostic[]};
  nativeInspection: {status: 'not-run'} | {status: 'inspected'; valid: boolean; complete: false; diagnostics: AvroInspectDiagnostic[]};
  payloadPath?: string;
}
export interface AvroDocumentInspector {inspect(document: unknown): AvroDocumentInspectResult}
/** Create the opt-in bounded Rust inspector for a whole UMF Avro document. */
export declare function createAvroDocumentInspector(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): AvroDocumentInspector;
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
  /** Inspect an Iceberg payload through the native package validator for Registry use. */
  inspectPayload(payload: unknown): {code: string; path: string; message: string; severity: 'error' | 'warning'}[];
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
  validatePayload(payload: unknown, document: unknown, path: string, scope: string): ArrowSchemaValidation['diagnostics'];
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
  prepareArrowIpcObservation(document: unknown): unknown;
  completeArrowIpcObservation(prepared: unknown, outcome: unknown): unknown;
  inspectArrowIpcLayout(document: unknown): unknown;
  inspectArrowIpcConsistency(document: unknown): unknown;
  exportArrowSchemaIpcNative(document: unknown): Uint8Array;
  prepareArrowSchemaIpc(document: unknown): unknown;
  completeArrowSchemaIpc(document: unknown, beforeJson: string, afterJson: string, bytesHex: string): unknown;
  prepareArrowIpcRename(document: unknown, request: unknown): unknown;
  prepareArrowIpcRenameFooter(document: unknown, request: unknown, schemaHex: string): unknown;
  completeArrowIpcRename(document: unknown, request: unknown, schemaHex: string, footerHex: string | null): unknown;
  renameArrowIpcFieldNative(document: unknown, request: unknown): unknown;
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
  getParquetArrowSchema(document: unknown): unknown;
  renameParquetFieldWithArrowSchema(document: unknown, policy: unknown): unknown;
  prepareRenameParquetFieldWithArrowSchema(document: unknown, policy: unknown): unknown;
  completeRenameParquetFieldWithArrowSchema(document: unknown, policy: unknown, flatbufferHex: string, backendError?: string): unknown;
  inspectParquetSchema(document: unknown): unknown;
  inspectParquetPages(document: unknown): unknown;
  decodeParquetPageBodies(document: unknown): unknown;
  decodeParquetLevels(document: unknown): unknown;
  decodeParquetPhysical(document: unknown): unknown;
  decodeParquetValues(document: unknown): unknown;
  assembleParquetRows(document: unknown): unknown;
  repairParquetDictionaryOffsets(document: unknown): unknown;
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
export declare function createAccessRrfEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): AccessRrfEngine;
export declare const ACCESS_TEMPORAL_PROFILE: 'umf-access-temporal/0.1.0';
export type AccessTemporalKind = 'date' | 'instant' | 'local';
interface AccessTemporalBase { readonly profile: typeof ACCESS_TEMPORAL_PROFILE; readonly originalText: string; readonly canonicalText: string }
export interface AccessDate extends AccessTemporalBase { readonly kind: 'date' }
export interface AccessLocal extends AccessTemporalBase { readonly kind: 'local'; readonly microsecond: number }
export interface AccessInstant extends AccessTemporalBase { readonly kind: 'instant'; readonly microsecond: number; readonly utcSeconds: string; readonly originalOffset: string }
export type AccessTemporal = AccessDate | AccessLocal | AccessInstant;
export interface AccessTemporalEngine { readonly profile: typeof ACCESS_TEMPORAL_PROFILE; parseAccessTemporal(kind: AccessTemporalKind, token: string): AccessTemporal }
/** Create the opt-in CONTRACT-075 temporal parser; no default route is changed. */
export declare function createAccessTemporalEngine(): AccessTemporalEngine;
/** Create the opt-in exact-source Arrow IPC capture engine; no default route is changed. */
export declare function createArrowIpcEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ArrowIpcEngine;
/** Create the opt-in bounded Parquet capture/inspection engine; no default route is changed. */
export declare function createParquetCaptureEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): ParquetCaptureEngine;

export interface JsonSchemaResource {uri: string; source: string}
export type JsonSchemaNativeJson = {kind: 'null'} | {kind: 'boolean'; value: boolean} | {kind: 'string'; value: string} | {kind: 'number'; value: string} | {kind: 'array'; items: JsonSchemaNativeJson[]} | {kind: 'object'; members: Record<string, JsonSchemaNativeJson>};
export interface JsonSchemaValidation {valid: boolean; complete: boolean; diagnostics: {code: string; path: string; message: string; severity: 'error' | 'warning'}[]}
export interface JsonSchemaEngine {
  importJsonSchema(source: string, options: {id: string; baseUri: string; resources?: Record<string, string>}): unknown;
  inspectJsonSchema(document: unknown): JsonSchemaValidation;
  inspectJsonSchemaPayload(payload: unknown, path: string): JsonSchemaValidation['diagnostics'];
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

export interface UmfCodegenResources extends UmfCoreResources {tablesPackage: unknown; actionsPackage: unknown; bindingPackage: unknown; stableBindingPackage: unknown; sagaPackage?: unknown}
export type UmfCodegenOperation = 'inspectActions' | 'declareAction' | 'editAction' | 'assessAction' | 'validateBulkOutcome' | 'compileActionRule' | 'admitActionDeclaration' | 'admitActionInputs' | 'selectActionIdentity' | 'actionFieldValueKey' | 'compileActionSelector' | 'evaluateActionRule' | 'inspectSagas' | 'declareSaga' | 'editSaga' | 'assessSaga' | 'generatePythonClient' | 'reviewedValueDigest' | 'inspectTableLifecycle' | 'inspectTableLifecyclePayload' | 'compileTableDeployment' | 'verifyTableDeployment' | 'compileTableMigration' | 'verifyTableMigration' | 'compileTableInventoryMigration' | 'discoverTableInventoryMigrationChanges' | 'verifyTableInventoryMigration' | 'serializeTableInventoryMigration' | 'irreversiblePurgeDisclosure' | 'discoverTableMigrationChanges' | 'normalizeRowScope' | 'prepareRowScope' | 'completeRowScope' | 'generateAccessPackage' | 'diffAccessPackages';
export type UmfCodegenOutcome = {ok: true; result: unknown} | {ok: false; error: {code: string; message: string; path?: string; pointer?: string}};
export type UmfCodegenHostReadEventV3 = 'InitialPackage' | 'ParseText' | 'ParseFormat' | 'DigestText' | 'SelectRecords' | 'NativeFormat' | 'SelectActions' | 'OutputPackageSuffix' | 'OutputSourceText';
export interface UmfCodegenEngine {
  inspectActions(source: unknown): unknown;
  declareAction(source: unknown, module: string, action: unknown): unknown;
  editAction(source: unknown, identity: unknown, replacement: unknown): unknown;
  assessAction(source: unknown, identity: unknown, profile: unknown): unknown;
  validateBulkOutcome(artifact: unknown): unknown;
  compileActionRule(document: unknown, action: unknown, rule: unknown, phase: string): unknown;
  admitActionDeclaration(document: unknown, action: unknown): unknown;
  admitActionInputs(document: unknown, action: unknown, inputs: unknown, outputs?: boolean): unknown;
  selectActionIdentity(document: unknown, action: unknown, frame: unknown, inputs: unknown): unknown;
  actionFieldValueKey(reference: unknown): string;
  compileActionSelector(document: unknown, action: unknown, frame: unknown): unknown;
  evaluateActionRule(document: unknown, action: unknown, rule: unknown, phase: string, state: unknown): boolean;
  call(operation: UmfCodegenOperation, request: unknown): UmfCodegenOutcome;
  sagaRegistryProfile(): {actionsPackage: unknown; sagaPackage: unknown};
  inspectSagas(source: unknown): unknown;
  declareSaga(source: unknown, module: string, definition: unknown): unknown;
  editSaga(source: unknown, identity: unknown, replacement: unknown): unknown;
  assessSaga(source: unknown, identity: unknown, capabilities: unknown): unknown;
  generatePythonClient(request: unknown): unknown;
  generatePythonClientWithHost(readHost: (event: UmfCodegenHostReadEventV3, argument?: string) => unknown): unknown;
  reviewedValueDigest(value: unknown): string;
  inspectTableLifecycle(source: unknown): unknown;
  inspectTableLifecyclePayload(payload: unknown, context: {document: unknown; path: string; scope: string}): unknown;
  compileTableDeployment(request: unknown): unknown;
  verifyTableDeployment(bundle: unknown): unknown;
  compileTableMigration(request: unknown): unknown;
  verifyTableMigration(plan: unknown): unknown;
  compileTableInventoryMigration(request: unknown): unknown;
  discoverTableInventoryMigrationChanges(previous: unknown, next: unknown, selector: unknown, history: unknown): unknown;
  verifyTableInventoryMigration(plan: unknown, history: unknown): unknown;
  serializeTableInventoryMigration(plan: unknown, history: unknown): string;
  irreversiblePurgeDisclosure(candidate: unknown): unknown;
  discoverTableMigrationChanges(previous: unknown, next: unknown, selector?: unknown): unknown[];
  normalizeRowScope(input: unknown, context: unknown): unknown;
  prepareRowScope(input: unknown, context: unknown): unknown;
  completeRowScope(input: unknown, context: unknown, prepared: unknown, admitPolicyDiagnostics: unknown): unknown;
  generateAccessPackage(request: unknown, profile: unknown): unknown;
  diffAccessPackages(before: unknown, after: unknown): unknown;
}
export interface RetainedUmfCodegenEngine extends UmfCodegenEngine { dispose(): void; }
export declare function createCodegenEngine(resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): UmfCodegenEngine;
export declare function createRetainedCodegenEngine(resources: UmfCodegenResources, options?: {profile?: 'cooperative' | 'hard-isolated'; setupControls?: UmfCoreControls; controls?: UmfCoreControls}): RetainedUmfCodegenEngine;

export interface UmfCorePackage { manifest: unknown; kinds?: boolean; nativeValidator?: string; semantics?: (payload: unknown, context: {document: unknown; path: string; scope: string}) => {code:string;path:string;message:string;severity:"error"|"warning"}[]; }
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

export declare const AVRO_CARDINALITY_BINDING_PROFILE: 'umf.avro-cardinality-binding/1.0.0';
export declare function executeAvroCardinalityBindingWire(wireJson: string, controlDispatcher?: (amount: number) => string | undefined): string;

export declare const DBT_PROFILE: 'umf-r9-dbt-preservation/0.1.0';
export interface DbtEngine {
 readonly profile: typeof DBT_PROFILE;
 readonly capabilities: Readonly<{profile: typeof DBT_PROFILE; nativeJson: true; complete: false}>;
 inspectPayload(token: 1 | 2 | 3, payload: unknown): unknown;
 importDbtManifest(text: string, options: {id: string}): unknown;
 exportDbtManifest(document: unknown): string;
 inspectDbtManifest(document: unknown): unknown;
 getDbtManifestNode(document: unknown, path: string): unknown;
 proposeDbtManifestNodeEdit(document: unknown, path: string, text: string): unknown;
 importDbtArtifact(text: string, options: {id: string}): unknown;
 exportDbtArtifact(document: unknown): string;
 inspectDbtArtifact(document: unknown): unknown;
 getDbtArtifactNode(document: unknown, path: string): unknown;
 proposeDbtArtifactNodeEdit(document: unknown, path: string, text: string): unknown;
 importDbtSemanticManifest(text: string, options: {id: string}): unknown;
 exportDbtSemanticManifest(document: unknown): string;
 inspectDbtSemanticManifest(document: unknown): unknown;
 getDbtSemanticManifestNode(document: unknown, path: string): unknown;
 proposeDbtSemanticManifestNodeEdit(document: unknown, path: string, text: string): unknown;
 inspectDbtManifestGraph(document: unknown): unknown;
 selectDbtManifestDependencies(document: unknown, options: {roots: string[]; includeMacros?: boolean; maxDepth?: number; maxNodes?: number}): unknown;
}
export declare function createDbtEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): DbtEngine;

export declare const RDF_PROFILE: 'umf-r9-rdf-preservation/0.1.0';
export interface RdfEngine {
 readonly profile: typeof RDF_PROFILE;
 readonly capabilities: Readonly<{profile: typeof RDF_PROFILE; rdf11: true; generalizedJson: true; complete: false}>;
  inspectRdfPayload(payload: unknown, family?: 'rdf' | 'generalized-rdf'): unknown[];
 inspectRdfDocument(document: unknown): unknown;
 importRdfNQuads(source: string, options: {id: string; blankNodeScope?: string}): unknown;
 getRdfQuads(document: unknown): unknown[];
 exportRdfNQuads(document: unknown, options?: {preserveSource?: boolean}): string;
 proposeRdfQuadEdit(document: unknown, index: number, replacement: unknown): unknown;
 proposeRdfIriRename(document: unknown, options: {from: string; to: string}): unknown;
 importRdfTurtle(source: string, options: {id: string; baseIRI: string; blankNodeScope?: string}): unknown;
 exportRdfTurtle(document: unknown): string;
 getRdfNamedGraphs(document: unknown): unknown[];
 importRdfTriG(source: string, options: {id: string; baseIRI: string; blankNodeScope?: string}): unknown;
 exportRdfTriG(document: unknown): string;
 proposeRdfDatasetMerge(documents: unknown[], options: {id: string; graphPolicy: 'union-by-name'; blankNodePolicy: 'disjoint-inputs'}): unknown;
 inspectGeneralizedRdfDocument(document: unknown): unknown;
 importGeneralizedRdfDataset(source: string, options: {id: string; blankNodeScope?: string}): unknown;
 exportGeneralizedRdfDataset(document: unknown): string;
 getGeneralizedRdfQuads(document: unknown): unknown[];
 proposeGeneralizedRdfQuadEdit(document: unknown, index: number, replacement: unknown): unknown;
}
export declare function createRdfEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): RdfEngine;

export declare const GRAPHQL_PROFILE: 'umf.graphql-wire/1';
export interface GraphqlEngine {
 readonly profile: typeof GRAPHQL_PROFILE;
 readonly capabilities: Readonly<{profile: typeof GRAPHQL_PROFILE; sdl: true; ast: true; callbackEdits: true; complete: false}>;
 importGraphqlSchema(source: string, options: {id: string; mode?: 'schema' | 'fragment'}): any;
 inspectGraphql(document: unknown): {valid: boolean; complete: boolean; diagnostics: any[]};
 exportGraphqlSchema(document: unknown): string;
 getGraphqlAst(document: unknown): any;
 editGraphqlAst(document: unknown, edit: (ast: any) => any): unknown;
 exportGraphqlBundle(document: unknown): {schema: string; source: any; diagnostics: any[]};
 inspectGraphqlPayload(payload: unknown): any[];
 projectGraphqlInputToJsonSchema(document: unknown, bindings: unknown): unknown;
}
export declare function createGraphqlEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): GraphqlEngine;

export declare const NATIVE_FAMILY_PROFILE: 'umf.native-family-dispatch/1';
export type NativeFamilyOperation = (fields?: Record<string, unknown>) => unknown;
export interface NativeFamilyOperations {
 readonly ['delta-log']: Readonly<Record<'capture'|'export'|'inspect'|'inspectActions'|'reconcileCommits'|'reconcileCheckpoint'|'reconcileCheckpointSidecars', NativeFamilyOperation>>;
 readonly ['core-ideal-reports']: Readonly<Record<'inspectFieldClassification'|'verifyFieldClassificationInspection'|'inspectFieldProjection'|'verifyFieldProjectionInspection'|'inspectRecordProjection'|'verifyRecordProjectionInspection'|'inspectStructuredClassification'|'verifyStructuredClassificationInspection', NativeFamilyOperation>>;
  readonly ['field-record-parquet-projection']: Readonly<Record<'projectFieldToParquet'|'recoverFieldFromParquet'|'projectRecordToParquet'|'recoverRecordFromParquet', NativeFamilyOperation>>;
 readonly ['binding-public']: Readonly<Record<'inspectBinding'|'getBinding'|'readBindingDocument'|'writeBindingDocument'|'projectBindingIndexes'|'migrateBindingRelationships'|'rollbackBindingRelationships'|'validateBindingSemantics'|'validateBit128Dataset', NativeFamilyOperation>>;
 readonly ['dashboard-public']: Readonly<Record<'inspectDashboard'|'readDashboardDocument'|'writeDashboardDocument'|'getDashboardDefinition'|'validateDashboardSemantics', NativeFamilyOperation>>;
 readonly ['medical-projection']: Readonly<Record<'projectMedicalFhir'|'projectCdcMortality'|'projectDicomMetadata'|'lookupMedicalTerminology', NativeFamilyOperation>>;
 readonly ['relationship-extra-projection']: Readonly<Record<'importRelationshipExtraArchive'|'prepareRelationshipToExtra'|'completeRelationshipToExtra'|'classifyRelationshipExtra'|'verifyRelationshipExtra'|'recoverRelationshipExtraIdeal'|'recoverRelationshipExtraNative', NativeFamilyOperation>>;
 readonly ['relationship-parquet-projection']: Readonly<Record<'projectRelationshipToParquet'|'verifyRelationshipParquetProjection'|'recoverRelationshipParquetIdeal'|'recoverRelationshipParquetNative', NativeFamilyOperation>>;
 readonly ['cardinality-sqlserver-projection']: Readonly<Record<'projectCardinalityToSqlServer'|'recoverCardinalityFromSqlServer', NativeFamilyOperation>>;
 readonly ['field-record-sqlserver-projection']: Readonly<Record<'projectFieldToSqlServer'|'recoverFieldFromSqlServer'|'projectRecordToSqlServer'|'recoverRecordFromSqlServer', NativeFamilyOperation>>;
 readonly ['field-record-avro-projection']: Readonly<Record<'projectFieldToAvro'|'recoverFieldFromAvro'|'projectRecordToAvro'|'recoverRecordFromAvro', NativeFamilyOperation>>;
 readonly ['avro-cardinality']: Readonly<Record<'projectCardinalityToAvro'|'recoverCardinalityFromAvro'|'classifyAvroCardinality'|'verifyAvroCardinalityClassification'|'recoverAvroCardinalityBundle', NativeFamilyOperation>>;
 readonly ['avro-classification']: Readonly<Record<'classifyAvroField'|'recoverAvroFieldBundle'|'classifyAvroRecord'|'recoverAvroRecordBundle'|'classifyAvroKeys'|'verifyAvroKeyClassification'|'recoverAvroKeySource'|'classifyAvroRelationships'|'verifyAvroRelationshipClassification'|'recoverAvroRelationshipSource'|'classifyAvroNullability'|'verifyAvroNullabilityClassification'|'recoverAvroNullabilityBundle'|'classifyAvroFacets'|'verifyAvroFacetClassification'|'recoverAvroFacetSource', NativeFamilyOperation>>;
 readonly ['record-type']: Readonly<Record<'recoverKeysParquetIdeal'|'verifyKeysParquetProjection'|'projectKeysToParquet'|'recoverFacetsFromParquet'|'projectFacetsToParquet'|'recoverNullabilityFromParquet'|'projectNullabilityToParquet'|'recoverCardinalityFromParquet'|'projectCardinalityToParquet'|'classifyAvroRecordType'|'recoverAvroRecordTypeBundle'|'classifyParquetRecordType'|'recoverParquetRecordTypeBytes'|'classifyParquetRecord'|'recoverParquetRecordBytes'|'classifyParquetRelationships'|'verifyParquetRelationshipClassification'|'recoverParquetRelationshipSource'|'classifyParquetNullability'|'verifyParquetNullabilityClassification'|'recoverParquetNullabilityBytes'|'classifyParquetField'|'verifyParquetFieldClassification'|'recoverParquetFieldBytes'|'classifyParquetKeys'|'verifyParquetKeyClassification'|'recoverParquetKeySource'|'classifyParquetCardinality'|'verifyParquetCardinalityClassification'|'recoverParquetCardinalityBytes'|'classifyParquetFacets'|'verifyParquetFacetClassification'|'recoverParquetFacetSource', NativeFamilyOperation>>;
 readonly ['nullability-avro-projection']: Readonly<Record<'projectNullabilityToAvro'|'recoverNullabilityFromAvro', NativeFamilyOperation>>;
 readonly ['nullability-sqlserver-projection']: Readonly<Record<'projectNullabilityToSqlServer'|'recoverNullabilityFromSqlServer', NativeFamilyOperation>>;
 readonly ['facets-avro-projection']: Readonly<Record<'projectFacetsToAvro'|'recoverFacetsFromAvro', NativeFamilyOperation>>;
 readonly ['facets-sqlserver-projection']: Readonly<Record<'projectFacetsToSqlServer'|'recoverFacetsFromSqlServer', NativeFamilyOperation>>;
 readonly ['key-avro-projection']: Readonly<Record<'projectKeysToAvro'|'verifyKeysAvroProjection'|'recoverKeysAvroIdeal', NativeFamilyOperation>>;
 readonly ['key-sqlserver-projection']: Readonly<Record<'projectKeysToSqlServer'|'verifyKeysSqlServerProjection'|'recoverKeysSqlServerIdeal', NativeFamilyOperation>>;
 readonly ['avro-relationship-projection']: Readonly<Record<'projectRelationshipToAvro'|'verifyRelationshipAvroProjection'|'recoverRelationshipAvroIdeal'|'recoverRelationshipAvroNative', NativeFamilyOperation>>;
 readonly ['relationship-sqlserver-projection']: Readonly<Record<'projectRelationshipToSqlServer'|'verifyRelationshipSqlServerProjection'|'recoverRelationshipSqlServerIdeal'|'recoverRelationshipSqlServerBinding'|'recoverRelationshipSqlServerNative', NativeFamilyOperation>>;
 readonly ['relationship-postgresql-projection']: Readonly<Record<'prepareProjectRelationshipsToPostgresql'|'completeProjectRelationshipsToPostgresql'|'blockProjectRelationshipsToPostgresql'|'verifyRelationshipsPostgresqlProjection'|'recoverRelationshipsPostgresqlIdeal'|'recoverRelationshipsPostgresqlNative', NativeFamilyOperation>>;
 readonly ['tablespec-relationship-projection']: Readonly<Record<'projectRelationshipToTableSpec'|'verifyRelationshipTableSpecProjection'|'recoverRelationshipTableSpecIdeal'|'recoverRelationshipTableSpecNativeSources', NativeFamilyOperation>>;
 readonly ['tablespec-via-avro-projection']: Readonly<Record<'projectToTableSpecViaAvro', NativeFamilyOperation>>;
 readonly ['parquet-avro-projection']: Readonly<Record<'projectParquetToAvro', NativeFamilyOperation>>;
 readonly ['arrow-spark-projection']: Readonly<Record<'projectArrowToSpark'|'projectSparkToArrow', NativeFamilyOperation>>;
 readonly ['arrow-flatbuffer-model']: Readonly<Record<'importArrowFlatbufferModel'|'inspectArrowFlatbufferModel'|'exportArrowFlatbufferModel'|'proposeArrowFlatbufferEdit'|'decodeArrowFlatbuffer'|'prepareArrowFlatbufferEncoding'|'verifyArrowFlatbufferEncoding'|'encodeArrowFlatbufferNative', NativeFamilyOperation>>;
 readonly ['avro-tablespec-projection']: Readonly<Record<'projectAvroToTableSpec'|'projectTableSpecToAvro', NativeFamilyOperation>>;
 readonly ['postgresql-avro-projection']: Readonly<Record<'projectPostgresqlToAvro', NativeFamilyOperation>>;
 readonly ['postgresql-json-schema-projection']: Readonly<Record<'projectPostgresqlRowToJsonSchema', NativeFamilyOperation>>;
 readonly ['json-schema-protobuf-projection']: Readonly<Record<'projectJsonSchemaToProtobuf', NativeFamilyOperation>>;
 readonly ['sqlserver-avro-projection']: Readonly<Record<'projectSqlServerToAvro', NativeFamilyOperation>>;
 readonly ['sqlserver-ddl-projection']: Readonly<Record<'projectSqlServerToDdl', NativeFamilyOperation>>;
 readonly ['binding-iceberg-projection']: Readonly<Record<'projectBindingToIceberg', NativeFamilyOperation>>;
 readonly ['binding-sqlserver-planned-index-projection']: Readonly<Record<'projectBindingIndexesAgainstSqlServerPlan', NativeFamilyOperation>>;
 readonly ['binding-index-projection']: Readonly<Record<'projectBindingIndexesToSqlServer'|'prepareBindingIndexesToPostgresql'|'completeBindingIndexesToPostgresql', NativeFamilyOperation>>;
 readonly ['binding-parquet-projection']: Readonly<Record<'projectBindingToParquet', NativeFamilyOperation>>;
 readonly ['binding-delta-projection']: Readonly<Record<'projectBindingToDelta', NativeFamilyOperation>>;
 readonly ['binding-sqlserver-tables']: Readonly<Record<'projectBindingTablesToSqlServer' | 'projectBindingTablesAndIndexesFromPlanToSqlServer' | 'projectBindingTablesAndIndexesToSqlServer', NativeFamilyOperation>>;
 readonly ['binding-sqlserver-physical']: Readonly<Record<'projectBindingToSqlServer' | 'verifyBindingSqlServerProjection' | 'recoverBindingSqlServerSources' | 'recoverBindingSqlServerNative', NativeFamilyOperation>>;
 readonly avro: Readonly<Record<'import'|'inspect'|'inspectPayload'|'fields'|'export'|'exportBundle'|'getNode'|'editNode'|'proposeNodeEdit', NativeFamilyOperation>>;
 readonly ['avro-json-schema-projection']: Readonly<Record<'projectAvroToJsonSchema', NativeFamilyOperation>>;
 readonly ['ddd-json-schema-projection']: Readonly<Record<'projectDddToJsonSchema'|'dddFieldBinding'|'inspectDdd'|'validateDddPayload'|'getDddDefinition'|'editDddDefinition'|'projectDddEntitiesToGraphql'|'projectDddToGraphql'|'verifyDddGraphqlProjection'|'recoverDddFromGraphql'|'recoverDddGraphqlNative'|'validateSqlServerRelationshipLayout'|'validatePostgresqlRelationshipLayout'|'prepareDddPostgresqlProjection'|'completeDddPostgresqlProjection'|'verifyDddPostgresqlProjection'|'recoverDddPostgresqlIdeal'|'recoverDddPostgresqlNative'|'blockDddPostgresqlProjection'|'prepareDddPostgresqlTables'|'completeDddPostgresqlTables'|'blockDddPostgresqlTables'|'prepareDddPostgresqlTablesAndIndexes'|'completeDddPostgresqlTablesAndIndexes'|'prepareDddPostgresqlTablesAndIndexesCombined', NativeFamilyOperation>>;
 readonly ['openapi-json-schema-projection']: Readonly<Record<'projectOpenapiToJsonSchema', NativeFamilyOperation>>;
 readonly ['typespec-smithy-jsonschema-projection']: Readonly<Record<'prepareTypeSpecJsonSchema'|'completeTypeSpecJsonSchema'|'prepareSmithyJsonSchema'|'completeSmithyJsonSchema', NativeFamilyOperation>>;
 readonly openapi: Readonly<Record<'import'|'validate'|'inspectPayload'|'export'|'exportBundle'|'getNode'|'lookupResource'|'extractSchema'|'indexSchemas'|'resolveSchemaReference'|'resolveDynamicReference'|'resolveObjectReference'|'edit', NativeFamilyOperation>>;
 readonly linkml: Readonly<Record<'import'|'inspect'|'inspectPayload'|'export'|'getNode'|'editNode'|'classSlots'|'slotValues'|'importContext'|'importMerge', NativeFamilyOperation>>;
 readonly odcs: Readonly<Record<'import'|'inspect'|'inspectPayload'|'export'|'getNode'|'editNode'|'resolveReference'|'relationships'|'renameElement', NativeFamilyOperation>>;
 readonly tablespec: Readonly<Record<'projectKeysToTableSpec'|'verifyKeysTableSpecProjection'|'recoverKeysTableSpecIdeal'|'projectFacetsToTableSpec'|'recoverFacetsFromTableSpec'|'importTableSpec'|'inspectTableSpec'|'exportTableSpec'|'getTableSpecTable'|'getTableSpecColumn'|'editTableSpecTable'|'editTableSpecColumn'|'importTableSpecBundle'|'exportTableSpecBundle'|'classifyTableSpecField'|'verifyTableSpecFieldClassification'|'projectFieldToTableSpec'|'recoverFieldFromTableSpec'|'classifyTableSpecRecord'|'verifyTableSpecRecordClassification'|'projectRecordToTableSpec'|'recoverRecordFromTableSpec'|'projectCardinalityToTableSpec'|'recoverCardinalityFromTableSpec'|'projectNullabilityToTableSpec'|'recoverNullabilityFromTableSpec'|'classifyTableSpecCardinality'|'verifyTableSpecCardinalityClassification'|'recoverTableSpecCardinalitySource'|'classifyTableSpecNullability'|'verifyTableSpecNullabilityClassification'|'recoverTableSpecNullabilitySource'|'classifyTableSpecKeys'|'verifyTableSpecKeyClassification'|'recoverTableSpecKeySource'|'classifyTableSpecFacets'|'verifyTableSpecFacetClassification'|'recoverTableSpecFacetSource'|'classifyTableSpecRelationships'|'verifyTableSpecRelationshipClassification'|'recoverTableSpecRelationshipSource', NativeFamilyOperation>>;
 readonly jsonld: Readonly<Record<'import'|'inspectPayload'|'validate'|'export'|'getNode'|'editNode'|'expand'|'flatten'|'compact'|'toRdf'|'fromRdf'|'fromGeneralizedRdf'|'frame', NativeFamilyOperation>>;
 readonly postgresql: Readonly<Record<'prepareFacetsProjection'|'completeFacetsProjection'|'prepareFacetsRecovery'|'verifyFacetsProjection'|'recoverFacetsProjection'|'projectFacetsWithNativeBackend'|'recoverFacetsWithNativeBackend'|'import'|'inspect'|'inspectPayload'|'export'|'columns'|'getNode'|'findRelation'|'edit'|'proposeCatalogEdit'|'reconstruction'|'dependencies'|'facetCatalog'|'cardinalityCatalog'|'cardinalityType'|'cardinalityCorrelate'|'keyCatalog'|'prepareKeyCorrelation'|'keyCorrelate'|'facetCorrelate'|'classifyComposite'|'verifyCompositeClassification'|'recoverCompositeCapture'|'getDdlDeclarations'|'prepareDdlParserRequest'|'classifyDdlRecord'|'verifyDdlKinds'|'recoverDdlKinds'|'prepareFieldProjection'|'completeFieldProjection'|'recoverFieldProjection'|'prepareRecordProjection'|'completeRecordProjection'|'recoverRecordProjection'|'prepareFieldRecovery'|'prepareCardinalityProjection'|'completeCardinalityProjection'|'prepareCardinalityRecovery'|'recoverCardinalityProjection'|'projectFieldWithNativeBackend'|'recoverFieldWithNativeBackend'|'projectRecordWithNativeBackend'|'recoverRecordWithNativeBackend'|'projectCardinalityWithNativeBackend'|'recoverCardinalityWithNativeBackend'|'prepareNullabilityProjection'|'completeNullabilityProjection'|'prepareNullabilityRecovery'|'recoverNullabilityProjection'|'prepareKeysProjection'|'completeKeysProjection'|'prepareKeysRecovery'|'verifyKeysProjection'|'recoverKeysProjection'|'projectKeysWithNativeBackend'|'recoverKeysWithNativeBackend'|'projectNullabilityWithNativeBackend'|'recoverNullabilityWithNativeBackend'|'prepareRecordRecovery'|'classifyField'|'verifyFieldClassification'|'recoverFieldCapture'|'classifyRecord'|'verifyRecordClassification'|'recoverRecordCapture'|'classifyCardinality'|'verifyCardinalityClassification'|'recoverCardinalitySource'|'classifyNullability'|'verifyNullabilityClassification'|'recoverNullabilitySource'|'prepareKeyParserRequests'|'classifyKeys'|'verifyKeyClassification'|'recoverKeySource'|'prepareFacetParserRequests'|'classifyFacets'|'verifyFacetClassification'|'recoverFacetSource'|'prepareRelationshipParserRequests'|'classifyRelationships'|'verifyRelationshipClassification'|'recoverRelationshipSource', NativeFamilyOperation>>;
 readonly sqlserver: Readonly<Record<'import'|'inspect'|'inspectPayload'|'export'|'columns'|'constraints'|'indexes'|'edit'|'facetType'|'facetPredicate'|'facetConstraints'|'classifyField'|'verifyFieldClassification'|'recoverFieldCapture'|'classifyRecord'|'verifyRecordClassification'|'recoverRecordCapture'|'classifyCardinality'|'verifyCardinalityClassification'|'recoverCardinalitySource'|'classifyNullability'|'verifyNullabilityClassification'|'recoverNullabilitySource'|'classifyKeys'|'verifyKeyClassification'|'recoverKeySource'|'classifyRelationships'|'verifyRelationshipClassification'|'recoverRelationshipSource'|'classifyFacets'|'verifyFacetClassification'|'recoverFacetSource', NativeFamilyOperation>>;
 readonly shacl: Readonly<Record<'import'|'inspect'|'inspectPayload'|'export'|'getQuads'|'editQuad'|'getPropertyPath'|'evaluatePropertyPath'|'getTargetNodes'|'getShapeMetadata'|'validate', NativeFamilyOperation>>;
 readonly owl: Readonly<Record<'import'|'inspect'|'inspectPayload'|'export'|'getQuads'|'editQuad'|'getOntologyHeaders'|'getExpressionView'|'getListAxioms'|'getSpecialAxioms'|'getAxiomAnnotations'|'getDeclarations', NativeFamilyOperation>>;
 readonly ['delta-ddl']: Readonly<Record<'defineTable'|'generate'|'generateBundle'|'realizeSparkDelta4'|'inspectPayload', NativeFamilyOperation>>;
 readonly ['delta-parquet']: Readonly<Record<'projectActions'|'reconcileCheckpoint'|'reconcileMultipart', NativeFamilyOperation>>;
 readonly spark: Readonly<Record<'import'|'inspect'|'inspectPayload'|'export'|'getNode'|'editNode'|'renameField', NativeFamilyOperation>>;
}
export declare function createNativeFamilyDispatcher(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): NativeFamilyOperations;
export type PostgresqlParserRequest = {token: string; backend: '@libpg-query/parser@17.6.10'; astVersion: 170004; work: 'parse'|'deparse'|'codecRoundTrip'; sql?: string; tree?: unknown};
export type PostgresqlParserResponse = {kind:'parsed';tree:unknown}|{kind:'deparsed';sql:string}|{kind:'codecRoundTripped';tree:unknown};
export interface PostgresqlParserSessionEngine {
  prepareImport(input:{source:string;id:string}):PostgresqlParserRequest;
  cancel(input:{token:string}):boolean;
  completeImport(input:{token:string;tree:unknown}):{done:true;document:unknown};
  prepareExport(input:{document:unknown}):PostgresqlParserRequest;
  completeExport(input:{token:string;response:PostgresqlParserResponse}):{done:false;request:PostgresqlParserRequest}|{done:true;sql:string};
  editNode(input:{document:unknown;pointer:string;text:string}):unknown;
  inspect(input:{document:unknown}):unknown; getSource(input:{document:unknown}):string;
  getNode(input:{document:unknown;pointer:string}):unknown; inspectPayload(input:{payload:unknown}):unknown[];
  validateAst(input:{ast:unknown}):unknown;
}
export declare const POSTGRESQL_PARSER_PROFILE:'umf.postgresql-parser-wire/1';
export declare function createPostgresqlParserSessionEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): PostgresqlParserSessionEngine;
export interface PostgresqlSqlEngine {
  importSql(source: string, id: string): unknown;
  inspect(document: unknown): unknown;
  exportSql(document: unknown): string;
  getSource(document: unknown): string;
  getNode(document: unknown, pointer: string): unknown;
  editNode(document: unknown, pointer: string, text: string): unknown;
  inspectPayload(payload: unknown): readonly unknown[];
  validateAst(ast: unknown): unknown;
}
/** Requires the Node addon to be built with `native-postgresql`. */
export declare function createPostgresqlSqlEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): PostgresqlSqlEngine;
export declare const JSONLD_PROFILE: 'umf.jsonld-wire/1';
export interface JsonLdOperations {
 readonly profile: typeof JSONLD_PROFILE;
 readonly capabilities: Readonly<{profile: typeof JSONLD_PROFILE; source: true; transformations: true; complete: false}>;
 importJsonLdDocument(source: string, options: Record<string, unknown>): unknown;
 inspectJsonLdDocument(document: unknown): unknown;
 exportJsonLdDocument(document: unknown): string;
 getJsonLdNode(document: unknown, path: string): unknown;
 proposeJsonLdNodeEdit(document: unknown, path: string, replacementJson: string): unknown;
 proposeJsonLdExpansion(document: unknown, options: Record<string, unknown>): Promise<unknown>;
 proposeJsonLdFlatten(document: unknown, options: Record<string, unknown>): Promise<unknown>;
 proposeJsonLdCompaction(document: unknown, options: Record<string, unknown>): Promise<unknown>;
 proposeJsonLdFraming(document: unknown, options: Record<string, unknown>): Promise<unknown>;
 proposeJsonLdToRdf(document: unknown, options: Record<string, unknown>): Promise<unknown>;
 proposeRdfToJsonLd(document: unknown, options: Record<string, unknown>): Promise<unknown>;
 proposeGeneralizedRdfToJsonLd(document: unknown, options: Record<string, unknown>): Promise<unknown>;
}
export declare function createJsonLdEngine(options?: {profile?: 'cooperative' | 'hard-isolated'; controls?: UmfCoreControls}): JsonLdOperations;

export declare const TYPESPEC_SESSION_PROFILE:'umf.typespec-source-wire/1';
export interface TypeSpecSessionOperations {
 inspectTypeSpec(document:unknown):unknown; importTypeSpecSources(input:unknown,options:unknown):unknown;
 exportTypeSpecSources(document:unknown):unknown; proposeTypeSpecSourceEdit(document:unknown,path:string,text:string):unknown;
 getTypeSpecSyntax(document:unknown,path:string):unknown; inspectTypeSpecPayload(payload:unknown):unknown;
 compileTypeSpecDocument(document:unknown):Promise<unknown>; getTypeSpecSemanticGraph(document:unknown,input:unknown):Promise<unknown>;
 emitTypeSpecJsonSchema(document:unknown,input:unknown):Promise<unknown>;
}
export declare function createTypeSpecSessionEngine(options:{executeCompilerRequest:(request:never)=>Promise<unknown>;executeParserRequest:(request:never)=>unknown;profile?:'cooperative'|'hard-isolated';controls?:UmfCoreControls}):TypeSpecSessionOperations;

export declare const SMITHY_SESSION_PROFILE: 'umf.smithy-native-wire/1';
export interface SmithySessionOperations {
 inspect(fields:{document:unknown}):unknown; inspectPayload(fields:{payload:unknown}):unknown[];
 importJson(fields:{source:string;id:string;dependencies?:{id:string;schema:string}[]}):unknown; importSources(fields:{files:Record<string,string>;id:string}):unknown;
 exportJson(fields:{document:unknown}):string; exportSources(fields:{document:unknown}):unknown; exportBundle(fields:{document:unknown}):unknown;
 getNode(fields:{document:unknown;path:string;dependencyId?:string}):unknown; editNode(fields:{document:unknown;path:string;replacement:string;dependencyId?:string}):unknown; editSource(fields:{document:unknown;path:string;source:string}):unknown;
 assembleSmithyDocument(document:unknown,backend:unknown,options:{id:string;signal?:AbortSignal}):Promise<unknown>; selectSmithyShapes(document:unknown,backend:unknown,selector:string,options:{id:string;signal?:AbortSignal}):Promise<unknown>;
}
export declare function createSmithySessionEngine(options?:{profile?:'cooperative'|'hard-isolated';controls?:UmfCoreControls}):SmithySessionOperations;

export declare function createActionPlanSessionEngine(options?: {controls?: UmfCoreControls}): {
  run(operation: 'prepareModel'|'prepareInspect'|'prepareAssess'|'completeRegistry'|'completeSelection'|'cancel'|'inspectManifest'|'constructManifest'|'assessManifest', fields?: Record<string, unknown>): unknown;
};
export interface SecurityProtectionDomainsResult {
  readonly status: 'resolved-domains' | 'refused'; readonly complete: false; readonly authority: false;
  readonly policy: unknown; readonly catalog: unknown; readonly closure: unknown;
  readonly domains: readonly unknown[]; readonly diagnostics: readonly {readonly code:string;readonly path:string;readonly message:string;readonly severity:'error'|'warning'}[];
}
export interface UmfSecurityProtectionDomainsEngine { resolveSecurityProtectionDomains(policy:unknown,catalog:unknown,closure:unknown):SecurityProtectionDomainsResult; }
export declare function createSecurityProtectionDomainsEngine(): UmfSecurityProtectionDomainsEngine;

export interface SecurityReadRegistrationSession {
  registerSecurityRead(policy: unknown, resolution: unknown): number;
  evaluateSecurityRead(handle: number, cut: unknown, request: unknown): unknown;
}
export interface SecurityReadRegistrationEngine { createSession(): SecurityReadRegistrationSession; }
export declare function createSecurityReadRegistrationEngine(): SecurityReadRegistrationEngine;

export interface SecurityAuthorityGuardSession { beginRead():string; beginChange(generation:string):number; completeChange(token:number,committed:boolean):void; close():void; }
export interface SecurityAuthorityGuardEngine { createSession(generation:string):SecurityAuthorityGuardSession; }
export declare function createSecurityAuthorityGuardEngine():SecurityAuthorityGuardEngine;
