import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createArrowSchemaEngine} from '../../bindings/core/node/index.js';
import {
  exportArrowSchema,
  getArrowNode,
  importArrowSchema,
  inspectArrow,
  proposeArrowNodeEdit,
} from '../../src/adapters/arrow/index.ts';

const root = resolve(import.meta.dir, '../..');
const cases = JSON.parse(readFileSync(resolve(root, 'fixtures/arrow/schema-cases.json'), 'utf8'));
const capture = operation => {
  try { return {status: 'ok', value: operation()}; }
  catch (error) { return {status: 'error', code: error.code, message: error.message, path: error.path}; }
};

test('Node/Bun Arrow binding matches TypeScript for the 52 authored schema cases and five operations', () => {
  const engine = createArrowSchemaEngine();
  expect(cases).toHaveLength(52);
  const selected = process.env.ARROW_CASE_LIMIT ? cases.slice(0, Number(process.env.ARROW_CASE_LIMIT)) : cases;
  for (const row of selected) {
    const source = JSON.stringify(row.input);
    const expected = importArrowSchema(source, {id: row.id});
    const actual = engine.importSchema(source, row.id);
    expect(actual).toEqual(expected);
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
    expect(JSON.stringify(engine.inspect(actual))).toBe(JSON.stringify(inspectArrow(expected)));
    expect(engine.exportSchema(actual)).toBe(exportArrowSchema(expected));
    expect(engine.getNode(actual, '/fields/0/name')).toEqual(getArrowNode(expected, '/fields/0/name'));
    const before = JSON.stringify(actual);
    const expectedEdit = proposeArrowNodeEdit(expected, '/fields/0/name', '"changed"');
    const actualEdit = engine.proposeNodeEdit(actual, '/fields/0/name', '"changed"');
    expect(JSON.stringify(actualEdit)).toBe(JSON.stringify(expectedEdit));
    expect(JSON.stringify(actual)).toBe(before);
  }
}, 120000);

test('Arrow binding preserves exact numeric lexemes and matches representative failure and unknown-field behavior', () => {
  const engine = createArrowSchemaEngine();
  const source = '{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":1e3}}]}';
  const expected = importArrowSchema(source, {id: 'number-lexeme'});
  const actual = engine.importSchema(source, 'number-lexeme');
  expect(actual).toEqual(expected);
  expect(engine.exportSchema(actual)).toBe(exportArrowSchema(expected));
  expect(engine.exportSchema(actual)).toContain('1e3');
  expect(JSON.stringify(engine.inspect(actual))).toBe(JSON.stringify(inspectArrow(expected)));

  const invalid = '{"fields":[{"name":"x","nullable":true,"type":{"name":"int","bitWidth":7,"isSigned":true}}]}';
  expect(capture(() => engine.importSchema(invalid, 'invalid')))
    .toEqual(capture(() => importArrowSchema(invalid, {id: 'invalid'})));

  const unknown = '{"fields":[{"name":"x","nullable":true,"futureField":true,"type":{"name":"utf8"}}],"futureRoot":true}';
  const expectedUnknown = importArrowSchema(unknown, {id: 'unknown'});
  const actualUnknown = engine.importSchema(unknown, 'unknown');
  expect(JSON.stringify(engine.inspect(actualUnknown))).toBe(JSON.stringify(inspectArrow(expectedUnknown)));
  expect(capture(() => engine.exportSchema(actualUnknown)))
    .toEqual(capture(() => exportArrowSchema(expectedUnknown)));
  expect(engine.getNode(actualUnknown, '/fields/0/futureField'))
    .toEqual(getArrowNode(expectedUnknown, '/fields/0/futureField'));
  expect(JSON.stringify(engine.proposeNodeEdit(actualUnknown, '/fields/0/name', '"y"')))
    .toBe(JSON.stringify(proposeArrowNodeEdit(expectedUnknown, '/fields/0/name', '"y"')));
}, 120000);

test('Arrow prepared engine scopes setup and call controls and rejects use after disposal', () => {
  const setup = capture(() => createArrowSchemaEngine({setupControls: {isCancelled: () => true}}));
  expect(setup.status).toBe('error');
  expect(setup.code).toBe('CANCELLED');
  const setupBudget = capture(() => createArrowSchemaEngine({setupControls: {maxWork: 0}}));
  expect(setupBudget.status).toBe('error');
  expect(setupBudget.code).toBe('RESOURCE_LIMIT');

  const cancelled = createArrowSchemaEngine({controls: {isCancelled: () => true}});
  const call = capture(() => cancelled.importSchema('{"fields":[]}', 'cancelled'));
  expect(call.status).toBe('error');
  expect(call.code).toBe('CANCELLED');
  cancelled.dispose();
  const callBudgetEngine = createArrowSchemaEngine({controls: {maxWork: 0}});
  const callBudget = capture(() => callBudgetEngine.importSchema('{"fields":[]}', 'budget'));
  expect(callBudget.status).toBe('error');
  expect(callBudget.code).toBe('RESOURCE_LIMIT');
  callBudgetEngine.dispose();

  const engine = createArrowSchemaEngine();
  engine.dispose();
  engine.dispose();
  const disposed = capture(() => engine.importSchema('{"fields":[]}', 'disposed'));
  expect(disposed.status).toBe('error');
  expect(disposed.code).toBe('RUST_ARROW_SCHEMA_HANDLE_DISPOSED');
}, 120000);
