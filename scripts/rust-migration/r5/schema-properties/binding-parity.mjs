import {readFile} from 'node:fs/promises';
const {createCoreModelEngine}=await import(process.env.UMF_R5_BINDING_ENTRY??'../../../../bindings/core/node/index.js');
const read=(path)=>readFile(path,'utf8').then(JSON.parse);
const [frozen,resources]=await Promise.all([
  read('docs/helix/04-build/evidence/rust-migration/r5-schema-properties/frozen-typescript.json'),
  Promise.all(['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json'].map(read)).then(([coreSchema,referenceSchema,packageSchema,constraints,domainPolicy])=>({coreSchema,referenceSchema,packageSchema,constraints,domainPolicy})),
]);
const predecessor=await import('../../../../src/model/schema-properties.ts');
const canonical=(value)=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const equal=(label,actual,expected)=>{if(canonical(actual)!==canonical(expected))throw new Error(`${label} differs: Rust=${canonical(actual)} TypeScript=${canonical(expected)}`);};
const capture=(fn)=>{try{return {ok:true,value:fn()};}catch(error){return {ok:false,error:{name:error.name,code:error.code??'',message:error.message??String(error),path:error.path??''}};}};
const {source,identity,patch,unknownFacets,unknownRange,invalidSource,unknownPatch}=frozen.inputs;
const engine=createCoreModelEngine(resources);
let meteredWork=0;const meteredEngine=createCoreModelEngine(resources,{controls:{meter:(amount)=>{meteredWork+=amount;}}});meteredEngine.inspectCoreSchemaProperties(source,identity);if(meteredWork===0)throw new Error('Schema-properties host/Rust work was not metered');
let cancelled=false;const cancellable=createCoreModelEngine(resources,{controls:{isCancelled:()=>cancelled}});cancelled=true;const cancellation=capture(()=>cancellable.inspectCoreSchemaProperties(source,identity));if(cancellation.ok||cancellation.error.code!=='CANCELLED')throw new Error('Schema-properties cancellation was not enforced');
const expected=frozen.success;
equal('document inspection',engine.inspectCoreSchemaProperties(source,{scope:'document'}),expected.inspectDocument.value);
equal('module inspection',engine.inspectCoreSchemaProperties(source,{scope:'module',module:'m'}),expected.inspectModule.value);
equal('element inspection',engine.inspectCoreSchemaProperties(source,identity),expected.inspectElement.value);
const before=canonical(source);
const declared=engine.declareCoreSchemaProperties(source,identity,patch);
equal('declaration',declared,expected.declare.value);
if(canonical(source)!==before)throw new Error('Declaration mutated the caller source');
equal('unrelated unknown facet preservation',engine.declareCoreSchemaProperties(unknownFacets.source,identity,unknownFacets.patch),expected.unknownUnrelatedFacetMerge.value);
equal('unknown qualifier inspection',engine.inspectCoreSchemaProperties(expected.unknownQualifierInspection.value.source,expected.unknownQualifierInspection.value.identity),expected.unknownQualifierInspection.value);
for(const [label,actual,key] of [
  ['patch before source validation',capture(()=>engine.declareCoreSchemaProperties(unknownPatch.source,unknownPatch.identity,unknownPatch.patch)),'patchBeforeInvalidSource'],
  ['source before identity lookup',capture(()=>engine.declareCoreSchemaProperties(invalidSource.source,invalidSource.identity,invalidSource.patch)),'sourceBeforeMissingIdentity'],
  ['unknown existing group refusal',capture(()=>engine.declareCoreSchemaProperties(unknownRange.source,identity,unknownRange.patch)),'unknownExistingGroup'],
]) equal(label,actual,frozen.refusals[key]);
const adversarial=[
  ['source validation precedes malformed identity',()=>engine.inspectCoreSchemaProperties(invalidSource.source,{scope:'nonsense',future:true}),()=>predecessor.inspectCoreSchemaProperties(invalidSource.source,{scope:'nonsense',future:true})],
  ['slash-bearing unknown identity key',()=>engine.inspectCoreSchemaProperties(source,{scope:'element',module:'m',element:'e','future/key':true}),()=>predecessor.inspectCoreSchemaProperties(source,{scope:'element',module:'m',element:'e','future/key':true})],
  ['post-edit title diagnostic',()=>engine.declareCoreSchemaProperties(source,identity,{title:12}),()=>predecessor.declareCoreSchemaProperties(source,identity,{title:12})],
  ['post-edit duplicate alias diagnostic',()=>engine.declareCoreSchemaProperties(source,identity,{aliases:['same','same']}),()=>predecessor.declareCoreSchemaProperties(source,identity,{aliases:['same','same']})],
  ['invalid scope before later unknown identity key',()=>engine.inspectCoreSchemaProperties(source,{scope:'nonsense',future:true}),()=>predecessor.inspectCoreSchemaProperties(source,{scope:'nonsense',future:true})],
  ['unknown identity without scope',()=>engine.inspectCoreSchemaProperties(source,{future:true}),()=>predecessor.inspectCoreSchemaProperties(source,{future:true})],
  ['null scope identity',()=>engine.inspectCoreSchemaProperties(source,{scope:null}),()=>predecessor.inspectCoreSchemaProperties(source,{scope:null})],
  ['insertion order chooses first unknown identity key',()=>engine.inspectCoreSchemaProperties(source,{future:true,scope:'nonsense'}),()=>predecessor.inspectCoreSchemaProperties(source,{future:true,scope:'nonsense'})],
  ['empty identity keeps generic refusal',()=>engine.inspectCoreSchemaProperties(source,{}),()=>predecessor.inspectCoreSchemaProperties(source,{})],
];
for(const [label,rust,typescript] of adversarial){const expected=capture(typescript);if(expected.ok)throw new Error(`${label}: TypeScript unexpectedly accepted the adversarial input`);equal(label,capture(rust),expected);}
for(const format of ['json','yaml'])equal(`${format} document round-trip`,engine.readDocument(engine.writeDocument(declared,format),format),frozen.copyAndRoundTrip.jsonRoundTrip);
process.stdout.write(JSON.stringify({operations:5,refusals:12,formats:['json','yaml'],meteredWork,cancellation:cancellation.error.code,status:'pass'})+'\n');
