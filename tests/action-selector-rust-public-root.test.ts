// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import fixture from '../docs/helix/03-test/fixtures/bulk-update/model.json';
import {compileActionRule,compileActionSelector,selectActionIdentity,admitActionInputs,prepareActionIdentities,actionFieldValueKey} from '../src/index-node-v4';
import type {Document} from '../src/model/types';

function setup() {
  const document = structuredClone(fixture) as unknown as Document;
  const module = document.modules[0] as unknown as {extensions: Record<string, {actions: unknown[]}>};
  const action = module.extensions['umf.actions']!.actions[0] as Record<string, any>;
  const frame = action.writes[0];
  return {document, action, frame};
}

test('Node V4 Action selector public root compiles exact entity selector through Rust', () => {
  const {document, action, frame} = setup();
  expect(compileActionSelector(document, action as never, frame as never)).toEqual({
    language: 'umf.actions.keys', version: '1', expression: '{"entity":"customer"}',
    frame: 'customer-write', ast: {entity: 'customer'},
  });
});

test('Node V4 Action selector public root refuses unsupported selector versions', () => {
  const {document, action, frame} = setup();
  frame.selector.version = '2';
  expect(() => compileActionSelector(document, action as never, frame as never)).toThrow(expect.objectContaining({code: 'ACTION_SELECTOR_PROFILE'}));
});


test('Node V4 Action identity public root admits typed values and selects a stable Core Key tuple through Rust', {timeout: 60_000}, () => {
  const {document, action, frame} = setup();
  const inputs = {customer: {key: {module: 'sales', element: 'customer', key: 'pk'}, components: [{string: 'customer-17'}]}, 'active-value': {boolean: false}};
  expect(admitActionInputs(document, action as never, inputs as never)).toEqual(inputs);
  expect(selectActionIdentity(document, action as never, frame as never, inputs as never)).toMatchObject({entity: inputs.customer});
  const prepared = prepareActionIdentities(document, action as never);
  expect(prepared.select('customer-write', inputs as never).entity).toEqual(inputs.customer);
  expect(actionFieldValueKey({module: 'sales', element: 'active'})).toBe('["sales","active"]');
});

test('Node V4 Action identity public root refuses missing required input', () => {
  const {document, action} = setup();
  expect(() => admitActionInputs(document, action as never, {} as never)).toThrow(expect.objectContaining({code: 'ACTION_PARAMETER'}));
});


test('Node V4 Action rule public root compiles rules/1 through the shared Rust Action analyzer', () => {
  const {document, action} = setup();
  const rule = {language: 'umf.actions.rules', version: '1', expression: '{"literal":{"boolean":true}}', references: []};
  expect(compileActionRule(document, action as never, rule as never, 'pre')).toMatchObject({language: 'umf.actions.rules', version: '1', phase: 'pre', type: 'boolean', ast: {literal: {boolean: true}}, dependencies: []});
});

test('Node V4 Action rule public root refuses a nonboolean condition', () => {
  const {document, action} = setup();
  const rule = {language: 'umf.actions.rules', version: '1', expression: '{"literal":{"string":"x"}}', references: []};
  expect(() => compileActionRule(document, action as never, rule as never, 'pre')).toThrow(expect.objectContaining({code: 'ACTION_STRUCTURE'}));
});
