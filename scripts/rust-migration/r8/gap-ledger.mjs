#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const inventoryPath = 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/inventory.json';
const outputPath = 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));

// These are explicit source/API-to-Rust mappings supported by reviewed opt-in
// core evidence. No name similarity or candidate-family heuristic adds rows.
const accepted = new Map();
const accept = (source, exports, rustModule, rustSource, evidence, focusedTest) => {
  const evidencePaths = evidence.map(file => /^(?:docs|scripts|crates|src|spec)\//.test(file)
    ? file
    : `docs/helix/04-build/evidence/rust-migration/${file}`);
  for (const [exportName, rustSymbol] of exports) accepted.set(`${source}#${exportName}`, {
    rustOwner: `${rustModule}::${rustSymbol}`,
    rustSourcePaths: [rustSource],
    evidencePaths,
    focusedTestPaths: Array.isArray(focusedTest) ? focusedTest : [focusedTest],
  });
};
accept('src/model/semantic-types.ts', [['inspectCoreSemanticTypes', 'inspect_core_semantic_types']], 'umf_core::core_semantic_types', 'crates/umf-core/src/core_semantic_types.rs', ['r5-core-semantic-types/README.md', 'r5-core-semantic-types/frozen-typescript.json'], 'crates/umf-core/tests/r5_core_semantic_types.rs');
accept('src/model/semantic-types.ts', [['getCoreSemanticTypes', 'get_core_semantic_types']], 'umf_core::core_semantic_types', 'crates/umf-core/src/core_semantic_types.rs', ['r5-core-semantic-types/README.md', 'r5-core-semantic-types/frozen-typescript.json'], 'crates/umf-core/tests/r5_core_semantic_types.rs');
accept('src/model/semantic-types.ts', [['declareCoreSemanticTypes', 'declare_core_semantic_types']], 'umf_core::core_semantic_types', 'crates/umf-core/src/core_semantic_types.rs', ['r5-core-semantic-types/README.md', 'r5-core-semantic-types/frozen-typescript.json'], 'crates/umf-core/tests/r5_core_semantic_types.rs');
accept('src/model/semantic-types.ts', [['verifyCoreSemanticTypeDeclaration', 'verify_core_semantic_type_declaration']], 'umf_core::core_semantic_types', 'crates/umf-core/src/core_semantic_types.rs', ['r5-core-semantic-types/README.md', 'r5-core-semantic-types/frozen-typescript.json'], 'crates/umf-core/tests/r5_core_semantic_types.rs');
accept('src/model/semantic-types.ts', [['validateCoreSemanticTypeValue', 'validate_core_semantic_type_value']], 'umf_core::core_semantic_types', 'crates/umf-core/src/core_semantic_types.rs', ['r5-semantic-value/README.md', 'r5-semantic-value/frozen-typescript.json'], 'crates/umf-core/tests/r5_core_semantic_types.rs');
accept('src/model/record-values.ts', [['validateCoreRecordValues', 'validate_core_record_values']], 'umf_core::record_values', 'crates/umf-core/src/record_values.rs', ['r5-record-values/README.md', 'r5-record-values/frozen-typescript.json'], 'crates/umf-core/tests/r5_record_values.rs');
accept('src/model/dataset-values.ts', [['validateCoreDatasetValues', 'validate_core_dataset_values'], ['verifyCoreDatasetValues', 'verify_core_dataset_values']], 'umf_core::dataset_values', 'crates/umf-core/src/dataset_values.rs', ['r5-dataset-values/README.md', 'r5-dataset-values/frozen-typescript.json', 'r5-dataset-values/frozen-verify-typescript.json'], 'crates/umf-core/tests/r5_dataset_values.rs');
accept('src/model/dataset-values-compact.ts', [['validateCoreDatasetValuesCompact', 'validate_core_dataset_values_compact'], ['verifyCoreDatasetValuesCompact', 'verify_core_dataset_values_compact']], 'umf_core::dataset_values', 'crates/umf-core/src/dataset_values.rs', ['r5-dataset-values-compact/README.md', 'r5-dataset-values-compact/index.json'], 'crates/umf-core/tests/r5_dataset_values_compact.rs');
accept('src/model/key-tuple.ts', [['encodeCoreKeyTuple', 'encode_core_key_tuple'], ['verifyCoreKeyTuple', 'verify_core_key_tuple']], 'umf_core::core_key_tuple', 'crates/umf-core/src/core_key_tuple.rs', ['r5-core-key-tuple/README.md', 'r5-core-key-tuple/frozen-typescript.json'], 'crates/umf-core/tests/r5_core_key_tuple.rs');
accept('src/model/keys.ts', [
  ['inspectCoreKeys', 'inspect_core_keys'],
  ['lookupCoreKey', 'lookup_core_key'],
  ['declareCoreRecordMembers', 'declare_core_record_members'],
  ['declareCoreKey', 'declare_core_key'],
  ['verifyCoreKeyOperation', 'verify_core_key_operation'],
], 'umf_core::core_keys', 'crates/umf-core/src/core_keys.rs', ['r5-core-keys/README.md', 'r5-core-keys/frozen-typescript.json'], 'crates/umf-core/tests/r5_core_keys.rs');
accept('src/model/facets.ts', [
  ['inspectCoreFacets', 'inspect_core_facets'],
  ['declareCoreFacets', 'declare_core_facets'],
  ['verifyCoreFacetDeclaration', 'verify_core_facet_declaration'],
  ['historicalCoreFacetPatch', 'historical_core_facet_patch'],
], 'umf_core::facets', 'crates/umf-core/src/facets.rs', ['r5-core-facets/README.md', 'r5-core-facets/frozen-typescript.json', 'r5-core-facets/meaning-cases.json', 'r5-core-facets/regression-cases.json'], 'crates/umf-core/tests/r5_core_facets.rs');
accept('src/model/field-kind.ts', [
  ['inspectCoreElementKind', 'inspect_core_kind'],
  ['declareCoreElementKind', 'declare_core_kind'],
  ['verifyCoreKindDeclaration', 'verify_core_kind_declaration'],
], 'umf_core::core_kind', 'crates/umf-core/src/core_kind.rs', ['r5-kind-nullability/README.md', 'r5-model-bindings/README.md', 'scripts/rust-migration/r5/kind-nullability/frozen-typescript.json', 'scripts/rust-migration/r5/kind-nullability/frozen-refusals.json', 'scripts/rust-migration/r5/kind-nullability/rust-outputs.json'], 'crates/umf-core/tests/r5_kind_nullability.rs');
accept('src/model/nullability.ts', [
  ['inspectCoreNullability', 'inspect_core_nullability'],
  ['declareCoreNullability', 'declare_core_nullability'],
  ['verifyCoreNullabilityDeclaration', 'verify_core_nullability_declaration'],
], 'umf_core::nullability', 'crates/umf-core/src/nullability.rs', ['r5-kind-nullability/README.md', 'r5-model-bindings/README.md', 'scripts/rust-migration/r5/kind-nullability/frozen-typescript.json', 'scripts/rust-migration/r5/kind-nullability/frozen-refusals.json', 'scripts/rust-migration/r5/kind-nullability/rust-outputs.json'], 'crates/umf-core/tests/r5_kind_nullability.rs');
accept('src/model/cardinality.ts', [
  ['inspectCoreCardinality', 'inspect_core_cardinality'],
  ['declareCoreCardinality', 'declare_core_cardinality'],
  ['verifyCoreCardinalityDeclaration', 'verify_core_cardinality_declaration'],
], 'umf_core::cardinality', 'crates/umf-core/src/cardinality.rs', ['r5-cardinality/README.md', 'r5-cardinality/vectors.json', 'r5-model-bindings/README.md', 'r5-model-bindings/frozen-cardinality-typescript.json', 'r5-cardinality/schema-oracle.mjs', 'crates/umf-core/examples/r5_cardinality_capture.rs'], 'docs/helix/04-build/evidence/rust-migration/r5-cardinality/schema-oracle.mjs');
accept('src/extensions/semantic-types/index.ts', [['getSemanticTypes', 'get_semantic_types'], ['setSemanticTypes', 'set_semantic_types']], 'umf_core::semantic_type_accessors', 'crates/umf-core/src/semantic_type_accessors.rs', ['r5-semantic-type-accessors/README.md', 'r5-semantic-type-accessors/frozen-typescript.json'], 'crates/umf-core/tests/r5_semantic_type_accessors.rs');
accept('src/model/bit128.ts', [
  ['parseBits128', 'parse_bits128'], ['bits128FromBytes', 'bits128_from_bytes'],
  ['bits128ToBytes', 'bits128_to_bytes'], ['compareBits128', 'compare_bits128'],
  ['bits128ToWords', 'bits128_to_words'], ['bits128FromWords', 'bits128_from_words'],
  ['bits128ToInteger', 'bits128_to_integer'], ['bits128FromInteger', 'bits128_from_integer'],
], 'umf_core::bit128', 'crates/umf-core/src/bit128.rs', [
  'docs/helix/04-build/evidence/rust-migration/r5-bit128/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-bit128-binding/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-bit128-default-route/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-bit128-default-adapter/README.md',
  'scripts/rust-migration/r5/bit128-default-route/predecessor.json',
], ['crates/umf-core/tests/r5_bit128.rs', 'tests/rust-bit128-default.test.ts']);
accept('src/model/uuid.ts', [
  ['parseUuid', 'parse_uuid'], ['uuidFromBits128', 'uuid_from_bits128'], ['uuidToBits128', 'uuid_to_bits128'],
], 'umf_core::bit128', 'crates/umf-core/src/bit128.rs', [
  'docs/helix/04-build/evidence/rust-migration/r5-bit128/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-bit128-binding/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-bit128-default-route/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-bit128-default-adapter/README.md',
  'scripts/rust-migration/r5/bit128-default-route/predecessor.json',
], ['crates/umf-core/tests/r5_bit128.rs', 'tests/rust-bit128-default.test.ts']);
accept('src/adapters/gregorian-date.ts', [
  ['parseGregorianDate', 'parse_gregorian_date'],
  ['truncateGregorianDate', 'truncate_gregorian_date'],
], 'umf_core::gregorian_date', 'crates/umf-core/src/gregorian_date.rs', [
  'docs/helix/02-design/contracts/CONTRACT-066-gregorian-date-operations.md',
  'docs/helix/02-design/contracts/CONTRACT-065-rfc3339-exact-instant.md',
  'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/sol-review.md',
], ['crates/umf-core-wire/tests/gregorian_date_wire.rs', 'scripts/rust-migration/r5/temporal-default-route-node.ts', 'scripts/rust-migration/r5/temporal-default-route-browser.ts']);
accept('src/adapters/rfc3339-exact-instant.ts', [
  ['parseRfc3339ExactInstant', 'parse_rfc3339_exact_instant'],
  ['sameRfc3339ExactInstant', 'same_rfc3339_exact_instant'],
], 'umf_core::rfc3339_exact_instant', 'crates/umf-core/src/rfc3339_exact_instant.rs', [
  'docs/helix/02-design/contracts/CONTRACT-066-gregorian-date-operations.md',
  'docs/helix/02-design/contracts/CONTRACT-065-rfc3339-exact-instant.md',
  'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/sol-review.md',
], ['crates/umf-core-wire/tests/rfc3339_exact_instant_wire.rs', 'scripts/rust-migration/r5/temporal-default-route-node.ts', 'scripts/rust-migration/r5/temporal-default-route-browser.ts']);
accept('src/model/relationships.ts', [
  ['inspectCoreRelationships', 'inspect_core_relationships'],
  ['lookupCoreRelationship', 'lookup_core_relationship'],
  ['declareCoreRelationship', 'declare_core_relationship'],
  ['verifyCoreRelationshipOperation', 'verify_core_relationship_operation'],
], 'umf_core::core_relationships', 'crates/umf-core/src/core_relationships.rs', [
  'docs/helix/02-design/contracts/CONTRACT-041-relationship.md',
  'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/README.md',
  'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json',
], ['crates/umf-core/tests/r5_core_relationships.rs', 'crates/umf-core-wire/tests/r5_core_relationships_wire.rs', 'bindings/core/node/tests/core-relationships-wrapper.test.js']);
accept('src/model/relationship-selection.ts', [['selectCoreRelationships', 'select_core_relationships']], 'umf_core::core_relationship_selection', 'crates/umf-core/src/core_relationship_selection.rs', [
  'r5-core-relationship-selection/frozen-typescript.json',
  'r8-core-relationship-selection-binding/README.md',
  'r8-core-relationship-selection-binding/receipts.json',
], [
  'crates/umf-core/tests/r5_core_relationship_selection.rs',
  'crates/umf-core-wire/tests/r8_core_relationship_selection_wire.rs',
  'scripts/rust-migration/r8/relationship-selection-binding-node.mjs',
  'scripts/rust-migration/r8/relationship-selection-binding-browser.mjs',
]);
accept('src/extensions/security/logic.ts', [
  ['securityNot', 'security_not'],
  ['securityAnd', 'security_and'],
  ['securityOr', 'security_or'],
  ['composeSecurityRules', 'compose_security_rules'],
], 'umf_core::security_logic', 'crates/umf-core/src/security_logic.rs', [
  'docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md',
  'r8-security-truth-logic/frozen-typescript.json',
  'r8-security-truth-logic/compose-cases.json',
  'r8-security-truth-logic-binding/README.md',
], [
  'crates/umf-core-wire/tests/security_logic_wire.rs',
  'bindings/core/node/tests/security-logic.test.js',
]);
accept('src/model/native-json.ts', [['parseNativeJson', 'NativeJsonTree::parse_json']], 'umf_core::native_json', 'crates/umf-core/src/native_json.rs', [
  'docs/helix/04-build/evidence/rust-migration/r8-native-json-parser/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/predecessor.json',
  'docs/helix/02-design/contracts/CONTRACT-002-json-schema.md',
], [
  'crates/umf-core-wire/tests/r5_json_schema_wire.rs',
  'bindings/core/node/tests/json-schema-wrapper.test.js',
  'scripts/rust-migration/r5/json-schema-tree-operations-replay.mjs',
  'scripts/rust-migration/r5/json-schema-tree-operations-browser.mjs',
]);
accept('src/model/internal/json-number.ts', [['assertExactJsonNumber', 'assert_exact_json_number']], 'umf_core::json_number', 'crates/umf-core/src/json_number.rs', [
  'r8-json-number-predecessor/README.md',
  'r8-json-number-predecessor/typescript-predecessor.json',
  'r8-json-number-predecessor/node-replay.json',
  'r8-json-number-predecessor/bun-replay.json',
  'r8-json-number-predecessor/chromium-replay.json',
], [
  'crates/umf-core/tests/r8_json_number.rs',
  'crates/umf-core-wire/tests/r8_json_number_wire.rs',
  'scripts/rust-migration/r8/json-number-binding-node.mjs',
  'scripts/rust-migration/r8/json-number-binding-browser.mjs',
]);

