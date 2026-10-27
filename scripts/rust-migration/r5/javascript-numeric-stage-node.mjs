import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {encodeRequestWire, encodeWire, fromWire, resultError} from '../../../bindings/core/node/src/wire.js';

const packageEntry = process.env.UMF_R5_NODE_PACKAGE;
if (!packageEntry) throw new Error('Set UMF_R5_NODE_PACKAGE to the freshly built package index.js');
const addon = createRequire(import.meta.url)(resolve(dirname(packageEntry), 'umf_core_node.node'));
const resources = {
  coreSchema: await readFile('spec/core/schema.json', 'utf8').then(JSON.parse),
  referenceSchema: await readFile('spec/core/semantic-type-reference.schema.json', 'utf8').then(JSON.parse),
  packageSchema: await readFile('spec/core/extension-package.schema.json', 'utf8').then(JSON.parse),
  constraints: await readFile('spec/metamodel/generated/core-constraints.json', 'utf8').then(JSON.parse),
  domainPolicy: await readFile('spec/metamodel/generated/domain-policy.json', 'utf8').then(JSON.parse),
};
const document = await readFile('tests/lifecycle/fixtures/legacy-note.json', 'utf8').then(JSON.parse);
const refusalCode = (operation) => {
  try { operation(); } catch (error) { return JSON.parse(error.message).code; }
  return 'ACCEPTED';
};
const forged = JSON.parse(addon.executeJavascriptNumericWire(encodeRequestWire({
  profile: 'umf.javascript-numeric/1.0.0',
  op: 'validateJavascriptNumericContext',
  literal: {decimalToken: '1'}, result: {decimalToken: '1'},
})));
assert.equal(resultError(forged)?.code, 'REQUEST');

assert.equal(refusalCode(() => new addon.JavascriptNumericRuntime(encodeWire(resources), () => encodeRequestWire({ok:false, code:'CANCELLED', message:'setup cancelled'}))), 'CANCELLED');
assert.equal(refusalCode(() => new addon.JavascriptNumericRuntime(encodeWire(resources), () => encodeRequestWire({ok:false, code:'DEADLINE', message:'setup deadline'}))), 'DEADLINE');

let setupWork = 0;
const runtime = new addon.JavascriptNumericRuntime(encodeWire(resources), (amount) => { setupWork += amount; return ''; });
assert.ok(setupWork > 0, 'resource setup should use its own control path');
resources.coreSchema = null;
assert.equal(refusalCode(() => new addon.JavascriptNumericRuntime(encodeWire({coreSchema:{}}), () => encodeRequestWire({ok:false, code:'RESOURCE_LIMIT', message:'setup refusal'}))), 'RESOURCE_LIMIT');


assert.equal(refusalCode(() => runtime.prepare('exactDecimal', encodeWire({token:'1'}), () => encodeRequestWire({ok:false, code:'CANCELLED', message:'operation cancelled'}))), 'CANCELLED');
assert.equal(refusalCode(() => runtime.prepare('exactDecimal', encodeWire({token:'1'}), () => encodeRequestWire({ok:false, code:'DEADLINE', message:'operation deadline'}))), 'DEADLINE');
assert.equal(refusalCode(() => runtime.prepare('exactDecimal', encodeWire({token:'1'}), () => encodeRequestWire({ok:false, code:'RESOURCE_LIMIT', message:'operation work limit'}))), 'RESOURCE_LIMIT');
const options = {document, field:{module:'note_lifecycle', element:'notes__note_id'}};
let operationWork = 0;
const stage = runtime.prepare('integerFromBigInt', encodeWire({token:'1'}), (amount) => { operationWork += amount; return ''; });
const validation = fromWire(JSON.parse(stage.validateContext(encodeWire(options), (amount) => { operationWork += amount; return ''; })));
const output = fromWire(JSON.parse(stage.takeOutput((amount) => { operationWork += amount; return ''; })));
assert.equal(output.integerToken, '1');
assert.equal(validation.valid, true);
assert.ok(operationWork > 0);
assert.equal(refusalCode(() => stage.validateContext(encodeWire(options))), 'JAVASCRIPT_NUMERIC_STAGE');

const outputStage = runtime.prepare('exactDecimal', encodeWire({token:'1.250'}));
assert.equal(fromWire(JSON.parse(outputStage.takeOutput())).decimalToken, '1.250');
assert.equal(refusalCode(() => outputStage.takeOutput()), 'JAVASCRIPT_NUMERIC_STAGE');

const failedStage = runtime.prepare('integerFromBigInt', encodeWire({token:'1'}));
const invalidResult = fromWire(JSON.parse(failedStage.validateContext(encodeWire({document, field:{module:'note_lifecycle', element:'absent'}}))));
assert.equal(invalidResult.valid, false);
assert.equal(refusalCode(() => failedStage.validateContext(encodeWire(options))), 'JAVASCRIPT_NUMERIC_STAGE');

console.log(JSON.stringify({status:'pass', forgedWireRefused:true, setupWork, operationWork, stageOneShotAfterSuccess:true, stageOneShotAfterFailure:true, setupRefusal:'RESOURCE_LIMIT', setupCancellation:'CANCELLED', setupDeadline:'DEADLINE', operationRefusal:'RESOURCE_LIMIT', operationCancellation:'CANCELLED', operationDeadline:'DEADLINE'}));
