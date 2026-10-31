import {expect, test} from 'bun:test';
import {resolve} from 'node:path';
import ts from 'typescript-api';
import packageJson from '../../package.json' with {type: 'json'};

function declaredExports(path) {
  const absolute = resolve(path);
  const program = ts.createProgram([absolute], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  });
  const source = program.getSourceFile(absolute);
  if (!source) throw new Error(`missing declaration source ${path}`);
  const symbol = program.getTypeChecker().getSymbolAtLocation(source);
  if (!symbol) throw new Error(`missing declaration module symbol ${path}`);
  return new Set(program.getTypeChecker().getExportsOfModule(symbol).map(item => item.getName()));
}

function runtimeSourceExports(path) {
  const absolute = resolve(path);
  const program = ts.createProgram([absolute], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    resolveJsonModule: true,
    allowJs: true,
    skipLibCheck: true,
  });
  const source = program.getSourceFile(absolute);
  if (!source) throw new Error(`missing runtime source ${path}`);
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  if (!module) throw new Error(`missing runtime module symbol ${path}`);
  return new Set(checker.getExportsOfModule(module).filter(exported => {
    const resolved = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    return (resolved.getDeclarations() ?? []).some(declaration =>
      ts.isFunctionDeclaration(declaration) || ts.isClassDeclaration(declaration) || ts.isEnumDeclaration(declaration)
      || ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration)
      || (ts.isSourceFile(declaration) && declaration.fileName.endsWith('.json')));
  }).map(exported => exported.getName()));
}

test('package root types describe both V4 roots while ./reference keeps its TypeScript surface', {timeout: 30_000}, () => {
  expect(packageJson.exports['.'].types).toBe('./dist/src/index-browser-v4.d.ts');
  expect(packageJson.exports['./reference'].types).toBe('./dist/src/index.d.ts');

  const root = declaredExports('dist/src/index-browser-v4.d.ts');
  const node = declaredExports('dist/src/index-node-v4.d.ts');
  const reference = declaredExports('dist/src/index.d.ts');
  const rootRuntime = runtimeSourceExports('src/index-browser-v4.ts');
  const nodeRuntime = runtimeSourceExports('src/index-node-v4.ts');
  const referenceRuntime = runtimeSourceExports('src/index.ts');
  const rootOnly = ['projectSecCompanyFactsRustCandidate', 'projectSecSubmissionsRustCandidate', 'readDescriptorSetRustCandidate'];
  expect(rootRuntime.size).toBe(1123);
  expect(nodeRuntime).toEqual(rootRuntime);
  expect(referenceRuntime.size).toBe(1120);
  expect([...rootRuntime].filter(name => !referenceRuntime.has(name)).sort()).toEqual(rootOnly.sort());
  expect([...referenceRuntime].filter(name => !rootRuntime.has(name))).toEqual([]);
  expect([...rootRuntime].filter(name => !root.has(name))).toEqual([]);
  expect([...nodeRuntime].filter(name => !node.has(name))).toEqual([]);
  expect([...referenceRuntime].filter(name => !reference.has(name))).toEqual([]);
  expect(rootOnly.every(name => root.has(name) && node.has(name))).toBe(true);
  expect(rootOnly.every(name => !reference.has(name))).toBe(true);
});
