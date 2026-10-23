// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare the opt-in Rust binding with the 50 frozen TypeScript carrier cases.
import {readFile} from 'node:fs/promises';
const {createCoreModelEngine, createEngine} = await import(process.env.UMF_R5_BINDING_ENTRY ?? '../../../bindings/core/node/index.js');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const [resources, frozen] = await Promise.all([
  Promise.all([
    read('spec/core/schema.json'), read('spec/core/semantic-type-reference.schema.json'),
    read('spec/core/extension-package.schema.json'), read('spec/metamodel/generated/core-constraints.json'),
    read('spec/metamodel/generated/domain-policy.json'),
  ]).then(([coreSchema, referenceSchema, packageSchema, constraints, domainPolicy]) => ({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy})),
  read('docs/helix/04-build/evidence/rust-migration/r5-field-value/frozen-typescript.json'),
]);
const canonical = (value) => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
    : JSON.stringify(value);
const capture = (run) => {
  try { return {result: run()}; }
  catch (error) { return {thrown: {name: error.name, message: error.message}, error}; }
};
const engine = createCoreModelEngine(resources);
for (const row of frozen.cases) {
  const captured = capture(() => engine.validateCoreFieldValue(row.source ?? frozen.source, row.identity, row.value));
  if (row.thrown && !(captured.error instanceof TypeError)) throw new Error(row.id + ' did not throw a native JavaScript TypeError');
  const actual = captured.result === undefined ? {thrown: captured.thrown} : {result: captured.result};
  const expected = row.result ? {result: row.result} : {thrown: row.thrown};
  if (canonical(actual) !== canonical(expected)) throw new Error(row.id + ' differs from frozen TypeScript behavior: actual=' + canonical(actual) + ' expected=' + canonical(expected));
}
let work = 0;
const metered = createCoreModelEngine(resources, {controls:{meter(amount) { work += amount; }}});
metered.validateCoreFieldValue(frozen.cases[0].source ?? frozen.source, frozen.cases[0].identity, frozen.cases[0].value);
if (work === 0) throw new Error('Field-value request did not account host/Rust work');
let cancelled = false;
const cancellable = createCoreModelEngine(resources, {controls:{isCancelled:()=>cancelled}});
cancelled = true;
let cancellation = '';
try { cancellable.validateCoreFieldValue(frozen.cases[0].source ?? frozen.source, frozen.cases[0].identity, frozen.cases[0].value); }
catch (error) { cancellation = error.code ?? ''; }
if (cancellation !== 'CANCELLED') throw new Error('Field-value cancellation returned ' + cancellation);
if ('validateCoreFieldValue' in createEngine(resources)) throw new Error('Field-value API must remain opt-in before R7');
console.log(JSON.stringify({status:'pass',runtime:process.version,bun:typeof Bun === 'undefined' ? null : Bun.version,cases:frozen.cases.length,typeErrors:frozen.cases.filter((row)=>row.thrown).length,orderedJsonCarrierAdmission:true,meteredWork:work,cancellation}));
