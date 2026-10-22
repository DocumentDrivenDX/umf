import {evaluateSecurityWrite} from '/Users/erik/.codex/worktrees/security-main-integration/umf/src/extensions/security/write';
import {writeFixture} from '/Users/erik/.codex/worktrees/security-main-integration/umf/tests/security/write-fixture';
import {ref} from '/Users/erik/.codex/worktrees/security-main-integration/umf/tests/security/fixture';
const results:{id:string;actual:string;expected:string}[]=[];
const run=(f:ReturnType<typeof writeFixture>)=>evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'update',original:f.original,proposed:f.proposed}).decision;
const assert=(id:string,f:ReturnType<typeof writeFixture>,expected:string)=>{const before=JSON.stringify(f);const actual=run(f);if(JSON.stringify(f)!==before)throw Error(id+' mutated inputs');results.push({id,actual,expected});if(actual!==expected)throw Error(JSON.stringify(results));};
const field=(f:ReturnType<typeof writeFixture>,name:string)=>f.resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id===name)!;
const plain=(f:ReturnType<typeof writeFixture>)=>{for(const r of f.policy.rules)r.condition={op:'literal',value:true};};
assert('baseline',writeFixture(),'permit');
{
 const f=writeFixture();field(f,'staffId').scalarType='binary';field(f,'assignmentStaff').scalarType='binary';
 for(const [state,token] of [[f.original,'aA'],[f.proposed,'Aa']] as const){state.cut.subjects[0]!.key=[{binaryHex:token}];state.cut.subjects[0]!.fields[0]!.value={binaryHex:token};state.cut.facts.find(x=>x.type.elementId==='Assignment')!.fields.find(x=>x.field.elementId==='assignmentStaff')!.value={binaryHex:'aa'};}
 assert('binary-key-and-field-hex-case',f,'permit');
}
{
 const f=writeFixture();field(f,'ownerId').scalarType='integer';
 for(const state of [f.original,f.proposed]){const row=state.cut.facts.find(x=>x.type.elementId==='Ownership')!;row.key=[{integerToken:'100'}];row.fields.find(x=>x.field.elementId==='ownerId')!.value={integerToken:'100'};const duplicate=structuredClone(row);duplicate.key=[{integerToken:'1e2'}];duplicate.fields.find(x=>x.field.elementId==='ownerId')!.value={integerToken:'1e2'};state.cut.facts.push(duplicate);}
 assert('semantically-duplicate-inventory-identity',f,'indeterminate');
}
{
 const f=writeFixture();for(const state of [f.original,f.proposed]){const row=state.cut.facts.find(x=>x.type.elementId==='Assignment')!;row.fields.push(structuredClone(row.fields[0]!));}assert('duplicate-field-in-matching-projections',f,'indeterminate');
}
{
 const f=writeFixture();plain(f);field(f,'active').nullability='absent-allowed';for(const state of [f.original,f.proposed])state.cut.facts.find(x=>x.type.elementId==='Assignment')!.fields=state.cut.facts.find(x=>x.type.elementId==='Assignment')!.fields.filter(x=>x.field.elementId!=='active');
 assert('same-omitted-unused-authority-field',f,'permit');f.proposed.cut.facts.find(x=>x.type.elementId==='Assignment')!.absent=[ref('active')];assert('omitted-vs-explicitly-absent-authority-field',f,'indeterminate');
}
{
 const f=writeFixture();plain(f);const ownerNote=ref('ownerNote');
 field(f,'Ownership').members!.push({module:'m',element:'ownerNote'});
 f.resolution.documents[0]!.document.modules[0]!.elements.push({id:'ownerNote',kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 f.resolution.ontology.associations.find(x=>x.type.elementId==='Ownership')!.fields.push({ref:ownerNote,protection:'unprotected'});
 for(const state of [f.original,f.proposed])state.cut.coverage.find(x=>x.type.elementId==='Ownership')!.fields.push(ownerNote);
 f.original.cut.facts.find(x=>x.type.elementId==='Ownership')!.fields.push({field:ownerNote,value:null});
 f.proposed.cut.facts.find(x=>x.type.elementId==='Ownership')!.absent=[ownerNote];
 f.policy.rules.find(x=>x.id==='writer')!.actions=f.policy.rules.find(x=>x.id==='writer')!.actions.filter(x=>x!=='change-owner');assert('null-to-absence-requires-owner-action',f,'deny');f.policy.rules.find(x=>x.id==='writer')!.actions.push('change-owner');assert('null-to-absence-with-owner-action',f,'permit');
}
{
 const f=writeFixture();plain(f);field(f,'active').nullability='absent-allowed';for(const state of [f.original,f.proposed])state.cut.facts.find(x=>x.type.elementId==='Assignment')!.absent=[ref('active')];assert('present-and-explicitly-absent-duplicate',f,'indeterminate');
}
console.log(JSON.stringify({results,inputUnchanged:true},null,2));
