import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const pkg=resolve(process.env.UMF_R5_INSTALLED_PACKAGE); if(!pkg) throw Error('UMF_R5_INSTALLED_PACKAGE required');
const req=createRequire(resolve(pkg,'dist/umf-node.js'));
const addon=req('./umf_core_node.node');
const op='executeValidateCoreRecordValuesHostJson';
if(typeof addon[op]!=='function')throw Error(`missing packaged ${op}`);
let dispatches=0;const native=addon[op];addon[op]=function(...args){dispatches++;return native.apply(this,args)};
const root=process.env.UMF_R5_WORKTREE;
const evidence=resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-values');
const packet=JSON.parse(await readFile(resolve(evidence,'frozen-typescript.json'),'utf8'));
const host=JSON.parse(await readFile(resolve(evidence,'host-admission.json'),'utf8'));
const api=await import('@umf/core'),ref=await import('@umf/core/reference');
assert.notEqual(api.validateCoreRecordValues,ref.validateCoreRecordValues);
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
const thrown=e=>({name:e?.name??'Error',code:e?.code??'',message:String(e?.message??e),path:e?.path??''});
const capture=fn=>{try{return{ok:true,value:fn()}}catch(e){return{ok:false,error:thrown(e)}}};
const expected=c=>c.thrown?{ok:false,error:{...c.thrown}}:{ok:true,value:c.result};
const compare=(actual,want,label)=>{if(want?.ok===false&&want.error&&!Object.hasOwn(want.error,'name'))delete actual.error?.name;assert.equal(canonical(actual),canonical(want),label)};
let defaultSemantic=0;
for(const c of packet.cases){const before=dispatches;const actual=capture(()=>api.validateCoreRecordValues(c.source,c.identity,c.values));assert.equal(dispatches,before+1,`default Rust dispatch ${c.id}`);defaultSemantic++;compare(actual,expected(c),`default ${c.id}`)}
const semanticDispatches=dispatches;
for(const c of packet.cases)compare(capture(()=>ref.validateCoreRecordValues(c.source,c.identity,c.values)),expected(c),`reference ${c.id}`);
assert.equal(dispatches,semanticDispatches,'reference route dispatched Rust');
const {source,identity,values}=host.fixture, outcomes=host.outcomes.rawCases;
const rawExpected=(key)=>key==='invalidNumbers'?null:key==='nan'||key==='positiveInfinity'||key==='negativeInfinity'||key==='negativeZero'||key==='unsafeInteger'?outcomes.invalidNumbers.find(x=>x.id===key).outcome:outcomes[key];
function scenario(id){
 let s=0,i=0,v=0; const counts=()=>({source:s,identity:i,values:v});
 const src={...source};
 const identityAccessor={get module(){i++;return 'fixture'},element:'item'};
 const valuesAccessor=[{field:{module:'fixture',element:'label'},state:'present',get value(){v++;return{string:'x'}}}];
 const makeSourceAccessor=()=>{Object.defineProperty(src,'future',{enumerable:true,get(){s++;return true}});return src};
 switch(id){
 case 'sourceAccessor': return {args:[makeSourceAccessor(),identity,values],counts};
 case 'identityAccessor': return {args:[source,identityAccessor,valuesAccessor],counts};
 case 'valuesAccessorBeforeSourceVersion': return {args:[{...source,umf:'0.7.0'},identity,valuesAccessor],counts};
 case 'hiddenSource': {const x={...source};Object.defineProperty(x,'hidden',{value:true});return{args:[x,identity,values],counts}}
 case 'symbolSource': return{args:[{...source,[Symbol('future')]:true},identity,values],counts};
 case 'customPrototypeSource': return{args:[Object.assign(Object.create({future:true}),source),identity,values],counts};
 case 'sparseValues': return{args:[source,identity,new Array(1)],counts};
 case 'cyclicSource': {const x={...source};x.cycle=x;return{args:[x,identity,values],counts}}
 case 'nonJsonValues': return{args:[source,identity,[undefined]],counts};
 case 'hiddenIdentity': {const x={module:'fixture'};Object.defineProperty(x,'element',{value:'item'});return{args:[source,x,values],counts}}
 case 'symbolIdentity': return{args:[source,{...identity,[Symbol('future')]:true},values],counts};
 case 'customPrototypeIdentity': return{args:[source,Object.assign(Object.create({future:true}),identity),values],counts};
 case 'crossedInvalidSemanticSource': return{args:[{...source,umf:'0.7.0'},{module:''},[null]],counts};
 case 'nan':case 'positiveInfinity':case 'negativeInfinity':case 'negativeZero':case 'unsafeInteger': {const nums={nan:NaN,positiveInfinity:Infinity,negativeInfinity:-Infinity,negativeZero:-0,unsafeInteger:Number.MAX_SAFE_INTEGER+1};return{args:[source,identity,[{field:{module:'fixture',element:'label'},state:'present',value:{number:nums[id]}}]],counts}}
 case 'sourceThenIdentityThenValuesGetterCounts': {const argsA=[{...source,umf:'0.7.0'},{module:''},values],a=capture(()=>api.validateCoreRecordValues(...argsA));const ca=counts();s=i=v=0;const argsB=[source,{module:''},[null]],b=capture(()=>api.validateCoreRecordValues(...argsB));const cb=counts();s=i=v=0;const refCounts=()=>({source:s,identity:i,values:v});return{direct:a,ca,second:b,cb,argsA,argsB,refCounts}}
 }
 throw Error('unhandled host case '+id)
}
const ids=['sourceAccessor','identityAccessor','valuesAccessorBeforeSourceVersion','hiddenSource','symbolSource','customPrototypeSource','sparseValues','cyclicSource',...outcomes.invalidNumbers.map(x=>x.id),'nonJsonValues','hiddenIdentity','symbolIdentity','customPrototypeIdentity','crossedInvalidSemanticSource','sourceThenIdentityThenValuesGetterCounts'];
assert.equal(ids.length,19);
let defaultHost=0,referenceHost=0;const dispatchByCase={};
for(const id of ids){const sc=scenario(id);if(id==='sourceThenIdentityThenValuesGetterCounts'){const pair=[[sc.direct,host.outcomes.semanticOrder.invalidSourceBeforeIdentityMeaning,sc.ca,sc.argsA],[sc.second,host.outcomes.semanticOrder.copiedValuesBeforeIdentityMeaning,sc.cb,sc.argsB]];for(const [got,want,count]of pair){compare(got,want,id);compare(count,{source:0,identity:0,values:0},id+' default getter trace')}const refBefore=dispatches;for(const [,want,,args]of pair)compare(capture(()=>ref.validateCoreRecordValues(...args)),want,id+' reference order trace');assert.equal(dispatches,refBefore,id+' reference order trace dispatch');compare(sc.refCounts(),{source:0,identity:0,values:0},id+' reference getter trace');dispatchByCase[id]={default:2,reference:0,orderProbes:2};continue}
 const want=rawExpected(id);let before=dispatches;const got=capture(()=>api.validateCoreRecordValues(...sc.args));compare(got,want,id);assert.deepEqual(sc.counts(),{source:0,identity:0,values:0},id+' getter count');assert.equal(dispatches,before+1,id+' default dispatch');defaultHost++;dispatchByCase[id]={default:dispatches-before,reference:0,getterReads:{source:0,identity:0,values:0}};
 before=dispatches;compare(capture(()=>ref.validateCoreRecordValues(...sc.args)),want,id+' reference');assert.equal(dispatches,before,id+' reference dispatch');assert.deepEqual(sc.counts(),{source:0,identity:0,values:0},id+' reference getter trace');referenceHost++;
}
assert.equal(dispatches-semanticDispatches,defaultHost+2,'18 standalone cases plus two ordered semantic traces');
console.log(JSON.stringify({status:'pass',runtime:typeof Bun==='undefined'?process.version:`Bun ${Bun.version}`,packageVersion:JSON.parse(await readFile(resolve(pkg,'package.json'),'utf8')).version,semantic:{cases:24,defaultDispatches:defaultSemantic,referenceDispatches:0},rawHostAdmission:{cases:19,defaultDispatches:defaultHost+2,referenceDispatches:0,dispatchByCase,getterCounts:'zero for all accessor refusal vectors; explicit source/identity/value trace checked'},resource:{browserCountLimitPending:true},totalRecordValueRustDispatches:dispatches}));
