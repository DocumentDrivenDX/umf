#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript-api';

const root = path.resolve(import.meta.dirname, '../../..');
const inventoryPath = 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/inventory.json';
const outputPath = 'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/package-reference-variable-analysis.json';
const check = process.argv.includes('--check');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const absolute = file => path.resolve(root, file);
const inventory = JSON.parse(fs.readFileSync(absolute(inventoryPath), 'utf8'));
const rows = inventory.symbols.filter(row => row.routeId === 'package-reference' && row.declarationKind === 'VariableDeclaration');
const config = ts.readConfigFile(absolute('tsconfig.json'), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram([absolute('src/index.ts')], { ...parsed.options, noEmit: true, allowJs: true, resolveJsonModule: true });
const checker = program.getTypeChecker();

function initializerClass(declaration) {
  const init = declaration.initializer;
  if (!init) return 'no-initializer';
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isFunctionDeclaration(init)) return 'function-valued';
  if (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isTypeAssertionExpression(init) || ts.isParenthesizedExpression(init)) return initializerClass({ initializer: init.expression });
  if (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init)) return 'static-literal-data';
  if (ts.isStringLiteralLike(init) || ts.isNumericLiteral(init) || ts.isBigIntLiteral(init) || init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword || init.kind === ts.SyntaxKind.NullKeyword || ts.isNoSubstitutionTemplateLiteral(init)) return 'static-literal-data';
  if (ts.isCallExpression(init) && init.expression.kind === ts.SyntaxKind.PropertyAccessExpression && init.expression.expression.kind === ts.SyntaxKind.Identifier && init.expression.expression.text === 'Object' && init.expression.name.text === 'freeze') return 'frozen-data-expression';
  if (ts.isIdentifier(init) || ts.isPropertyAccessExpression(init)) return 'alias-or-property-read';
  if (ts.isCallExpression(init) || ts.isNewExpression(init)) return 'dynamic-executable';
  return 'other-expression';
}

function unwrapped(init) {
  while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isTypeAssertionExpression(init) || ts.isParenthesizedExpression(init))) init = init.expression;
  return init;
}

function resolvedDeclaration(node, sourceFile) {
  if (ts.isPropertyAccessExpression(node)) node = node.expression;
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return (symbol?.getDeclarations() ?? []).map(decl => ({ path: path.relative(root, decl.getSourceFile().fileName).split(path.sep).join('/'), declaration: ts.SyntaxKind[decl.kind] }));
}

function authorityClass(declaration, sourceFile) {
  if (sourceFile.fileName.startsWith(absolute('src/generated/'))) return 'generated-source-declaration';
  const init = unwrapped(declaration.initializer);
  if (init && (ts.isIdentifier(init) || ts.isPropertyAccessExpression(init))) {
    const targets = resolvedDeclaration(init, sourceFile);
    const targetPaths = targets.map(target => target.path);
    if (targetPaths.some(target => target.startsWith('src/generated/'))) return 'generated-data-alias';
    if (targetPaths.some(target => target.endsWith('/package.json'))) return 'authored-package-descriptor-alias';
    if (targetPaths.some(target => target.endsWith('.json'))) return 'authored-json-data-alias';
  }
  if (init && ts.isCallExpression(init) && init.expression.kind === ts.SyntaxKind.PropertyAccessExpression && init.expression.expression.kind === ts.SyntaxKind.Identifier && init.expression.expression.text === 'Object' && init.expression.name.text === 'freeze') {
    const argument = unwrapped(init.arguments[0]);
    if (argument && (ts.isIdentifier(argument) || ts.isPropertyAccessExpression(argument)) && resolvedDeclaration(argument, sourceFile).some(target => target.path.startsWith('src/generated/'))) return 'generated-frozen-data-alias';
    return 'frozen-authored-data-expression';
  }
  if (init && (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init) || ts.isStringLiteralLike(init) || ts.isNumericLiteral(init) || init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword || init.kind === ts.SyntaxKind.NullKeyword || ts.isNoSubstitutionTemplateLiteral(init))) return 'authored-static-data';
  if (init && (ts.isCallExpression(init) || ts.isNewExpression(init))) return 'dynamic-executable';
  if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return 'function-valued';
  return 'unresolved-initializer-authority';
}