// Exact-operation ownership for the JSON Schema and Protobuf root adapter
// surfaces. Each entry names a Rust symbol only where source and evidence
// establish that relationship; it never infers support from similar names.
const adapterOwnership = new Map();
const own = (exports, details) => {
  for (const exportName of exports) adapterOwnership.set(exportName, details);
};
const jsonSchemaEvidence = [
  'docs/helix/02-design/contracts/CONTRACT-002-json-schema.md',
  'docs/helix/04-build/evidence/rust-migration/r5-json-schema-bindings/predecessor.json',
  'docs/helix/04-build/evidence/rust-migration/r5-json-schema-bindings/successor-real-hosts-35bf199d.md',
  'docs/helix/04-build/evidence/rust-migration/r5-json-schema-bindings/successor-real-hosts-35bf199d-results.json',
  'docs/helix/04-build/evidence/rust-migration/r5-json-schema-inspect/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-json-schema-inspect/sol-review.md',
];
const protobufEvidence = [
  'docs/helix/02-design/contracts/CONTRACT-003-protobuf.md',
  'docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/predecessor.json',
  'docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/installed-wheel-replay-summary.json',
];
const protobufInspectEvidence = [
  'docs/helix/02-design/contracts/CONTRACT-003-protobuf.md',
  'docs/helix/04-build/evidence/rust-migration/r5-protobuf-inspect-bindings/README.md',
  'docs/helix/04-build/evidence/rust-migration/r5-protobuf-inspect-bindings/browser-receipt.json',
];
own(['importJsonSchema'], { status: 'candidate-core', supportProfile: 'r5-json-schema/0.1.0; opt-in; restricted Draft 2020-12 validator profile; frozen 30/30', rustOwner: 'umf_core::json_schema_adapter::import_json_schema', sourcePaths: ['crates/umf-core/src/json_schema_adapter.rs'], wireOperation: 'importJsonSchema', bindingRoutes: ['Node native addon', 'WASM browser'], evidencePaths: jsonSchemaEvidence, predecessor: 'CONTRACT-002 frozen JSON Schema predecessor; 30 cases', nativeGate: 'Installed Node/Bun and real Chromium frozen successor replay: 30/30; broader 1,301-vector Draft corpus remains rejected', hostGate: 'Opt-in Node/Bun and browser WASM; default TypeScript route remains active', knownMismatches: ['General Draft 2020-12 corpus retains compile, runtime, and semantic disagreements'] });
own(['inspectJsonSchema'], { status: 'candidate-core', supportProfile: 'r5-json-schema/0.1.0; opt-in; restricted Draft 2020-12 validator profile; frozen 30/30', rustOwner: 'umf_core::json_schema_adapter::inspect_json_schema', sourcePaths: ['crates/umf-core/src/json_schema_adapter.rs', 'crates/umf-core/src/json_schema_inspect.rs'], wireOperation: 'inspectJsonSchema', bindingRoutes: ['Node native addon', 'WASM browser'], evidencePaths: jsonSchemaEvidence, predecessor: 'CONTRACT-002 frozen JSON Schema predecessor; 30 cases', nativeGate: 'Installed Node/Bun and real Chromium frozen successor replay: 30/30; broader 1,301-vector Draft corpus remains rejected', hostGate: 'Opt-in Node/Bun and browser WASM; default TypeScript route remains active', knownMismatches: ['General Draft 2020-12 corpus retains compile, runtime, and semantic disagreements'] });
for (const [names, owner, wire] of [
  [['exportJsonSchema'], 'umf_core::json_schema_adapter::export_json_schema', 'exportJsonSchema'],
  [['exportJsonSchemaResources'], 'umf_core::json_schema_adapter::export_json_schema_resources', 'exportJsonSchemaResources'],
  [['exportJsonSchemaBundle'], 'umf_core::json_schema_adapter::export_json_schema_bundle', 'exportJsonSchemaBundle'],
  [['getJsonSchemaNode'], 'umf_core::json_schema_adapter::get_json_schema_node', 'getJsonSchemaNode'],
  [['walkJsonSchema'], 'umf_core::json_schema_adapter::walk_json_schema', 'walkJsonSchema'],
]) own(names, { status: 'candidate-core', supportProfile: 'r5-json-schema/0.1.0; opt-in; restricted Draft 2020-12 validator profile; frozen 30/30', rustOwner: owner, sourcePaths: ['crates/umf-core/src/json_schema_adapter.rs'], wireOperation: wire, bindingRoutes: ['Node native addon', 'WASM browser'], evidencePaths: jsonSchemaEvidence, predecessor: 'CONTRACT-002 frozen JSON Schema predecessor; 30 cases', nativeGate: 'Installed Node/Bun and real Chromium frozen successor replay: 30/30; broader 1,301-vector Draft corpus remains rejected', hostGate: 'Opt-in Node/Bun and browser WASM; default TypeScript route remains active', knownMismatches: ['General Draft 2020-12 corpus retains compile, runtime, and semantic disagreements'] });
own(['editJsonSchemaNode'], { status: 'candidate-core', supportProfile: 'umf-core JSON Schema node edit; core-only candidate', rustOwner: 'umf_core::json_schema_adapter::edit_node', sourcePaths: ['crates/umf-core/src/json_schema_adapter.rs'], wireOperation: null, bindingRoutes: [], evidencePaths: ['docs/helix/02-design/contracts/CONTRACT-002-json-schema.md'], predecessor: 'CONTRACT-002; no frozen per-export edit packet identified', nativeGate: 'Core function exists; operation-specific native predecessor replay not identified', hostGate: 'No wire/binding route; TypeScript root export remains default', knownMismatches: ['Core edit_node is not dispatched by core-wire and does not establish wrapper parity'] });
own(['parseNativeJson'], { status: 'accepted-opt-in-subset', supportProfile: 'umf-r5-json-schema/0.1.0 parseNativeJson typed-string operation; opt-in; frozen parser subset 11/11', rustOwner: 'umf_core::native_json::NativeJsonTree::parse_json', sourcePaths: ['crates/umf-core/src/native_json.rs', 'crates/umf-core-wire/src/lib.rs', 'bindings/core/node/src/lib.rs', 'bindings/core/wasm/src/lib.rs'], wireOperation: 'parseNativeJson', bindingRoutes: ['Node native addon', 'WASM browser'], evidencePaths: ['docs/helix/02-design/contracts/CONTRACT-002-json-schema.md', 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/predecessor.json', 'docs/helix/04-build/evidence/rust-migration/r8-native-json-parser/README.md'], predecessor: 'Frozen 22-case R5 tree-operation packet, including 11 parseNativeJson cases', nativeGate: 'Fresh current-source Node 26.12.1, Bun 1.4.3 and HeadlessChrome 153 replay: 22/22 packet cases; parser subset 11/11; focused wire tests 8/8', hostGate: 'Opt-in Node/WASM tagged-string operation under umf-r5-json-schema/0.1.0; TypeScript default root remains active; non-string wire source is rejected before parser entry', knownMismatches: ['Raw JavaScript wrong-type host behavior differs from tagged-wire REQUEST admission', 'Default Node/browser package-root binding and route retirement remain unproven'] });
for (const [name, profile, owner, wire, source, ev, host] of [
  ['importProtobufDescriptorSet', 'umf-protobuf-descriptor/0.1.0', 'umf_core::protobuf_document::import_descriptor_set', null, 'crates/umf-core/src/protobuf_document.rs', ['docs/helix/04-build/evidence/rust-migration/r5-protobuf-document/README.md'], 'Core-only document operation; no Node/WASM document wire route'],
  ['exportProtobufDescriptorSet', 'umf-protobuf-descriptor/0.1.0', 'umf_core::protobuf_document::export_descriptor_set', null, 'crates/umf-core/src/protobuf_document.rs', ['docs/helix/04-build/evidence/rust-migration/r5-protobuf-document/README.md'], 'Core-only document operation; no Node/WASM document wire route'],
  ['getProtobufDescriptorSet', 'umf-protobuf-descriptor/0.1.0', 'umf_core::protobuf_document::get_descriptor_set', null, 'crates/umf-core/src/protobuf_document.rs', ['docs/helix/04-build/evidence/rust-migration/r5-protobuf-document/README.md'], 'Core-only document operation; no Node/WASM document wire route'],
  ['exportProtobufBundle', 'umf-protobuf-descriptor/0.1.0', 'umf_core::protobuf_document::export_bundle', null, 'crates/umf-core/src/protobuf_document.rs', ['docs/helix/04-build/evidence/rust-migration/r5-protobuf-document/README.md'], 'Core-only document operation; no Node/WASM document wire route'],
]) own([name], { status: 'candidate-core', supportProfile: profile, rustOwner: owner, sourcePaths: [source], wireOperation: wire, bindingRoutes: [], evidencePaths: [...protobufEvidence, ...ev], predecessor: 'CONTRACT-003 plus Protobuf descriptor/document focused predecessor evidence', nativeGate: 'Core focused document tests only; installed binding parity not established', hostGate: host, knownMismatches: ['Document-operation evidence does not establish descriptor codec or whole-adapter parity'] });
own(['readDescriptorSet', 'writeDescriptorSet'], { status: 'accepted-opt-in-subset', supportProfile: 'umf-protobuf-descriptor/0.1.0 (CPython 3.11.17 Darwin arm64 only)', rustOwner: 'umf_core::protobuf_descriptor::{read_descriptor_set,write_descriptor_set}', sourcePaths: ['crates/umf-core/src/protobuf_descriptor.rs'], wireOperation: null, bindingRoutes: ['Python installed wheel'], evidencePaths: protobufEvidence, predecessor: 'CONTRACT-003 frozen Buf 2.15.0 descriptor codec: 93 operations', nativeGate: 'Installed wheel replay: 32 exact, 7 contract-directed divergences, 54 expected rejections; zero generic mismatches', hostGate: 'Python wheel only; Node/WASM codec binding not qualified by this evidence', knownMismatches: ['Seven predecessor divergences follow CONTRACT-003 rather than Buf behavior', 'Descriptor codec does not establish document adapter or source compiler behavior'] });
own(['inspectProtobuf'], { status: 'accepted-opt-in-subset', supportProfile: 'umf-r5-protobuf-inspect/0.1.0', rustOwner: 'umf_core::protobuf_inspect::inspect_protobuf_document', sourcePaths: ['crates/umf-core/src/protobuf_inspect.rs'], wireOperation: 'protobuf.descriptor.inspect', bindingRoutes: ['Node native addon', 'WASM browser', 'Python binding', 'CLI'], evidencePaths: protobufInspectEvidence, predecessor: 'CONTRACT-003 bounded structural inspector predecessor observations', nativeGate: 'Focused Node/Bun, Chromium, Python and CLI controls; not general Protobuf conformance', hostGate: 'Compiler-required warning remains; no native compiler callback is invoked by inspect', knownMismatches: ['Reports complete:false and compiler-required warning', 'Unknown wire content retained but not semantically interpreted'] });
own(['importProtobufSources', 'exportProtobufSources'], { status: 'partial-host-boundary', supportProfile: 'R5 Protobuf source prepare/finish; host callbacks required', rustOwner: 'umf_core::protobuf_source::{prepare_source_import,import_sources,prepare_source_export,finish_source_export}', sourcePaths: ['crates/umf-core/src/protobuf_source.rs'], wireOperation: null, bindingRoutes: [], evidencePaths: ['docs/helix/02-design/contracts/CONTRACT-003-protobuf.md', 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-source/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-source/predecessor.json', 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-source-export/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-source-export/predecessor.json'], predecessor: 'CONTRACT-003 source/compiler boundary; separate frozen import and export observations', nativeGate: 'Core preparation/finalization tests; compiler/printer equivalence remains unqualified', hostGate: 'Host compiler and source emitter callbacks remain required; no generic Node/WASM route', knownMismatches: ['Callback identity, compiler version, source layout and complete compiler semantics remain host-owned'] });
own(['proposeProtobufDescriptorEdit'], { status: 'unported', supportProfile: null, rustOwner: null, sourcePaths: [], wireOperation: null, bindingRoutes: [], evidencePaths: protobufEvidence, predecessor: 'CONTRACT-003; no exact frozen operation mapping identified', nativeGate: 'No operation-specific native gate', hostGate: 'TypeScript default only; no Rust operation or binding route identified', knownMismatches: ['No exact Rust descriptor-edit proposal owner'] });
own(['protobufRegistry', 'jsonSchemaRegistry'], { status: 'unported', supportProfile: null, rustOwner: null, sourcePaths: [], wireOperation: null, bindingRoutes: [], evidencePaths: [], predecessor: 'No frozen registry-wrapper operation packet identified', nativeGate: 'No operation-specific native gate', hostGate: 'TypeScript registry wrappers remain active; no equivalent Rust route established', knownMismatches: ['Do not infer registry parity from inspector or document operations'] });
own(['JSON_SCHEMA_DIALECT'], { status: 'data-or-constant', supportProfile: null, rustOwner: 'umf_core::json_schema_adapter::DIALECT_2020_12', sourcePaths: ['crates/umf-core/src/json_schema_adapter.rs'], wireOperation: null, bindingRoutes: [], evidencePaths: ['docs/helix/02-design/contracts/CONTRACT-002-json-schema.md'], predecessor: 'CONTRACT-002 dialect identifier; no executable operation packet', nativeGate: 'Constant equality requires direct source check, not host parity replay', hostGate: 'TypeScript root constant remains default', knownMismatches: [] });
own(['JSON_SCHEMA_EXTENSION'], { status: 'data-or-constant', supportProfile: null, rustOwner: 'umf_core::json_schema_adapter::EXTENSION', sourcePaths: ['crates/umf-core/src/json_schema_adapter.rs'], wireOperation: null, bindingRoutes: [], evidencePaths: ['docs/helix/02-design/contracts/CONTRACT-002-json-schema.md'], predecessor: 'CONTRACT-002 extension identifier; no executable operation packet', nativeGate: 'Constant equality requires direct source check, not host parity replay', hostGate: 'TypeScript root constant remains default', knownMismatches: [] });
own(['PROTOBUF_EXTENSION'], { status: 'data-or-constant', supportProfile: null, rustOwner: 'umf_core::protobuf_document::EXT', sourcePaths: ['crates/umf-core/src/protobuf_document.rs'], wireOperation: null, bindingRoutes: [], evidencePaths: ['docs/helix/02-design/contracts/CONTRACT-003-protobuf.md'], predecessor: 'CONTRACT-003 extension identifier; no executable operation packet', nativeGate: 'Constant equality requires direct source check, not host parity replay', hostGate: 'TypeScript root constant remains default', knownMismatches: [] });
own(['jsonSchemaPackage', 'protobufPackage'], { status: 'data-or-constant', supportProfile: null, rustOwner: null, sourcePaths: ['spec/extensions/json-schema/package.json', 'spec/extensions/protobuf/package.json'], wireOperation: null, bindingRoutes: ['Package resource asset'], evidencePaths: [], predecessor: 'Contract/resource package definition; no executable operation packet', nativeGate: 'Resource bytes/hash and package closure are separate gates', hostGate: 'Package resource route; TypeScript root remains default', knownMismatches: ['Rust operation ownership does not imply package asset inclusion/authority'] });

function operationOwnership(exportName, routeStatus = 'legacy-fixture') {
  const detail = adapterOwnership.get(exportName);
  if (!detail) return null;
  const sourceClosure = [...new Set(detail.sourcePaths)].sort().map(file => ({ path: file, sha256: digest(read(file)) }));
  const evidenceClosure = [...new Set(detail.evidencePaths)].sort().map(file => ({ path: file, sha256: digest(read(file)) }));
  const defaultRouteStatus = routeStatus === 'explicit-reference'
    ? 'Explicit ./reference TypeScript route; this operation mapping does not alter default Node/browser routes or retire declarations'
    : routeStatus === 'default-node' || routeStatus === 'default-browser'
      ? `${routeStatus === 'default-node' ? 'Node' : 'Browser'} default route contains source-selected V4 entry declarations. Exact Rust ownership and qualification are recorded per row; zero declarations retired`
      : 'TypeScript package-root export remains default; zero rows retired';
  return { ...detail, sourceClosure, evidenceClosure, reviewStatus: 'Sol-approved mapping schema; row-level independent review pending', defaultRouteStatus };
}

function acceptedOperationEvidence(mapping, routeStatus = 'legacy-fixture') {
  const closure = paths => [...new Set(paths)].sort().map(file => ({ path: file, sha256: digest(read(file)) }));
  return {
    rustSourceClosure: closure(mapping.rustSourcePaths),
    evidenceClosure: closure(mapping.evidencePaths),
    focusedTestClosure: closure(mapping.focusedTestPaths),
    scopeRule: mapping.evidencePaths.some(file => file.includes('/r8-json-number-predecessor/'))
      ? 'Source/evidence hashes pin identity only; the linked R8 JSON-number packet defines string-input parity and its remaining host/default-route gates.'
      : mapping.evidencePaths.some(file => file.includes('/r8-security-truth-logic-binding/'))
        ? 'Source/evidence hashes pin identity only; the linked CONTRACT-062 truth/composition packet defines admitted JSON parity for already-evaluated rules, excluding Registry, backend authorization, and default-route retirement.'
      : mapping.evidencePaths.some(file => file.includes('/r8-core-relationship-selection-binding/'))
        ? 'Source/evidence hashes pin identity only; the linked relationship-selection packet defines 16-case opt-in host parity, excluding Registry callbacks and JavaScript error class identity.'
      : 'Source/evidence hashes pin identity only; the linked R5 packet defines the bounded operation subset and its remaining gates.',
    defaultRouteStatus: routeStatus === 'explicit-reference'
      ? 'Explicit ./reference TypeScript route; mapping does not affect default Node/browser routes or retire declarations'
      : routeStatus === 'default-node' || routeStatus === 'default-browser'
        ? `${routeStatus === 'default-node' ? 'Node' : 'Browser'} default route source selection is recorded per V4 entry declaration. Installed qualification and all retirement remain open unless a row's bounded evidence says otherwise`
        : 'TypeScript package-root export remains default; zero rows retired',
  };
}

function sourceSelectedImplementation(routeId, exportName, source = null) {
  if (!['package-root-node', 'package-root-browser'].includes(routeId)) return null;
  const browser = routeId === 'package-root-browser';
  const defaultEntry = browser ? 'src/index-browser-v4.ts' : 'src/index-node-v4.ts';
  if (source !== null && source !== defaultEntry) return null;
  const closure = paths => [...new Set(paths)].sort().map(file => ({ path: file, sha256: digest(read(file)) }));
  const temporal = new Map([
    ['parseGregorianDate', ['umf_core::gregorian_date::parse_gregorian_date', 'crates/umf-core/src/gregorian_date.rs', 'crates/umf-core-wire/tests/gregorian_date_wire.rs']],
    ['truncateGregorianDate', ['umf_core::gregorian_date::truncate_gregorian_date', 'crates/umf-core/src/gregorian_date.rs', 'crates/umf-core-wire/tests/gregorian_date_wire.rs']],
    ['parseRfc3339ExactInstant', ['umf_core::rfc3339_exact_instant::parse_rfc3339_exact_instant', 'crates/umf-core/src/rfc3339_exact_instant.rs', 'crates/umf-core-wire/tests/rfc3339_exact_instant_wire.rs']],
    ['sameRfc3339ExactInstant', ['umf_core::rfc3339_exact_instant::same_rfc3339_exact_instant', 'crates/umf-core/src/rfc3339_exact_instant.rs', 'crates/umf-core-wire/tests/rfc3339_exact_instant_wire.rs']],
  ]);
  const relationships = new Map([
    ['inspectCoreRelationships', 'inspect_core_relationships'], ['lookupCoreRelationship', 'lookup_core_relationship'],
    ['declareCoreRelationship', 'declare_core_relationship'], ['verifyCoreRelationshipOperation', 'verify_core_relationship_operation'],
  ]);
  if (temporal.has(exportName)) {
    const [rustOwner, rustSource, wireTest] = temporal.get(exportName);
    const predecessor = exportName.includes('Gregorian') ? 'src/adapters/gregorian-date.ts' : 'src/adapters/rfc3339-exact-instant.ts';
    const evidencePaths = ['docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/sol-review.md'];
    const sourcePaths = [defaultEntry, predecessor, 'bindings/core/node/src/temporal.js', 'bindings/core/wasm/index.js', 'bindings/core/node/src/lib.rs', 'bindings/core/wasm/src/lib.rs', 'crates/umf-core-wire/src/lib.rs', rustSource, wireTest, 'scripts/rust-migration/r5/temporal-default-route-node.ts', 'scripts/rust-migration/r5/temporal-default-route-browser.ts', ...evidencePaths];
    return { status: 'installed-private-prior-cohort', rustOwner, wireOperation: `temporal/${exportName}`, bindingRoute: browser ? 'V4 browser root -> WASM temporal wrapper -> Rust wire' : 'V4 Node root -> Node-API temporal wrapper -> Rust wire', sourceClosure: closure(sourcePaths), qualificationStatus: 'Prior private source-pinned Node/Bun and real Chromium temporal replay passed for the captured cohort; the evidence records source drift and is not current fixed-point/release qualification. ./reference remains TypeScript and declaration retirement remains open.' };
  }
  if (relationships.has(exportName)) {
    const rustSource = 'crates/umf-core/src/core_relationships.rs';
    const evidencePaths = ['docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/README.md', 'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json', 'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/fixed-point-build.json', 'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/fixed-point-bun-replay.json', 'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/fixed-point-node-replay.json', 'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/fixed-point-browser-replay.json'];
    const sourcePaths = [defaultEntry, 'src/access/rust-relationships-default.ts', 'src/model/relationships.ts', 'bindings/core/node/src/core-relationships.js', 'bindings/core/wasm/src/core-relationships.js', 'bindings/core/node/src/lib.rs', 'bindings/core/wasm/src/lib.rs', 'crates/umf-core-wire/src/lib.rs', rustSource, 'crates/umf-core/tests/r5_core_relationships.rs', 'crates/umf-core-wire/tests/r5_core_relationships_wire.rs', ...evidencePaths];
    return { status: 'installed-private-fixed-point-cohort', rustOwner: `umf_core::core_relationships::${relationships.get(exportName)}`, wireOperation: `model/${exportName}`, bindingRoute: browser ? 'V4 browser root -> WASM relationship wrapper -> Rust wire' : 'V4 Node root -> Node-API relationship wrapper -> Rust wire', sourceClosure: closure(sourcePaths), qualificationStatus: 'Prior private fixed-point package replay passed 11 cases in Bun, bundled Node, and real Chromium; artifact is private/nonpublishable. This records bounded route evidence only; ./reference and declaration retirement remain open.' };
  }
  const currentSelections = new Map([
    ['validateCsvBooleanLexical', {
      rustOwner: 'umf_core::csv_boolean_lexical::validate_csv_boolean_lexical',
      wireOperation: 'model/validateCsvBooleanLexical',
      bindingMethod: 'validateCsvBooleanLexical(source, request)',
      profile: 'CONTRACT-053 CSV Boolean lexical profile',
      rustSource: 'crates/umf-core/src/csv_boolean_lexical.rs',
      testSources: ['crates/umf-core/tests/r5_csv_boolean_lexical.rs', 'crates/umf-core-wire/tests/r5_csv_boolean_lexical_wire.rs', 'tests/rust-csv-boolean-default.test.ts'],
      evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-csv-boolean-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-csv-boolean-default-route/chromium-smoke.json', 'scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json', 'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/installed-replay.json', 'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/retirement-review.md', 'scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs', 'scripts/rust-migration/r8/csv-boolean-retirement-reference.mjs'],
    }],
    ['verifyCsvBooleanLexical', {
      rustOwner: 'umf_core::csv_boolean_lexical::verify_csv_boolean_lexical',
      wireOperation: 'model/prepareCsvBooleanLexicalVerification then model/finishCsvBooleanLexicalVerification',
      bindingMethod: 'verifyCsvBooleanLexical(receipt, source, request)',
      profile: 'CONTRACT-053 CSV Boolean lexical profile',
      rustSource: 'crates/umf-core/src/csv_boolean_lexical.rs',
      testSources: ['crates/umf-core/tests/r5_csv_boolean_lexical.rs', 'crates/umf-core-wire/tests/r5_csv_boolean_lexical_wire.rs', 'tests/rust-csv-boolean-default.test.ts'],
      evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-csv-boolean-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-csv-boolean-default-route/chromium-smoke.json', 'scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json', 'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/installed-replay.json', 'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-route/retirement-review.md', 'scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs', 'scripts/rust-migration/r8/csv-boolean-retirement-reference.mjs'],
    }],
    ['inspectCoreScalarType', {
      rustOwner: 'umf_core::scalar_type_inspection::inspect_core_scalar_type',
      wireOperation: 'model/inspectCoreScalarType', bindingMethod: 'inspectCoreScalarType(source, identity)',
      profile: 'core scalar-type inspection/0.3.0', rustSource: 'crates/umf-core/src/scalar_type_inspection.rs',
      testSources: ['crates/umf-core-wire/tests/r5_scalar_type_inspection.rs'],
      evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/chromium.json', 'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json', 'docs/helix/04-build/evidence/rust-migration/r5-scalar-type-inspection/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-scalar-type-inspection/frozen-typescript.json', 'docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/README.md', 'docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/receipt.json', 'scripts/rust-migration/r8/core-inspectors-installed.mjs'],
    }],
    ['inspectCoreRecordMembers', {
      rustOwner: 'umf_core::record_members_inspection::inspect_core_record_members',
      wireOperation: 'model/inspectCoreRecordMembers', bindingMethod: 'inspectCoreRecordMembers(source, identity)',
      profile: 'core record-member inspection/0.3.0', rustSource: 'crates/umf-core/src/record_members_inspection.rs',
      testSources: ['crates/umf-core-wire/tests/r5_record_members_inspection.rs'],
      evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/chromium.json', 'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json', 'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/chromium.json', 'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json', 'docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/README.md', 'docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/receipt.json', 'scripts/rust-migration/r8/core-inspectors-installed.mjs'],
    }],
    ['inspectCoreReferenceLinks', {
      rustOwner: 'umf_core::reference_links_inspection::inspect_core_reference_links',
      wireOperation: 'model/inspectCoreReferenceLinks', bindingMethod: 'inspectCoreReferenceLinks(source, identity)',
      profile: 'core reference-link inspection/0.3.0', rustSource: 'crates/umf-core/src/reference_links_inspection.rs',
      testSources: ['crates/umf-core/tests/r5_reference_links_inspection.rs', 'crates/umf-core-wire/tests/r5_reference_links_inspection.rs'],
      evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/chromium.json', 'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json', 'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/chromium.json', 'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/frozen-typescript.json', 'docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/README.md', 'docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/receipt.json', 'scripts/rust-migration/r8/core-inspectors-installed.mjs'],
    }],
    ['parseGregorianDate', {
      rustOwner: 'umf_core::gregorian_date::parse_gregorian_date', wireOperation: 'temporal/parseGregorianDate', bindingMethod: 'parseGregorianDate(value)', profile: 'CONTRACT-005 Gregorian date operations', rustSource: 'crates/umf-core/src/gregorian_date.rs', testSources: ['crates/umf-core-wire/tests/gregorian_date_wire.rs'], evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/sol-review.md'],
    }],
    ['truncateGregorianDate', {
      rustOwner: 'umf_core::gregorian_date::truncate_gregorian_date', wireOperation: 'temporal/truncateGregorianDate', bindingMethod: 'truncateGregorianDate(value, unit)', profile: 'CONTRACT-005 Gregorian date operations', rustSource: 'crates/umf-core/src/gregorian_date.rs', testSources: ['crates/umf-core-wire/tests/gregorian_date_wire.rs'], evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/sol-review.md'],
    }],
    ['parseRfc3339ExactInstant', {
      rustOwner: 'umf_core::rfc3339_exact_instant::parse_rfc3339_exact_instant', wireOperation: 'temporal/parseRfc3339ExactInstant', bindingMethod: 'parseRfc3339ExactInstant(value)', profile: 'CONTRACT-005 exact RFC 3339 instant operations', rustSource: 'crates/umf-core/src/rfc3339_exact_instant.rs', testSources: ['crates/umf-core-wire/tests/rfc3339_exact_instant_wire.rs'], evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/sol-review.md'],
    }],
    ['sameRfc3339ExactInstant', {
      rustOwner: 'umf_core::rfc3339_exact_instant::same_rfc3339_exact_instant', wireOperation: 'temporal/sameRfc3339ExactInstant', bindingMethod: 'sameRfc3339ExactInstant(left, right)', profile: 'CONTRACT-005 exact RFC 3339 instant operations', rustSource: 'crates/umf-core/src/rfc3339_exact_instant.rs', testSources: ['crates/umf-core-wire/tests/rfc3339_exact_instant_wire.rs'], evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/README.md', 'docs/helix/04-build/evidence/rust-migration/r5-temporal-default-route/sol-review.md'],
    }],
    ...['inspectCoreRelationships', 'lookupCoreRelationship', 'declareCoreRelationship', 'verifyCoreRelationshipOperation'].map(name => [name, {
      rustOwner: `umf_core::core_relationships::${({ inspectCoreRelationships: 'inspect_core_relationships', lookupCoreRelationship: 'lookup_core_relationship', declareCoreRelationship: 'declare_core_relationship', verifyCoreRelationshipOperation: 'verify_core_relationship_operation' })[name]}`, wireOperation: `model/${name}`, bindingMethod: `${name}(...)`, profile: 'CONTRACT-018 Core relationship operations', rustSource: 'crates/umf-core/src/core_relationships.rs', testSources: ['crates/umf-core/tests/r5_core_relationships.rs', 'crates/umf-core-wire/tests/r5_core_relationships_wire.rs'], evidencePaths: ['docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/README.md', 'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json'],
    }]),
  ]);
  if (currentSelections.has(exportName)) {
    const selection = currentSelections.get(exportName);
    const binder = exportName === 'validateCsvBooleanLexical' || exportName === 'verifyCsvBooleanLexical'
      ? 'src/access/rust-csv-boolean-default.ts'
      : 'src/access/rust-core-inspectors-default.ts';
    const subBinding = exportName === 'validateCsvBooleanLexical' || exportName === 'verifyCsvBooleanLexical'
      ? 'csv-boolean-lexical.js' : 'core-model.js';
    const routeClosure = [
      defaultEntry, binder,
      `bindings/core/node/src/${subBinding}`, `bindings/core/wasm/src/${subBinding}`,
      'bindings/core/node/src/wire.js', 'bindings/core/wasm/src/wire.js',
      'bindings/core/node/index.js', 'bindings/core/wasm/index.js',
      'bindings/core/node/src/lib.rs', 'bindings/core/wasm/src/lib.rs',
      'crates/umf-core-wire/src/lib.rs', selection.rustSource,
      ...selection.testSources, ...selection.evidencePaths,
      ...(exportName === 'validateCsvBooleanLexical' || exportName === 'verifyCsvBooleanLexical'
        ? ['bindings/core/wasm/tests/csv-boolean-default-browser.mjs']
        : ['scripts/rust-migration/r5/core-inspectors-default-parity.ts', 'scripts/rust-migration/r5/core-inspectors-default-browser.mjs']),
    ];
    return {
      status: 'source-selected-only',
      supportProfile: selection.profile,
      rustOwner: selection.rustOwner,
      wireOperation: selection.wireOperation,
      bindingMethod: selection.bindingMethod,
      bindingRoute: browser ? 'default browser v4 entrypoint -> WASM wrapper -> Rust wire dispatcher' : 'default Node v4 entrypoint -> Node-API wrapper -> Rust wire dispatcher',
      sourceClosure: closure(routeClosure),
      evidenceClosure: closure(selection.evidencePaths),
      qualificationStatus: exportName === 'validateCsvBooleanLexical' || exportName === 'verifyCsvBooleanLexical'
        ? 'A prior fixed-point private SDK archive passed 14 frozen CSV Boolean cases in installed Node, Bun and Chromium defaults. Independent reference review found an accessor-admission mismatch in that archive; the current scoped source correction is not in the archive. Current-cohort installed/browser parity, a proven current binding route and declaration retirement remain open.'
        : 'A prior fixed-point private SDK archive passed the three inspector predecessor packets (8/9/9 cases) in installed Node, Bun and Chromium defaults, with selected Node/Bun host-shape comparisons and damaged-addon refusals. Current-cohort installed qualification, broader host parity, a proven current binding route and declaration retirement remain open.',
    };
  }
  const bit128Symbols = new Map([
    ['parseBits128', 'parse_bits128'], ['parseUuid', 'parse_uuid'],
    ['bits128FromBytes', 'bits128_from_bytes'], ['bits128ToBytes', 'bits128_to_bytes'],
    ['uuidFromBits128', 'uuid_from_bits128'], ['uuidToBits128', 'uuid_to_bits128'],
    ['compareBits128', 'compare_bits128'], ['bits128ToWords', 'bits128_to_words'],
    ['bits128FromWords', 'bits128_from_words'], ['bits128ToInteger', 'bits128_to_integer'],
    ['bits128FromInteger', 'bits128_from_integer'],
  ]);
  if (bit128Symbols.has(exportName)) {
    const routeEntry = browser ? 'src/index-browser-v4.ts' : 'src/index-node-v4.ts';
    const sourcePaths = [
      routeEntry, 'src/access/rust-bit128-default.ts',
      'bindings/core/node/index.js', 'bindings/core/node/src/bit128.js', 'bindings/core/node/src/wire.js',
      'bindings/core/node/src/lib.rs',
      'bindings/core/wasm/index.js', 'bindings/core/wasm/src/bit128.js', 'bindings/core/wasm/src/wire.js', 'bindings/core/wasm/src/lib.rs',
      'crates/umf-core-wire/src/lib.rs', 'crates/umf-core/src/bit128.rs',
      'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md',
      'scripts/rust-migration/r5/bit128-default-route/freeze.ts',
      'scripts/rust-migration/r5/bit128-default-route/predecessor.json',
      'tests/rust-bit128-default.test.ts',
    ];
    return {
      status: 'source-selected-only',
      supportProfile: 'umf-128/1',
      rustOwner: `umf_core::bit128::${bit128Symbols.get(exportName)}`,
      wireOperation: `umf-128/1:${exportName}`,
      bindingRoute: browser ? 'browser WASM source-selected route; installed qualification pending' : 'Node native source-selected route; installed qualification pending',
      sourceClosure: [...new Set(sourcePaths)].sort().map(file => ({path: file, sha256: digest(read(file))})),
      qualificationStatus: 'This operation is source-selected through the default Node/browser root only. Frozen predecessor and opt-in Rust binding evidence do not qualify installed default-route behavior. Installed Node/Bun/Chromium qualification is pending; zero declarations are retired.',
    };
  }
  const facetSymbols = new Map([
    ['inspectCoreFacets', 'inspect_core_facets'],
    ['declareCoreFacets', 'declare_core_facets'],
    ['verifyCoreFacetDeclaration', 'verify_core_facet_declaration'],
    ['historicalCoreFacetPatch', 'historical_core_facet_patch'],
  ]);
  if (facetSymbols.has(exportName)) {
    return {
      status: 'unqualified-current-route',
      rustOwner: `umf_core::facets::${facetSymbols.get(exportName)}`,
      wireOperation: `model/${exportName}`,
      bindingRoute: browser ? 'browser WASM source-selected route; installed qualification pending' : 'Node native source-selected route; installed qualification pending',
      sourceClosure: [browser ? 'src/index-browser-v4.ts' : 'src/index-node-v4.ts', 'src/access/rust-facets-default.ts', 'bindings/core/wasm/src/core-model.js', 'bindings/core/node/src/core-model.js', 'crates/umf-core-wire/src/lib.rs', 'crates/umf-core/src/facets.rs'].sort().map(file => ({ path: file, sha256: digest(read(file)) })),
      qualificationStatus: 'Rust facets operations are source-selected at this Node/browser root; installed qualification is pending and declaration retirement remains open.',
    };
  }
  const coreKeySymbols = new Map([
    ['inspectCoreKeys', 'inspect_core_keys'],
    ['lookupCoreKey', 'lookup_core_key'],
    ['declareCoreRecordMembers', 'declare_core_record_members'],
    ['declareCoreKey', 'declare_core_key'],
  ]);
  if (coreKeySymbols.has(exportName)) {
    return {
      status: 'unqualified-current-route',
      rustOwner: `umf_core::core_keys::${coreKeySymbols.get(exportName)}`,
      wireOperation: `model/${exportName}`,
      bindingRoute: browser ? 'browser WASM source-selected route; installed qualification pending' : 'Node native source-selected route; installed qualification pending',
      sourceClosure: [
        browser ? 'src/index-browser-v4.ts' : 'src/index-node-v4.ts',
        'src/access/rust-keys-default.ts',
        'bindings/core/wasm/src/core-model.js',
        'bindings/core/node/src/core-model.js',
        'bindings/core/wasm/src/core-keys.js',
        'bindings/core/node/src/core-keys.js',
        'crates/umf-core-wire/src/lib.rs',
        'crates/umf-core/src/core_keys.rs',
      ].sort().map(file => ({ path: file, sha256: digest(read(file)) })),
      qualificationStatus: 'These four Rust Core Keys operations are source-selected at this Node/browser root. Installed qualification is pending, verifyCoreKeyOperation remains TypeScript, and declaration retirement remains open.',
    };
  }
  if (exportName === 'validateCoreDatasetValuesCompact') {
    return {
      status: 'unqualified-current-route',
      rustOwner: 'umf_core::dataset_values::validate_core_dataset_values_compact',
      wireOperation: 'model/validateCoreDatasetValuesCompact',
      bindingRoute: browser ? 'browser WASM source-selected route; installed qualification pending' : 'Node native source-selected route; installed qualification pending',
      sourceClosure: [
        browser ? 'src/index-browser-v4.ts' : 'src/index-node-v4.ts',
        'src/access/rust-dataset-values-compact-default.ts',
        'bindings/core/wasm/src/dataset-values-compact.js',
        'bindings/core/node/src/dataset-values-compact.js',
        'bindings/core/wasm/src/core-model.js',
        'bindings/core/node/src/core-model.js',
        'crates/umf-core-wire/src/lib.rs',
        'crates/umf-core/src/dataset_values.rs',
        'crates/umf-core/src/record_values.rs',
      ].sort().map(file => ({ path: file, sha256: digest(read(file)) })),
      qualificationStatus: 'Rust compact Dataset validation is source-selected at this Node/browser root; installed qualification is pending. Verification remains TypeScript and declaration retirement remains open.',
    };
  }
  const cardinalitySymbols = new Map([
    ['inspectCoreCardinality', 'inspect_core_cardinality'],
    ['declareCoreCardinality', 'declare_core_cardinality'],
    ['verifyCoreCardinalityDeclaration', 'verify_core_cardinality_declaration'],
  ]);
  if (cardinalitySymbols.has(exportName)) {
    return {
      status: 'unqualified-current-route',
      rustOwner: `umf_core::cardinality::${cardinalitySymbols.get(exportName)}`,
      wireOperation: `model/${exportName}`,
      bindingRoute: browser ? 'browser WASM source-selected route; installed qualification pending' : 'Node native source-selected route; installed qualification pending',
      sourceClosure: [
        browser ? 'src/index-browser-v4.ts' : 'src/index-node-v4.ts',
        'src/access/rust-cardinality-default.ts',
        'bindings/core/wasm/src/core-model.js',
        'bindings/core/node/src/core-model.js',
        'crates/umf-core-wire/src/lib.rs',
        'crates/umf-core/src/cardinality.rs',
      ].sort().map(file => ({ path: file, sha256: digest(read(file)) })),
      qualificationStatus: 'Current package root source selects this Rust cardinality operation. Installed package/Chromium replay is pending; declaration retirement remains open.',
    };
  }
  if (exportName !== 'generatePythonClient') return null;
  const sourcePaths = [
    browser ? 'src/index-browser-v4.ts' : 'src/index-node-v4.ts',
    browser ? 'src/browser-v4.ts' : 'src/node-v4.ts',
    'src/access/rust-default-v4.ts',
    'src/access/rust-runtime.ts',
    'crates/umf-core-wire/src/codegen.rs',
    'crates/umf-codegen/src/generation/mod.rs',
  ];
  const qualificationPaths = browser
    ? ['scripts/test-rust-codegen-host-read-v4-browser.ts', 'scripts/test-rust-codegen-host-read-v4-package.ts']
    : ['scripts/test-rust-codegen-host-read-v4-node.ts', 'scripts/test-rust-codegen-host-read-v4-package.ts'];
  const qualificationEvidencePaths = [
    'docs/helix/04-build/evidence/rust-migration/r7-sdk-source-default-route/README.md',
    'docs/helix/04-build/evidence/rust-migration/r7-sdk-source-default-route/source-build-manifest.json',
    'docs/helix/04-build/evidence/rust-migration/r7-sdk-source-default-route/package-receipt.json',
    'docs/helix/04-build/evidence/rust-migration/r7-sdk-source-default-route/installed-test-receipt.json',
    'docs/helix/04-build/evidence/rust-migration/r7-sdk-source-default-route/action-conformance-smoke-receipt.json',
  ];
  return {
    status: 'installed-local-private-cohort',
    rustOwner: 'umf_codegen::resources::CodegenEngine::generate_python_client_host_v4',
    wireOperation: 'generatePythonClientWithHost(profile=umf.python-client-host-read/4)',
    bindingRoute: browser ? 'browser WASM candidate source route' : 'Node native candidate source route',
    sourceClosure: [...sourcePaths].sort().map(file => ({ path: file, sha256: digest(read(file)) })),
    qualificationSourceClosure: qualificationPaths.sort().map(file => ({ path: file, sha256: digest(read(file)) })),
    qualificationEvidenceClosure: qualificationEvidencePaths.sort().map(file => ({ path: file, sha256: digest(read(file)) })),
    capturedSourceTreeSha256: '0bf95b9c99c7fd328cf5d9f2cc5a04d1a4d637832a45446c6a0bc4893081cc55',
    qualificationStatus: 'R7 local private captured cohort: installed Node/Bun and real Chromium replay plus 139-case installed Bun smoke. Current worktree differs (including core source), so this is not combined-tree, publishable or retirement qualification.',
  };
}

function operationMapping(row) {
  const direct = accepted.get(`${row.source}#${row.exportName}`);
  if (direct) return direct;
  if (['package-root-node', 'package-root-browser'].includes(row.routeId)
      && ['src/index-node-v4.ts', 'src/index-browser-v4.ts'].includes(row.source)) {
    if (['inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'].includes(row.exportName)) {
      return accepted.get(`src/model/facets.ts#${row.exportName}`) ?? null;
    }
    if (['parseBits128', 'bits128FromBytes', 'bits128ToBytes', 'compareBits128', 'bits128ToWords', 'bits128FromWords', 'bits128ToInteger', 'bits128FromInteger'].includes(row.exportName)) {
      return accepted.get(`src/model/bit128.ts#${row.exportName}`) ?? null;
    }
    if (['parseUuid', 'uuidFromBits128', 'uuidToBits128'].includes(row.exportName)) {
      return accepted.get(`src/model/uuid.ts#${row.exportName}`) ?? null;
    }
    if (['inspectCoreKeys', 'lookupCoreKey', 'declareCoreRecordMembers', 'declareCoreKey'].includes(row.exportName)) {
      return accepted.get(`src/model/keys.ts#${row.exportName}`) ?? null;
    }
    if (row.exportName === 'validateCoreDatasetValuesCompact') {
      return accepted.get(`src/model/dataset-values-compact.ts#${row.exportName}`) ?? null;
    }
    if (['inspectCoreCardinality', 'declareCoreCardinality', 'verifyCoreCardinalityDeclaration'].includes(row.exportName)) {
      return accepted.get(`src/model/cardinality.ts#${row.exportName}`) ?? null;
    }
    if (['parseGregorianDate', 'truncateGregorianDate'].includes(row.exportName)) return accepted.get(`src/adapters/gregorian-date.ts#${row.exportName}`) ?? null;
    if (['parseRfc3339ExactInstant', 'sameRfc3339ExactInstant'].includes(row.exportName)) return accepted.get(`src/adapters/rfc3339-exact-instant.ts#${row.exportName}`) ?? null;
    if (['inspectCoreRelationships', 'lookupCoreRelationship', 'declareCoreRelationship', 'verifyCoreRelationshipOperation'].includes(row.exportName)) return accepted.get(`src/model/relationships.ts#${row.exportName}`) ?? null;
  }
  return null;
}

const resourceScanCache = new Map();
function filesUnder(directory, predicate) {
  const base = path.join(root, directory);
  if (!fs.existsSync(base)) return [];
  const result = [];
  const walk = current => {
    for (const item of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, item.name);
      if (item.isDirectory() && !['target', 'node_modules', '__pycache__', '.venv'].includes(item.name)) walk(full);
      else if (item.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join('/');
        if (predicate(relative)) result.push(relative);
      }
    }
  };
  walk(base);
  return result;
}

function resourceScans(scriptFiles) {
  const key = scriptFiles.map(file => `${file.path}:${file.sha256}`).join('\n');
  if (resourceScanCache.has(key)) return resourceScanCache.get(key);
  const rustSources = [
    ...filesUnder('crates/umf-core/src', file => file.endsWith('.rs')),
    ...filesUnder('crates/umf-core-wire/src', file => file.endsWith('.rs')),
    ...filesUnder('crates/umf-cli/src', file => file.endsWith('.rs')),
  ];
  const sourceImports = filesUnder('src', file => file.endsWith('.ts') || file.endsWith('.tsx'));
  const rootImports = new Map();
  const rustConsumers = new Map();
  for (const file of [...sourceImports, ...rustSources]) {
    const text = read(file).toString('utf8');
    for (const resource of knownResourcePaths) {
      if (!text.includes(resource)) continue;
      if (file.startsWith('src/')) {
        const owners = rootImports.get(resource) ?? [];
        owners.push(file);
        rootImports.set(resource, owners);
      } else {
        const owners = rustConsumers.get(resource) ?? [];
        const kind = file.startsWith('crates/umf-core/src/') ? 'umf-core compile-time include'
          : file.startsWith('crates/umf-core-wire/src/') ? 'umf-core-wire compile-time include'
            : 'umf CLI compile-time include';
        owners.push({ file, kind, sha256: digest(read(file)) });
        rustConsumers.set(resource, owners);
      }
    }
  }
  const exactGenerators = new Map();
  const scriptCandidates = scriptFiles.filter(file => /(?:schema|metamodel|resource)/i.test(file.path)
    && !/(?:browser|oracle|test|freeze|audit|check|verify|conformance|evidence|parity)/i.test(file.path));
  const directOutput = /(?:Bun\.write|writeFileSync|writeFile|write_text|write_bytes)\s*\(\s*(['"`])([^'"`]+)\1/g;
  for (const script of scriptCandidates) {
    const text = read(script.path).toString('utf8');
    for (const match of text.matchAll(directOutput)) {
      const output = match[2].replace(/^\.\//, '');
      if (knownResourcePaths.includes(output)) {
        const entries = exactGenerators.get(output) ?? [];
        entries.push(script.path);
        exactGenerators.set(output, entries);
      }
    }
  }
  const metamodelManifest = json('spec/metamodel/generated/manifest.json');
  const metamodelOutputs = new Set(Object.keys(metamodelManifest.outputs ?? {}));
  const generatorReceiptPath = 'docs/helix/04-build/evidence/metamodel-authority/regression/current-schema-generators/receipt.json';
  const generatorReceipt = json(generatorReceiptPath);
  const generatorOutputs = new Set(Object.keys(generatorReceipt.affectedResourceSha256 ?? {}));
  const scans = { rootImports, rustConsumers, exactGenerators, metamodelOutputs, metamodelManifestPath: 'spec/metamodel/generated/manifest.json', generatorOutputs, generatorReceiptPath };
  resourceScanCache.set(key, scans);
  return scans;
}

const knownResourcePaths = [];
function pathExists(file) { return fs.existsSync(path.join(root, file)); }
// CONTRACT-014 defines this bounded Smithy family as normative authored
// schemas. The SDK build copies spec/ as data; it does not generate these
// schema bytes. Hash the contract/export/build closure in every ledger row.
const authoredResourceAuthorities = new Map([
  ...[
    'spec/extensions/smithy/schema.json',
    'spec/extensions/smithy/native-structure.schema.json',
    'spec/extensions/smithy/native-assembly.schema.json',
    'spec/extensions/smithy/assembly-result.schema.json',
    'spec/extensions/smithy/native-selection.schema.json',
    'spec/extensions/smithy/selection-result.schema.json',
    'spec/projections/smithy-json-schema.schema.json',
  ].map(file => [file, {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-014-smithy.md'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-014-smithy.md', 'src/index.ts',
      'src/adapters/smithy/index.ts', 'src/adapters/smithy/assembly.ts',
      'src/adapters/smithy/selection.ts', 'src/projections/smithy-json-schema.ts',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ...[
    'spec/extensions/openapi/reference-result.schema.json',
    'spec/extensions/openapi/schema-extraction.schema.json',
    'spec/extensions/openapi/schema-index.schema.json',
    'spec/extensions/openapi/schema-reference.schema.json',
    'spec/extensions/openapi/dynamic-reference.schema.json',
  ].map(file => [file, {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-011-openapi.md'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-011-openapi.md', 'src/index.ts',
      'src/adapters/openapi/index.ts', 'src/adapters/openapi/references.ts',
      'src/adapters/openapi/extraction.ts', 'src/adapters/openapi/scope.ts',
      'src/adapters/openapi/dynamic.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ['spec/projections/openapi-json-schema.schema.json', {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-012-openapi-json-schema.md'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-012-openapi-json-schema.md', 'src/index.ts',
      'src/projections/openapi-json-schema.ts', 'src/adapters/openapi/scope.ts',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/projections/ddd-json-schema.schema.json', {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-006-ddd-document-projection.md',
      'docs/helix/01-frame/user-stories/US-006-ddd-document-projection.md'],
    governingClauses: ['US-006-AC1', 'US-006-AC3'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-006-ddd-document-projection.md',
      'docs/helix/01-frame/user-stories/US-006-ddd-document-projection.md',
      'src/projections/ddd-json-schema.ts', 'tests/projections/ddd-json-schema.test.ts',
      'scripts/browser.ts', 'src/index.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/projections/bit128-model.schema.json', {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md',
      'docs/helix/02-design/solution-designs/SD-005-128-bit-uuid.md'],
    governingClauses: ['CONTRACT-076 § Model composition profile — uuid-model1'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md',
      'docs/helix/02-design/solution-designs/SD-005-128-bit-uuid.md',
      'src/projections/bit128-model.ts', 'tests/uuid-model.test.ts',
      'tests/uuid-mixed-model.test.ts', 'src/index.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/projections/postgresql-row-json-schema.schema.json', {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md'],
    governingClauses: ['US-015-AC9'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md',
      'src/projections/postgresql-json-schema.ts', 'tests/postgresql/projection.test.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/core/native-json.schema.json', {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md',
      'docs/helix/02-design/contracts/CONTRACT-077-generated-reference.md'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md',
      'docs/helix/02-design/contracts/CONTRACT-077-generated-reference.md',
      'src/model/native-json.ts', 'src/index.ts', 'tests/core/native-json.test.ts',
      'src/core-ideals/cardinality-avro.ts', 'src/core-ideals/cardinality-postgresql.ts',
      'src/core-ideals/cardinality-sqlserver.ts', 'src/core-ideals/cardinality-tablespec.ts',
      'src/core-ideals/facets-avro.ts', 'src/core-ideals/facets-postgresql.ts',
      'src/core-ideals/facets-sqlserver.ts', 'src/core-ideals/facets-tablespec.ts',
      'src/core-ideals/nullability-avro.ts', 'src/core-ideals/nullability-parquet.ts',
      'src/core-ideals/nullability-postgresql.ts', 'src/core-ideals/nullability-sqlserver.ts',
      'src/core-ideals/nullability-tablespec.ts', 'src/core-ideals/relationship-postgresql.ts',
      'src/adapters/avro/facet-type.ts', 'src/adapters/postgresql/key-catalog.ts',
      'src/adapters/postgresql/key-correlation.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/core/semantic-types-selection.schema.json', {
    kind: 'authored-versioned-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-078-semantic-types.md'],
    governingClauses: ['CONTRACT-078 § Published schemas'],
    authoringHistory: [{
      commit: 'f397e484727cc7405958c9ec40468cf6134e48e3',
      action: 'added; current bytes match introducing blob',
      sha256: '529d97cfd8ff7b5e201967c7156dc8c9439d5984ac1ee755bdb60a2d505bdead',
    }],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-078-semantic-types.md',
      'src/model/selection-schemas.ts', 'src/model/semantic-types.ts',
      'tests/semantic-types/composition.test.ts', 'src/index.ts',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts',
      'scripts/package-sdk.py',
      'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/core-selection-schema-authority.md'],
  }],
  ...[
    ['spec/projections/ddd-graphql.schema.json',
      'docs/helix/02-design/technical-designs/TD-049-ddd-graphql.md',
      'TD-049 § Complete 0.7.0 projection',
      'dcc8c540b', '8a4a5686d67ee70a8adc3bde0abdae4989e1437aa389fccce6c0a62b2592cb21',
      '1a550add6922767237364b6ecc0184d165c08c0c34a7208a7db7ad423f9a0042',
      ['src/projections/ddd-graphql/index.ts', 'tests/projections/ddd-graphql.test.ts']],
    ['spec/core/facets-sqlserver-projection.schema.json',
      'docs/helix/02-design/technical-designs/TD-043-core-facets.md',
      'TD-043 § SQL Server authored facet projection',
      'e1c5bb2df', 'a539e3fd69967c44c60f8a4757a0d8aeb743e889a41a4532699380230a3d7ef8',
      '6c92fee8e2bdaad0991e846d72786d259364ee3bc901503db90609d278885f2d',
      ['src/core-ideals/facets-sqlserver-projection.ts', 'scripts/core-ideals/facets-sqlserver-projection-native.ts']],
    ['spec/core/sqlserver-facet-classification.schema.json',
      'docs/helix/02-design/technical-designs/TD-043-core-facets.md',
      'TD-043 § SQL Server facet classification API',
      '0749e74fa', 'fe3f7f430bd8682f8ab6ad8f71a4606c1b43a469a412352e3ee4cb6684e331c2',
      'b2db09ae9cd6877aa6ac8e3fc2fa267ebf2c530fa9d2c2867f1de21c38cc67f5',
      ['src/core-ideals/facets-sqlserver.ts', 'scripts/core-ideals/facets-sqlserver-classification-browser.ts']],
  ].map(([file, design, clause, addedCommit, addedSha256, refreshedSha256, consumers]) => [file, {
    kind: 'authored-versioned-design-schema',
    governingArtifacts: [design],
    governingClauses: [clause],
    authoringHistory: [
      {commit: addedCommit, action: 'added', sha256: addedSha256},
      {commit: '8706814a9', action: 'updated; current bytes match', sha256: refreshedSha256},
    ],
    closurePaths: [design, ...consumers, 'src/index.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py',
      'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/projection-parquet-sqlserver-resource-authority.md'],
  }]),
  ...[
    ['spec/projections/avro-json-schema.schema.json',
      'docs/helix/02-design/contracts/CONTRACT-008-avro-document-projection.md',
      'docs/helix/01-frame/user-stories/US-008-avro-document-projection.md',
      ['US-008-AC1', 'US-008-AC2'], 'src/projections/avro-json-schema.ts', 'tests/avro/projection.test.ts'],
    ['spec/projections/graphql-input-json-schema.schema.json',
      'docs/helix/02-design/contracts/CONTRACT-010-graphql-input-projection.md',
      'docs/helix/01-frame/user-stories/US-010-graphql-input-projection.md',
      ['US-010-AC1', 'US-010-AC2', 'US-010-AC3'], 'src/projections/graphql-input-json-schema.ts', 'tests/graphql/projection.test.ts'],
    ['spec/projections/json-schema-protobuf.schema.json',
      'docs/helix/02-design/contracts/CONTRACT-004-json-schema-protobuf-projection.md',
      'docs/helix/01-frame/user-stories/US-004-json-schema-protobuf-projection.md',
      ['US-004-AC1', 'US-004-AC2', 'US-004-AC4'], 'src/projections/json-schema-protobuf.ts', 'tests/projections/json-schema-protobuf.test.ts'],
  ].map(([file, contract, story, governingClauses, consumer, test]) => [file, {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: [contract, story],
    governingClauses,
    closurePaths: [contract, story, consumer, test, 'src/index.ts',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ...[
    ['spec/extensions/typespec/syntax-locations.schema.json', ['US-013-AC1'],
      ['src/adapters/typespec/index.ts', 'tests/typespec/native.test.ts']],
    ['spec/extensions/typespec/compiler-report.schema.json', ['US-013-AC1'],
      ['src/adapters/typespec/compiler.ts', 'tests/typespec/native.test.ts']],
    ['spec/extensions/typespec/semantic-graph.schema.json', ['US-013-AC5', 'US-013-AC6'],
      ['src/adapters/typespec/semantic.ts', 'tests/typespec/semantic.test.ts']],
    ['spec/extensions/typespec/json-schema-emission.schema.json', ['US-013-AC12', 'US-013-AC13'],
      ['src/adapters/typespec/emission.ts', 'tests/typespec/emission.test.ts']],
    ['spec/projections/typespec-json-schema.schema.json', ['US-013-AC15', 'US-013-AC16'],
      ['src/projections/typespec-json-schema.ts', 'tests/typespec/projection.test.ts']],
  ].map(([file, governingClauses, consumers]) => [file, {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-013-typespec.md',
      'docs/helix/01-frame/user-stories/US-013-typespec.md'],
    governingClauses,
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-013-typespec.md',
      'docs/helix/01-frame/user-stories/US-013-typespec.md', ...consumers,
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ...[
    ['spec/extensions/postgresql/schema.json', ['src/adapters/postgresql/index.ts'], ['US-015-AC1', 'US-015-AC3']],
    ['spec/extensions/postgresql-catalog/schema.json', ['src/adapters/postgresql/catalog.ts'], ['US-015-AC6']],
    ['spec/extensions/postgresql-catalog/capture.schema.json', ['src/adapters/postgresql/catalog.ts'], ['US-015-AC6']],
  ].map(([file, consumers, governingClauses]) => [file, {
    kind: 'authored-normative-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md'],
    governingClauses,
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md', ...consumers,
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ...[
    ['spec/core/dataset-value-operation.schema.json', 'docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md',
      ['src/model/dataset-values.ts', 'src/model/evolution.ts', 'src/model/internal/schema-work.ts', 'src/index.ts'],
      'c7c95e1c4ea5b72541f47fa0350ca467ff02f395', '913b25afb079d6952e31006ee4a772e77b67461d9029f8cccda24dd4ce017b7a',
      '217cc3c05e10cec1bb4e93cca1205c039f596e95080cba075823a9b8b351013d'],
    ['spec/core/dataset-value-compact-operation.schema.json', 'docs/helix/02-design/contracts/CONTRACT-056-core-dataset-compact.md',
      ['src/model/dataset-values-compact.ts', 'src/model/internal/schema-work.ts', 'src/index.ts'],
      'a95c3ec18a8f904decde884a4fa252988d2a5b0f', 'b113553c04e1c25eeb5f19da0879d8273c1e34ed515126d751bc812424843caf',
      '89f502aa0cea1a75fba2ff586c795c875a980b96af3e01d3117538e9fe12e74e'],
  ].map(([file, contract, consumers, addedCommit, addedSha256, refreshedSha256]) => [file, {
    kind: 'authored-versioned-contract-schema',
    governingArtifacts: [contract],
    authoringHistory: [
      { commit: addedCommit, action: 'added', sha256: addedSha256 },
      { commit: '8706814a9', action: 'updated', sha256: refreshedSha256 },
    ],
    closurePaths: [contract, ...consumers, 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
]);
const explicitGeneratedResourceAuthorities = new Map([
  ['spec/extensions/parquet/idl.json', {
    kind: 'generated-from-pinned-parquet-thrift-descriptor-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md'],
    governingClauses: ['CONTRACT-019 § Pinned IDL and named metadata (US-019-AC6)'],
    generator: 'scripts/parquet-idl.py',
    reproductionStatus: 'Current bytes match the historical generated output and the current writer differs only by SPDX; a fresh thriftpy2 0.5.3 compiler replay was unavailable in this worktree.',
    inputPaths: ['native/parquet/sources/manifest.json', 'native/parquet/sources/parquet.thrift'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md',
      'scripts/parquet-idl.py', 'native/parquet/sources/manifest.json',
      'native/parquet/sources/parquet.thrift', 'native/parquet/sources/LogicalTypes.md',
      'native/parquet/sources/Encryption.md', 'native/parquet/sources/Encodings.md',
      'native/parquet/sources/LICENSE', 'native/parquet/sources/NOTICE',
      'docker/core-replay/oracle-requirements.txt', 'src/adapters/parquet/idl-map.ts',
      'scripts/parquet-metadata-schema.ts', 'src/index.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py',
      'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/projection-parquet-sqlserver-resource-authority.md'],
  }],
  ['spec/extensions/delta-log/inspection.schema.json', {
    kind: 'generated-from-exact-contract-governed-delta-log-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-018-delta.md',
      'docs/helix/01-frame/user-stories/US-018-delta-schema.md'],
    governingClauses: ['US-018-AC9', 'US-018-AC10'],
    generator: 'scripts/delta-log-schema.ts',
    inputPaths: ['spec/core/native-json.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-018-delta.md',
      'docs/helix/01-frame/user-stories/US-018-delta-schema.md',
      'scripts/delta-log-schema.ts', 'src/model/types.ts', 'src/generated/core-model.ts',
      'spec/core/native-json.schema.json', 'src/index.ts', 'tests/delta/log.test.ts',
      'tests/delta/actions.test.ts', 'spec/extensions/delta-log/schema.json',
      'spec/extensions/delta-log/package.json', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/extensions/parquet/framing.schema.json', {
    kind: 'generated-from-exact-contract-governed-parquet-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md',
      'docs/helix/01-frame/user-stories/US-019-parquet.md'],
    governingClauses: ['US-019-AC1', 'US-019-AC2'],
    generator: 'scripts/parquet-schema.ts',
    inputPaths: [],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md',
      'docs/helix/01-frame/user-stories/US-019-parquet.md',
      'scripts/parquet-schema.ts', 'src/model/types.ts', 'src/generated/core-model.ts',
      'src/index.ts', 'tests/parquet/capture.test.ts', 'tests/parquet/footer.test.ts',
      'spec/extensions/parquet/schema.json', 'spec/extensions/parquet/package.json',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/extensions/spark/datatype-schema.json', {
    kind: 'generated-from-exact-contract-governed-spark-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-017-spark.md',
      'docs/helix/01-frame/user-stories/US-017-spark-schema.md'],
    governingClauses: ['US-017-AC1', 'US-017-AC2'],
    generator: 'scripts/spark-schema.ts',
    inputPaths: ['spec/core/native-json.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-017-spark.md',
      'docs/helix/01-frame/user-stories/US-017-spark-schema.md',
      'scripts/spark-schema.ts', 'src/model/types.ts', 'src/generated/core-model.ts',
      'spec/core/native-json.schema.json', 'src/adapters/spark/index.ts',
      'src/index.ts', 'tests/spark/schema.test.ts', 'spec/extensions/spark/schema.json',
      'spec/extensions/spark/package.json', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/extensions/sqlserver-nullability/native.schema.json', {
    kind: 'generated-from-exact-self-contained-native-evidence-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-041-core-nullability.md',
      'docs/helix/01-frame/user-stories/US-041-core-nullability.md'],
    governingClauses: ['US-041-AC2', 'US-041-AC6'],
    generator: 'scripts/core-ideals/nullability-sqlserver-evidence-schema.ts',
    inputPaths: [],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-041-core-nullability.md',
      'docs/helix/01-frame/user-stories/US-041-core-nullability.md',
      'scripts/core-ideals/nullability-sqlserver-evidence-schema.ts',
      'src/core-ideals/nullability-sqlserver.ts',
      'tests/core-ideals/nullability-sqlserver.test.ts', 'src/index.ts',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ...[
    ['spec/extensions/delta/datatype-schema.json', 'src/adapters/delta/index.ts'],
    ['spec/extensions/delta-table/context-schema.json', 'src/adapters/delta/table.ts'],
  ].map(([file, consumer]) => [file, {
    kind: 'generated-from-contract-governed-delta-profile-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-018-delta.md',
      'docs/helix/01-frame/user-stories/US-018-delta-schema.md'],
    governingClauses: [file === 'spec/extensions/delta/datatype-schema.json' ? 'US-018-AC1' : 'US-018-AC4'],
    generator: file === 'spec/extensions/delta/datatype-schema.json' ? 'scripts/delta-schema.ts' : 'scripts/delta-table-schema.ts',
    inputPaths: ['src/model/types.ts', 'spec/core/native-json.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-018-delta.md',
      'docs/helix/01-frame/user-stories/US-018-delta-schema.md', 'src/model/types.ts',
      'src/generated/core-model.ts', 'src/model/errors.ts', 'spec/core/schema.json',
      'spec/core/semantic-type-reference.schema.json', 'spec/core/extension-package.schema.json',
      'spec/metamodel/generated/core-constraints.json', 'spec/metamodel/generated/domain-policy.json',
      'spec/core/native-json.schema.json',
      file === 'spec/extensions/delta/datatype-schema.json' ? 'scripts/delta-schema.ts' : 'scripts/delta-table-schema.ts',
      'src/index.ts', 'src/adapters/delta/index.ts', 'src/adapters/delta/table.ts',
      'tests/delta/schema.test.ts', 'tests/delta/table.test.ts',
      file === 'spec/extensions/delta/datatype-schema.json'
        ? 'spec/extensions/delta/schema.json' : 'spec/extensions/delta-table/schema.json',
      file === 'spec/extensions/delta/datatype-schema.json'
        ? 'spec/extensions/delta/package.json' : 'spec/extensions/delta-table/package.json',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ...[
    ['spec/extensions/postgresql-catalog/key-observations-v1.schema.json',
      ['src/adapters/postgresql/key-catalog.ts', 'src/core-ideals/key-postgresql.ts', 'tests/core-ideals/key-postgresql-catalog.test.ts']],
    ['spec/core/postgresql-key-catalog-inspection.schema.json',
      ['src/adapters/postgresql/key-catalog.ts', 'tests/core-ideals/key-postgresql-catalog.test.ts']],
    ['spec/core/postgresql-key-catalog-correlation.schema.json',
      ['src/adapters/postgresql/key-correlation.ts', 'tests/core-ideals/key-postgresql-correlation.test.ts']],
  ].map(([file, consumers]) => [file, {
    kind: 'generated-from-contract-governed-postgresql-key-catalog-schemas',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md'],
    governingClauses: ['US-015-AC6'],
    generator: 'scripts/core-ideals/key-postgresql-catalog-schema.ts',
    inputPaths: [],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md',
      'docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md', 'spec/core/native-json.schema.json',
      'scripts/core-ideals/key-postgresql-catalog-schema.ts',
      'src/adapters/postgresql/key-catalog.ts', 'src/adapters/postgresql/key-correlation.ts',
      'src/core-ideals/key-postgresql.ts', ...consumers, 'src/adapters/postgresql/index.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ['spec/extensions/delta-log/parquet-checkpoint.schema.json', {
    kind: 'generated-from-contract-governed-delta-checkpoint-schema-composition',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-018-delta.md',
      'docs/helix/01-frame/user-stories/US-018-delta-schema.md'],
    governingClauses: ['US-018-AC18'],
    generator: 'scripts/delta-parquet-checkpoint-schema.ts',
    inputPaths: ['spec/extensions/delta-log/reconciliation.schema.json',
      'spec/extensions/delta-log/sidecar-reconciliation.schema.json',
      'spec/extensions/delta-log/parquet-actions.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-018-delta.md',
      'docs/helix/01-frame/user-stories/US-018-delta-schema.md',
      'scripts/delta-parquet-checkpoint-schema.ts', 'scripts/delta-reconcile-schema.ts',
      'scripts/delta-sidecars-schema.ts', 'scripts/delta-parquet-actions-schema.ts',
      'scripts/delta-schema.ts', 'scripts/delta-log-schema.ts', 'scripts/delta-action-schema.ts',
      'scripts/delta-table-schema.ts', 'scripts/parquet-values-schema.ts',
      'scripts/parquet-rows-schema.ts', 'scripts/parquet-physical-schema.ts',
      'scripts/parquet-levels-schema.ts', 'scripts/parquet-pages-schema.ts',
      'scripts/parquet-metadata-schema.ts', 'scripts/parquet-footer-schema.ts',
      'src/index.ts', 'tests/delta/parquet-checkpoint.test.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py',
      'spec/extensions/delta-log/reconciliation.schema.json',
      'spec/extensions/delta-log/sidecar-reconciliation.schema.json',
      'spec/extensions/delta-log/parquet-actions.schema.json',
      'spec/extensions/parquet/values.schema.json', 'spec/extensions/parquet/physical.schema.json',
      'spec/extensions/parquet/rows.schema.json', 'spec/extensions/parquet/levels.schema.json',
      'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json',
      'spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/footer-decode.schema.json',
      'spec/extensions/parquet/idl.json', 'spec/extensions/delta-log/inspection.schema.json',
      'spec/extensions/delta-table/context-schema.json'],
  }],
  ['spec/extensions/postgresql/native-ast.schema.json', {
    kind: 'generated-from-pinned-postgresql-protobuf-descriptor',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md'],
    governingClauses: ['US-015-AC1', 'US-015-AC3', 'US-015-AC4'],
    generator: 'scripts/postgresql-schema.ts',
    inputPaths: ['native/postgresql/protobuf/pg_query.proto', 'native/postgresql/protobuf/manifest.json',
      'package.json', 'bun.lock'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-015-postgresql.md',
      'docs/helix/01-frame/user-stories/US-015-postgresql.md', 'scripts/postgresql-schema.ts',
      'native/postgresql/protobuf/pg_query.proto', 'native/postgresql/protobuf/manifest.json',
      'native/postgresql/protobuf/schema-evidence.json', 'package.json', 'bun.lock',
      'src/adapters/postgresql/index.ts', 'tests/postgresql/edit-preservation.test.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/core/field-tablespec-projection.schema.json', {
    kind: 'generated-from-exact-self-contained-projection-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-040-core-field.md',
      'docs/helix/01-frame/user-stories/US-040-core-field.md'],
    governingClauses: ['US-040-AC3', 'US-040-AC4', 'US-040-AC5'],
    generator: 'scripts/core-ideals/field-tablespec-projection-schema.ts',
    inputPaths: [],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-040-core-field.md',
      'docs/helix/01-frame/user-stories/US-040-core-field.md',
      'scripts/core-ideals/field-tablespec-projection-schema.ts',
      'scripts/core-ideals/projection-policy-schema.ts',
      'src/core-ideals/field-tablespec-projection.ts',
      'tests/core-ideals/field-tablespec-projection.test.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/core/cardinality-tablespec-projection.schema.json', {
    kind: 'generated-from-exact-single-output-projection-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
      'docs/helix/01-frame/user-stories/US-042-core-cardinality.md'],
    governingClauses: ['US-042-AC3', 'US-042-AC4', 'US-042-AC5'],
    generator: 'scripts/core-ideals/cardinality-tablespec-projection-schema.ts',
    inputPaths: ['spec/core/field-tablespec-projection.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
      'docs/helix/01-frame/user-stories/US-042-core-cardinality.md',
      'scripts/core-ideals/cardinality-tablespec-projection-schema.ts',
      'spec/core/field-tablespec-projection.schema.json',
      'src/core-ideals/cardinality-tablespec-projection.ts',
      'tests/core-ideals/cardinality-tablespec-projection.test.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ...[
    'spec/extensions/parquet/metadata.schema.json',
    'spec/extensions/parquet/metadata-inspection.schema.json',
  ].map(resource => [resource, {
    kind: 'generated-from-contract-governed-multi-output-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md',
      'docs/helix/01-frame/user-stories/US-019-parquet.md'],
    governingClauses: ['US-019-AC6'],
    generator: 'scripts/parquet-metadata-schema.ts',
    inputPaths: ['spec/extensions/parquet/idl.json', 'spec/extensions/parquet/footer-decode.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md',
      'docs/helix/01-frame/user-stories/US-019-parquet.md',
      'scripts/parquet-metadata-schema.ts', 'scripts/parquet-idl.py',
      'native/parquet/sources/manifest.json', 'native/parquet/sources/parquet.thrift',
      'spec/extensions/parquet/idl.json', 'spec/extensions/parquet/footer-decode.schema.json',
      'src/adapters/parquet/metadata.ts', 'tests/parquet/metadata.test.ts', 'src/index.ts',
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ['spec/core/field-postgresql-projection.schema.json', {
    kind: 'generated-from-exact-single-output-projection-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-040-core-field.md',
      'docs/helix/01-frame/user-stories/US-040-core-field.md'],
    governingClauses: ['US-040-AC3', 'US-040-AC4', 'US-040-AC5'],
    generator: 'scripts/core-ideals/field-postgresql-projection-schema.ts',
    inputPaths: ['spec/core/field-tablespec-projection.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-040-core-field.md',
      'docs/helix/01-frame/user-stories/US-040-core-field.md',
      'scripts/core-ideals/field-postgresql-projection-schema.ts',
      'spec/core/field-tablespec-projection.schema.json',
      'src/core-ideals/field-postgresql-projection.ts',
      'tests/core-ideals/field-postgresql-projection.test.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/core/cardinality-postgresql-projection.schema.json', {
    kind: 'generated-from-exact-single-output-projection-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
      'docs/helix/01-frame/user-stories/US-042-core-cardinality.md'],
    governingClauses: ['US-042-AC3', 'US-042-AC4', 'US-042-AC5'],
    generator: 'scripts/core-ideals/cardinality-postgresql-projection-schema.ts',
    inputPaths: ['spec/core/field-postgresql-projection.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
      'docs/helix/01-frame/user-stories/US-042-core-cardinality.md',
      'scripts/core-ideals/cardinality-postgresql-projection-schema.ts',
      'spec/core/field-postgresql-projection.schema.json',
      'src/core-ideals/cardinality-postgresql-projection.ts',
      'tests/core-ideals/cardinality-postgresql-projection.test.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/core/field-sqlserver-projection.schema.json', {
    kind: 'generated-from-exact-single-output-projection-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-040-core-field.md',
      'docs/helix/01-frame/user-stories/US-040-core-field.md',
      'docs/helix/02-design/contracts/CONTRACT-031-sqlserver.md'],
    governingClauses: ['US-040-AC3', 'US-040-AC4', 'US-040-AC5', 'US-031-AC5'],
    generator: 'scripts/core-ideals/field-sqlserver-projection-schema.ts',
    inputPaths: ['spec/core/field-postgresql-projection.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-040-core-field.md',
      'docs/helix/01-frame/user-stories/US-040-core-field.md',
      'docs/helix/02-design/contracts/CONTRACT-031-sqlserver.md',
      'scripts/core-ideals/field-sqlserver-projection-schema.ts',
      'scripts/core-ideals/projection-policy-schema.ts',
      'src/core-ideals/sqlserver-syntax.ts', 'spec/core/field-postgresql-projection.schema.json',
      'src/core-ideals/field-sqlserver-projection.ts', 'tests/core-ideals/field-sqlserver-projection.test.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ['spec/core/cardinality-sqlserver-projection.schema.json', {
    kind: 'generated-from-exact-single-output-projection-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
      'docs/helix/01-frame/user-stories/US-042-core-cardinality.md',
      'docs/helix/02-design/contracts/CONTRACT-031-sqlserver.md'],
    governingClauses: ['US-042-AC3', 'US-042-AC4', 'US-042-AC5', 'US-031-AC5'],
    generator: 'scripts/core-ideals/cardinality-sqlserver-projection-schema.ts',
    inputPaths: ['spec/core/field-sqlserver-projection.schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md',
      'docs/helix/02-design/technical-designs/TD-042-core-cardinality.md',
      'docs/helix/01-frame/user-stories/US-042-core-cardinality.md',
      'docs/helix/02-design/contracts/CONTRACT-031-sqlserver.md',
      'scripts/core-ideals/cardinality-sqlserver-projection-schema.ts',
      'spec/core/field-sqlserver-projection.schema.json',
      'src/core-ideals/cardinality-sqlserver-projection.ts', 'tests/core-ideals/cardinality-sqlserver-projection.test.ts',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ...[
    ['spec/extensions/parquet/levels.schema.json', 'scripts/parquet-levels-schema.ts', ['spec/extensions/parquet/pages.schema.json'], 'US-019-AC16'],
    ['spec/extensions/parquet/physical.schema.json', 'scripts/parquet-physical-schema.ts', ['spec/extensions/parquet/levels.schema.json'], 'US-019-AC17'],
    ['spec/extensions/parquet/rows.schema.json', 'scripts/parquet-rows-schema.ts', ['spec/extensions/parquet/physical.schema.json'], 'US-019-AC18'],
    ['spec/extensions/parquet/values.schema.json', 'scripts/parquet-values-schema.ts', ['spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json'], 'US-019-AC19'],
  ].map(([file, generator, inputPaths, clause]) => [file, {
    kind: 'generated-from-contract-governed-parquet-result-schema-chain',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md', 'docs/helix/01-frame/user-stories/US-019-parquet.md'],
    governingClauses: [clause],
    generator,
    inputPaths,
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-019-parquet.md', 'docs/helix/01-frame/user-stories/US-019-parquet.md',
      'scripts/parquet-levels-schema.ts', 'scripts/parquet-physical-schema.ts', 'scripts/parquet-rows-schema.ts', 'scripts/parquet-values-schema.ts',
      'scripts/parquet-pages-schema.ts', 'scripts/parquet-metadata-schema.ts', 'scripts/parquet-footer-schema.ts', 'scripts/parquet-schema.ts',
      'src/model/types.ts', 'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py',
      'spec/extensions/parquet/levels.schema.json', 'spec/extensions/parquet/physical.schema.json',
      'spec/extensions/parquet/rows.schema.json', 'spec/extensions/parquet/values.schema.json',
      'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json',
      'spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json',
      ...inputPaths],
  }]),
  ...[
    ['spec/projections/spark-arrow.schema.json', 'scripts/spark-arrow-schema.ts', [], 'US-017-AC6'],
    ['spec/projections/arrow-spark.schema.json', 'scripts/arrow-spark-schema.ts', ['spec/projections/spark-arrow.schema.json'], 'US-017-AC7'],
  ].map(([file, generator, inputPaths, clause]) => [file, {
    kind: 'generated-from-contract-governed-spark-projection-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-017-spark.md', 'docs/helix/01-frame/user-stories/US-017-spark-schema.md'],
    governingClauses: [clause],
    generator,
    inputPaths,
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-017-spark.md', 'docs/helix/01-frame/user-stories/US-017-spark-schema.md',
      generator, ...inputPaths, 'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ...[
    'spec/extensions/domain-pack/schema.json',
    'spec/extensions/domain-pack/package.json',
    'spec/extensions/dataset-source/schema.json',
    'spec/extensions/dataset-source/package.json',
  ].map(file => [file, {
    kind: 'generated-from-explicit-typescript-schema-builder',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-052-domain-packs.md'],
    generator: 'scripts/domain-pack-schema.ts',
    inputPaths: ['src/domain-packs/schema.ts', 'src/domain-packs/source-schema.ts'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-052-domain-packs.md',
      'scripts/domain-pack-schema.ts', 'src/domain-packs/schema.ts',
      'src/domain-packs/source-schema.ts', 'src/index.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ...[
    ['spec/extensions/arrow-ipc/layout-result.schema.json', 'scripts/arrow-ipc-layout-schema.ts'],
    ['spec/extensions/arrow-ipc/consistency-result.schema.json', 'scripts/arrow-ipc-consistency-schema.ts'],
    ['spec/extensions/arrow-ipc/rename-result.schema.json', 'scripts/arrow-ipc-rename-schema.ts'],
  ].map(([file, generator]) => [file, {
    kind: 'generated-from-contract-governed-single-output-schema-writer',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md'],
    generator,
    inputPaths: [],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md', generator,
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ...[
    'spec/extensions/arrow/schema.json',
    'spec/extensions/arrow/integration-schema.json',
  ].map(file => [file, {
    kind: 'generated-from-contract-governed-arrow-schema-generator',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md'],
    generator: 'scripts/arrow-schema.ts',
    inputPaths: ['src/model/types.ts', 'spec/extensions/postgresql/schema.json'],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md',
      'scripts/arrow-schema.ts', 'src/model/types.ts', 'spec/extensions/postgresql/schema.json',
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ['spec/extensions/arrow/flatbuffer-model.schema.json', {
    kind: 'generated-from-contract-governed-pinned-flatbuffer-sources',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md'],
    generator: 'scripts/arrow-flatbuffer-schema.ts',
    inputPaths: ['src/model/types.ts', 'spec/extensions/arrow/flatbuffers/manifest.json',
      ...Object.keys(json('spec/extensions/arrow/flatbuffers/manifest.json').files).map(file => `spec/extensions/arrow/flatbuffers/${file}`)],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-016-arrow.md',
      'scripts/arrow-flatbuffer-schema.ts', 'src/model/types.ts',
      'spec/extensions/arrow/flatbuffers/manifest.json',
      ...Object.keys(json('spec/extensions/arrow/flatbuffers/manifest.json').files).map(file => `spec/extensions/arrow/flatbuffers/${file}`),
      'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
  ...[
    ['spec/extensions/delta-log/action-schema.json', 'scripts/delta-action-schema.ts',
      ['spec/extensions/delta-table/context-schema.json', 'spec/extensions/delta-log/inspection.schema.json', 'spec/core/native-json.schema.json'],
      ['US-018-AC10']],
    ['spec/extensions/delta-log/parquet-actions.schema.json', 'scripts/delta-parquet-actions-schema.ts',
      ['spec/extensions/parquet/values.schema.json', 'spec/core/native-json.schema.json', 'spec/extensions/delta-log/inspection.schema.json',
        'spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json', 'spec/extensions/parquet/levels.schema.json',
        'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json', 'spec/extensions/parquet/metadata.schema.json',
        'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json'],
      ['US-018-AC15']],
    ['spec/extensions/delta-log/sidecar-reconciliation.schema.json', 'scripts/delta-sidecars-schema.ts',
      ['spec/extensions/delta-log/reconciliation.schema.json', 'spec/extensions/delta-log/parquet-actions.schema.json',
        'spec/core/native-json.schema.json', 'spec/extensions/delta-log/inspection.schema.json',
        'spec/extensions/parquet/values.schema.json', 'spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json',
        'spec/extensions/parquet/levels.schema.json', 'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json',
        'spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json'],
      ['US-018-AC16']],
    ['spec/extensions/delta-log/multipart.schema.json', 'scripts/delta-multipart-schema.ts',
      ['spec/extensions/delta-log/parquet-checkpoint.schema.json', 'spec/extensions/delta-log/reconciliation.schema.json',
        'spec/extensions/delta-log/sidecar-reconciliation.schema.json', 'spec/extensions/delta-log/parquet-actions.schema.json',
        'spec/core/native-json.schema.json', 'spec/extensions/delta-log/inspection.schema.json',
        'spec/extensions/parquet/values.schema.json', 'spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json',
        'spec/extensions/parquet/levels.schema.json', 'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json',
        'spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json'],
      ['US-018-AC19']],
  ].map(([file, generator, inputPaths, clause]) => {
    const sharedClosure = ['docs/helix/02-design/contracts/CONTRACT-018-delta.md', generator,
      'scripts/delta-log-schema.ts', 'scripts/delta-reconcile-schema.ts', 'scripts/delta-parquet-checkpoint-schema.ts',
      'scripts/delta-parquet-actions-schema.ts', 'scripts/delta-sidecars-schema.ts', 'scripts/delta-multipart-schema.ts',
      'scripts/delta-table-schema.ts', 'scripts/parquet-values-schema.ts', 'scripts/parquet-rows-schema.ts',
      'scripts/parquet-physical-schema.ts', 'scripts/parquet-levels-schema.ts', 'scripts/parquet-pages-schema.ts', 'scripts/parquet-metadata-schema.ts',
      'scripts/parquet-footer-schema.ts',
      'src/model/types.ts', 'src/index.ts', 'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py',
      'spec/core/native-json.schema.json', 'spec/extensions/delta-log/inspection.schema.json',
      'spec/extensions/delta-log/reconciliation.schema.json', 'spec/extensions/delta-log/parquet-actions.schema.json',
      'spec/extensions/delta-log/sidecar-reconciliation.schema.json', 'spec/extensions/delta-log/parquet-checkpoint.schema.json',
      'spec/extensions/parquet/physical.schema.json', 'spec/extensions/parquet/rows.schema.json', 'spec/extensions/parquet/values.schema.json',
      'spec/extensions/parquet/levels.schema.json', 'spec/extensions/parquet/pages.schema.json', 'spec/extensions/parquet/framing.schema.json',
      'spec/extensions/parquet/metadata.schema.json', 'spec/extensions/parquet/footer-decode.schema.json', 'spec/extensions/parquet/idl.json'];
    return [file, {
      kind: 'generated-from-contract-governed-delta-schema-composition',
      governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-018-delta.md'],
      governingClauses: clause,
      generator,
      inputPaths,
      closurePaths: [...new Set([...sharedClosure, ...inputPaths,
        ...(file.endsWith('action-schema.json') ? ['spec/extensions/delta-table/context-schema.json'] : [])])],
    }];
  }),
]);

// These versioned core schemas were directly authored alongside the contract
// revision that defines their subset, then intentionally refreshed to core
// 0.10 references in the metamodel-current-definition commit. They have no
// executable schema writer: preserve their direct authorship history instead
// of inferring a generator from nearby operation code.
const versionedCoreSchemaAuthors = new Map([
  ...[
    ['spec/core/bit128-selection.schema.json', ['docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'], ['src/index.ts'], 'db9ae63d0d647f544caed064fe80b68d208246c3a77fafc9be9f00ed59652c5f', '2ae3a359b46bc7bf82dcdc8098ae46f60bfb64bba5bd4acb1b0e6ded4eee5442'],
    ['spec/core/cardinality-operation-v6.schema.json', ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'], ['src/model/cardinality.ts', 'src/index.ts'], 'ad379c477298cffc32e72c8722a3d06f3dc81694ac9d1cb0d5b1d23e942f2bf5', 'c606cf71b5fe0b2afb15f0ffd3fcce20c449857b954852e63d944040dacf6595'],
    ['spec/core/facet-operation-v5.schema.json', ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'], ['src/model/facets.ts', 'src/index.ts'], 'f70a0cf3ee39ee725d5a33def64ed6c8557e7fbef4d3d0ca89afd53a8b6820e3', 'de87a6c79500be2b99337f5a885698b24b9e4d47a997c6d3cd649c90ea853bca'],
    ['spec/core/key-operation-v4.schema.json', ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'], ['src/model/keys.ts', 'src/index.ts'], 'dd087b5e26a92dd6ee5366ded216a006ed4ef5e7b31e851890fd81d978606ba1', 'f9306a891b4f0f9f180160144109e05b42e05e8868dcc84fc301f5819c63519f'],
    ['spec/core/key-tuple-operation-v4.schema.json', ['docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'], ['src/model/key-tuple.ts', 'src/model/evolution.ts', 'src/model/dataset-values.ts', 'src/model/dataset-values-compact.ts', 'src/index.ts'], '90691e12c3edd982009124ea3d7a170d0f109bca76d388d5388bd2578ffaee0c', 'fe7d93da41ac331696686bd32fb0be8ca62b7a5638b95b975034195d66dff2cc'],
    ['spec/core/relationship-metadata-selection-v2.schema.json', ['docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'], ['src/model/relationship-selection.ts', 'src/index.ts'], '991f845a1b8a7517c1ad6a43826b31cb83ae03d597b8cbc8b7dcea8e933c29b8', 'e1586b2164f8f1c06dabdf7505861ab7c39c5cef0a267a3033a8d95aa479f720'],
    ['spec/core/relationship-operation-v3.schema.json', ['docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'], ['src/model/relationships.ts', 'src/index.ts'], '58c3d8a0ba0a0261ef3954f2952df62830c28b2570f523e11eab612206e67603', '42a3a7ad1e3ef7ac80ef5044948aad12847de22aaf63367e6264bfcb2434bda7'],
    ['spec/core/relationship-extras.schema.json', ['docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'docs/helix/02-design/technical-designs/TD-045-relationship.md', 'docs/helix/01-frame/user-stories/US-045-relationship.md'], ['src/core-ideals/relationship-extras.ts', 'src/index.ts'], '8976c2c707c5616922bebf085f65d6d029ca7ed685c90cad5613dbd87ecb226c', 'fad9ec7ad8b33cc631647a30e1061a926307c702e9a5c18ba7cdf8dff94510e6', '997c1a16a9b52e62252b5ce4e4bc3d4f3b7b7cb9'],
    ['spec/core/relationship-parquet-projection.schema.json', ['docs/helix/02-design/contracts/CONTRACT-041-relationship.md', 'docs/helix/02-design/contracts/CONTRACT-019-parquet.md'], ['src/core-ideals/relationship-parquet-projection.ts', 'src/index.ts'], 'ef753a57872076791c435ec2612efb3ce7259ed719baa2a2b28d7a6494c223ec', '01c2c812a06130abddb4ec78d8760537f18cff2eb6bfd96f09b87b748dd9192b', 'f69d1a7c7b7d62d4f2924217b813f8b58b07ecef'],
  ].map(([file, governingArtifacts, consumers, addedSha256, refreshedSha256, addedCommit = '25a38767a3ce7a2c7af297cf541196e9cbc6ad4a']) => [file, {
    kind: 'authored-versioned-contract-schema',
    governingArtifacts,
    authoringHistory: [
      { commit: addedCommit, action: 'added', sha256: addedSha256 },
      { commit: '8706814a9', action: 'updated', sha256: refreshedSha256 },
    ],
    closurePaths: [...governingArtifacts, ...consumers,
      ...(file === 'spec/core/relationship-extras.schema.json' ? ['docs/helix/01-frame/user-stories/US-045-relationship.md', 'tests/core-ideals/relationship-extras.test.ts'] : []),
      ...(file === 'spec/core/relationship-parquet-projection.schema.json' ? ['tests/core-ideals/relationship-parquet.test.ts'] : []),
      ...(file === 'spec/core/relationship-metadata-selection-v2.schema.json' ? ['tests/core/relationship-selection.test.ts'] : []),
      ...(file === 'spec/core/relationship-operation-v3.schema.json' ? ['tests/core/relationship-operations.test.ts'] : []),
      'scripts/build.ts', 'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }]),
  ['spec/core/csv-boolean-lexical-operation.schema.json', {
    kind: 'authored-versioned-contract-schema',
    governingArtifacts: ['docs/helix/02-design/contracts/CONTRACT-053-domain-pack-profiles.md'],
    authoringHistory: [
      { commit: '8e76c74d14203225d1ef159c9132bb9e9b0cdffe', action: 'added', sha256: '1c07d500c8dd6732ce814bdfb04a532a8df313c0df188f369faf7fcf0b2b85b0' },
      { commit: '8706814a9605d7325eef32a5df3d05696de00b62', action: 'updated', sha256: '6548b442849a2a1246ea860ca5be22eecd98596c571d9c0b74ce1eba7780b791' },
    ],
    closurePaths: ['docs/helix/02-design/contracts/CONTRACT-053-domain-pack-profiles.md',
      'src/model/csv-boolean-lexical.ts', 'tests/csv-boolean-lexical.test.ts',
      'scripts/browser-csv-boolean-lexical.ts', 'src/index.ts', 'scripts/build.ts',
      'scripts/package-sdk-rust-default.ts', 'scripts/package-sdk.py'],
  }],
]);

function resourceOwnership(row, aliasCount, scans) {
  const sourcePath = row.source;
  const sourceHash = digest(read(sourcePath));
  const authoredAuthority = authoredResourceAuthorities.get(sourcePath) ?? versionedCoreSchemaAuthors.get(sourcePath);
  const explicitGeneratedAuthority = explicitGeneratedResourceAuthorities.get(sourcePath);
  const generators = scans.exactGenerators.get(sourcePath) ?? [];
  const metamodelGenerated = scans.metamodelOutputs.has(sourcePath);
  const recordedGenerated = scans.generatorOutputs.has(sourcePath);
  const generatorKind = metamodelGenerated ? 'metamodel' : explicitGeneratedAuthority?.kind ?? authoredAuthority?.kind ?? (generators.length ? 'candidate-direct-output-literal; writer/input relation not proven' : null);
  const generatorPaths = metamodelGenerated ? ['scripts/metamodel/build.ts', 'crates/umf-metamodel/src/lib.rs'] : explicitGeneratedAuthority ? [explicitGeneratedAuthority.generator] : generators;
  const authorityStatus = metamodelGenerated || explicitGeneratedAuthority ? 'generated-authority-known' : authoredAuthority ? 'authored-authority-known' : generators.length === 1 ? 'candidate-generated' : 'authority-unresolved';
  const generatorRuntime = explicitGeneratedAuthority
    ? { language: generatorPaths.some(file => file.endsWith('.py')) ? 'Python' : 'TypeScript', runtime: generatorPaths.some(file => file.endsWith('.py')) ? 'Python 3' : 'Bun', entrypoints: generatorPaths }
    : metamodelGenerated
    ? { language: 'TypeScript host plus Rust compiler', runtime: 'Bun host; pinned native Rust metamodel compiler', entrypoints: generatorPaths }
    : generators.length
      ? { language: generatorPaths.some(file => file.endsWith('.py')) ? 'Python' : 'TypeScript', runtime: generatorPaths.some(file => file.endsWith('.py')) ? 'Python 3' : 'Bun', entrypoints: generatorPaths }
      : null;
  const generatorClosurePaths = [...new Set([
    ...(authoredAuthority ? authoredAuthority.closurePaths : []),
    ...(explicitGeneratedAuthority ? explicitGeneratedAuthority.closurePaths : []),
    ...generatorPaths,
    ...(metamodelGenerated ? [scans.metamodelManifestPath] : []),
    ...(recordedGenerated ? [scans.generatorReceiptPath] : []),
  ])].filter(pathExists).sort();
  const rootSourcePaths = [...new Set(['src/index.ts', ...(scans.rootImports.get(sourcePath) ?? [])])].filter(pathExists).sort();
  const route = (id, status, details, sourcePaths, installedQualification) => ({
    id, status, ...details,
    sourceClosure: [...new Set(sourcePaths)].filter(pathExists).sort().map(file => ({ path: file, sha256: digest(read(file)) })),
    installedQualification,
  });
  const rootRouteDefinitions = row.routeId === 'package-root-node'
    ? [{ id: 'package-root-node', entry: 'src/index-node-v4.ts', target: './dist/umf-node.js', host: 'Node' }]
    : row.routeId === 'package-root-browser'
      ? [{ id: 'package-root-browser', entry: 'src/index-browser-v4.ts', target: './dist/umf-browser.js', host: 'browser ESM' }]
      : row.routeId === 'package-reference'
        ? [{ id: 'package-reference', entry: 'src/index.ts', target: './dist/umf.js', host: 'Node, Bun and browser ESM' }]
        : [{ id: 'package-root-typescript', entry: 'src/index.ts', target: './dist/umf.js', host: 'Node, Bun and browser ESM' }];
  const routes = rootRouteDefinitions.map(definition => route(definition.id, 'source-linked', {
    exportName: row.exportName,
    exportSource: row.source,
    routeSource: definition.entry,
    entrypoint: definition.entry,
    inheritedDataSource: 'src/index.ts',
    artifactPath: `${definition.target.replace('./dist/', 'dist/')}`,
    resourceArtifactPath: `dist/spec/${sourcePath.slice('spec/'.length)}`,
    routeScope: row.routeId === 'package-reference' ? 'Explicit TypeScript reference route.' : row.routeId.startsWith('package-root-') ? 'Condition-specific root entrypoint plus inherited src/index.ts export/data graph.' : 'Legacy fixture route.',
  }, [...rootSourcePaths, definition.entry, sourcePath], { status: 'not-installed-qualified', artifact: `${definition.target}; source-package archive and installed resource bytes not qualified`, runtimeHosts: [definition.host] }));
  routes.push(route('sdk-archive', 'build-rule-only', {
    buildRule: 'scripts/build.ts copies the complete spec/ tree to dist/spec; scripts/package-sdk.py includes dist/spec in the tarball',
    artifactPath: `package/dist/spec/${sourcePath.slice('spec/'.length)}`,
    platform: 'ESM bundle is intended to be platform-independent; installed per-host resource bytes are unqualified',
  }, [sourcePath, 'scripts/build.ts', 'scripts/package-sdk.ts', 'scripts/package-sdk.py', 'package.json'], { status: 'not-installed-qualified', artifact: '@umf/core production SDK archive for the current source cohort', runtimeHosts: ['Node', 'Bun', 'browser ESM'] }));
  const rust = scans.rustConsumers.get(sourcePath) ?? [];
  if (rust.length) routes.push(route('rust-compile-time-includes', 'source-embedded', {
    consumers: rust.map(({ file, kind }) => ({ file, kind })),
    artifact: 'Native crate/CLI build output; not the TypeScript root resource export',
  }, [sourcePath, ...rust.map(item => item.file)], { status: 'source-only', artifact: 'No per-resource installed native distribution receipt' }));
  const pythonRoutes = [];
  const pythonCore = ['spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json', 'spec/core/extension-package.schema.json'];
  const actionRuntime = new Map([
    ['spec/core/schema.json', 'coreSchema.json'],
    ['spec/core/semantic-type-reference.schema.json', 'referenceSchema.json'],
    ['spec/core/extension-package.schema.json', 'packageSchema.json'],
    ['spec/metamodel/generated/core-constraints.json', 'constraints.json'],
    ['spec/metamodel/generated/domain-policy.json', 'domainPolicy.json'],
    ['spec/extensions/tables/package.json', 'tablesPackage.json'],
    ['spec/extensions/actions/package.json', 'actionsPackage.json'],
    ['spec/extensions/binding/package.json', 'bindingPackage.json'],
    ['spec/extensions/binding-stable/package.json', 'stableBindingPackage.json'],
  ]);
  const codegenResources = new Map([
    ['spec/extensions/actions/package.json', 'actions.package.json'],
    ['spec/extensions/binding/package.json', 'binding.package.json'],
    ['spec/metamodel/generated/core-constraints.json', 'core.constraints.json'],
    ['spec/metamodel/generated/domain-policy.json', 'core.domain-policy.json'],
    ['spec/core/extension-package.schema.json', 'core.package-schema.json'],
    ['spec/core/semantic-type-reference.schema.json', 'core.reference-schema.json'],
    ['spec/core/schema.json', 'core.schema.json'],
    ['spec/extensions/binding-stable/package.json', 'stable-binding.package.json'],
    ['spec/extensions/tables/package.json', 'tables.package.json'],
  ]);
  if (pythonCore.includes(sourcePath) || sourcePath.startsWith('spec/metamodel/generated/')
      || ['spec/extensions/domain-pack/schema.json', 'spec/extensions/dataset-source/schema.json'].includes(sourcePath)) {
    pythonRoutes.push(route('python-core-wheel', 'hatch-wheel-rule', {
      artifactPath: `umf/${sourcePath}`,
      packageRule: pythonCore.includes(sourcePath) ? 'CORE_RESOURCES forced into the umf-core wheel' : sourcePath.startsWith('spec/metamodel/generated/') ? 'generated resource directory forced into the umf-core wheel' : 'canonical extension schema forced into the umf-core wheel',
    }, [sourcePath, 'python/hatch_build.py', 'python/pyproject.toml'], { status: 'not-installed-qualified', artifact: 'umf-core wheel from current source cohort', runtimeHosts: ['CPython wheel target/platform not captured'] }));
  }
  if (actionRuntime.has(sourcePath)) pythonRoutes.push(route('python-action-runtime-copy', 'hashed-copy-rule', {
    artifactPath: `umf/action_runtime_resources/${actionRuntime.get(sourcePath)}`,
    packageRule: 'Hatch hook stages a nine-resource copy; source mapping and resource manifest are explicit',
  }, [sourcePath, 'python/hatch_build.py', 'python/src/umf/action_runtime.py', 'python/src/umf/action_runtime_resource_manifest.json'], { status: 'installed-evidence-not-current-source-bound', artifact: 'Historical wheel/resource tests exist; current exact wheel receipt not established here', runtimeHosts: ['CPython wheel target/platform not captured'] }));
  if (codegenResources.has(sourcePath)) pythonRoutes.push(route('python-codegen-wheel-copy', 'hashed-copy-rule', {
    artifactPath: `umf_codegen/_resources/${codegenResources.get(sourcePath)}`,
    packageRule: 'Nine canonical inputs copied and checked by sync_codegen_resources.py; exact bytes listed in _resources/manifest.json',
  }, [sourcePath, 'scripts/rust-migration/r4/sync_codegen_resources.py', 'python/umf_codegen/src/umf_codegen/_resources/manifest.json', 'python/umf_codegen/src/umf_codegen/_release.py', 'python/umf_codegen/pyproject.toml'], { status: 'installed-evidence-not-current-source-bound', artifact: 'umf-codegen wheel; installed source cohort not pinned to this inventory row', runtimeHosts: ['CPython wheel target/platform not captured'] }));
  routes.push(...pythonRoutes);
  const executablePortDisposition = generatorRuntime
    ? (metamodelGenerated ? 'Rust compiler owns generated semantics; TypeScript/Bun orchestration disposition requires explicit thin-host review' : 'Generator remains TypeScript/Python build tooling; Rust-port versus justified host-tool disposition is open')
    : 'No exact executable generator identified; authority/source provenance review remains open';
  const evidencePaths = [
    ...(recordedGenerated ? [scans.generatorReceiptPath] : []),
    ...(metamodelGenerated ? ['spec/metamodel/generated/manifest.json'] : []),
    ...(pythonRoutes.some(item => item.id === 'python-codegen-wheel-copy') ? ['python/umf_codegen/tests/test_native_contract.py', 'python/umf_codegen/tests/test_resources.py'] : []),
  ].filter(pathExists);
  return {
    source: { path: sourcePath, sha256: sourceHash, packageRootAliasCount: aliasCount },
    authority: {
      status: authorityStatus,
      canonicalPath: sourcePath,
      generatorKind: generatorKind ?? (recordedGenerated ? 'historical-generator-cohort-output; exact writer unresolved' : 'unresolved'),
      generator: generatorRuntime,
      executablePortDisposition,
      kind: authoredAuthority?.kind ?? explicitGeneratedAuthority?.kind ?? null,
      governingArtifacts: authoredAuthority?.governingArtifacts ?? explicitGeneratedAuthority?.governingArtifacts ?? [],
      governingClauses: authoredAuthority?.governingClauses ?? explicitGeneratedAuthority?.governingClauses ?? [],
      generatorInputs: explicitGeneratedAuthority?.inputPaths ?? [],
      ...(explicitGeneratedAuthority?.reproductionStatus ? {reproductionStatus: explicitGeneratedAuthority.reproductionStatus} : {}),
      ...(authoredAuthority?.authoringHistory ? { authoredRevisionClosure: authoredAuthority.authoringHistory } : {}),
      sourceClosureCompleteness: authoredAuthority?.authoringHistory ? 'direct versioned schema authorship and governing contract/current source/package closure are pinned; SDK archive bytes remain unqualified' : authoredAuthority ? 'normative schema authority traced to governing contract; authored schema bytes are copied under dist/spec by the SDK build; installed archive bytes remain unqualified' : explicitGeneratedAuthority ? 'exact generator, schema-builder inputs, governing contract, package exports and build/archive rules are hash-pinned; installed archive bytes remain unqualified' : metamodelGenerated ? 'direct compiler/host/manifest files; transitive Cargo and metamodel input closure not frozen per resource' : generatorRuntime ? 'candidate entrypoint hash only; writer condition and transitive input closure unproven' : 'no generator source closure established',
      historicalGeneratorReceipt: recordedGenerated ? { path: scans.generatorReceiptPath, sha256: digest(read(scans.generatorReceiptPath)), outputSha256: digest(Buffer.from(String(json(scans.generatorReceiptPath).affectedResourceSha256[sourcePath]))) } : null,
      sourceClosure: generatorClosurePaths.map(file => ({ path: file, sha256: digest(read(file)) })),
    },
    routes,
    evidenceClosure: [...new Set(evidencePaths)].sort().map(file => ({ path: file, sha256: digest(read(file)) })),
    defaultRouteStatus: row.routeId === 'package-reference'
      ? 'Explicit ./reference TypeScript resource route; not a default Node/browser route; zero resource rows retired'
      : row.routeId === 'package-root-node'
        ? 'Node default route inherits the TypeScript resource/data leg; installed route and bytes unqualified; zero resource rows retired'
        : row.routeId === 'package-root-browser'
          ? 'Browser default route inherits the TypeScript resource/data leg; installed route and bytes unqualified; zero resource rows retired'
          : 'TypeScript package-root data export remains default; zero resource rows retired',
    reviewStatus: 'Machine source/route census; per-resource authority and exact installed-artifact review pending',
    knownGaps: [
      ...(!['generated-authority-known', 'authored-authority-known'].includes(authorityStatus) ? ['Exact authoring authority or generator input/write relation is not established by the current static source map'] : []),
      ...(authoredAuthority || explicitGeneratedAuthority ? ['Source authority and package build closure are pinned; installed archive byte qualification remains open'] : []),
      'No current production SDK archive receipt binds this resource byte hash to an installed artifact',
    ],
  };
}

function ownerFamily(source) {
  const parts = source.split('/');
  if (source.startsWith('spec/')) return `resource:${parts.slice(0, 3).join('/')}`;
  if (parts[1] === 'adapters' || parts[1] === 'extensions' || parts[1] === 'projections') {
    const family = parts[2] ?? '(root)';
    return `${parts[1]}:${family.replace(/\.[^.]+$/, '')}`;
  }
  if (parts[1] === 'domain-packs') return `domain-packs:${parts[2] ?? '(root)'}`;
  if (parts[1] === 'generated') return 'generated-runtime';
  if (parts[1] === 'model' || parts[1] === 'validation' || parts[1] === 'registry' || parts[1] === 'core-ideals') return `${parts[1]}:${path.basename(source, path.extname(source))}`;
  return parts.slice(0, 2).join(':');
}

function publicRows(inventory) {
  const conditionRoutes = ['package-root-node', 'package-root-browser', 'package-reference'];
  const presentRoutes = conditionRoutes.filter(routeId => inventory.symbols.some(row => row.routeId === routeId));
  let rootRows;
  if (presentRoutes.length) {
    const missing = conditionRoutes.filter(routeId => !presentRoutes.includes(routeId));
    if (missing.length) throw new Error(`R8 condition-aware ledger is missing required routes: ${missing.join(', ')}`);
    rootRows = inventory.symbols.filter(row => conditionRoutes.includes(row.routeId));
    const routeSignatures = conditionRoutes.map(routeId => {
      const counts = new Map();
      for (const row of rootRows.filter(item => item.routeId === routeId)) {
        const signature = logicalDeclarationSignature(row);
        counts.set(signature, (counts.get(signature) ?? 0) + 1);
      }
      return { routeId, counts };
    });
    const reference = routeSignatures[0].counts;
    for (const { routeId, counts } of routeSignatures.slice(1)) {
      if (counts.size !== reference.size || [...reference].some(([signature, count]) => counts.get(signature) !== count)) {
        throw new Error(`R8 condition-aware declaration multiplicity differs for ${routeId}; review route-specific overloads before counting logical gaps`);
      }
    }
  } else {
    // Legacy synthetic fixtures remain useful for unit-testing row enrichment;
    // the source inventory itself must use the complete condition-aware model.
    rootRows = inventory.symbols.filter(row => row.routeId === 'package-root');
    if (rootRows.length === 0) {
      throw new Error('R8 gap ledger needs a condition-aware Node/browser/reference root model; refusing an empty ledger for the new source inventory');
    }
  }
  knownResourcePaths.splice(0, knownResourcePaths.length, ...new Set(rootRows
    .filter(row => row.source.startsWith('spec/') && row.source.endsWith('.json'))
    .map(row => row.source)));
  const scans = resourceScans(collectScriptFiles());
  const aliasNamesBySource = new Map();
  for (const row of rootRows) {
    const names = aliasNamesBySource.get(row.source) ?? new Set();
    names.add(row.exportName);
    aliasNamesBySource.set(row.source, names);
  }
  const occurrenceByRoute = new Map();
  const logicalKeyByRow = new Map();
  for (const row of rootRows) {
    const declarationSignature = logicalDeclarationSignature(row);
    const routeSignature = `${row.routeId}\0${declarationSignature}`;
    const ordinal = occurrenceByRoute.get(routeSignature) ?? 0;
    occurrenceByRoute.set(routeSignature, ordinal + 1);
    logicalKeyByRow.set(row, `${declarationSignature}\0${ordinal}`);
  }
  return rootRows.map((row, index) => {
    const inert = row.source.startsWith('spec/') && row.source.endsWith('.json');
    const mapping = operationMapping(row);
    const sourceSelection = sourceSelectedImplementation(row.routeId, row.exportName, row.source);
    const selectedBySource = sourceSelection !== null;
    const selectedCardinality = mapping && ['package-root-node', 'package-root-browser'].includes(row.routeId)
      && ['inspectCoreCardinality', 'declareCoreCardinality', 'verifyCoreCardinalityDeclaration'].includes(row.exportName);
    const selectedBit128 = mapping && ['package-root-node', 'package-root-browser'].includes(row.routeId)
      && ['parseBits128', 'parseUuid', 'bits128FromBytes', 'bits128ToBytes', 'uuidFromBits128', 'uuidToBits128', 'compareBits128', 'bits128ToWords', 'bits128FromWords', 'bits128ToInteger', 'bits128FromInteger'].includes(row.exportName);
    const operation = operationOwnership(row.exportName, row.routeId === 'package-root-node' ? 'default-node' : row.routeId === 'package-root-browser' ? 'default-browser' : row.routeId === 'package-reference' ? 'explicit-reference' : 'legacy-fixture');
    const routeDetails = {
      'package-root-node': {
        route: '.', routeStatus: 'default-node',
        defaultRoute: inert ? 'JSON resource export from Node package root' : 'Node package root declaration',
        implementationStatus: row.exportName === 'generatePythonClient'
          ? 'Rust V4 implementation selected by source route; installed qualification pending'
          : selectedCardinality ? 'Rust cardinality operation selected by source route; installed qualification pending'
          : ['inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'].includes(row.exportName) ? 'Rust facets operation selected by source route; installed qualification pending'
          : row.exportName === 'validateCoreDatasetValuesCompact' ? 'Rust compact Dataset validation selected by source route; installed qualification pending'
          : ['inspectCoreKeys', 'lookupCoreKey', 'declareCoreRecordMembers', 'declareCoreKey'].includes(row.exportName) ? 'Rust Core Keys operation selected by source route; installed qualification pending'
          : selectedBit128 ? 'Rust Bit128/UUID operation selected by source route; installed qualification pending'
          : ['inspectCoreScalarType', 'inspectCoreRecordMembers', 'inspectCoreReferenceLinks'].includes(row.exportName) && selectedBySource ? 'Rust core inspector selected by source route; prior private installed archive passed; current cohort qualification pending'
          : ['validateCsvBooleanLexical', 'verifyCsvBooleanLexical'].includes(row.exportName) && selectedBySource ? 'Rust CSV Boolean lexical operation selected by source route; prior private installed archive passed frozen cases but accessor parity failed; current cohort qualification pending'
          : inert ? 'TypeScript package-root data export remains default' : 'inherited TypeScript implementation remains default',
      },
      'package-root-browser': {
        route: '.', routeStatus: 'default-browser',
        defaultRoute: inert ? 'JSON resource export from browser package root' : 'browser package root declaration',
        implementationStatus: row.exportName === 'generatePythonClient'
          ? 'Rust V4 implementation selected by source route; installed qualification pending'
          : selectedCardinality ? 'Rust cardinality operation selected by source route; installed qualification pending'
          : ['inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'].includes(row.exportName) ? 'Rust facets operation selected by source route; installed qualification pending'
          : row.exportName === 'validateCoreDatasetValuesCompact' ? 'Rust compact Dataset validation selected by source route; installed qualification pending'
          : ['inspectCoreKeys', 'lookupCoreKey', 'declareCoreRecordMembers', 'declareCoreKey'].includes(row.exportName) ? 'Rust Core Keys operation selected by source route; installed qualification pending'
          : selectedBit128 ? 'Rust Bit128/UUID operation selected by source route; installed qualification pending'
          : ['inspectCoreScalarType', 'inspectCoreRecordMembers', 'inspectCoreReferenceLinks'].includes(row.exportName) && selectedBySource ? 'Rust core inspector selected by source route; prior private installed archive passed; current cohort qualification pending'
          : ['validateCsvBooleanLexical', 'verifyCsvBooleanLexical'].includes(row.exportName) && selectedBySource ? 'Rust CSV Boolean lexical operation selected by source route; prior private installed archive passed frozen cases but accessor parity failed; current cohort qualification pending'
          : inert ? 'TypeScript package-root data export remains default' : 'inherited TypeScript implementation remains default',
      },
      'package-reference': {
        route: './reference', routeStatus: 'explicit-reference',
        defaultRoute: inert ? 'JSON resource export from explicit TypeScript reference route' : 'explicit TypeScript reference declaration',
        implementationStatus: inert ? 'TypeScript reference data export remains explicit' : 'TypeScript reference implementation remains explicit',
      },
    }[row.routeId] ?? {
      route: '.', routeStatus: 'legacy-fixture',
      defaultRoute: inert ? 'JSON resource export from current package root' : 'TypeScript declaration from current package root',
      implementationStatus: inert ? 'TypeScript package-root data export remains default' : 'TypeScript package-root export remains default',
    };
    const disposition = row.routeId === 'package-root'
      ? inert ? 'retain-as-data; authority and installed-asset route require source-specific review' : mapping ? 'opt-in Rust core operation exists; default TypeScript route remains TypeScript' : 'default route remains TypeScript; exact Rust operation, binding route and retirement disposition unresolved'
      : inert
      ? 'retain as JSON resource data; authority and installed asset route require source-specific review'
      : row.routeId === 'package-reference'
        ? 'explicit TypeScript reference declaration remains available; not a Node/browser default-route claim'
        : row.exportName === 'generatePythonClient' && ['package-root-node', 'package-root-browser'].includes(row.routeId)
          ? `${row.routeId === 'package-root-node' ? 'Node' : 'browser'} Rust V4 implementation selected by source route; installed qualification pending; TypeScript retirement gap remains open`
          : selectedCardinality
            ? `${row.routeId === 'package-root-node' ? 'Node' : 'browser'} Rust cardinality operation selected by source route; installed qualification pending; retirement gap remains open`
          : ['inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'].includes(row.exportName) && ['package-root-node', 'package-root-browser'].includes(row.routeId)
            ? `${row.routeId === 'package-root-node' ? 'Node' : 'browser'} Rust facets operation selected by source route; installed qualification pending; retirement gap remains open`
          : row.exportName === 'validateCoreDatasetValuesCompact' && ['package-root-node', 'package-root-browser'].includes(row.routeId)
            ? `${row.routeId === 'package-root-node' ? 'Node' : 'browser'} Rust compact Dataset validation selected by source route; installed qualification pending; verification remains TypeScript and retirement gap remains open`
          : ['inspectCoreKeys', 'lookupCoreKey', 'declareCoreRecordMembers', 'declareCoreKey'].includes(row.exportName) && ['package-root-node', 'package-root-browser'].includes(row.routeId)
            ? `${row.routeId === 'package-root-node' ? 'Node' : 'browser'} Rust Core Keys operation selected by source route; installed qualification pending; verifyCoreKeyOperation remains TypeScript and retirement gap remains open`
          : ['inspectCoreScalarType', 'inspectCoreRecordMembers', 'inspectCoreReferenceLinks'].includes(row.exportName) && selectedBySource
            ? `${row.routeId === 'package-root-node' ? 'Node' : 'browser'} Rust core inspector selected by source route; prior private archive passed installed Node/Bun/Chromium frozen cases; current-cohort qualification and retirement remain open`
          : ['validateCsvBooleanLexical', 'verifyCsvBooleanLexical'].includes(row.exportName) && selectedBySource
            ? `${row.routeId === 'package-root-node' ? 'Node' : 'browser'} Rust CSV Boolean lexical operation selected by source route; prior private archive passed installed frozen cases but accessor parity failed; current-cohort qualification and retirement remain open`
          : selectedBit128
            ? `${row.routeId === 'package-root-node' ? 'Node' : 'browser'} Rust Bit128/UUID operation source-selected only; installed Node/Bun/Chromium qualification pending; zero declarations retired`
          : mapping
            ? `bounded opt-in Rust core operation exists; ${row.routeId === 'package-root-browser' ? 'browser' : row.routeId === 'package-root-node' ? 'Node' : 'package-root'} TypeScript implementation remains in route; zero declarations retired`
            : `${row.routeId === 'package-root-browser' ? 'browser' : row.routeId === 'package-root-node' ? 'Node' : 'package-root'} route remains TypeScript; exact Rust operation and retirement disposition unresolved`;
    return {
      id: `${row.routeId}-${String(index + 1).padStart(4, '0')}`,
      routeId: row.routeId,
      route: routeDetails.route,
      routeStatus: routeDetails.routeStatus,
      implementationStatus: routeDetails.implementationStatus,
      sourceSelectedImplementation: sourceSelection,
      logicalDeclarationKey: logicalKeyByRow.get(row),
      exportName: row.exportName,
      declarationName: row.declarationName,
      declarationKind: row.declarationKind,
      source: row.source,
      line: row.line,
      sourceSha256: row.sourceSha256,
      ownerFamily: ownerFamily(row.source),
      rowKind: inert ? 'generated-inert-json' : 'executable',
      defaultRoute: routeDetails.defaultRoute,
      acceptedRustOperation: mapping ? mapping.rustOwner : null,
      acceptedOperationEvidence: mapping ? acceptedOperationEvidence(mapping, routeDetails.routeStatus) : null,
      operationOwnership: operation,
      ...(inert ? { resourceOwnership: resourceOwnership(row, aliasNamesBySource.get(row.source).size, scans) } : {}),
      evidence: mapping ? mapping.evidencePaths[0] : null,
      bindingRoute: null,
      bindingRouteStatus: 'unproven',
      disposition,
    };
  });
}

function logicalDeclarationSignature(row) {
  // These exact declarations intentionally differ by condition: the Node and
  // browser roots select Rust-backed initializers/operations while ./reference
  // retains the TypeScript declarations. Normalize only reviewed route switches.
  // Cardinality exports have the same reviewed source-selection shape: a
  // BindingElement in the Node/browser V4 entrypoints and a function in
  // ./reference. Normalize only these exact three names; overload checks for
  // every other declaration remain kind- and multiplicity-sensitive.
  const selectedOperation = row.exportName === 'generatePythonClient'
    || ['parseGregorianDate', 'truncateGregorianDate', 'parseRfc3339ExactInstant', 'sameRfc3339ExactInstant', 'inspectCoreRelationships', 'lookupCoreRelationship', 'declareCoreRelationship', 'verifyCoreRelationshipOperation'].includes(row.exportName)
    || row.exportName === 'validateCoreDatasetValuesCompact'
    || ['parseBits128', 'parseUuid', 'bits128FromBytes', 'bits128ToBytes', 'uuidFromBits128', 'uuidToBits128', 'compareBits128', 'bits128ToWords', 'bits128FromWords', 'bits128ToInteger', 'bits128FromInteger'].includes(row.exportName)
    || ['inspectCoreKeys', 'lookupCoreKey', 'declareCoreRecordMembers', 'declareCoreKey'].includes(row.exportName)
    || ['inspectCoreRecordMembers', 'inspectCoreReferenceLinks', 'inspectCoreScalarType', 'validateCsvBooleanLexical', 'verifyCsvBooleanLexical'].includes(row.exportName)
    || ['inspectCoreCardinality', 'declareCoreCardinality', 'verifyCoreCardinalityDeclaration', 'inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'].includes(row.exportName);
  const kind = selectedOperation
    && ['package-root-node', 'package-root-browser', 'package-reference'].includes(row.routeId)
    ? 'condition-selected-rust-operation'
    : row.declarationKind;
  return `${row.exportName}\0${row.declarationName}\0${kind}`;
}

function externalCensus(packageJson, packageBytes, cliBytes, pythonPackages, scriptFiles) {
  const packageScripts = Object.entries(packageJson.scripts ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, command]) => ({ name, command, entrypointFiles: [...command.matchAll(/(?:^|\s)(?:bun|node|python3?|bash)\s+((?:scripts|python)\/[\w./-]+\.(?:ts|js|mjs|py|sh))/g)].map(match => match[1]), role: name.startsWith('build') ? 'build' : name.startsWith('test') ? 'test' : name.startsWith('check') ? 'check' : 'utility', retirement: 'separate R8 tooling disposition required' }));
  const scriptEntrypoints = new Map();
  for (const item of packageScripts) for (const file of item.entrypointFiles) {
    const names = scriptEntrypoints.get(file) ?? [];
    names.push(item.name);
    scriptEntrypoints.set(file, names);
  }
  const cliSource = cliBytes.toString('utf8');
  const mainStart = cliSource.indexOf('fn main()');
  const mainEnd = cliSource.indexOf('\n#[cfg(feature = "codegen")]\nconst RESOURCE_PROFILE', mainStart);
  const runStart = cliSource.indexOf('fn run(args: Vec<String>)');
  const runEnd = cliSource.indexOf('\n#[cfg(feature = "embedded-adapters")]\nfn iceberg_run', runStart);
  if (mainStart < 0 || mainEnd < 0 || runStart < 0 || runEnd < 0) throw new Error('CLI dispatch structure changed; review the census parser.');
  const topLevelModes = new Set();
  const dispatchBlocks = [cliSource.slice(mainStart, mainEnd), cliSource.slice(runStart, runEnd)];
  for (const block of dispatchBlocks) {
    for (const match of block.matchAll(/env::args\(\)\.nth\(1\)\.as_deref\(\)\s*==\s*Some\("([^"]+)"\)|args\.first\(\)\.map\(String::as_str\)\s*(?:==|!=)\s*Some\("([^"]+)"\)/g)) {
      const name = match[1] ?? match[2];
      topLevelModes.add(name);
    }
  }
  const featureGates = { codegen: 'Cargo feature: codegen', iceberg: 'Cargo feature: embedded-adapters', protobuf: 'Cargo feature: embedded-adapters', 'json-schema': 'Cargo feature: embedded-adapters' };
  const cliModes = [...topLevelModes].sort().map(name => ({ name, featureGate: featureGates[name] ?? 'unconditional in the recorded source', source: 'crates/umf-cli/src/main.rs', sourceSha256: digest(cliBytes), route: 'native executable: umf', nestedDispatch: 'not fully inventoried here; nested command/options remain open', disposition: 'CLI behavior and default-release qualification remain independently tracked' }));
  const pythonRoots = pythonPackages.map(pkg => {
    const initSource = pkg.init.toString('utf8');
    const exportsMatch = initSource.match(/__all__\s*=\s*\[([\s\S]*?)\]/);
    let rootExports;
    let rootExportStatus;
    if (exportsMatch) {
      rootExportStatus = 'enumerated-by-__all__';
      rootExports = [...exportsMatch[1].matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map(match => ({ name: match[1], kind: 'declared-in-__all__', source: `${pkg.path}/__init__.py`, route: pkg.packageName, disposition: 'separate binding/API parity and release qualification required' }));
    } else {
      rootExportStatus = 'explicit-import-candidates-without-__all__';
      rootExports = [];
      for (const statement of initSource.matchAll(/^from\s+([.\w]+)\s+import\s+(\([\s\S]*?^\s*\)|[^\n]+)/gm)) {
        const module = statement[1];
        const clause = statement[2].replace(/[()]/g, '');
        for (const line of clause.split(/,|\n/)) {
          const imported = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/);
          if (!imported) continue;
          const name = imported[2] ?? imported[1];
          if (!name.startsWith('_')) rootExports.push({ name, kind: 'explicit-import-reexport-candidate', module, source: `${pkg.path}/__init__.py`, route: pkg.packageName, disposition: 'candidate only; package has no __all__ declaration' });
        }
      }
    }
    rootExports.sort((a, b) => a.name.localeCompare(b.name) || a.module?.localeCompare(b.module ?? '') || a.kind.localeCompare(b.kind));
    const modules = pkg.files.map(file => {
      const source = file.bytes.toString('utf8');
      const callables = [...source.matchAll(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)].map(match => match[1]).filter(name => !name.startsWith('_')).sort();
      return { source: file.path, sourceSha256: digest(file.bytes), publicCallableNames: callables, disposition: 'module-level public-by-convention surface; exact contract and Rust route remain unreviewed' };
    });
    const assets = pkg.assets.map(file => {
      const nativeExtension = /\.(?:so|dylib|dll)$/.test(file.path);
      return { source: file.path, sourceSha256: digest(file.bytes), kind: nativeExtension ? 'native-extension-binary' : 'inert-package-asset', executableAtRuntime: nativeExtension, disposition: nativeExtension ? 'native executable release input; ABI, loader and packaged-byte qualification remain required' : 'inert release input; packaging, authority and byte route require release qualification' };
    });
    return { packageName: pkg.packageName, initSha256: digest(pkg.init), rootExportStatus, rootExports, modules, assets };
  });
  return {
    packageManifestSha256: digest(packageBytes),
    packageScripts,
    repositoryScriptFiles: scriptFiles.map(file => ({ source: file.path, sourceSha256: file.sha256, packageScriptEntrypoints: scriptEntrypoints.get(file.path) ?? [], activity: scriptEntrypoints.has(file.path) ? 'direct-package-script-entrypoint' : 'package-entrypoint-reachability-unresolved', role: file.path.includes('/test') || file.path.includes('test-') ? 'test-or-qualification' : file.path.includes('/build') || file.path.includes('build-') ? 'build-tool' : 'support-tool', disposition: 'tooling closure; not part of package-root symbol rows' })),
    cliModes,
    pythonPackages: pythonRoots,
    limits: ['Package scripts are enumerated from package.json; helper scripts are listed separately by source path.', 'CLI modes are dispatch surfaces, not a complete command-option inventory.', 'Python root exports use __all__; module-level functions are reported as public-by-convention candidates, not all are supported API promises.'],
  };
}

export function buildLedger({ inventory, packageJson, packageBytes = Buffer.from(JSON.stringify(packageJson)), cliBytes, pythonPackages, scriptFiles }) {
  const rows = publicRows(inventory);
  const logicalRows = new Map();
  for (const row of rows) {
    const key = `${row.logicalDeclarationKey}\0${row.rowKind}`;
    if (!logicalRows.has(key)) logicalRows.set(key, row);
  }
  const logical = [...logicalRows.values()];
  const routeCounts = Object.fromEntries(['package-root-node', 'package-root-browser', 'package-reference'].map(routeId => {
    const routeRows = rows.filter(row => row.routeId === routeId);
    return [routeId, {
      declarations: routeRows.length,
      executableDeclarations: routeRows.filter(row => row.rowKind === 'executable').length,
      inertJsonDeclarations: routeRows.filter(row => row.rowKind === 'generated-inert-json').length,
      rustSelectedSourceDeclarations: routeRows.filter(row => row.sourceSelectedImplementation !== null).length,
      executableDefaultRouteGaps: routeId === 'package-reference' ? null : routeRows.filter(row => row.rowKind === 'executable').length,
      retainedReferenceExecutableRows: routeId === 'package-reference' ? routeRows.filter(row => row.rowKind === 'executable').length : 0,
    }];
  }));
  const byFamily = new Map();
  for (const row of rows) {
    const entry = byFamily.get(row.ownerFamily) ?? { ownerFamily: row.ownerFamily, total: 0, executable: 0, inertJson: 0, mappedOptInRust: 0, unportedExecutable: 0, rows: [] };
    entry.total++;
    if (row.rowKind === 'generated-inert-json') entry.inertJson++;
    else { entry.executable++; if (row.acceptedRustOperation) entry.mappedOptInRust++; else entry.unportedExecutable++; }
    entry.rows.push(row.id);
    byFamily.set(row.ownerFamily, entry);
  }
  const groups = [...byFamily.values()].sort((a, b) => a.ownerFamily.localeCompare(b.ownerFamily));
  const resourceRows = rows.filter(row => row.resourceOwnership);
  const uniqueResourcePaths = new Set(resourceRows.map(row => row.source));
  const runtimeExportDispositionSupplement = buildRuntimeExportDispositionSupplement();
  const counts = {
    packageRootRows: rows.length,
    routeDeclarationRows: rows.length,
    uniqueExportNames: new Set(logical.map(row => row.exportName)).size,
    executableRows: logical.filter(row => row.rowKind === 'executable').length,
    routeExecutableRows: rows.filter(row => row.rowKind === 'executable').length,
    inertJsonRows: logical.filter(row => row.rowKind === 'generated-inert-json').length,
    routeInertJsonRows: rows.filter(row => row.rowKind === 'generated-inert-json').length,
    executableWithAcceptedOptInRustOperation: logical.filter(row => row.rowKind === 'executable' && row.acceptedRustOperation).length,
    executableWithoutAcceptedRustMapping: logical.filter(row => row.rowKind === 'executable' && !row.acceptedRustOperation).length,
    executableDefaultRouteGaps: logical.filter(row => row.rowKind === 'executable').length,
    executableDefaultRouteGapDefinition: 'Unique logical executable export names unresolved for retirement from default Node/browser roots; each root has its own route count. Rust-selected entries remain gaps until current integrated-source qualification and retirement review; captured local-private qualification is reported separately, and ./reference is reported separately.',
    executableDefaultRouteGapsByRoute: routeCounts,
    sourceSelectedRustOverrides: Object.values(routeCounts).reduce((sum, route) => sum + route.rustSelectedSourceDeclarations, 0),
    bindingRoutesProven: logical.filter(row => row.bindingRoute !== null).length,
    sourceSelectedRustOverridesDefinition: 'Count of Node/browser declaration rows whose source resolves to the V4 root entry and has an exact Rust ownership mapping in this ledger. The entry declaration census is 37 per root in the current inventory; source selection does not remove any logical retirement gap. Temporal and relationship route receipts are private bounded cohorts, not release qualification.',
    bindingRoutesProvenDefinition: 'Count of accepted opt-in operation rows with a binding route proven against the current pinned inventory cohort. Root-selected rows are reported separately; source selection does not prove an installed binding route or retire a declaration.',
    ownerFamilies: groups.length,
    adapterOwnershipRows: logical.filter(row => row.operationOwnership !== null).length,
    adapterOwnershipByStatus: Object.fromEntries(['accepted-opt-in-subset', 'candidate-core', 'partial-host-boundary', 'unported', 'data-or-constant'].map(status => [status, logical.filter(row => row.operationOwnership?.status === status).length])),
    resourceExportAliases: new Set(resourceRows.map(row => `${row.source}\0${row.exportName}`)).size,
    routeResourceExportAliases: resourceRows.length,
    uniqueResourceFiles: uniqueResourcePaths.size,
    resourceAuthorityByStatus: Object.fromEntries(['generated-authority-known', 'authored-authority-known', 'candidate-generated', 'authority-unresolved'].map(status => [status, new Set(resourceRows.filter(row => row.resourceOwnership.authority.status === status).map(row => `${row.source}\0${row.exportName}`)).size])),
  };
  return {
    format: 'umf.r8.authority-bound-gap-ledger/2',
    scope: 'Route-specific runtime export declarations for the default Node root, default browser root and explicit TypeScript reference route in the pinned condition-aware inventory. Logical default gaps are counted once, with per-route status; this is a gap census, not retirement approval.',
    input: { path: inventoryPath, sha256: digest(Buffer.from(JSON.stringify(inventory, null, 2) + '\n')) },
    counts,
    runtimeExportDispositionSupplement,
    routeStatus: {
      'package-root-node': `default Node route; the current V4 entry directly defines ${routeCounts['package-root-node'].rustSelectedSourceDeclarations} Rust-owned exports and inherits ${routeCounts['package-root-node'].executableDeclarations - routeCounts['package-root-node'].rustSelectedSourceDeclarations} executable TypeScript declarations. Temporal V4 exports have prior private Node/Bun/Chromium replay with recorded source-cohort limits; Core relationship V4 exports have private fixed-point Bun/Node/Chromium 11-case replay. These cohorts do not establish release qualification. All 922 unique logical executable declarations remain retirement gaps; ./reference is separately TypeScript.`,
      'package-root-browser': `default browser route; the current V4 entry directly defines ${routeCounts['package-root-browser'].rustSelectedSourceDeclarations} Rust-owned exports and inherits ${routeCounts['package-root-browser'].executableDeclarations - routeCounts['package-root-browser'].rustSelectedSourceDeclarations} executable TypeScript declarations. Temporal V4 exports have prior private Node/Bun/Chromium replay with recorded source-cohort limits; Core relationship V4 exports have private fixed-point Bun/Node/Chromium 11-case replay. These cohorts do not establish release qualification. All 922 unique logical executable declarations remain retirement gaps; ./reference is separately TypeScript.`,
      'package-reference': 'explicit TypeScript reference route; its declarations remain TypeScript',
    },
    nextPortClusters: [
      { cluster: 'core semantic model operations', sourceFamily: 'src/model/*', priority: 1, work: 'extend frozen opt-in R5 core APIs while preserving contract/version/error-order semantics; no default route until binding and installed evidence pass' },
      { cluster: 'adapter imports and inspections', sourceFamily: 'src/adapters/*', priority: 2, work: 'split pure parsing/admission from host I/O; cluster by adapter contract and native oracle; preserve each loss/unknown boundary' },
      { cluster: 'extensions and domain packs', sourceFamily: 'src/extensions/*, src/domain-packs/*', priority: 3, work: 'separate generic package validation and pure operations from discovery/filesystem/network and callback capabilities' },
      { cluster: 'projections and schema emission', sourceFamily: 'src/projections/*', priority: 4, work: 'map exact projection operations, versions, loss reports and installed host routes; do not infer from adapter presence' },
      { cluster: 'generated resource ownership', sourceFamily: 'spec/**/*.json, src/generated/*', priority: 5, work: 'record authored authority, reproducible generator, package asset route and byte/hash evidence per resource family' },
      { cluster: 'CLI, scripts and Python closure', sourceFamily: 'externalCensus', priority: 6, work: 'complete CLI option and Python submodule symbol maps; classify tools as retain, replace, or unported with evidence' },
    ],
    ownerFamilies: groups,
    rows,
    externalCensus: externalCensus(packageJson, packageBytes, cliBytes, pythonPackages, scriptFiles),
    authorityLimits: [
      'An opt-in Rust operation is not a binding route and does not retire a default TypeScript export.',
      'No row is marked retired. Exact package-installed routes and duplicate implementation retirement remain open.',
      'Candidate family labels in the source inventory are not treated as operation mappings.',
      'JSON resource exports are inert data rows, not executable algorithm rows; their authored/generated authority and installed distribution route remain per-resource questions.',
      'Resource authority statuses distinguish proven metamodel writers, explicitly contract-authored Smithy schemas, candidate writer literals, and unresolved authoring provenance. Source hashes do not qualify installed bytes.',
      'No thin host boundary is justified by filename or export name. A wrapper can be classified as retained host glue only after a separate capability/behavior review.',
      'Node, browser and reference route rows are route-specific; logical executable-gap and unique-resource counts avoid multiplying the same declarations and spec files by route.',
      'Source-selected Rust V4, cardinality, facets, compact Dataset validation, and four Core Keys declarations are reported separately from accepted opt-in operation mappings. Their current integrated-source qualification and retirement gates remain open.',
    ],
  };
}

function buildRuntimeExportDispositionSupplement() {
  const sourceClosure = [
    'spec/metamodel/umf.yaml', 'spec/metamodel/generated/manifest.json',
    'scripts/metamodel/build.ts', 'scripts/metamodel/rust.ts', 'scripts/metamodel/source-closure.ts',
    'crates/umf-metamodel/src/lib.rs', 'src/generated/core-model.ts', 'src/model/types.ts',
    'src/index.ts', 'src/index-node-v4.ts', 'src/index-browser-v4.ts', 'package.json',
    'src/core-ideals/parquet-cardinality-shape.ts', 'src/extensions/security/protection/functions.ts',
    'src/model/field-kind.ts', 'src/model/nullability.ts', 'src/model/cardinality.ts',
    'src/model/scalar-type.ts', 'src/model/bit128-field.ts',
  ].sort().map(file => ({ path: file, sha256: digest(read(file)) }));
  const exports = [
    { name: 'SCALAR_TYPES', classification: 'inert-generated-data-alias', authority: 'spec/metamodel/umf.yaml domains.vocabulary.scalarType -> knownScalarType; Rust metamodel compiler emits coreVocabulary.scalarType; src/model/types.ts aliases it', callerPaths: ['src/core-ideals/parquet-cardinality-shape.ts', 'src/extensions/security/protection/functions.ts'] },
    { name: 'ELEMENT_KINDS', classification: 'inert-generated-data-alias', authority: 'spec/metamodel/umf.yaml domains.vocabulary.kind -> knownElementKind; Rust metamodel compiler emits coreVocabulary.kind; src/model/types.ts aliases it', callerPaths: ['src/model/field-kind.ts'] },
    { name: 'NULLABILITIES', classification: 'inert-generated-data-alias', authority: 'spec/metamodel/umf.yaml domains.vocabulary.nullability -> knownNullability; Rust metamodel compiler emits coreVocabulary.nullability; src/model/types.ts aliases it', callerPaths: ['src/model/nullability.ts'] },
    { name: 'CARDINALITIES', classification: 'inert-generated-data-alias', authority: 'spec/metamodel/umf.yaml domains.vocabulary.cardinality -> knownCardinality; Rust metamodel compiler emits coreVocabulary.cardinality; src/model/types.ts aliases it', callerPaths: ['src/model/cardinality.ts'] },
    { name: 'scalarTypesForVersion', classification: 'executable-semantic-behavior', authority: 'authored version gate in src/model/types.ts compares the input to generated CURRENT_CORE_VERSION, returning generated SCALAR_TYPES on equality and an empty array otherwise', callerPaths: ['src/model/scalar-type.ts', 'src/model/bit128-field.ts'] },
  ].map(item => ({
    ...item,
    declarationSource: 'src/model/types.ts',
    generatedValueSource: item.classification === 'inert-generated-data-alias' ? 'src/generated/core-model.ts' : null,
    packageRoutes: [
      { id: 'package-root-node', entry: 'src/index-node-v4.ts', route: 'V4 entry export-star -> src/index.ts -> src/model/types.ts', status: 'TypeScript source selected; no Rust binding route proven; not retired' },
      { id: 'package-root-browser', entry: 'src/index-browser-v4.ts', route: 'V4 entry export-star -> src/index.ts -> src/model/types.ts', status: 'TypeScript source selected; no Rust binding route proven; not retired' },
      { id: 'package-reference', entry: 'src/index.ts', route: 'explicit ./reference export condition -> src/index.ts -> src/model/types.ts', status: 'TypeScript reference implementation remains available' },
    ],
    callerPaths: [...item.callerPaths].sort(),
  }));
  const manifest = json('spec/metamodel/generated/manifest.json');
  return {
    format: 'umf.r8.runtime-export-disposition-supplement/1',
    scope: 'Per-export source authority and runtime classification for five src/model/types.ts exports. Supplemental classification does not alter executable row kinds, Rust route mappings, logical retirement gaps or installed-release qualification.',
    generatedProvenance: {
      modelSha256: manifest.provenance.modelSha256,
      compilerSha256: manifest.provenance.compilerSha256,
      generatedCoreModelSha256: manifest.outputs['src/generated/core-model.ts'].sha256,
      sourceClosure,
    },
    exports,
    limits: [
      'The four vocabulary exports are frozen data values generated from the metamodel; they are not Rust runtime bindings or proof that consumers can be retired.',
      'scalarTypesForVersion is executable TypeScript behavior with current-version gating, even though it consumes generated vocabulary data.',
      'All five remain TypeScript on Node, browser, and ./reference source routes; exact installed bytes and default-route retirement are unproven.',
    ],
  };
}

function collectScriptFiles() {
  const base = path.join(root, 'scripts');
  const files = [];
  const walk = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (/\.(?:ts|js|mjs|py|sh)$/.test(item.name)) {
        const relative = path.relative(root, full).split(path.sep).join('/');
        files.push({ path: relative, sha256: digest(fs.readFileSync(full)) });
      }
    }
  };
  walk(base);
  return files;
}

export function collectPythonSourceFiles(directory, relativeRoot) {
  const files = [];
  const walk = (dir, relative) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = `${relative}/${item.name}`;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full, filePath);
      else if (item.isFile() && item.name.endsWith('.py')) files.push({ path: filePath, bytes: fs.readFileSync(full) });
    }
  };
  walk(directory, relativeRoot);
  return files;
}

export function collectPythonPackageAssets(directory, relativeRoot, trackedPaths = null) {
  const files = [];
  const walk = (dir, relative) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = `${relative}/${item.name}`;
      const full = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== '__pycache__') walk(full, filePath);
      else if (item.isFile() && !item.name.endsWith('.py') && !item.name.endsWith('.pyc') && (trackedPaths === null || trackedPaths.has(filePath))) files.push({ path: filePath, bytes: fs.readFileSync(full) });
    }
  };
  walk(directory, relativeRoot);
  return files;
}

function collectPythonPackages() {
  const trackedPaths = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean));
  return [
    { packageName: 'umf', path: 'python/src/umf' },
    { packageName: 'umf_access', path: 'python/umf_access/src/umf_access' },
    { packageName: 'umf_codegen', path: 'python/umf_codegen/src/umf_codegen' },
  ].map(pkg => {
    const directory = path.join(root, pkg.path);
    return { ...pkg, init: read(`${pkg.path}/__init__.py`), files: collectPythonSourceFiles(directory, pkg.path), assets: collectPythonPackageAssets(directory, pkg.path, trackedPaths) };
  });
}

function main() {
  const check = process.argv.includes('--check');
  const stdout = process.argv.includes('--stdout');
  const inventory = json(inventoryPath);
  const packageBytes = read('package.json');
  const payload = buildLedger({ inventory, packageJson: JSON.parse(packageBytes), packageBytes, cliBytes: read('crates/umf-cli/src/main.rs'), pythonPackages: collectPythonPackages(), scriptFiles: collectScriptFiles() });
  const rendered = JSON.stringify(payload, null, 2) + '\n';
  const output = path.join(root, outputPath);
  if (stdout) {
    process.stdout.write(rendered);
    return;
  } else if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== rendered) throw new Error('R8 gap ledger is stale; deliberately regenerate after reviewing source changes.');
    console.log(`R8 gap ledger current: ${payload.counts.packageRootRows} condition-specific root rows; ${payload.counts.executableDefaultRouteGaps} logical executable rows retain a retirement gap.`);
  } else {
    fs.writeFileSync(output, rendered);
    console.log(`Wrote ${outputPath}`);
  }
  console.log(`gapLedgerSha256=${digest(Buffer.from(rendered))}`);
  console.log(JSON.stringify(payload.counts));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
