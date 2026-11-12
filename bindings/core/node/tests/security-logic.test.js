import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createSecurityLogicEngine, SECURITY_LOGIC_PROFILE} from '../index.js';

const engine = createSecurityLogicEngine();
const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

test('public Node factory replays frozen truth tables and refusal vectors', () => {
  assert.equal(SECURITY_LOGIC_PROFILE, 'umf.security-logic/1.0.0');
  const packetPath = 'tests/rust-core/fixtures/r8-security-truth-logic/frozen-typescript.json';
  const packet = JSON.parse(read(packetPath));
  assert.deepEqual(packet.truths.map(value => engine.securityNot(value)), packet.not);
  assert.deepEqual(packet.truths.map(a => packet.truths.map(b => engine.securityAnd([a,b]))), packet.and);
  assert.deepEqual(packet.truths.map(a => packet.truths.map(b => engine.securityOr([a,b]))), packet.or);
  for (const row of packet.refusals) {
    const values = row.values ?? Array(row.operandCount).fill('T');
    assert.throws(() => (row.operation === 'securityAnd' ? engine.securityAnd : engine.securityOr)(values), error =>
      error.code === row.code && error.message === row.message && error.path === row.path, row.name);
  }
  for (const row of packet.notRefusals) assert.throws(() => engine.securityNot(row.value), error =>
    error.code === row.code && error.message === row.message && error.path === row.path, row.name);
});

test('public Node factory replays frozen composition outcomes and refusals', () => {
  const packetPath = 'tests/rust-core/fixtures/r8-security-truth-logic/compose-cases.json';
  const packet = JSON.parse(read(packetPath));
  for (const row of packet.cases) {
    const rules = row.input.manyRules
      ? [...row.input.rules, ...Array(row.input.manyRules - row.input.rules.length).fill({effect:'permit',truth:'T'})]
      : row.input.rules;
    if (row.error) {
      assert.throws(() => engine.composeSecurityRules(rules, row.input.protectedFields), error =>
        error.code === row.error.code && error.message === row.error.message && error.path === row.error.path, row.name);
    } else {
      assert.deepEqual(plain(engine.composeSecurityRules(rules, row.input.protectedFields)), row.oracle, row.name);
    }
  }
});

test('host preflight rejects accessors without invoking them and does not hide proxy traps', () => {
  let getterCalled = false;
  const rule = {effect:'permit', get truth() { getterCalled = true; return 'T'; }};
  assert.throws(() => engine.composeSecurityRules([rule]), error => error.code === 'ACCESSOR_PROPERTY');
  assert.equal(getterCalled, false);

  let trapCalled = false;
  const proxy = new Proxy([], {ownKeys() { trapCalled = true; throw new Error('proxy trap'); }});
  assert.throws(() => engine.securityAnd(proxy), /proxy trap/);
  assert.equal(trapCalled, true);
});

test('native candidate condition compiler assigns lexical occurrences and rejects bad association indexes', () => {
  const condition = {op:'exists',token:7,alias:'a',association:0,where:{op:'literal',value:true}};
  assert.deepEqual(plain(engine.compileCandidateCompactCondition(condition,1)), {kind:'candidate-compact-condition/0.1',expression:{op:'exists',occurrence:0,alias:'a',association:0,where:{op:'literal',value:true}}});
  assert.throws(() => engine.compileCandidateCompactCondition({...condition,association:1},1), error => error.code === 'SECURITY_CANDIDATE_CONDITION');
});

test('native candidate storage validation checks complete membership and reports exact legacy charges', () => {
  const type={documentId:'d',moduleId:'m',elementId:'R'};
  const field={documentId:'d',moduleId:'m',elementId:'f'};
  const program={ontology:{ontology:{entities:[{type,fields:[{ref:field}]}],actionPurposes:[{action:'read',purposes:['read']}]}},catalog:null};
  const owner={version:'umf.security.logical-owner/0.1',id:'o',revision:'r',disclosure:{readAction:'read'},storage:[{type,field,storageEffect:'canonical'}]};
  assert.deepEqual(plain(engine.validateCandidateCatalogStorage(program,owner,10)),{storage:owner.storage,steps:2});
  assert.throws(() => engine.validateCandidateCatalogStorage(program,owner,1), error => error.code === 'SECURITY_CATALOG_STORAGE');
  assert.throws(() => engine.validateCandidateCatalogStorage(program,{...owner,storage:[]},10), error => error.code === 'SECURITY_CATALOG_STORAGE');
});

test('host work limits, cancellation, and unknown rule members fail closed', () => {
  assert.throws(() => createSecurityLogicEngine({controls:{maxWork:0}}).securityAnd(['T']), error => error.code === 'RESOURCE_LIMIT');
  assert.throws(() => createSecurityLogicEngine({controls:{isCancelled:()=>true}}).securityAnd(['T']), error => error.code === 'CANCELLED');
  let measured = 0;
  assert.equal(createSecurityLogicEngine({controls:{meter:amount => { measured += amount; }}}).securityNot('T'), 'F');
  assert.ok(measured > 0);
  assert.throws(() => engine.composeSecurityRules([{effect:'permit',truth:'T',future:true}]), error => error.code === 'SECURITY_UNKNOWN');
  assert.throws(() => createSecurityLogicEngine({future:true}), /Unknown security logic option/);
});