const details = [];
for (const row of rows) {
  const sourceFile = program.getSourceFile(absolute(row.source));
  if (!sourceFile) throw new Error(`AST source missing: ${row.source}`);
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 === row.line && node.name.getText(sourceFile) === row.declarationName) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!declaration) throw new Error(`AST row did not resolve: ${row.source}:${row.line} ${row.declarationName}`);
  const init = declaration.initializer;
  details.push({ routeId: row.routeId, exportName: row.exportName, declarationName: row.declarationName, source: row.source, line: row.line, sourceSha256: row.sourceSha256, initializerKind: init ? ts.SyntaxKind[init.kind] : 'none', initializerClass: initializerClass(declaration), authorityClass: authorityClass(declaration, sourceFile), resolvedInitializerDeclarations: init ? resolvedDeclaration(unwrapped(init), sourceFile) : [], generatedSource: row.source.startsWith('src/generated/'), initializerText: init?.getText(sourceFile) ?? null });
}
details.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line || a.exportName.localeCompare(b.exportName));
const byClass = Object.fromEntries([...new Set(details.map(row => row.initializerClass))].sort().map(kind => [kind, details.filter(row => row.initializerClass === kind).length]));
const generatedVariables = details.filter(row => row.generatedSource);
const authorityCounts = Object.fromEntries([...new Set(details.map(row => row.authorityClass))].sort().map(kind => [kind, details.filter(row => row.authorityClass === kind).length]));
const generatedModelPath = 'src/generated/core-model.ts';
const generatedModel = fs.readFileSync(absolute(generatedModelPath));
const manifestPath = 'spec/metamodel/generated/manifest.json';
const manifest = JSON.parse(fs.readFileSync(absolute(manifestPath), 'utf8'));
const writerPath = 'scripts/metamodel/build.ts';
const writerSha256 = digest(fs.readFileSync(absolute(writerPath)));
const payload = {
  format: 'umf.r8.package-reference-variable-initializer-analysis/1',
  method: 'TypeScript compiler AST declarations resolved through the package-reference entry; no name/regex-based initializer inference.',
  inventorySha256: digest(fs.readFileSync(absolute(inventoryPath))),
  packageReferenceVariableDeclarationCount: details.length,
  initializerClasses: byClass,
  authorityClasses: authorityCounts,
  generatedVariableDeclarationCount: generatedVariables.length,
  generatedVariableDeclarations: generatedVariables,
  generatedCoreModel: {
    source: generatedModelPath,
    sourceSha256: digest(generatedModel),
    metamodelSource: 'spec/metamodel/umf.yaml',
    metamodelSha256: manifest.sources['spec/metamodel/umf.yaml'],
    outputSha256: manifest.outputs[generatedModelPath]?.sha256,
    compilerSourceSetSha256: manifest.provenance.compilerSha256,
    manifestSha256: digest(fs.readFileSync(absolute(manifestPath))),
    currentWriterSha256: writerSha256,
    manifestWriterSha256: manifest.sources[writerPath],
    currentOutputMatchesCapturedManifest: manifest.outputs[generatedModelPath]?.sha256 === digest(generatedModel),
    currentWriterMatchesCapturedManifest: manifest.sources[writerPath] === writerSha256,
    capturedSourceFileCount: Object.keys(manifest.sources).length,
    generatedOutputFreshness: manifest.outputs[generatedModelPath]?.sha256 === digest(generatedModel) && manifest.sources[writerPath] === writerSha256 ? 'captured-output-matches-manifest; current full source closure unverified' : 'moving-source-drift',
    currentCoreVersionConsumers: ['src/model/types.ts', 'src/compilation/admission/index.ts', 'src/access/index.ts'],
    disposition: 'generated semantic constant; compile-time generated data with runtime version-gating consumers, not inert-only data',
  },
  symbols: details,
  limitations: ['Initializer syntax is a shape label; it does not by itself prove inertness or authority.', 'The five generated-backed data rows are CURRENT_CORE_VERSION and the four vocabulary arrays; scalarTypesForVersion is a separate function-valued authored version gate.', 'The generated model matches its captured manifest, but the full generator --check currently fails on another stale output and an isolated current-source build reports a larger source closure; exact full-tree fixed-point status is therefore open.', 'No ledger status, logical retirement gap, or default-route claim is changed by this analysis.'],
};
const rendered = JSON.stringify(payload, null, 2) + '\n';
if (check) {
  if (!fs.existsSync(absolute(outputPath)) || fs.readFileSync(absolute(outputPath), 'utf8') !== rendered) throw new Error('Package-reference variable analysis is stale; recapture deliberately.');
  console.log(`Package-reference AST analysis current: ${details.length} variable declarations; ${generatedVariables.length} generated-source declaration.`);
} else {
  fs.writeFileSync(absolute(outputPath), rendered);
  console.log(`Wrote ${outputPath}: ${details.length} declarations; ${generatedVariables.length} generated-source declaration.`);
}
console.log(`analysisSha256=${digest(Buffer.from(rendered))}`);
console.log(JSON.stringify(byClass));
