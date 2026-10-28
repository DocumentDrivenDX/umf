import {expect, test} from 'bun:test';
import {createAvroCandidateEditor, createAvroInspector, AVRO_CANDIDATE_PROFILE, AVRO_INSPECT_PROFILE} from '../src/avro.js';
import {toWire} from '../src/wire.js';
import {AVRO_CANDIDATE_PROFILE as PUBLIC_AVRO_CANDIDATE_PROFILE, AVRO_INSPECT_PROFILE as PUBLIC_AVRO_INSPECT_PROFILE, createAvroCandidateEditor as createPublicAvroCandidateEditor, createAvroInspector as createPublicAvroInspector, executeRecordTypeBindingWire, initializeAvroCandidateEditorWasm, initializeAvroInspectorWasm, RECORD_TYPE_BINDING_PROFILE} from '../index.js';

function reply(value) {
  return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire(value))});
}

test('Avro WASM wrappers pin operation IDs and preserve the incomplete inspector result', () => {
  const requests = [];
  const module = {
    avroInspectProfileVersion: () => AVRO_INSPECT_PROFILE,
    executeAvroInspectWire(wire) {
      requests.push(JSON.parse(wire));
      return reply({valid: true, complete: false, diagnostics: [{code: 'AVRO_PROFILE_LIMIT', path: '', message: 'incomplete', severity: 'warning'}]});
    },
  };
  const result = createAvroInspector(module).inspect({type: 'record'}, [{id: 'dep', root: {type: 'enum'}}]);
  expect(result.complete).toBe(false);
  expect(result.diagnostics[0].code).toBe('AVRO_PROFILE_LIMIT');
  expect(requests[0].kind).toBe('object');
  expect(field(requests[0], 'op').units.map((unit) => String.fromCharCode(unit)).join('')).toBe('avro.schema.inspect');
});

test('candidate wrapper retains the proposal profile and refuses malformed reports', () => {
  const requests = [];
  const module = {
    avroCandidateProfileVersion: () => AVRO_CANDIDATE_PROFILE,
    executeAvroCandidateWire(wire) {
      requests.push(JSON.parse(wire));
      return reply({profile: AVRO_CANDIDATE_PROFILE, status: 'candidate', path: '/fields/0/name', replacement: {type: 'string'}});
    },
  };
  const report = createAvroCandidateEditor(module).proposeNodeEdit({source: true}, '/fields/0/type', '{"type":"string"}', 'dep');
  expect(report.profile).toBe(AVRO_CANDIDATE_PROFILE);
  expect(report.status).toBe('candidate');
  expect(requests[0].kind).toBe('object');
  expect(field(requests[0], 'op').units.map((unit) => String.fromCharCode(unit)).join('')).toBe('avro.schema.proposeNodeEdit');
  expect(field(requests[0], 'replacementJson').units.map((unit) => String.fromCharCode(unit)).join('')).toBe('{"type":"string"}');
  expect(field(requests[0], 'dependencyId').units.map((unit) => String.fromCharCode(unit)).join('')).toBe('dep');

  const malformed = createAvroCandidateEditor({...module, executeAvroCandidateWire: () => reply({profile: AVRO_CANDIDATE_PROFILE, status: 'not-candidate'})});
  expect(() => malformed.proposeNodeEdit({}, '/', '{}')).toThrow(expect.objectContaining({code: 'WIRE_FORMAT'}));
});

function field(wire, name) {
  return wire.members.find((entry) => entry.key.map((unit) => String.fromCharCode(unit)).join('') === name)?.value;
}

test('Avro operation controls refuse before entering WASM and reset per call', () => {
  let calls = 0;
  const module = {
    avroInspectProfileVersion: () => AVRO_INSPECT_PROFILE,
    executeAvroInspectWire: () => { calls++; return reply({valid: true, complete: false, diagnostics: []}); },
  };
  const stopped = createAvroInspector(module, {controls: {isCancelled: () => true}});
  expect(() => stopped.inspect({type: 'string'})).toThrow(expect.objectContaining({code: 'CANCELLED'}));
  expect(calls).toBe(0);

  let charged = 0;
  const observed = createAvroInspector(module, {controls: {meter(amount) { charged += amount; }}});
  observed.inspect({type: 'string'});
  const ceiling = charged;
  const bounded = createAvroInspector(module, {controls: {maxWork: ceiling}});
  expect(() => bounded.inspect({type: 'string'})).not.toThrow();
  expect(() => bounded.inspect({type: 'string'})).not.toThrow();
});

test('public WASM exports initialize the pinned opt-in Avro inspector and candidate editor', async () => {
  expect(PUBLIC_AVRO_INSPECT_PROFILE).toBe(AVRO_INSPECT_PROFILE);
  expect(PUBLIC_AVRO_CANDIDATE_PROFILE).toBe(AVRO_CANDIDATE_PROFILE);
  let initialized = false;
  const module = {
    default: async () => { initialized = true; },
    avroInspectProfileVersion: () => AVRO_INSPECT_PROFILE,
    executeAvroInspectWire: () => reply({valid: true, complete: false, diagnostics: []}),
    avroCandidateProfileVersion: () => AVRO_CANDIDATE_PROFILE,
    executeAvroCandidateWire: () => reply({profile: AVRO_CANDIDATE_PROFILE, status: 'candidate'}),
  };
  const inspector = await initializeAvroInspectorWasm(async () => module,
    {WebAssembly: {instantiate() {}}});
  expect(initialized).toBe(true);
  expect(inspector.inspect({kind: 'string', value: 'string'})).toMatchObject({valid: true, complete: false});
  expect(createPublicAvroInspector(module).inspect({kind: 'string', value: 'string'}).valid).toBe(true);
  expect(createPublicAvroCandidateEditor(module).proposeNodeEdit({}, '/x', '1'))
    .toMatchObject({profile: AVRO_CANDIDATE_PROFILE, status: 'candidate'});
  expect((await initializeAvroCandidateEditorWasm(async () => module,
    {WebAssembly: {instantiate() {}}})).proposeNodeEdit({}, '/x', '1'))
    .toMatchObject({profile: AVRO_CANDIDATE_PROFILE, status: 'candidate'});
  expect(() => createPublicAvroInspector({...module, avroInspectProfileVersion: () => 'wrong'}))
    .toThrow('RUST_WASM_BINDING_PROFILE_MISMATCH');
});

test('WASM public index exposes only the pinned opt-in Record Type wire profile', () => {
  const request = JSON.stringify({tagged: true});
  const module = {
    recordTypeBindingProfileVersion: () => RECORD_TYPE_BINDING_PROFILE,
    executeRecordTypeWire: (wire, control) => `${wire}:${typeof control}`,
  };
  expect(RECORD_TYPE_BINDING_PROFILE).toBe('umf.record-type-binding/1.0.0');
  expect(executeRecordTypeBindingWire(module, request)).toBe(`${request}:undefined`);
  expect(() => executeRecordTypeBindingWire({}, request)).toThrow('RUST_WASM_BINDING_MISSING');
  expect(() => executeRecordTypeBindingWire({...module, recordTypeBindingProfileVersion: () => 'wrong'}, request))
    .toThrow('RUST_WASM_BINDING_PROFILE_MISMATCH');
});
