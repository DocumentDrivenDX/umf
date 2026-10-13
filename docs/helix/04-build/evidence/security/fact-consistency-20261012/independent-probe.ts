import {evaluateSecurityAccess as access,evaluateSecurityCollection as collection} from "/Users/erik/.codex/worktrees/security-main-integration/umf/src/extensions/security/evaluate.ts";
import {evaluateSecurityAccess as expanded} from "/private/tmp/umf-fact-consistency-astra-nad05t7d/expanded-retention.ts";
import {evaluationFixture} from "/Users/erik/.codex/worktrees/security-main-integration/umf/tests/security/evaluation-fixture.ts";
import {ref} from "/Users/erik/.codex/worktrees/security-main-integration/umf/tests/security/fixture.ts";
const outcomes=[];
function check(id,actual,expected){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(id+': '+JSON.stringify(actual));outcomes.push({id,actual});}
function broad(f,type=ref('Resource')){f.policy.rules=[{id:'read',effect:'permit',actions:['read'],target:[type],condition:{op:'literal',value:true}}];}
for(const [name,kind,facets,a,b,expected] of [
 ['integer-equivalent','integer',undefined,{integerToken:'1e2'},{integerToken:'100'},'permit'],
 ['integer-zero','integer',undefined,{integerToken:'-0'},{integerToken:'0'},'permit'],
 ['decimal-equivalent','decimal',{precision:10,scale:2},{decimalToken:'1.20'},{decimalToken:'12e-1'},'permit'],
 ['binary-equivalent','binary',undefined,{binaryHex:'abCD'},{binaryHex:'ABcd'},'permit'],
 ['unicode-distinct','string',undefined,{string:'é'},{string:'é'},'indeterminate'],
 ['boolean-distinct','boolean',undefined,{boolean:true},{boolean:false},'indeterminate'],
]){
 const f=evaluationFixture();broad(f);
 const field=f.resolution.documents[0].document.modules[0].elements.find(x=>x.id==='salary');field.scalarType=kind;if(facets)field.facets=facets;
 f.resource.fields.find(x=>x.field.elementId==='salary').value=a;
 const inventory=structuredClone(f.resource);inventory.fields.find(x=>x.field.elementId==='salary').value=b;f.cut.facts.push(inventory);
 check(name,access(f.policy,f.resolution,f.cut,{action:'read',output:[]},f.resource).decision,expected);
}
{
 const f=evaluationFixture();broad(f);const other=structuredClone(f.resource);other.fields.find(x=>x.field.elementId==='salary').value={integerToken:'101'};
 check('collection-conflict',collection(f.policy,f.resolution,f.cut,{action:'read',resources:[f.resource,other],output:[]}),{status:'refused',rows:[]});
}
{
 const f=evaluationFixture();broad(f,ref('Staff'));const module=f.resolution.documents[0].document.modules[0];
 module.elements.find(x=>x.id==='Staff').members.push({module:'m',element:'staffLabel'});
 module.elements.push({id:'staffLabel',kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}});
 f.resolution.ontology.entities.find(x=>x.type.elementId==='Staff').fields.push({ref:ref('staffLabel'),protection:'unprotected'});
 f.cut.coverage.find(x=>x.type.elementId==='Staff').fields.push(ref('staffLabel'));
 f.cut.subjects[0].fields.push({field:ref('staffLabel'),value:{string:'original'}});
 const resource=structuredClone(f.cut.subjects[0]);resource.fields.find(x=>x.field.elementId==='staffLabel').value={string:'changed'};
 check('subject-resource-conflict',access(f.policy,f.resolution,f.cut,{action:'read',output:[]},resource).decision,'indeterminate');
 resource.fields.find(x=>x.field.elementId==='staffLabel').value={string:'original'};
 check('subject-resource-consistent',access(f.policy,f.resolution,f.cut,{action:'read',output:[]},resource).decision,'permit');
}
const f=evaluationFixture();broad(f);f.cut.facts=[];
for(let i=0;i<50;i++)f.cut.facts.push({type:ref('Resource'),key:[{string:'many-'+i}],fields:[{field:ref('resourceId'),value:{string:'many-'+i}},{field:ref('salary'),value:{integerToken:'1e100000'}}],absent:[]});
const oldSet=Map.prototype.set;let normalizedCharacters=0,originalLiteralCharacters=0;
Map.prototype.set=function(k,v){if(typeof v==='string'&&v.startsWith('present:integer:'))normalizedCharacters+=v.length;if(v&&typeof v==='object'&&typeof v.integerToken==='string')originalLiteralCharacters+=v.integerToken.length;return oldSet.call(this,k,v);};
let oldCount,newCount,newLiteralCount;
try{
 check('expanded-retention-control',expanded(f.policy,f.resolution,f.cut,{action:'read',output:[]},f.resource).decision,'permit');oldCount=normalizedCharacters;
 normalizedCharacters=0;originalLiteralCharacters=0;
 check('original-reference-retention',access(f.policy,f.resolution,f.cut,{action:'read',output:[]},f.resource).decision,'permit');newCount=normalizedCharacters;newLiteralCount=originalLiteralCharacters;
}finally{Map.prototype.set=oldSet;}
if(!(oldCount>4000000&&newCount===0))throw Error('Retention control failed');
console.log(JSON.stringify({passed:outcomes.length,outcomes,retentionProbe:{inputJsonCharacters:JSON.stringify(f.cut).length,facts:f.cut.facts.length,maxFacts:f.cut.maxFacts,maxSteps:f.cut.maxSteps,expandedRetainedCharacters:oldCount,revisedExpandedRetainedCharacters:newCount,revisedOriginalLiteralCharacters:newLiteralCount,scope:'Instrumented Map.set values in isolated bounded probe, not a heap or runtime resource theorem'}},null,2));
