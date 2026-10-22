// SPDX-License-Identifier: MIT OR Apache-2.0
import {tableOperationSource} from './table-operation-fixture';
/** A source-declared association intentionally carries no foreign key. */
export function relatedSource(nested=false){
 const source=tableOperationSource() as any,module=source.modules[0],payload=module.extensions['umf.tables'];
 const ref=(element:string)=>({module:'demo',element});
 for(const id of ['memberNote','memberPerson'])module.elements.push({id,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 module.elements.push({id:'Membership',kind:'record',members:[ref('memberNote'),ref('memberPerson')],keys:[{id:'primary',name:'primary',primary:true,fields:[ref('memberNote'),ref('memberPerson')]}],extensions:{}});
 const person={select:{kind:'owner',field:ref('memberPerson')},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}};
 const batch=Object.fromEntries(['select','insert','update','delete'].map(c=>[c,{kind:'allow'}]));
 const membershipBatch=structuredClone(batch);membershipBatch.update={kind:'deny'};
 payload.tables.push({id:'memberships',record:ref('Membership'),name:'memberships',columns:[{field:ref('memberNote'),name:'note_id',nativeType:{kind:'text'}},{field:ref('memberPerson'),name:'person',nativeType:{kind:'text'}}],indexes:[],checks:[],foreignKeys:[],policy:{mode:'native-rls',person,batch:membershipBatch}});
 const rule={kind:'related',record:ref('Membership'),matches:[{source:ref('id'),target:ref('memberNote')}],rule:{kind:'owner',field:ref('memberPerson')}};
 for(const command of ['select','update','delete'])payload.tables[0].policy.person[command]=structuredClone(rule);
 payload.tables[0].policy.person.insert={kind:'deny'};
 payload.tables[0].policy.batch=structuredClone(batch);
 if(nested){
  for(const id of ['bridgeId','bridgeNote','bridgeGroup'])module.elements.push({id,kind:'field',scalarType:'string',cardinality:'one',nullability:id==='bridgeNote'?'absent-allowed':'required',extensions:{}});
  module.elements.push({id:'Bridge',kind:'record',members:['bridgeId','bridgeNote','bridgeGroup'].map(ref),keys:[{id:'primary',name:'primary',primary:true,fields:[ref('bridgeId')]}],extensions:{}});
  payload.tables.push({id:'bridges',record:ref('Bridge'),name:'bridges',columns:['bridgeId','bridgeNote','bridgeGroup'].map(id=>({field:ref(id),name:id,nativeType:{kind:'text'}})),indexes:[],checks:[],foreignKeys:[],policy:{mode:'native-rls',person:{select:{kind:'allow'},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}},batch:structuredClone(batch)}});
  const related={kind:'related',record:ref('Bridge'),matches:[{source:ref('id'),target:ref('bridgeNote')}],rule:{kind:'related',record:ref('Membership'),matches:[{source:ref('bridgeGroup'),target:ref('memberNote')}],rule:{kind:'owner',field:ref('memberPerson')}}};
  for(const command of ['select','update','delete'])payload.tables[0].policy.person[command]=structuredClone(related);
 }
 const read=structuredClone(payload.commands[0]);read.id='all_notes';read.parameters=[];read.body.where={op:'all'};payload.commands.push(read);
 return source;
}
if(import.meta.main)await Bun.write(process.argv[2]!,JSON.stringify(relatedSource()));
