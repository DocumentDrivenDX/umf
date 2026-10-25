import {expect, test} from 'bun:test';
import ts from 'typescript-api';
import {classifyDeclarationShape, classifyInitializerShape, classifyMigrationDisposition} from '../../scripts/rust-migration/r8/declaration-shapes.mjs';

function declaration(source: string, name: string) {
  const file = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statement = file.statements.find(item => (ts.isVariableStatement(item) && item.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name)) || (ts.isFunctionDeclaration(item) && item.name?.text === name));
  if (!statement) throw new Error(`missing fixture declaration ${name}`);
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.find(d => ts.isIdentifier(d.name) && d.name.text === name)!;
  if (ts.isFunctionDeclaration(statement)) return statement;
  throw new Error(`unsupported fixture declaration ${name}`);
}

test('R8 syntax labels classify AST shapes and leave migration disposition unreviewed', () => {
  const cases = [
    ['export const f = () => 1;', 'f', 'variable-declaration', 'arrow-function'],
    ['export const data = {x: 1};', 'data', 'variable-declaration', 'object-literal'],
    ['export let pending;', 'pending', 'variable-declaration', 'no-initializer'],
    ['export function run() { return 1; }', 'run', 'function-declaration', 'not-applicable'],
    ['export const made = new Map();', 'made', 'variable-declaration', 'new-expression'],
    ['export const alias = source;', 'alias', 'variable-declaration', 'identifier'],
  ] as const;
  for (const [source, name, shape, initializer] of cases) {
    const node = declaration(source, name);
    expect(classifyDeclarationShape(ts, node)).toBe(shape);
    expect(classifyInitializerShape(ts, node)).toBe(initializer);
    expect(classifyMigrationDisposition()).toBe('unreviewed');
  }
});

test('R8 negative controls do not classify from comments or initializer text', () => {
  const commentOnly = declaration('/* new Map() */ export const value = 1;', 'value');
  const deceptiveString = declaration('export const value = "(() => new Map())";', 'value');
  expect(classifyInitializerShape(ts, commentOnly)).toBe('literal');
  expect(classifyInitializerShape(ts, deceptiveString)).toBe('literal');
  expect(classifyDeclarationShape(ts, commentOnly)).toBe('variable-declaration');
});
