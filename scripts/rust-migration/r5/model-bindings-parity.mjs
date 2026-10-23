// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare complete retained TypeScript envelopes against the opt-in Rust binding.
import {readFile, writeFile} from 'node:fs/promises';
const {createCoreModelEngine} = await import(process.env.UMF_R5_BINDING_ENTRY ?? '../../../bindings/core/node/index.js');

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const [resources, source, surrogateSource, frozen, frozenRefusals, cardinality, cardinalityFrozen, selectionInputs, selectionFrozen, selectionRefusals, selectionRefusalFixture] = await Promise.all([
  Promise.all([
    read('spec/core/schema.json'), read('spec/core/semantic-type-reference.schema.json'),
    read('spec/core/extension-package.schema.json'), read('spec/metamodel/generated/core-constraints.json'),
    read('spec/metamodel/generated/domain-policy.json'),
  ]).then(([coreSchema, referenceSchema, packageSchema, constraints, domainPolicy]) => ({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy})),
  read('scripts/rust-migration/r5/kind-nullability/input.json'),
  read('scripts/rust-migration/r5/kind-nullability/surrogate-input.json'),
  read('scripts/rust-migration/r5/kind-nullability/frozen-typescript.json'),
  read('scripts/rust-migration/r5/kind-nullability/frozen-refusals.json'),
  read('docs/helix/04-build/evidence/rust-migration/r5-cardinality/vectors.json'),
  read('docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json'),
  read('scripts/rust-migration/r5/selection/input.json'),
  read('scripts/rust-migration/r5/selection/frozen-typescript.json'),
  read('scripts/rust-migration/r5/selection/frozen-refusals.json'),
  read('fixtures/validation/core-selection.json'),
]);
function preflightControl(name, options, expected) {
  let touches = 0;
  const hostile = new Proxy({}, {ownKeys(){ touches++; throw new Error('resources traversed before control preflight'); }, getOwnPropertyDescriptor(){ touches++; throw new Error('resources read before control preflight'); }});
  let code = '';
  try { createCoreModelEngine(hostile, options); } catch (error) { code = error.code ?? ''; }
  if (code !== expected || touches !== 0) throw new Error(`${name} preflight touched resources or returned ${code} (touches=${touches})`);
  return {code, touches};
}
const preflight = {
  zeroWork: preflightControl('zero-work', {controls:{maxWork:0}}, 'RESOURCE_LIMIT'),
  cancelled: preflightControl('cancelled', {controls:{isCancelled:()=>true}}, 'CANCELLED'),
  deadline: preflightControl('deadline', {controls:{now:()=>10,deadlineMs:0}}, 'DEADLINE'),
  hardIsolation: preflightControl('hard-isolated', {profile:'hard-isolated'}, 'RESOURCE_PROFILE_UNAVAILABLE'),
};
let meteredWork = 0;
const meteredEngine = createCoreModelEngine(resources, {controls:{meter:(amount)=>{meteredWork+=amount;}}});
meteredEngine.inspectCoreKind(source,'m','known');
if (meteredWork === 0) throw new Error('Metered model resource snapshot/request did not account host work');
let registryCancelled = false, cancelRegistryTouches = 0;
const cancellationEngine = createCoreModelEngine(resources, {controls:{isCancelled:()=>registryCancelled}});
registryCancelled = true;
const hostileRegistry = new Proxy([], {getPrototypeOf(){cancelRegistryTouches++;throw new Error('registry touched before cancellation');}, ownKeys(){cancelRegistryTouches++;throw new Error('registry touched before cancellation');}, getOwnPropertyDescriptor(){cancelRegistryTouches++;throw new Error('registry touched before cancellation');}});
let registryCancellationCode = '';
try { cancellationEngine.selectCoreElements(source,{references:'none'},hostileRegistry); } catch (error) { registryCancellationCode = error.code ?? ''; }
if(registryCancellationCode!=='CANCELLED'||cancelRegistryTouches!==0)throw new Error(`Registry cancellation preflight returned ${registryCancellationCode} after ${cancelRegistryTouches} touches`);
let largeRegistryDescriptors = 0, largeRegistryOwnKeys = 0, largeExtensionDescriptors = 0;
const largeRegistryValues=Array.from({length:128},(_,i)=>new Proxy({id:`large-${i}`,version:'1.0.0',scopes:['element'],schema:true},{getOwnPropertyDescriptor(target,key){largeExtensionDescriptors++;return Reflect.getOwnPropertyDescriptor(target,key);}}));
const largeRegistry = new Proxy(largeRegistryValues,{ownKeys(target){largeRegistryOwnKeys++;return Reflect.ownKeys(target);},getOwnPropertyDescriptor(target,key){if(key!=='length')largeRegistryDescriptors++;return Reflect.getOwnPropertyDescriptor(target,key);}});
let largeRegistryCode = '', largeRegistryArmed = false, largeRegistryCancelled = false, largeRegistryWork = 0;
const largeRegistryEngine=createCoreModelEngine(resources,{controls:{meter:(amount)=>{if(largeRegistryArmed){largeRegistryWork+=amount;if(largeRegistryWork>260)largeRegistryCancelled=true;}},isCancelled:()=>largeRegistryCancelled}});
largeRegistryArmed=true;
try { largeRegistryEngine.selectCoreElements(source,{references:'none'},largeRegistry); } catch (error) { largeRegistryCode = error.code ?? ''; }
if(largeRegistryCode!=='CANCELLED'||largeRegistryOwnKeys!==1||largeRegistryDescriptors!==128||largeExtensionDescriptors!==0)throw new Error(`Large registry was not bounded: ${largeRegistryCode}, work=${largeRegistryWork}, ownKeys=${largeRegistryOwnKeys}, arrayDescriptors=${largeRegistryDescriptors}, extensionDescriptors=${largeExtensionDescriptors}`);
const engine = createCoreModelEngine(resources);
const capture = (operation) => { try { return {ok: true, value: operation()}; } catch (e) { return {ok: false, error: {code: e.code ?? '', message: e.message ?? String(e), path: e.path ?? ''}}; } };
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const kindReceipt = engine.declareCoreKind(source, 'm', 'missing', 'field');
const nullReceipt = engine.declareCoreNullability(source, 'm', 'missing', 'absent-allowed');
const actual = {
  kind_inspect_known: capture(() => engine.inspectCoreKind(source, 'm', 'known')),
  kind_inspect_unspecified: capture(() => engine.inspectCoreKind(source, 'm', 'kindless')),
  kind_declare: capture(() => kindReceipt),
  kind_verify: capture(() => engine.verifyCoreKindDeclaration(kindReceipt, kindReceipt.target)),
  nullability_inspect_missing: capture(() => engine.inspectCoreNullability(source, 'm', 'missing')),
  nullability_inspect_known: capture(() => engine.inspectCoreNullability(source, 'm', 'known')),
  nullability_inspect_inapplicable: capture(() => engine.inspectCoreNullability(source, 'm', 'record')),
  nullability_declare: capture(() => nullReceipt),
  nullability_verify: capture(() => engine.verifyCoreNullabilityDeclaration(nullReceipt, nullReceipt.target)),
  kind_surrogate_identity_inspect: capture(() => engine.inspectCoreKind(surrogateSource, '\ud800', '\ud800')),
  nullability_surrogate_identity_inspect: capture(() => engine.inspectCoreNullability(surrogateSource, '\ud800', '\ud800')),
};
const invalid = structuredClone(source); invalid.modules[0].elements[0].id=''; invalid.modules.push(structuredClone(invalid.modules[0]));
const conflicting = structuredClone(source); conflicting.modules[0].elements[0].scalarType='integer';
const invalidKindSource = structuredClone(kindReceipt); invalidKindSource.source={};
const invalidKindTarget = structuredClone(kindReceipt); invalidKindTarget.target={};
const invalidNullSource = structuredClone(nullReceipt); invalidNullSource.source={};
const invalidNullTarget = structuredClone(nullReceipt); invalidNullTarget.target={};
const forgedKind = structuredClone(kindReceipt); delete forgedKind.identity;
const forgedNull = structuredClone(nullReceipt); delete forgedNull.identity;
const staleKind = structuredClone(kindReceipt); staleKind.target.id='stale';
const staleNull = structuredClone(nullReceipt); staleNull.target.id='stale';
const actualRefusals = {
  sourceInvalidKind:capture(()=>engine.inspectCoreKind(invalid,'m','known')),
  sourceInvalidNullability:capture(()=>engine.inspectCoreNullability(invalid,'m','known')),
  kindConflict:capture(()=>engine.declareCoreKind(conflicting,'m','known','record')),
  malformedKindReceipt:capture(()=>engine.verifyCoreKindDeclaration(forgedKind,kindReceipt.target)),
  malformedNullabilityReceipt:capture(()=>engine.verifyCoreNullabilityDeclaration(forgedNull,nullReceipt.target)),
  invalidKindReceiptSource:capture(()=>engine.verifyCoreKindDeclaration(invalidKindSource,kindReceipt.target)),
  invalidKindReceiptTarget:capture(()=>engine.verifyCoreKindDeclaration(invalidKindTarget,kindReceipt.target)),
  invalidNullabilityReceiptSource:capture(()=>engine.verifyCoreNullabilityDeclaration(invalidNullSource,nullReceipt.target)),
  invalidNullabilityReceiptTarget:capture(()=>engine.verifyCoreNullabilityDeclaration(invalidNullTarget,nullReceipt.target)),
  staleKindReceipt:capture(()=>engine.verifyCoreKindDeclaration(kindReceipt,staleKind.target)),
  staleNullabilityReceipt:capture(()=>engine.verifyCoreNullabilityDeclaration(nullReceipt,staleNull.target)),
  nullabilityRole:capture(()=>engine.declareCoreNullability(source,'m','record','required')),
  missingIdentity:capture(()=>engine.inspectCoreKind(source,'absent','absent')),
};
const cardInspect = engine.inspectCoreCardinality(cardinalityFrozen.document, cardinalityFrozen.identity.module, cardinalityFrozen.identity.element);
const cardKnown = engine.inspectCoreCardinality(cardinalityFrozen.known, cardinalityFrozen.identity.module, cardinalityFrozen.identity.element);
const cardUnknown = engine.inspectCoreCardinality(cardinalityFrozen.unknown, cardinalityFrozen.identity.module, cardinalityFrozen.identity.element);
const cardInapplicable = engine.inspectCoreCardinality(cardinalityFrozen.inapplicable, cardinalityFrozen.identity.module, cardinalityFrozen.identity.element);
const cardReceipt = engine.declareCoreCardinality(cardinalityFrozen.document, cardinalityFrozen.identity.module, cardinalityFrozen.identity.element, cardinalityFrozen.request);
const cardVerified = engine.verifyCoreCardinalityDeclaration(cardReceipt, cardReceipt.target);
const cardSurrogateValue = structuredClone(cardinalityFrozen.document); cardSurrogateValue.modules[0].elements[0].cardinality='\ud800';
const cardSurrogateValueResult = engine.inspectCoreCardinality(cardSurrogateValue, cardinalityFrozen.identity.module, cardinalityFrozen.identity.element);
const cardSurrogateItem = engine.declareCoreCardinality(cardinalityFrozen.surrogateItemDocument, cardinalityFrozen.identity.module, cardinalityFrozen.identity.element, cardinalityFrozen.surrogateItemRequest);
const surrogateCardDoc = structuredClone(cardinalityFrozen.surrogateIdentityDocument);
const surrogateCardIdentity = cardinalityFrozen.surrogateIdentity;
const cardSurrogate = engine.inspectCoreCardinality(surrogateCardDoc, surrogateCardIdentity.module, surrogateCardIdentity.element);
for (const [label, actual, expected] of [
  ['missing inspection',cardInspect,cardinalityFrozen.inspections.missing.value], ['known inspection',cardKnown,cardinalityFrozen.inspections.known.value],
  ['unknown inspection',cardUnknown,cardinalityFrozen.inspections.unknown.value], ['inapplicable inspection',cardInapplicable,cardinalityFrozen.inspections.inapplicable.value],
  ['declaration',cardReceipt,cardinalityFrozen.declaration], ['verification',cardVerified,cardinalityFrozen.verified.value],
  ['surrogate cardinality',cardSurrogateValueResult,cardinalityFrozen.inspections.surrogate.value],
  ['surrogate item type declaration',cardSurrogateItem,cardinalityFrozen.surrogateItemDeclaration.value],
]) if (canonical(actual)!==canonical(expected)) throw new Error(`Cardinality ${label} differs from frozen TypeScript envelope`);
if (canonical(cardSurrogate.identity)!==canonical(surrogateCardIdentity)) throw new Error('Cardinality UTF-16 identity was not retained');
const cardRefusals = {
  unknownOverwrite:capture(()=>engine.declareCoreCardinality(cardinalityFrozen.unknown,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element,{cardinality:'one'})),
  invalidRequest:capture(()=>engine.declareCoreCardinality(cardinalityFrozen.document,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element,{cardinality:'array',itemType:{module:'',element:''}})),
  missingIdentity:capture(()=>engine.inspectCoreCardinality(cardinalityFrozen.document,'absent','absent')),
  malformedSourceReceipt:capture(()=>engine.verifyCoreCardinalityDeclaration(cardinalityFrozen.malformedSourceReceipt,cardinalityFrozen.declaration.target)),
  malformedTargetReceipt:capture(()=>engine.verifyCoreCardinalityDeclaration(cardinalityFrozen.malformedTargetReceipt,cardinalityFrozen.declaration.target)),
  surrogateIdentity:capture(()=>engine.inspectCoreCardinality(cardinalityFrozen.surrogateIdentityDocument,cardinalityFrozen.surrogateIdentity.module,cardinalityFrozen.surrogateIdentity.element)),
};
for (const [name, expected] of Object.entries(cardinalityFrozen.refusals)) if (canonical(cardRefusals[name])!==canonical(expected)) throw new Error(`Cardinality ${name} refusal differs from frozen TypeScript envelope`);
for (const [name, expected] of Object.entries(frozen)) if (canonical(actual[name]?.value) !== canonical(expected)) throw new Error(`${name} differs from retained TypeScript envelope`);
for (const [name, expected] of Object.entries(frozenRefusals)) if (canonical(actualRefusals[name]) !== canonical(expected)) throw new Error(`${name} refusal differs from retained TypeScript envelope`);
const selection = Object.fromEntries(Object.entries(selectionInputs.queries).map(([name,query])=>[name,engine.selectCoreElements(selectionInputs.source,query)]));
selection.surrogate=engine.selectCoreElements(selectionInputs.surrogateSource,{references:'none',identities:[{module:'\ud800',element:'\ud800'}]});
for (const [name,expected] of Object.entries(selectionFrozen.cases)) if(canonical(selection[name])!==canonical(expected)) throw new Error(`Selection ${name} differs from frozen TypeScript envelope`);
if(canonical(selection.surrogate)!==canonical(selectionFrozen.surrogate)) throw new Error('Selection raw-surrogate identity differs from frozen TypeScript envelope');
const selectionCapture=(operation)=>capture(operation);
const invalidReference=structuredClone(selectionRefusalFixture.source); invalidReference.modules[0].elements[0].references[0].element='absent';
const invalidShape=structuredClone(selectionRefusalFixture.source); invalidShape.modules[0].elements[0].id='';
const rejectingExtension={id:'future.meaning',version:'1.0.0',scopes:['document','module','element'],schema:{type:'object'},semantics:()=>[{code:'FROZEN_REJECT',path:'/extensions/future.meaning',severity:'error',message:'Frozen rejection'}]};
const selectionRefused={invalidReference:selectionCapture(()=>engine.selectCoreElements(invalidReference,{references:'none'})),invalidShape:selectionCapture(()=>engine.selectCoreElements(invalidShape,{references:'none'})),semanticErrorEvenEmpty:selectionCapture(()=>engine.selectCoreElements(selectionRefusalFixture.source,{references:'none',names:[]},[rejectingExtension])),malformedQuery:selectionCapture(()=>engine.selectCoreElements(selectionRefusalFixture.source,{references:'none',extra:true})),large:selectionCapture(()=>engine.selectCoreElements({umf:'0.10.0',id:'large',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',extensions:{},future:Array(51000).fill('opaque')}]}]},{references:'none'}))};
for(const [name,expected] of Object.entries(selectionRefusals)) if(canonical(selectionRefused[name])!==canonical(expected)) throw new Error(`Selection ${name} refusal differs from frozen TypeScript envelope: actual=${JSON.stringify(selectionRefused[name])} expected=${JSON.stringify(expected)}`);
await writeFile('/private/tmp/umf-r5-model-bindings-node-result.json', JSON.stringify({actual,actualRefusals,preflight,meteredWork,registryControls:{cancellation:{code:registryCancellationCode,touches:cancelRegistryTouches},large:{code:largeRegistryCode,work:largeRegistryWork,ownKeys:largeRegistryOwnKeys,arrayDescriptors:largeRegistryDescriptors,extensionDescriptors:largeExtensionDescriptors}},cardinality:{inspection:cardInspect,declaration:cardReceipt,verification:cardVerified,surrogateIdentity:cardSurrogate},selection,selectionRefused}, null, 2) + '\n');
process.stdout.write(`${Object.keys(actual).length} kind/nullability successes, ${Object.keys(actualRefusals).length} refusals, eight cardinality successes plus six refusals, and ${Object.keys(selection).length} selection successes plus ${Object.keys(selectionRefused).length} refusals matched\n`);
