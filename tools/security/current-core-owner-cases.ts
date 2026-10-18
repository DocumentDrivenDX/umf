import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import type {Document} from '../../src/model/types';
import {inspectCoreRecordMembers} from '../../src/model/record-members';
import {inspectCoreScalarType} from '../../src/model/scalar-type';
import {inspectCoreReferenceLinks} from '../../src/model/reference-links';
import {createValidator} from '../../src/validation/schema';
import sourceSchema from '../../spec/core/schema.json';
import memberSchema from '../../spec/core/record-members-inspection-v0.3.schema.json';
import scalarSchema from '../../spec/core/scalar-type-inspection-v0.3.schema.json';
import linkSchema from '../../spec/core/reference-links-inspection-v0.3.schema.json';
export function runCurrentCoreOwnerCases(){
 const rows:{id:string;passed:boolean}[]=[];
 const check=(id:string,ok:boolean)=>{rows.push({id,passed:ok});if(!ok)throw Error(id);};
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 const source:Document={umf:CURRENT_CORE_VERSION,id:'d',vocabularies:{},modules:[{id:'m',namespace:'m',elements:[
  {id:'r',kind:'record',members:[{module:'m',element:'v'}],extensions:{}},
  {id:'v',name:'value',kind:'field',scalarType:'integer',nullability:'required',cardinality:'one',facets:{integerWidth:{bits:64,signed:true}},extensions:{}}]}]};
 const r={module:'m',element:'r'},v={module:'m',element:'v'};
 const copy=()=>structuredClone(source);
 const m=inspectCoreRecordMembers(source,r),s=inspectCoreScalarType(source,v),l=inspectCoreReferenceLinks(source,v);
 for(const [name,value] of [['members',m],['scalar',s],['links',l]] as const){check(name+'-current-version',value.version==='0.3.0');check(name+'-source-retained',same(value.source,source));check(name+'-unverified',value.provenance==='unverified');}
 check('member-declaration',same(m.meaning,{state:'known',members:[v],uninterpretedPaths:[]}));
 check('scalar-family',same(s.meaning,{state:'known',scalarType:'integer'}));check('links-missing',same(l.meaning,{state:'missing'}));
 for(const state of ['missing','empty','opaque'] as const){const d=copy();const record=d.modules[0]!.elements[0]!;
  if(state==='missing')delete record.members;else if(state==='empty')record.members=[];else(record.members as any[])[0]['future/qualifier']={ordered:['b','a']};
  const value=inspectCoreRecordMembers(d,r);check('members-'+state,value.meaning.state===(state==='missing'?'missing':state==='empty'?'known':'partial'));
  if(state==='opaque')check('member-opaque-retained',same((value.meaning as any).members,record.members));
 }
 const linked=copy();delete linked.modules[0]!.elements[1]!.facets;linked.modules[0]!.elements[1]!.references=[{role:'type',...r},{role:'future-role',...r,...{'opaque/qualifier':{value:'Ω'}}}];
 const links=inspectCoreReferenceLinks(linked,v);check('repeated-links-preserved',links.meaning.state==='present'&&links.meaning.links.length===2);
 if(links.meaning.state==='present')for(const [i,link] of links.meaning.links.entries()){check('link-'+i+'-original',same(link.reference,linked.modules[0]!.elements[1]!.references![i]));check('link-'+i+'-target',same(link.target.identity,r));check('link-'+i+'-authority',link.typeAssertion==='unverified');}
 const future=copy();future.modules[0]!.elements[1]!.scalarType='future-family';delete future.modules[0]!.elements[1]!.facets;check('future-family-preserved',same(inspectCoreScalarType(future,v).meaning,{state:'unknown',value:'future-family'}));
 check('record-scalar-inapplicable',inspectCoreScalarType(source,r).meaning.state==='inapplicable');check('field-members-inapplicable',inspectCoreRecordMembers(source,v).meaning.state==='inapplicable');
 for(const [name,run] of [['members',inspectCoreRecordMembers],['scalar',inspectCoreScalarType],['links',inspectCoreReferenceLinks]] as const){
  check(name+'-current-only',run(copy(),v).version==='0.3.0');
  for(const umf of ['0.6.0','0.7.0','0.8.0','0.9.0','future']){let rejected=false;try{run({...source,umf} as Document,v)}catch{rejected=true}check(name+'-unsupported-'+umf,rejected);}
 }
 const validator=createValidator();validator.addSchema(sourceSchema);
 for(const [name,schema,result] of [['members',memberSchema,m],['scalar',scalarSchema,s],['links',linkSchema,links]] as const){
  const valid=validator.compile(schema);check(name+'-closed-positive',valid(result));check(name+'-crossed-version',!valid({...result,version:'0.1.0'}));check(name+'-invented-provenance',!valid({...result,provenance:'verified'}));check(name+'-extra-authority',!valid({...result,enforcement:'database'}));
 }
 const invalid=copy();invalid.modules[0]!.elements[0]!.members=[{module:'m',element:'missing'}];let refused=false;try{inspectCoreRecordMembers(invalid,r)}catch{refused=true}check('invalid-membership-refused',refused);
 return rows;
}
