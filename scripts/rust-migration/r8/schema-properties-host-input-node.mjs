import {readFile} from 'node:fs/promises';
const binding = await import(process.env.UMF_HOST_JSON_BINDING ?? '../../../bindings/core/node/index.js');
const {createCoreSchemaPropertiesHostInputEngine} = binding;
const predecessor = process.versions.bun
  ? await import('../../../src/model/schema-properties.ts')
  : undefined;

const read = (path) => readFile(path, 'utf8').then(JSON.parse);
const [frozen, ...resourceFiles] = await Promise.all([
  read('docs/helix/04-build/evidence/rust-migration/r5-schema-properties/frozen-typescript.json'),
  ...['spec/core/schema.json', 'spec/core/semantic-type-reference.schema.json', 'spec/core/extension-package.schema.json', 'spec/metamodel/generated/core-constraints.json', 'spec/metamodel/generated/domain-policy.json'].map(read),
]);
const [coreSchema, referenceSchema, packageSchema, constraints, domainPolicy] = resourceFiles;
const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const {source, identity, patch, invalidSource, unknownPatch} = frozen.inputs;
const engine = createCoreSchemaPropertiesHostInputEngine(resources);
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
};
const capture = (fn) => {
  try { return {ok: true, value: fn()}; }
  catch (error) { return {ok: false, error: {name: error.name, code: error.code ?? '', message: error.message ?? String(error), path: error.path ?? ''}}; }
};

same(engine.declareCoreSchemaProperties(source, identity, patch), frozen.success.declare.value, 'frozen declaration');
same(capture(() => engine.declareCoreSchemaProperties(invalidSource.source, {scope: 'element', module: 'missing', element: 'missing'}, {title: 'x'})), frozen.refusals.sourceBeforeMissingIdentity, 'source-before-identity refusal');

let sourceTouched = false;
const sourceProxy = new Proxy({}, {getPrototypeOf() { sourceTouched = true; throw new Error('source should not be observed'); }});
const patchRefusal = capture(() => engine.declareCoreSchemaProperties(sourceProxy, identity, unknownPatch.patch));
if (patchRefusal.ok || sourceTouched) throw new Error('patch refusal did not precede source reflection');
same(patchRefusal, frozen.refusals.patchBeforeInvalidSource, 'patch-before-source refusal');

const marker = {identity: 'raw host exception'};
const throwingSource = new Proxy({}, {getPrototypeOf() { throw marker; }});
let caught;
try { engine.declareCoreSchemaProperties(throwingSource, identity, {title: 'x'}); }
catch (error) { caught = error; }
if (caught !== marker) throw new Error('raw proxy exception identity was not preserved');

const events = [];
const patchProxy = new Proxy({title: 'Count'}, {
  getPrototypeOf(target) { events.push('patch.prototype'); return Reflect.getPrototypeOf(target); },
  ownKeys(target) { events.push('patch.keys'); return Reflect.ownKeys(target); },
});
const sourceTrace = new Proxy(source, {
  getPrototypeOf(target) { events.push('source.prototype'); return Reflect.getPrototypeOf(target); },
});
engine.declareCoreSchemaProperties(sourceTrace, identity, patchProxy);
const patchKeys = events.indexOf('patch.keys');
const sourceProto = events.indexOf('source.prototype');
if (patchKeys < 0 || sourceProto < 0 || patchKeys > sourceProto) throw new Error(`staged patch/source order missing: ${events.join(',')}`);

// The fixed-size bridge is exercised with both a large copied root string and
// a large visible property key. Rust may reject them semantically, but never
// because the adapter imposed a 4M-unit transport cap.
const longValue = 'x'.repeat(20_000);
const largeSource = {...source, metadata: longValue};
const largeResult = capture(() => engine.declareCoreSchemaProperties(largeSource, identity, {title: 'Count'}));
if (!largeResult.ok || largeResult.value.metadata !== longValue) throw new Error('large root string was not copied through bounded chunks');

