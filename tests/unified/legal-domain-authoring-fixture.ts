// SPDX-License-Identifier: MIT OR Apache-2.0
/** Synthetic domain authoring layered on a cloned legal fixture, never the base history input. */
import {legalSource} from '../lifecycle/legal-fixture';

const moduleId='legal_lifecycle';
const ref=(element:string)=>({module:moduleId,element});

export function legalDomainAuthoringSource(alice='legal_alice',bob='legal_bob'){
 const source=legalSource(alice,bob),module=source.modules[0]!,payload=module.extensions['umf.tables'];
 const matter=module.elements.find((element:any)=>element.id==='matters')!;
 const table=payload.tables.find((item:any)=>item.id==='matters')!;
 matter.description='Synthetic matter record: "review"\\scope\nsecond line.';
 const fields=[
  {id:'matters__review_state',name:'review_state',description:'Review state: "draft"\\approved\nretained exactly.',scalarType:'string',allowedValues:[{string:'draft'},{string:'ready'}],nativeType:{kind:'text'}},
  {id:'matters__risk_score',name:'risk_score',description:'Optional risk score in [0, 100); NULL means not assessed.',scalarType:'decimal',facets:{precision:8,scale:2,range:{min:{decimalToken:'0.00'},max:{decimalToken:'100.00'},maxInclusive:false}},nativeType:{kind:'numeric',precision:8,scale:2}},
 ];
 for(const field of fields){
  const fieldRef=ref(field.id);
  const {id,name,description,scalarType,...domain}=field;
  module.elements.push({id,name,description,kind:'field',scalarType,cardinality:'one',nullability:'absent-allowed',...('facets' in domain?{facets:domain.facets}:{}),...('allowedValues' in domain?{allowedValues:domain.allowedValues}:{}),extensions:{}});
  matter.members.push(fieldRef);
  table.columns.push({field:fieldRef,name,nativeType:field.nativeType});
  payload.commands.find((command:any)=>command.id==='read_matters')!.body.fields.push(fieldRef);
  for(const row of payload.seedSets.flatMap((set:any)=>set.rows).filter((item:any)=>item.table==='matters'))
   row.values.push({field:fieldRef,value:null});
 }
 return source;
}
