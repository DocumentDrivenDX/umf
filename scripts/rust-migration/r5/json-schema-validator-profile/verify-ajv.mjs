import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import ajvPackage from 'ajv/package.json' with {type: 'json'};

assert.equal(ajvPackage.version, '8.20.0');
const ajv = new Ajv2020({allErrors: true, validateFormats: false});
const profileSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['item'],
  properties: {
    flag: {type: 'boolean'},
    item: {type: 'string'},
    other: {type: 'integer'},
    score: {type: 'number'},
  },
  $defs: {nested: {type: 'boolean'}},
};
const validateProfile = ajv.compile(profileSchema);
assert.equal(validateProfile({item: 'ok', other: 5, score: -0, flag: true}), true);
assert.equal(validateProfile({item: 1, other: 'bad', score: 'bad', flag: 'bad'}), false);
assert.deepEqual(validateProfile.errors.map(({instancePath, schemaPath, keyword}) => [instancePath, schemaPath, keyword]), [
  ['/flag', '#/properties/flag/type', 'type'],
  ['/item', '#/properties/item/type', 'type'],
  ['/other', '#/properties/other/type', 'type'],
  ['/score', '#/properties/score/type', 'type'],
]);
const namedProperties = ajv.compile({
  type: 'object',
  properties: {'a/b': {type: 'string'}, 'é': {type: 'integer'}, '😀': {type: 'boolean'}},
});
assert.equal(namedProperties({'a/b': 'ok', 'é': 1, '😀': true}), true);
assert.equal(namedProperties({'a/b': 1, 'é': 'bad', '😀': 1}), false);
assert.deepEqual(namedProperties.errors.map(({instancePath, keyword}) => [instancePath, keyword]), [
  ['/a~1b', 'type'],
  ['/é', 'type'],
  ['/😀', 'type'],
]);
assert.equal(validateProfile({other: 2, score: 9007199254740991, flag: false}), false);
assert.deepEqual(validateProfile.errors.map(({instancePath, schemaPath, keyword}) => [instancePath, schemaPath, keyword]), [
  ['', '#/required', 'required'],
]);

const numeric = ajv.compile({type: 'number'});
for (const [value, expected] of [[0, true], [-0, true], [1.5, true], [9007199254740991, true], [9007199254740992, true]]) {
  assert.equal(numeric(value), expected);
}
const integer = ajv.compile({type: 'integer'});
for (const [value, expected] of [[0, true], [-0, true], [1.5, false], [9007199254740991, true], [9007199254740992, true]]) {
  assert.equal(integer(value), expected);
}

const resourceAjv = new Ajv2020({allErrors: true, validateFormats: false});
resourceAjv.addSchema({$id: 'https://example.test/amount', type: 'integer'});
resourceAjv.addSchema({$id: 'z', type: 'boolean'}, 'https://example.test/z.json');
resourceAjv.addSchema(false, 'https://example.test/deny.json');
const relativeId = resourceAjv.getSchema('https://example.test/z.json');
assert.equal(relativeId(true), true);
assert.equal(relativeId(1), false);
const relativeIdAlias = resourceAjv.getSchema('z');
assert.equal(relativeIdAlias(true), true);
assert.equal(relativeIdAlias(1), false);
assert.equal(resourceAjv.getSchema('https://example.test/deny.json')('anything'), false);
const refSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://example.test/root',
  type: 'object',
  required: ['item'],
  properties: {
    item: {$ref: '#/$defs/text'},
    other: {$ref: 'https://example.test/amount'},
  },
  $defs: {text: {type: 'string'}},
};
const validateRefs = resourceAjv.compile(refSchema);
assert.equal(validateRefs({item: 'ok', other: 5}), true);
assert.equal(validateRefs({item: 1, other: 'bad'}), false);
assert.deepEqual(validateRefs.errors.map(({instancePath, schemaPath, keyword}) => [instancePath, schemaPath, keyword]), [
  ['/item', '#/$defs/text/type', 'type'],
  ['/other', 'https://example.test/amount/type', 'type'],
]);
console.log(JSON.stringify({ajv: ajvPackage.version, profileCases: 4, namedPropertyCases: 2, numericCases: 10, resourceCases: 3, referenceCases: 2, result: 'passed'}));
