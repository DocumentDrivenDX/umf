// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {bindingRegistry,copyJson,getBinding,inspectBinding,migrateBindingRelationships,projectBindingIndexes,readBindingDocument,rollbackBindingRelationships,writeBindingDocument,type Document} from '../../src/index-node-v4';
import {bindingMigrationCase} from '../../scripts/binding/stable-ids-cases';

const logical:Document={umf:'0.10.0',id:'orders-v1',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements:[{id:'Order',extensions:{}},{id:'details',kind:'field',extensions:{}}]}]};
const binding:Document={umf:'0.10.0',id:'orders-postgresql',vocabularies:{'umf.binding':{version:'0.1.0'}},modules:[],extensions:{'umf.binding':{profile:'umf-binding-1',logical:{documentId:'orders-v1',coreVersion:'0.10.0'},target:{system:'postgresql',version:'17.4',subset:'declared-indexes'},elements:[{module:'sales',element:'Order',table:'orders'}],fields:[{module:'sales',element:'details',storage:'column',column:'details'}],relationships:[],indexes:[{name:'details_idx',kind:'btree',on:[{field:{module:'sales',element:'details'}}],unique:false}]}}};

test('Binding default routes validate, read/write, retrieve and project through Rust',()=>{
 const before=copyJson(binding) as unknown as Document;const inspected=inspectBinding(binding,logical);
 expect(inspected).toEqual({valid:true,complete:true,diagnostics:[]});
 expect(bindingRegistry().get('umf.binding','0.1.0')).toBeDefined();
 expect(getBinding(binding,logical).indexes[0]?.name).toBe('details_idx');
 for(const format of ['json','yaml'] as const){const text=writeBindingDocument(binding,logical,format);expect(readBindingDocument(text,logical,format)).toEqual(binding);}
 expect(projectBindingIndexes(binding,logical,'strict').status).toBe('projected');
 expect(binding).toEqual(before);
});

test('Binding default routes refuse a stale paired logical identity before projection',()=>{
 const stale=copyJson(logical) as unknown as Document;stale.id='different';
 expect(inspectBinding(binding,stale).diagnostics.some(d=>d.code==='BINDING_MODEL')).toBe(true);
 expect(()=>getBinding(binding,stale)).toThrow();
 expect(()=>writeBindingDocument(binding,stale,'json')).toThrow();
});

test('Binding migration and rollback preserve the retained relationship receipt',()=>{
 const {binding:source,logical:model}=bindingMigrationCase();
 const migrated=migrateBindingRelationships(source,model);
 expect(migrated.document.extensions!['umf.binding']).toMatchObject({profile:'umf-binding-2'});
 expect(rollbackBindingRelationships(migrated.document,model,migrated.receipt)).toEqual({document:source,residuals:[]});
 const stale=copyJson(migrated.receipt) as unknown as typeof migrated.receipt;stale.mappings[0]!.stable.id='wrong';
 expect(()=>rollbackBindingRelationships(migrated.document,model,stale)).toThrow();
});
