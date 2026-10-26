#!/usr/bin/env node
// Read-only AST and package-identity census for the exact-string extension ID
// exports in the R8 default package roots.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript-api';

const root = path.resolve(import.meta.dirname, '../../..');
const inventoryPath = 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/inventory.json';
const ledgerPath = 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/gap-ledger.json';
const outputPath = 'docs/helix/04-build/evidence/rust-migration/r8-extension-id-data/receipt.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.resolve(root, file));
const json = file => JSON.parse(read(file));
const normalized = file => path.relative(root, file).split(path.sep).join('/');

const inventoryBytes = read(inventoryPath);
const ledgerBytes = read(ledgerPath);
const inventory = JSON.parse(inventoryBytes);
const ledger = JSON.parse(ledgerBytes);
assert.equal(ledger.input.path, inventoryPath, 'ledger must name the expected source inventory');
assert.equal(ledger.input.sha256, digest(inventoryBytes), 'gap ledger must bind the current inventory');

const rootIds = ['package-root-node', 'package-root-browser', 'package-reference'];
const rowsByRoute = Object.fromEntries(rootIds.map(routeId => [routeId,
  ledger.rows.filter(row => row.routeId === routeId && row.declarationKind === 'VariableDeclaration' && /_EXTENSION$/.test(row.exportName)),
]));
for (const routeId of rootIds) assert.equal(rowsByRoute[routeId].length, 63, `${routeId} extension ID declaration count`);
const names = rowsByRoute['package-root-node'].map(row => row.exportName).sort();
for (const routeId of rootIds.slice(1)) {
  assert.deepEqual(rowsByRoute[routeId].map(row => row.exportName).sort(), names, `${routeId} extension ID export set`);
}

const config = ts.readConfigFile(path.resolve(root, 'tsconfig.json'), ts.sys.readFile);
assert.equal(config.error, undefined, 'TypeScript config must parse');
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const programs = {
  'package-root-node': ts.createProgram([path.resolve(root, 'src/index-node-v4.ts')], { ...parsed.options, noEmit: true, allowJs: true, resolveJsonModule: true }),
  'package-root-browser': ts.createProgram([path.resolve(root, 'src/index-browser-v4.ts')], { ...parsed.options, noEmit: true, allowJs: true, resolveJsonModule: true }),
  'package-reference': ts.createProgram([path.resolve(root, 'src/index.ts')], { ...parsed.options, noEmit: true, allowJs: true, resolveJsonModule: true }),
};

function declarationFor(row, program) {
  const sourcePath = path.resolve(root, row.source);
  const source = program.getSourceFile(sourcePath);
  assert.ok(source, `compiler program must include ${row.source}`);
  let match;
  function visit(node) {
    if (ts.isVariableDeclaration(node)
      && source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 === row.line
      && node.name.getText(source) === row.declarationName) match = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(match, `source AST row must resolve: ${row.source}:${row.line} ${row.declarationName}`);
  assert.ok(ts.isStringLiteral(match.initializer), `${row.exportName} must initialize directly from a string literal`);
  return { value: match.initializer.text, source };
}

const packageFiles = [];
function visitPackages(directory) {
  for (const entry of fs.readdirSync(path.resolve(root, directory), { withFileTypes: true })) {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) visitPackages(file);
    else if (entry.isFile() && entry.name === 'package.json') {
      const manifest = JSON.parse(read(file));
      if (typeof manifest.id === 'string') packageFiles.push({ path: file, id: manifest.id, version: manifest.version ?? null });
    }
  }
}
visitPackages('spec/extensions');

const symbols = names.map(name => {
  const routeRows = Object.fromEntries(rootIds.map(routeId => [routeId,
    rowsByRoute[routeId].find(row => row.exportName === name),
  ]));
  const nodeRow = routeRows['package-root-node'];
  for (const routeId of rootIds.slice(1)) {
    const peer = routeRows[routeId];
    assert.equal(peer.source, nodeRow.source, `${name} source is shared by all routes`);
    assert.equal(peer.line, nodeRow.line, `${name} declaration line is shared by all routes`);
  }
  const { value, source } = declarationFor(nodeRow, programs['package-root-node']);
  for (const routeId of rootIds.slice(1)) {
    assert.equal(declarationFor(routeRows[routeId], programs[routeId]).value, value, `${name} AST value agrees across routes`);
  }
  const matchingPackages = packageFiles.filter(manifest => manifest.id === value)
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    exportName: name,
    value,
    declaration: { source: nodeRow.source, line: nodeRow.line, sourceSha256: digest(read(nodeRow.source)) },
    matchingPackageIds: matchingPackages,
    packageIdentityStatus: matchingPackages.length ? 'exact-id-match' : 'no-package-id-match',
    sourceTextSha256: digest(read(nodeRow.source)),
    routeRows: Object.fromEntries(rootIds.map(routeId => [routeId, {
      source: routeRows[routeId].source,
      line: routeRows[routeId].line,
      sourceSha256InInventory: routeRows[routeId].sourceSha256,
    }])),
  };
});