const primitiveRoots = [
  ['boolean root', false], ['null root', null], ['number root', 7],
  ['string root', 'primitive patch'], ['unsupported root', undefined],
];
for (const [label, value] of primitiveRoots) {
  const expected = value === undefined
    ? {ok: false, error: {name: 'UmfError', code: 'NON_JSON', message: 'Value is not JSON-compatible', path: ''}}
    : {ok: false, error: {name: 'UmfError', code: 'CORE_SCHEMA_PROPERTIES', message: 'Expected object', path: '/request'}};
  const actual = capture(() => engine.declareCoreSchemaProperties(source, identity, value));
  same(actual, expected, label);
  if (predecessor) same(actual, capture(() => predecessor.declareCoreSchemaProperties(source, identity, value)), `${label} predecessor`);
}
const nestedScalars = [
  ['boolean', true], ['null', null], ['number', 7], ['string', 'nested'],
  ['undefined', undefined], ['function', () => {}], ['symbol', Symbol('nested')], ['bigint', 1n],
];
for (const [label, value] of nestedScalars) {
  const patch = {title: {nested: value}};
  const actual = capture(() => engine.declareCoreSchemaProperties(source, identity, patch));
  const unsupported = ['undefined', 'function', 'symbol', 'bigint'].includes(label);
  const expected = unsupported
    ? {ok: false, error: {name: 'UmfError', code: 'NON_JSON', message: 'Value is not JSON-compatible', path: '/title/nested'}}
    : {ok: false, error: {name: 'UmfError', code: 'CORE_SCHEMA_PROPERTIES', message: '[{"code":"SEMANTIC_TYPE_STRUCTURE","path":"/modules/0/elements/0/title","message":"must be string","severity":"error"}]', path: ''}};
  same(actual, expected, `nested ${label}`);
  if (predecessor) same(actual, capture(() => predecessor.declareCoreSchemaProperties(source, identity, patch)), `nested ${label} predecessor`);
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayLengthDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length');
const withTypedArrayLengthMutation = (invoke) => {
  const patch = new Proxy({title: 'Count'}, {
    getPrototypeOf(target) {
      Object.defineProperty(typedArrayPrototype, 'length', {
        configurable: true,
        get() { return 0; },
      });
      return Reflect.getPrototypeOf(target);
    },
  });
  try { return capture(() => invoke(source, identity, patch)); }
  finally { Object.defineProperty(typedArrayPrototype, 'length', typedArrayLengthDescriptor); }
};
const typedArrayLengthResult = withTypedArrayLengthMutation(engine.declareCoreSchemaProperties.bind(engine));
if (predecessor) same(typedArrayLengthResult,
  withTypedArrayLengthMutation(predecessor.declareCoreSchemaProperties), 'typed-array length mutation predecessor');
const typedElements = typedArrayLengthResult.ok ? typedArrayLengthResult.value.modules[0].elements : [];
if (!typedArrayLengthResult.ok || typedElements[0].facets.integerWidth.bits !== 64 ||
    typedElements[1].facets.precision !== 20 || typedElements[1].facets.scale !== 2) {
  throw new Error(`typed-array length mutation corrupted numeric output: ${JSON.stringify(typedArrayLengthResult)}`);
}

const objectToJSON = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
const arrayToJSON = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
const withInheritedToJSONMutation = (invoke) => {
  const sourceTrace = new Proxy(source, {
    getPrototypeOf(target) {
      Object.defineProperty(Object.prototype, 'toJSON', {
        configurable: true,
        value() { return 'hostile inherited object toJSON'; },
      });
      Object.defineProperty(Array.prototype, 'toJSON', {
        configurable: true,
        value() { return ['hostile inherited array toJSON']; },
      });
      return Reflect.getPrototypeOf(target);
    },
  });
  try { return capture(() => invoke(sourceTrace, identity, patch)); }
  finally {
    if (objectToJSON) Object.defineProperty(Object.prototype, 'toJSON', objectToJSON);
    else delete Object.prototype.toJSON;
    if (arrayToJSON) Object.defineProperty(Array.prototype, 'toJSON', arrayToJSON);
    else delete Array.prototype.toJSON;
  }
};
const inheritedToJSONResult = withInheritedToJSONMutation(engine.declareCoreSchemaProperties.bind(engine));
same(inheritedToJSONResult, frozen.success.declare, 'inherited toJSON mutation result');
if (predecessor) same(inheritedToJSONResult,
  withInheritedToJSONMutation(predecessor.declareCoreSchemaProperties), 'inherited toJSON mutation predecessor');

process.stdout.write(JSON.stringify({cases: 21, status: 'pass', rawExceptionIdentity: true, patchBeforeSource: true, primitiveRoots: primitiveRoots.length, nestedScalars: nestedScalars.length, typedArrayLengthMutation: true, inheritedToJSONMutation: true}) + '\n');
