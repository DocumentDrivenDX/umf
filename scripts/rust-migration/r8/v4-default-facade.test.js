// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'bun:test';
import ts from 'typescript-api';
import { generateFacade } from './v4-default-facade.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const abs = file => path.resolve(root, file);
const relative = file => path.relative(root, file).split(path.sep).join('/');
const entries = ['src/index.ts', 'src/index-node-v4.ts', 'src/index-browser-v4.ts'];
const portedOperations = [
  'applyBulkEvent', 'bulkDecisionOrder', 'nextBulkFence', 'bulkItemToken',
  'parseBulkItemToken', 'isReservedBulkKey', 'checkBulkKeyUse',
  'projectLakeviewToLegacyDashboard',
  'projectArrowToSpark', 'projectSparkToArrow',
  'projectDddToJsonSchema', 'dddFieldBinding',
  'projectPostgresqlRowToJsonSchema', 'projectSqlServerToDdl',
  'projectAvroToTableSpec', 'projectTableSpecToAvro', 'projectToTableSpecViaAvro',
  'projectParquetToAvro', 'projectPostgresqlToAvro', 'projectSqlServerToAvro',
  'projectBindingToParquet', 'projectBindingToDelta', 'projectBindingToIceberg',
  'inspectRawTableBinding',
  'projectBindingIndexesToPostgresql',
  'projectDddToPostgresql', 'verifyDddPostgresqlProjection',
  'recoverDddPostgresqlIdeal', 'recoverDddPostgresqlNative',
  'projectDddTablesToPostgresql', 'projectDddTablesAndIndexesToPostgresql',
  'projectBindingIndexesToSqlServer', 'projectBindingTablesToSqlServer',
  'projectBindingTablesAndIndexesFromPlanToSqlServer', 'projectBindingToSqlServer',
  'projectJsonSchemaToProtobuf', 'projectDddEntitiesToGraphql', 'projectDddToGraphql',
  'classifyAvroKeys', 'classifyAvroNullability', 'classifyAvroRelationships',
  'selectCoreElements', 'selectCoreRelationships', 'inspectCoreEvolution', 'verifyCoreEvolution',
  'importProtobufSources', 'exportProtobufSources', 'readDescriptorSet', 'writeDescriptorSet',
  'captureArrowIpc', 'inspectArrowIpcLayout', 'inspectArrowFlatbufferModel',
  'importShaclTurtle', 'getShaclShapeMetadata', 'proposeShaclEngineValidation',
  'importOwlTurtle', 'getOwlDeclarations', 'getOwlOntologyHeaders',
  'projectRelationshipToAvro', 'projectRelationshipToTableSpec',
  'projectRelationshipToParquet', 'projectRelationshipToSqlServer',
  'projectRelationshipToExtra', 'projectRelationshipsToPostgresql',
];

