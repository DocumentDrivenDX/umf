#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-api';

const root = path.resolve(import.meta.dirname, '../../..');
const output = path.join(root, 'src/index-v4-default.ts');
const entries = ['src/index-node-v4.ts', 'src/index-browser-v4.ts'];
const reference = 'src/index.ts';
const aggregatorFiles = new Set([
  'src/index.ts', 'src/index-node-v4.ts', 'src/index-browser-v4.ts',
  'src/node.ts', 'src/browser.ts', 'src/node-v3.ts', 'src/browser-v3.ts',
]);
const rel = file => path.relative(root, file).split(path.sep).join('/');
const abs = file => path.resolve(root, file);

function resolved(checker, symbol) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function isTypeOnlyExport(symbol) {
  return (symbol.getDeclarations() || []).some(declaration =>
    (ts.isExportSpecifier(declaration) && declaration.isTypeOnly) ||
    (ts.isExportDeclaration(declaration) && declaration.isTypeOnly));
}

function moduleSpecifier(fromEntry, sourceFile) {
  let value = path.relative(path.dirname(abs(fromEntry)), sourceFile.fileName).split(path.sep).join('/');
  value = value.replace(/\.tsx?$/, '');
  return value.startsWith('.') ? value : `./${value}`;
}

function buildProgram() {
  const config = ts.readConfigFile(abs('tsconfig.json'), ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  return ts.createProgram([...entries, reference].map(abs), { ...parsed.options, noEmit: true, allowJs: true, resolveJsonModule: true });
}

export function generateFacade(program = buildProgram()) {
  const checker = program.getTypeChecker();
  const source = file => {
    const node = program.getSourceFile(abs(file));
    if (!node) throw new Error(`Missing TypeScript source: ${file}`);
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) throw new Error(`Missing module symbol: ${file}`);
    return { node, exports: checker.getExportsOfModule(symbol) };
  };
  const ref = source(reference);
  const rootExports = entries.map(file => ({ file, ...source(file) }));
  const localOverrides = new Set();
  for (const { file, node, exports } of rootExports) {
    const direct = exports.filter(exported => resolved(checker, exported).getDeclarations()?.some(declaration => declaration.getSourceFile() === node));
    if (!localOverrides.size) for (const exported of direct) localOverrides.add(exported.getName());
    else {
      const names = new Set(direct.map(exported => exported.getName()));
      if (names.size !== localOverrides.size || [...names].some(name => !localOverrides.has(name))) {
        throw new Error('Node and browser V4 local export overrides differ');
      }
    }
  }

  const bindings = [];
  const facets = [];
  for (const exported of ref.exports) {
    const name = exported.getName();
    const target = resolved(checker, exported);
    const flags = target.flags;
    const hasValue = !!(flags & ts.SymbolFlags.Value);
    const hasType = !!(flags & ts.SymbolFlags.Type);
    if (!hasValue && !hasType) continue;
    facets.push({ name, value: hasValue, type: hasType });
    const runtimeNeeded = hasValue && !localOverrides.has(name);
    const typeNeeded = hasType && (!hasValue || localOverrides.has(name));
    if (!runtimeNeeded && !typeNeeded) continue;

    // Only consider modules that declare the resolved symbol. This prevents
    // the reference/V4 aggregators (or another barrel) from becoming origins.
    const declarationFiles = new Set((target.getDeclarations() || []).map(declaration => declaration.getSourceFile()));
    const candidates = [];
    for (const file of declarationFiles) {
      if (aggregatorFiles.has(rel(file.fileName)) || file.isDeclarationFile || file.fileName.includes('/node_modules/')) continue;
      if (file.fileName.endsWith('.json')) {
        if (runtimeNeeded) candidates.push({ file, name: 'default' });
        continue;
      }
      const module = checker.getSymbolAtLocation(file);
      if (!module || !(module.flags & ts.SymbolFlags.Module)) continue;
      for (const origin of checker.getExportsOfModule(module)) {
        if (resolved(checker, origin) !== target) continue;
        if (runtimeNeeded && isTypeOnlyExport(origin)) continue;
        candidates.push({ file, name: origin.getName() });
      }
    }
    candidates.sort((a, b) => rel(a.file.fileName).localeCompare(rel(b.file.fileName)) || a.name.localeCompare(b.name));
    const chosen = candidates[0];
    if (!chosen) throw new Error(`Could not resolve an origin module for ${name} (runtime=${runtimeNeeded}, type=${typeNeeded})`);
    const specifier = moduleSpecifier(entries[0], chosen.file);
    if (runtimeNeeded) bindings.push({ kind: 'value', name, origin: chosen.name, specifier });
    else if (typeNeeded) bindings.push({ kind: 'type', name, origin: chosen.name, specifier });
  }

  bindings.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind) || a.specifier.localeCompare(b.specifier));
  const lines = [
    '// SPDX-License-Identifier: MIT OR Apache-2.0',
    '// Generated by scripts/rust-migration/r8/v4-default-facade.mjs; do not edit.',
  ];
  for (const binding of bindings) {
    const keyword = binding.kind === 'type' ? 'export type' : 'export';
    const alias = binding.name === binding.origin ? binding.origin : `${binding.origin} as ${binding.name}`;
    lines.push(`${keyword} { ${alias} } from '${binding.specifier}';`);
  }
  return { text: `${lines.join('\n')}\n`, localOverrides: [...localOverrides].sort(), bindings, facets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const generated = generateFacade();
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== generated.text) {
      throw new Error('Generated V4 default facade is stale; run bun scripts/rust-migration/r8/v4-default-facade.mjs');
    }
    console.log(`V4 default facade current: ${generated.bindings.length} explicit bindings; ${generated.localOverrides.length} local overrides.`);
  } else {
    fs.writeFileSync(output, generated.text);
    console.log(`Wrote src/index-v4-default.ts (${generated.bindings.length} bindings; ${generated.localOverrides.length} local overrides).`);
  }
}
