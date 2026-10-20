// SPDX-License-Identifier: MIT OR Apache-2.0
import {randomUUID} from 'node:crypto';
import {compileTableDeployment} from '../../src/table-deployment';
import note from '../binding/fixtures/table-lifecycle-note.json';
const source=structuredClone(note) as any,ref=(element:string)=>({module:'demo',element});
const field=(id:string)=>({id,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
const module=source.modules[0],payload=module.extensions['umf.tables'];
module.elements.push(field('parentId'),field('parentOwner'),field('noteParentId'));
module.elements.find((e:any)=>e.id==='Note').members.push(ref('noteParentId'));
module.elements.push({...field('caption'),nullability:'absent-allowed'},{...field('amount'),scalarType:'decimal',facets:{precision:10,scale:2}});
module.elements.find((e:any)=>e.id==='Note').members.push(ref('caption'),ref('amount'));
module.elements.push({id:'Parent',kind:'record',members:[ref('parentId'),ref('parentOwner')],keys:[{id:'primary',name:'primary',primary:true,fields:[ref('parentId')]}],extensions:{}});
module.relationships=[{id:'parent',name:'parent',source:[ref('Note')],target:[{...ref('Parent'),key:'primary'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:1,max:1},targetLifecycle:'independent',directed:true}];
const parent=structuredClone(payload.tables[0]);parent.id='parents';parent.name='parents';parent.record=ref('Parent');parent.columns=[{field:ref('parentId'),name:'id',nativeType:{kind:'text'}},{field:ref('parentOwner'),name:'owner',nativeType:{kind:'text'}}];
for(const command of ['select','insert','update','delete'])parent.policy.person[command]={kind:'owner',field:ref('parentOwner')};
payload.tables.push(parent);
payload.tables[0].columns.push({field:ref('noteParentId'),name:'parent_id',nativeType:{kind:'text'}});
payload.tables[0].columns.push({field:ref('caption'),name:'caption',nativeType:{kind:'text'},default:{kind:'literal',value:{string:"O'Reilly\\n%; SELECT 1;--"}}},{field:ref('amount'),name:'amount',nativeType:{kind:'numeric',precision:10,scale:2},default:{kind:'literal',value:{decimalToken:'12.30'}}});
payload.tables[0].checks.push({id:'nonnegative',name:'amount_nonnegative',expression:{op:'ge',left:{op:'field',field:ref('amount')},right:{op:'literal',value:{decimalToken:'0.00'}}}});
payload.tables[0].indexes.push({id:'owner_lookup',name:'owner_lookup',fields:[ref('owner')],include:[ref('caption')],unique:false});
payload.tables[0].foreignKeys.push({id:'parent_fk',name:'parent_fk',fields:[ref('noteParentId')],target:{record:ref('Parent'),key:'primary'},onUpdate:'restrict',onDelete:'restrict',deferrable:false,relationship:{module:'demo',id:'parent'}});
// Parent visibility composes with the child's independent old/new owner rule.
for(const command of ['select','insert','update','delete'])payload.tables[0].policy.person[command]={kind:'all',rules:[{kind:'owner',field:ref('owner')},{kind:'via',path:[{module:'demo',id:'parent',direction:'forward'}],rule:{kind:'owner',field:ref('parentOwner')}}]};
export const deploymentFixtureSource=source;
if(import.meta.main){
 const suffix=randomUUID().replaceAll('-','').slice(0,12),prefix='p2_'+suffix+'_';
 const configuration={module:'demo',schema:prefix+'schema',ownerRole:prefix+'owner',personRole:prefix+'person',batchRole:prefix+'batch',groupRoles:{readers:prefix+'readers'}};
 const result=compileTableDeployment({text:JSON.stringify(source),configuration});
 if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 await Bun.write(process.argv[2]!,JSON.stringify(result.bundle,null,2)+'\n');
}