function programForEntries() {
  const config = ts.readConfigFile(abs('tsconfig.json'), ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  return ts.createProgram(entries.map(abs), { ...parsed.options, noEmit: true, allowJs: true, resolveJsonModule: true });
}

function resolved(checker, symbol) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function exportFacets(program, entry) {
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(program.getSourceFile(abs(entry)));
  assert.ok(module, `missing module ${entry}`);
  return new Map(checker.getExportsOfModule(module).map(symbol => {
    const target = resolved(checker, symbol);
    return [symbol.getName(), {
      type: !!(target.flags & ts.SymbolFlags.Type),
      value: !!(target.flags & ts.SymbolFlags.Value),
    }];
  }));
}

test('V4 facade exposes the same common API on both hosts', () => {
  const program = programForEntries();
  const node = exportFacets(program, entries[1]);
  const browser = exportFacets(program, entries[2]);
  assert.deepEqual(exportFacets(program, 'src/index.ts'), node);
  assert.deepEqual(node.get('createPostgresqlSqlEngine'), { type: false, value: true });
  node.delete('createPostgresqlSqlEngine');
  assert.deepEqual(node, browser, 'public roots differ in common name/type/value facets');
  for (const name of portedOperations) {
    assert.deepEqual(browser.get(name), { type: false, value: true }, `missing runtime operation ${name}`);
  }
});

test('generated facade is deterministic, excludes local overrides, and has no broad runtime origins', () => {
  const program = programForEntries();
  const generated = generateFacade(program);
  for (const name of portedOperations) assert.ok(generated.localOverrides.includes(name), `${name} must be a host runtime export`);
  assert.ok(generated.localOverrides.includes('generateDomainPackSchema'));
  assert.ok(generated.localOverrides.includes('generateDatasetSourceSchema'));
  assert.ok(generated.localOverrides.includes('generateDomainPackLoaderSchema'));
  assert.ok(generated.localOverrides.includes('generateLoaderInventorySchema'));
  assert.equal(fs.readFileSync(abs('src/index-v4-default.ts'), 'utf8'), generated.text);
  assert.ok(!generated.text.includes("from './index'") && !generated.text.includes("from './index-node-v4'") && !generated.text.includes("from './index-browser-v4'"));

  const forbiddenRuntimeSources = new Set([
    'src/model/relationships.ts',
    'src/model/scalar-type.ts',
    'src/model/record-members.ts',
    'src/model/reference-links.ts',
    'src/model/semantic-types.ts',
    'src/extensions/binding/raw-profiles.ts',
    'src/core-ideals/relationship-avro-projection.ts',
    'src/core-ideals/relationship-tablespec-projection.ts',
    'src/core-ideals/relationship-parquet-projection.ts',
    'src/core-ideals/relationship-sqlserver-projection.ts',
    'src/core-ideals/relationship-extras.ts',
    'src/core-ideals/relationship-postgresql.ts',
  ]);
  for (const binding of generated.bindings.filter(binding => binding.kind === 'value')) {
    assert.ok(!forbiddenRuntimeSources.has(`src/${binding.specifier.replace(/^\.\//, '')}.ts`), `${binding.name} points to a shadowed TS body`);
  }
  for (const facet of generated.facets.filter(item => item.type && item.value)) {
    if (generated.localOverrides.includes(facet.name)) continue;
    const reference = exportFacets(program, 'src/index.ts').get(facet.name);
    assert.deepEqual(reference, { type: true, value: true }, `${facet.name} merged type/value facet was not retained`);
    assert.ok(generated.bindings.some(binding => binding.name === facet.name && binding.kind === 'value'), `${facet.name} merged type/value export is missing its runtime binding`);
  }
});

test('generated facade does not contain value exports for the 42 shadowed operations', () => {
  const generated = generateFacade(programForEntries());
  const shadowed = new Set([
    'inspectCoreRelationships', 'lookupCoreRelationship', 'declareCoreRelationship', 'verifyCoreRelationshipOperation',
    'inspectCoreScalarType', 'inspectCoreRecordMembers', 'inspectCoreReferenceLinks', 'inspectRawTableBinding',
    'inspectCoreSemanticTypes', 'getCoreSemanticTypes', 'declareCoreSemanticTypes', 'verifyCoreSemanticTypeDeclaration',
    'projectRelationshipToAvro', 'verifyRelationshipAvroProjection', 'recoverRelationshipAvroIdeal', 'recoverRelationshipAvroNative',
    'projectRelationshipToTableSpec', 'verifyRelationshipTableSpecProjection', 'recoverRelationshipTableSpecIdeal', 'recoverRelationshipTableSpecNativeSources',
    'projectRelationshipToSqlServer', 'verifyRelationshipSqlServerProjection', 'recoverRelationshipSqlServerIdeal', 'recoverRelationshipSqlServerBinding', 'recoverRelationshipSqlServerNative',
    'projectRelationshipToParquet', 'verifyRelationshipParquetProjection', 'recoverRelationshipParquetIdeal', 'recoverRelationshipParquetNative',
    'projectRelationshipToExtra', 'verifyRelationshipExtra', 'recoverRelationshipExtraIdeal', 'recoverRelationshipExtraNative',
    'projectRelationshipsToPostgresql', 'verifyRelationshipPostgresqlProjection', 'recoverRelationshipPostgresqlIdeal', 'recoverRelationshipPostgresqlNative',
    'validateCoreRecordValues', 'SemanticTypeRegistry', 'validateSemanticTypeValue', 'validateCoreSemanticTypeValue',
    'verifyCoreDatasetValuesCompact',
  ]);
  assert.equal(shadowed.size, 42);
  assert.ok([...shadowed].every(name => !generated.bindings.some(binding => binding.kind === 'value' && binding.name === name)));
});

test('Node and browser runtime bundles exclude all shadowed TypeScript bodies', async () => {
  const forbidden = [
    'src/index.ts',
    'src/model/relationships.ts', 'src/model/scalar-type.ts', 'src/model/record-members.ts', 'src/model/reference-links.ts', 'src/model/semantic-types.ts',
    'src/extensions/binding/raw-profiles.ts', 'src/model/dataset-values-compact.ts',
    'src/core-ideals/relationship-avro-projection.ts', 'src/core-ideals/relationship-tablespec-projection.ts',
    'src/core-ideals/relationship-parquet-projection.ts', 'src/core-ideals/relationship-sqlserver-projection.ts',
    'src/core-ideals/relationship-extras.ts', 'src/core-ideals/relationship-postgresql.ts',
    'src/core-ideals/relationship-avro-projection-factory.ts', 'src/core-ideals/relationship-tablespec-projection-factory.ts',
    'src/core-ideals/relationship-parquet-projection-factory.ts', 'src/core-ideals/relationship-sqlserver-projection-factory.ts',
    'src/core-ideals/relationship-extras-factory.ts', 'src/core-ideals/relationship-postgresql-factory.ts',
  ];
  const factories = [
    'src/core-ideals/avro-cardinality-rust-default.ts',
    'src/core-ideals/relationship-extras-rust-default.ts',
    'src/core-ideals/relationship-postgresql-rust-default.ts',
    'src/adapters/lakeview/project-rust-default.ts',
    'src/extensions/actions/bulk-rust-default.ts',
  ];
  const legacyValidation = [
    'src/registry/registry.ts',
    'src/validation/document.ts',
    'src/validation/schema.ts',
    'src/validation/constraint-kernel.ts',
    'src/validation/constraint-language.ts',
    'src/validation/literal-kernel.ts',
    'src/validation/literal-policy.ts',
  ];
  for (const [entry, target, hostInput] of [
    ['src/index-node-v4.ts', 'node', 'bindings/core/node/index.js'],
    ['src/index-browser-v4.ts', 'browser', 'bindings/core/wasm/index.js'],
  ]) {
    const rootSource = programForEntries().getSourceFile(abs(entry));
    const schemaImports = rootSource.statements.filter(statement =>
      ts.isImportDeclaration(statement) &&
      ['./domain-packs/schema', './domain-packs/source-schema'].includes(statement.moduleSpecifier.text),
    );
    assert.equal(schemaImports.length, 2, `${entry} must use the TypeScript schema functions only as type references`);
    assert.ok(schemaImports.every(statement => statement.importClause?.isTypeOnly), `${entry} has a runtime TypeScript schema import`);
    const namedSchemaGenerators = rootSource.statements.filter(statement =>
      ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
      statement.expression.expression.getText(rootSource) === 'Object.defineProperty' &&
      ['generateDomainPackSchema', 'generateDatasetSourceSchema'].includes(statement.expression.arguments[0]?.getText(rootSource)),
    );
    assert.equal(namedSchemaGenerators.length, 2, `${entry} must explicitly stabilize bundled schema generator names`);
    const result = await Bun.build({
      entrypoints: [entry], outdir: `/private/tmp/umf-v4-facade-${target}-test`, target,
      format: 'esm', metafile: true,
    });
    assert.equal(result.success, true, result.logs.map(log => log.message).join('\n'));
    const metafile = typeof result.metafile === 'string' ? JSON.parse(result.metafile) : result.metafile;
    const inputs = Object.keys(metafile.inputs).map(input => input.replace(`${root}/`, ''));
    const emitted = new Set(Object.values(metafile.outputs).flatMap(output =>
      Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([input]) => input.replace(`${root}/`, ''))));
    for (const source of forbidden) assert.ok(!inputs.includes(source), `${entry} runtime bundle still includes ${source}`);
    for (const source of legacyValidation) assert.ok(!emitted.has(source), `${entry} runtime bundle still emits ${source}`);
    for (const source of factories) assert.ok(inputs.includes(source), `${entry} runtime bundle lost factory ${source}`);
    assert.ok(inputs.includes(hostInput), `${entry} runtime bundle lost its ${target} host binding`);
  }
});
