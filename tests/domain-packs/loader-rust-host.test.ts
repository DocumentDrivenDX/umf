// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createDomainPackLoaderInspectionOperation} from '../../src/domain-packs/loader-rust';
import {inspectDomainPackLoader as inspectReference} from '../../src/domain-packs/loader';

const loader = {
  version: '1.0.0', id: 'umf.document-loader', implementation_version: '1.0.0',
  profile: 'court-documents', runtime: 'bun', entrypoint: 'run.ts',
  configuration_schema: 'inventory.schema.json', qualification: 'Finite inventory',
  artifacts: [
    {reference: 'run.ts', sha256: 'a'.repeat(64), source_annotation: {opaque: [1, true]}},
    {reference: 'inventory.schema.json', sha256: 'b'.repeat(64)},
  ], future_annotation: {retain: 'exactly'},
};

test('Rust-bound host wrapper preserves synchronous shape and parity with the TypeScript reference', () => {
  const seen: unknown[] = [];
  const inspect = createDomainPackLoaderInspectionOperation(wire => {
    const admitted = JSON.parse(wire);
    seen.push(admitted);
    return JSON.stringify(inspectReference(admitted));
  });
  expect(inspect.name).toBe('inspectDomainPackLoader');
  expect(inspect.length).toBe(1);
  expect(inspect(loader)).toEqual(inspectReference(loader));
  expect(seen).toHaveLength(1);
  expect(seen[0]).toEqual(loader);
});

test('host admission rejects accessors and toJSON without invoking them before Rust dispatch', () => {
  let invoked = 0;
  let dispatched = 0;
  const inspect = createDomainPackLoaderInspectionOperation(wire => {
    dispatched++;
    return JSON.stringify(inspectReference(JSON.parse(wire)));
  });
  const accessorInput = Object.defineProperty({...loader}, 'future_annotation', {
    enumerable: true, get() { invoked++; return {unexpected: true}; },
  });
  expect(inspect(accessorInput)).toEqual({valid: false, complete: false, diagnostics: ['Non-JSON loader companion']});
  const toJsonInput = {...loader, toJSON() { invoked++; return loader; }};
  expect(inspect(toJsonInput)).toEqual({valid: false, complete: false, diagnostics: ['Non-JSON loader companion']});
  expect(invoked).toBe(0);
  expect(dispatched).toBe(0);
});

test('host wrapper preserves structural rejection and duplicate-before-closure diagnostics', () => {
  const inspect = createDomainPackLoaderInspectionOperation(wire => JSON.stringify(inspectReference(JSON.parse(wire))));
  const duplicate = {...loader, artifacts: [{...loader.artifacts[0]}, {...loader.artifacts[0]}]};
  expect(inspect(duplicate)).toEqual({valid: false, complete: false, diagnostics: ['Duplicate loader artifact', 'Incomplete loader artifact closure']});
  const malformed = {...loader, artifacts: [{...loader.artifacts[0]}, {...loader.artifacts[1], sha256: 'A'.repeat(64)}]};
  expect(inspect(malformed)).toEqual({valid: false, complete: false, diagnostics: ['Unsupported or malformed loader companion']});
});

test('host wrapper passes lone UTF-16 surrogates and the admitted maximum unknown depth through JSON text', () => {
  let deep: unknown = null;
  for (let index = 0; index < 127; index++) deep = [deep];
  const input = {
    ...loader,
    qualification: '\uD800',
    [`future_\uD800`]: '\uDFFF',
    artifacts: [{...loader.artifacts[0], annotation: '\uDFFF'}, {...loader.artifacts[1]}],
    future_annotation: deep,
  };
  let wire = '';
  const inspect = createDomainPackLoaderInspectionOperation(value => {
    wire = value;
    return JSON.stringify(inspectReference(JSON.parse(value)));
  });
  expect(inspect(input)).toEqual(inspectReference(input));
  const roundTrip = JSON.parse(wire);
  expect(roundTrip.qualification).toBe('\uD800');
  expect(roundTrip[`future_\uD800`]).toBe('\uDFFF');
  expect(roundTrip.future_annotation).toEqual(deep);
});