for (const symbol of symbols) {
  assert.ok(symbol.matchingPackageIds.length, `${symbol.exportName} value ${symbol.value} must match at least one authored extension package ID`);
  assert.ok(symbol.matchingPackageIds.every(manifest => manifest.id === symbol.value));
}

const exclusions = [
  { name: 'CURRENT_CORE_VERSION', reason: 'generated version constant with runtime admission consumers' },
  { name: 'ELEMENT_KINDS', reason: 'generated vocabulary alias, not an extension identifier export' },
  { name: 'CARDINALITIES', reason: 'generated vocabulary alias, not an extension identifier export' },
  { name: 'NULLABILITIES', reason: 'generated vocabulary alias, not an extension identifier export' },
  { name: 'SCALAR_TYPES', reason: 'frozen generated vocabulary data' },
  { name: 'scalarTypesForVersion', reason: 'executable version gate' },
  { name: 'RFC3339_EXACT_INSTANT_PROFILE', reason: 'profile literal, not an extension identifier' },
  { name: 'PARQUET_MAX_BYTES', reason: 'runtime limit literal, not an extension identifier' },
  { name: 'actionsPackage', reason: 'copying/freeze factory result' },
  { name: 'securityPackage', reason: 'copying factory result' },
  { name: 'generatePythonClient', reason: 'asynchronously initialized default runtime export' },
];
for (const name of exclusions.map(item => item.name)) assert.ok(!names.includes(name), `${name} must remain outside this family`);

const inventorySymbolsByRoute = Object.fromEntries(rootIds.map(routeId => [routeId,
  inventory.symbols.filter(row => row.routeId === routeId && row.declarationKind === 'VariableDeclaration' && /_EXTENSION$/.test(row.exportName)),
]));
for (const routeId of rootIds) {
  assert.equal(inventorySymbolsByRoute[routeId].length, 63, `${routeId} inventory declaration count`);
  for (const row of inventorySymbolsByRoute[routeId]) {
    assert.equal(digest(read(row.source)), row.sourceSha256, `inventory source hash for ${row.exportName}`);
  }
}

const distinctIds = new Set(symbols.map(symbol => symbol.value));
const duplicatePackageIds = [...new Set(symbols.flatMap(symbol => symbol.value))]
  .map(id => ({ id, exports: symbols.filter(symbol => symbol.value === id).map(symbol => symbol.exportName), packages: packageFiles.filter(manifest => manifest.id === id).map(({ path, version }) => ({ path, version })) }))
  .filter(item => item.exports.length > 1 || item.packages.length > 1);

const payload = {
  format: 'umf.r8.extension-id-static-data-candidate/1',
  status: 'candidate-static-data; declarations and 922-gap ledger are unchanged',
  method: 'TypeScript compiler AST source-root resolution plus exact authored package.json ID comparisons; this is a data disposition candidate, not Rust-operation ownership or adapter parity.',
  inputs: {
    inventory: { path: inventoryPath, sha256: digest(inventoryBytes) },
    gapLedger: { path: ledgerPath, sha256: digest(ledgerBytes) },
  },
  counts: { exports: symbols.length, distinctStringIds: distinctIds.size, packagesUnderSpecExtensions: packageFiles.length, exclusions: exclusions.length },
  routeRoots: {
    'package-root-node': 'src/index-node-v4.ts',
    'package-root-browser': 'src/index-browser-v4.ts',
    'package-reference': 'src/index.ts',
  },
  symbols,
  duplicatePackageIds,
  negativeControls: exclusions,
  limits: [
    'Exact static string and package-ID parity do not establish native adapter behavior, extension validation, or registration semantics.',
    'Where multiple package manifests share one ID, this receipt preserves all exact matches and does not choose a package version.',
    'This packet does not change exports, import-time initialization, adapter consumers, Rust source, resource authority, or the 922 logical default-route retirement gaps.',
  ],
};
const rendered = `${JSON.stringify(payload, null, 2)}\n`;

if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(path.resolve(root, outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(root, outputPath), rendered);
  console.log(`Wrote ${outputPath}: ${symbols.length} static string candidates, ${distinctIds.size} unique IDs.`);
} else if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.resolve(root, outputPath), 'utf8'), rendered, 'extension ID data receipt is stale');
  console.log(`Current AST receipt: ${symbols.length} direct string exports, ${distinctIds.size} unique IDs.`);
} else {
  process.stdout.write(rendered);
}
