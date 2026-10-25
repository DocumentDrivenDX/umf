#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript-api';
import { classifyDeclarationShape, classifyInitializerShape, classifyMigrationDisposition } from './declaration-shapes.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const output = path.join(root, 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/inventory.json');
const check = process.argv.includes('--check');
const routes = [
  { id: 'package-root-node', label: '.', condition: 'node', target: './dist/umf-node.js', entry: 'src/index-node-v4.ts', mode: 'default' },
  { id: 'package-root-browser', label: '.', condition: 'browser', target: './dist/umf-browser.js', entry: 'src/index-browser-v4.ts', mode: 'default' },
  { id: 'package-reference', label: './reference', condition: 'import', target: './dist/umf.js', entry: 'src/index.ts', mode: 'reference' },
  { id: 'loader-contract', label: './loader-contract', condition: 'import', target: './dist/loader-contract.js', entry: 'src/domain-packs/loader-contract.ts', mode: 'public-subpath' },
  { id: 'candidate-v2-node', label: './rust-codegen-candidate/v2', condition: 'node', target: './dist/umf-rust-codegen-candidate-v2-node.js', entry: 'src/node.ts', mode: 'opt-in-candidate' },
  { id: 'candidate-v2-browser', label: './rust-codegen-candidate/v2', condition: 'browser', target: './dist/umf-rust-codegen-candidate-v2-browser.js', entry: 'src/browser.ts', mode: 'opt-in-candidate' },
  { id: 'candidate-v3-node', label: './rust-codegen-candidate/v3', condition: 'node', target: './dist/umf-rust-codegen-candidate-v3-node.js', entry: 'src/node-v3.ts', mode: 'opt-in-candidate' },
  { id: 'candidate-v3-browser', label: './rust-codegen-candidate/v3', condition: 'browser', target: './dist/umf-rust-codegen-candidate-v3-browser.js', entry: 'src/browser-v3.ts', mode: 'opt-in-candidate' },
  { id: 'candidate-v4-node', label: './rust-codegen-candidate/v4', condition: 'node', target: './dist/umf-rust-codegen-candidate-v4-node.js', entry: 'src/node-v4.ts', mode: 'opt-in-candidate' },
  { id: 'candidate-v4-browser', label: './rust-codegen-candidate/v4', condition: 'browser', target: './dist/umf-rust-codegen-candidate-v4-browser.js', entry: 'src/browser-v4.ts', mode: 'opt-in-candidate' },
];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const abs = p => path.resolve(root, p);
const rel = p => path.relative(root, p).split(path.sep).join('/');
const config = ts.readConfigFile(abs('tsconfig.json'), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(routes.map(r => abs(r.entry)), { ...parsed.options, noEmit: true, allowJs: true, resolveJsonModule: true });
const checker = program.getTypeChecker();
// Type analysis is used for symbol resolution; project-wide diagnostics are retained by existing checks.
function resolvedSymbol(symbol) { return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol; }
function runtimeDeclaration(decl) {
  return !!decl && (ts.isFunctionDeclaration(decl) || ts.isClassDeclaration(decl) || ts.isEnumDeclaration(decl) || ts.isVariableDeclaration(decl) || ts.isBindingElement(decl) || ts.isModuleDeclaration(decl) || (ts.isSourceFile(decl) && decl.fileName.endsWith('.json')));
}
function owner(file) {
  if (file.startsWith('spec/') && file.endsWith('.json')) return ['generated-data', 'authored or generated JSON resource; metamodel and contract authority vary by file', 'retain versioned data; identify source authority and installed asset route separately'];
  if (file.startsWith('src/generated/')) return ['generated-data', 'ADR-005 metamodel authority / generated inert data', 'retain generated data; rebuild from authored metamodel; executable helpers require separate owner'];
  if (/^src\/(node|browser)(-v[34])?\.ts$/.test(file) || /^src\/index-(node|browser)-v4\.ts$/.test(file)) return ['host', 'Node/Bun or browser binding facade', 'retain thin host loading, value conversion, and capability boundary; verify each delegated export enters Rust'];
  if (/^src\/(access|compilation|table-deployment|table-migration|table-authoring)\//.test(file)) return ['rust-candidate', 'Rust codegen engine (R3) plus binding/cutover track (R4/R7)', 'map symbol to exact Rust operation and installed route; duplicate TS retirement remains unresolved until parity and default-route evidence'];
  if (/^src\/(model|validation|registry|core-ideals)\//.test(file)) return ['rust-candidate', 'umf-core semantic engine (R5)', 'candidate shared semantic operation; exact Rust operation, native subset, tests, and retirement gate require symbol-level review'];
  if (/^src\/(adapters|projections|extensions)\//.test(file)) return ['rust-candidate', 'umf-core adapter/projection/extension family (R5)', 'candidate shared operation; versioned native subset, explicit loss/unknown preservation, Rust implementation, and retirement gate unresolved'];
  if (file.startsWith('src/domain-packs/')) return ['mixed-host-rust-candidate', 'host acquisition/I/O plus Rust pure admission/preservation (R5)', 'split pure algorithm from I/O per symbol; owner split and retirement remain unresolved'];
  if (file.startsWith('src/')) return ['unresolved', 'unassigned', 'no defensible symbol owner classification; review required'];
  return ['external-or-generated', 'outside authored TypeScript implementation', 'retain source/archive or identify generated-data authority; confirm executable ownership'];
}
const files = new Set();
const rows = [];
const routeCounts = {};
for (const route of routes) {
  const entry = program.getSourceFile(abs(route.entry));
  if (!entry) throw new Error(`Missing program entry ${route.entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(entry);
  if (!moduleSymbol) throw new Error(`No module symbol for ${route.entry}`);
  const exported = checker.getExportsOfModule(moduleSymbol);
  let count = 0;
  for (const exp of exported) {
    const target = resolvedSymbol(exp);
    for (const decl of (target.getDeclarations() || []).filter(runtimeDeclaration)) {
      const source = decl.getSourceFile();
      const file = rel(source.fileName);
      if (!file.startsWith('src/') && !file.startsWith('spec/')) continue;
      const pos = source.getLineAndCharacterOfPosition(decl.getStart(source));
      const [ownerKind, candidateOwner, disposition] = owner(file);
      rows.push({ routeId: route.id, packageRoute: route.label, packageCondition: route.condition, routeMode: route.mode, defaultRoute: route.mode === 'default', exportName: exp.getName(), declarationName: target.getName(), declarationKind: ts.SyntaxKind[decl.kind], declarationShape: classifyDeclarationShape(ts, decl), initializerShape: classifyInitializerShape(ts, decl), migrationDisposition: classifyMigrationDisposition(), source: file, line: pos.line + 1, sourceSha256: digest(fs.readFileSync(source.fileName)), ownerKind, candidateOwner, disposition });
      files.add(file); count++;
    }
  }
  routeCounts[route.id] = { packageRoute: route.label, packageCondition: route.condition, target: route.target, mode: route.mode, defaultRoute: route.mode === 'default', runtimeExportDeclarations: count };
}
rows.sort((a,b) => a.routeId.localeCompare(b.routeId) || a.exportName.localeCompare(b.exportName) || a.source.localeCompare(b.source) || a.line - b.line);
const exportNames = id => [...new Set(rows.filter(row => row.routeId === id).map(row => row.exportName))].sort();
const referenceExports = JSON.stringify(exportNames('package-reference'));
const rootEntries = new Map([
  ['package-root-node', 'src/index-node-v4.ts'],
  ['package-root-browser', 'src/index-browser-v4.ts'],
]);
const rootEntryExports = new Map([...rootEntries].map(([id, entry]) => [
  id,
  [...new Set(rows.filter(row => row.routeId === id && row.source === entry).map(row => row.exportName))].sort(),
]));
const nodeEntryExports = rootEntryExports.get('package-root-node');
const browserEntryExports = rootEntryExports.get('package-root-browser');
if (JSON.stringify(nodeEntryExports) !== JSON.stringify(browserEntryExports)) {
  throw new Error(`V4 root entry declarations diverge: Node=${JSON.stringify(nodeEntryExports)}, browser=${JSON.stringify(browserEntryExports)}`);
}
for (const id of ['package-root-node', 'package-root-browser']) {
  if (JSON.stringify(exportNames(id)) !== referenceExports) {
    const actual = exportNames(id);
    const expected = JSON.parse(referenceExports);
    throw new Error(`${id} export names diverge from ./reference; review package API: only root=${JSON.stringify(actual.filter(name => !expected.includes(name)))}, only reference=${JSON.stringify(expected.filter(name => !actual.includes(name)))}`);
  }
}
const pkg = JSON.parse(fs.readFileSync(abs('package.json'), 'utf8'));
const packageRoutes = [...new Set(routes.map(route => route.label))].sort();
const declaredPackageRoutes = Object.keys(pkg.exports || {}).sort();
if (JSON.stringify(packageRoutes) !== JSON.stringify(declaredPackageRoutes)) {
  throw new Error(`Package export routes changed; review capture inputs: ${JSON.stringify(declaredPackageRoutes)}`);
}
for (const route of routes) {
  if (pkg.exports[route.label]?.[route.condition] !== route.target) {
    throw new Error(`Package condition target changed: ${route.label}#${route.condition}; review capture inputs`);
  }
}
if (pkg.exports['.']?.import !== './dist/umf-browser.js' || pkg.exports['.']?.default !== './dist/umf-browser.js') {
  throw new Error('Package root import/default target changed; review capture inputs');
}
for (const version of ['v2', 'v3', 'v4']) {
  const label = `./rust-codegen-candidate/${version}`;
  const browserTarget = routes.find(route => route.label === label && route.condition === 'browser')?.target;
  if (pkg.exports[label]?.import !== browserTarget) {
    throw new Error(`Candidate import target changed: ${label}#import; review capture inputs`);
  }
}
const payload = {
  format: 'umf.r8.typescript-runtime-export-inventory/4',
  scope: 'Runtime TypeScript and JSON-resource public declarations reachable through condition-specific package JavaScript entrypoints; type-only exports are excluded. declarationShape and initializerShape are deterministic syntax-form labels only. migrationDisposition is unreviewed for every row because syntax and current routing do not establish a row-level retirement decision. Direct declarations resolved to each V4 root entry are counted mechanically; their ownership and qualification are tracked separately in the gap ledger. Root selection does not retire inherited TypeScript algorithms.',
  packageName: pkg.name,
  packageManifestSha256: digest(fs.readFileSync(abs('package.json'))),
  sourceCohort: Object.fromEntries([...files].sort().map(file => [file, digest(fs.readFileSync(abs(file)))])),
  bit128SourceSelection: {
    operations: ['parseBits128', 'parseUuid', 'bits128FromBytes', 'bits128ToBytes', 'uuidFromBits128', 'uuidToBits128', 'compareBits128', 'bits128ToWords', 'bits128FromWords', 'bits128ToInteger', 'bits128FromInteger'],
    status: 'source-selected-only; installed Node/Bun/Chromium qualification pending; zero declarations retired',
    authorityClosure: [
      'src/index-node-v4.ts', 'src/index-browser-v4.ts', 'src/access/rust-bit128-default.ts',
      'bindings/core/node/index.js', 'bindings/core/node/src/bit128.js', 'bindings/core/node/src/wire.js',
      'bindings/core/wasm/index.js', 'crates/umf-core-wire/src/lib.rs', 'crates/umf-core/src/bit128.rs',
      'src/model/bit128.ts', 'src/model/uuid.ts',
      'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md',
      'scripts/rust-migration/r5/bit128-default-route/freeze.ts',
      'scripts/rust-migration/r5/bit128-default-route/predecessor.json',
      'tests/rust-bit128-default.test.ts', 'crates/umf-core/tests/r5_bit128.rs',
      'docs/helix/04-build/evidence/rust-migration/r5-bit128/README.md',
      'docs/helix/04-build/evidence/rust-migration/r5-bit128-binding/README.md',
      'docs/helix/04-build/evidence/rust-migration/r5-bit128-default-route/README.md',
      'docs/helix/04-build/evidence/rust-migration/r5-bit128-default-adapter/README.md',
    ].sort().map(file => ({path: file, sha256: digest(fs.readFileSync(abs(file)))})),
  },
  routes: routeCounts,
  counts: { routes: routes.length, exportDeclarationSourceFiles: files.size, routeSpecificRuntimeExportDeclarations: rows.length, uniqueExportNames: new Set(rows.map(r => r.exportName)).size, defaultRouteDeclarations: rows.filter(r => r.defaultRoute).length, referenceRouteDeclarations: rows.filter(r => r.routeMode === 'reference').length, rustCandidateDeclarations: rows.filter(r => r.ownerKind === 'rust-candidate').length, hostDeclarations: rows.filter(r => r.ownerKind === 'host').length, mixedDeclarations: rows.filter(r => r.ownerKind === 'mixed-host-rust-candidate').length, generatedDataDeclarations: rows.filter(r => r.ownerKind === 'generated-data').length, defaultRouteJsonResourceDeclarations: rows.filter(r => r.defaultRoute && r.source.startsWith('spec/') && r.source.endsWith('.json')).length, unassignedOwnerDeclarations: rows.filter(r => r.ownerKind === 'unresolved').length, exactRustOperationMappedDeclarations: 0, symbolRetirementDispositionUnresolvedDeclarations: rows.length, migrationDispositionUnreviewedDeclarations: rows.filter(r => r.migrationDisposition === 'unreviewed').length, declarationShapeCounts: Object.fromEntries([...new Set(rows.map(r => r.declarationShape))].sort().map(shape => [shape, rows.filter(r => r.declarationShape === shape).length])), initializerShapeCounts: Object.fromEntries([...new Set(rows.map(r => r.initializerShape))].sort().map(shape => [shape, rows.filter(r => r.initializerShape === shape).length])), defaultRouteInheritedTypeScriptDeclarations: rows.filter(r => r.defaultRoute && r.source.startsWith('src/') && !/^src\/index-(node|browser)-v4\.ts$/.test(r.source)).length, defaultRouteV4EntryExportDeclarations: [...rootEntryExports.values()].reduce((sum, names) => sum + names.length, 0) },
  defaultRouteEntrySelections: [...rootEntries].map(([routeId, entry]) => ({ routeId, entry, entrySha256: digest(fs.readFileSync(abs(entry))), directExportCount: rootEntryExports.get(routeId).length, directExports: rootEntryExports.get(routeId) })),
  limitations: ['A public export may resolve to multiple runtime declarations or overloads; each declaration is listed.', 'Candidate ownership is a migration hypothesis, not evidence that Rust already implements the symbol.', 'The Node and browser root condition source entries are separately captured; installed artifacts require independent qualification.', 'The explicit ./reference TypeScript route is separate from either root condition.', 'Reachability is package-entrypoint export reachability only; active scripts and CLI commands need separate inventory rows.', 'A host/Rust mixed symbol boundary cannot be inferred mechanically and requires review.'],
  symbols: rows,
};
const rendered = JSON.stringify(payload, null, 2) + '\n';
if (check) {
  if (!fs.existsSync(output)) throw new Error(`Missing inventory: ${rel(output)}`);
  if (fs.readFileSync(output, 'utf8') !== rendered) throw new Error('R8 symbol inventory is stale; recapture deliberately.');
  console.log(`R8 symbol inventory current: ${rows.length} route-specific runtime export declarations across ${files.size} source files.`);
} else {
  fs.writeFileSync(output, rendered);
  console.log(`Wrote ${rel(output)} (${rows.length} declarations, ${files.size} source files).`);
}
console.log(`inventorySha256=${digest(Buffer.from(rendered))}`);
console.log(JSON.stringify(payload.counts));
