import {expect,test} from 'bun:test';
import {bindingRegistry,copyJson,getBinding,inspectBinding,migrateBindingRelationships,readBindingDocument,rollbackBindingRelationships,writeBindingDocument,type Document} from '../../src';
import {bindingMigrationCase} from '../../scripts/binding/stable-ids-cases';
const payload=(d:Document)=>d.extensions!['umf.binding'] as any;

test('@covers US-046-AC3 AC9 AC10: stable ID survives rename and copied receipts preserve old unknown content',()=>{
 const {binding,logical}=bindingMigrationCase(),before=copyJson(binding) as unknown as Document;
 const r=migrateBindingRelationships(binding,logical);
 expect(bindingRegistry().get('umf.binding','0.2.0')).toBeDefined();
 expect(binding).toEqual(before);expect(r.receipt.original).toEqual(before);
 expect(payload(r.document).relationships[0]).toEqual({module:'m',id:'order-customer',storage:'foreign_key',future:{opaque:['retain']}});
 (logical.modules[0]!.relationships as any[])[0].name='renamed';
 expect(inspectBinding(r.document,logical).valid).toBe(true);
 expect(inspectBinding(binding,logical).valid).toBe(false);
 for(const format of ['json','yaml'] as const)expect(readBindingDocument(writeBindingDocument(r.document,logical,format),logical,format)).toEqual(r.document);
 expect(rollbackBindingRelationships(r.document,logical,r.receipt)).toEqual({document:binding,residuals:[]});
 payload(r.document).future.changed=true;
 expect(payload(r.receipt.migrated).future.changed).toBeUndefined();
 const copy=getBinding(r.document,logical);(copy.relationships[0] as any).id='changed';
 expect(payload(r.document).relationships[0].id).toBe('order-customer');
});

test('@covers US-046-AC3 AC10: duplicate, missing, stale and legacy opaque relationship references refuse',()=>{
 for(const mutate of [
  (b:Document,l:Document)=>payload(b).relationships.push({...payload(b).relationships[0]}),
  (b:Document,l:Document)=>payload(b).relationships[0].name='missing',
  (b:Document,l:Document)=>l.id='different',
  (b:Document,l:Document)=>{l.umf='0.6.0';payload(b).logical.coreVersion='0.6.0';},
  (b:Document,l:Document)=>(l.modules[0]!.relationships as any[]).push({...((l.modules[0]!.relationships as any[])[0]),id:'other',inverse:'different'}),
  (b:Document,l:Document)=>payload(b).relationships[0].id={opaque:'collision'},
 ]){const {binding,logical}=bindingMigrationCase();mutate(binding,logical);const before=copyJson(binding) as unknown as Document;expect(()=>migrateBindingRelationships(binding,logical)).toThrow();expect(binding).toEqual(before);}
 const {binding,logical}=bindingMigrationCase(),{document}=migrateBindingRelationships(binding,logical);
 payload(document).relationships[0].id='missing';expect(inspectBinding(document,logical).valid).toBe(false);
 payload(document).relationships[0].id='order-customer';payload(document).relationships.push({...payload(document).relationships[0]});expect(inspectBinding(document,logical).diagnostics.some(d=>d.code==='BINDING_DUPLICATE')).toBe(true);
});

test('@covers US-046-AC7 AC10: rollback preserves new ID-only choices and all edits as copied residuals',()=>{
 const {binding,logical}=bindingMigrationCase(),r=migrateBindingRelationships(binding,logical);
 const second={...(logical.modules[0]!.relationships as any[])[0],id:'second',name:'second',inverse:'secondInverse'};
 (logical.modules[0]!.relationships as any[]).push(second);
 payload(r.document).relationships.push({module:'m',id:'second',storage:'junction'});
 payload(r.document).future.changed=true;
 const rolled=rollbackBindingRelationships(r.document,logical,r.receipt);
 expect(rolled.document).toEqual(binding);expect(rolled.residuals).toHaveLength(2);
 expect(rolled.residuals[0]!.value).toEqual({module:'m',id:'second',storage:'junction'});
 expect(rolled.residuals[1]!.value).toEqual(copyJson(r.document));
 payload(r.document).future.changed=false;expect((rolled.residuals[1]!.value as any).extensions['umf.binding'].future.changed).toBe(true);
});

test('@covers US-046-AC10: receipts are recomputed and unrelated bindings cannot roll back',()=>{
 const {binding,logical}=bindingMigrationCase(),r=migrateBindingRelationships(binding,logical);
 r.receipt.mappings[0]!.stable.id='tampered';expect(()=>rollbackBindingRelationships(r.document,logical,r.receipt)).toThrow();
 const fresh=migrateBindingRelationships(binding,logical);fresh.document.id='other';expect(()=>rollbackBindingRelationships(fresh.document,logical,fresh.receipt)).toThrow();
});

test('public binding inspection refuses mismatched profiles and accessors without invoking them',()=>{
 const {binding,logical}=bindingMigrationCase();binding.vocabularies['umf.binding']!.version='0.2.0';
 expect(inspectBinding(binding,logical).valid).toBe(false);
 let calls=0;const evil=bindingMigrationCase().binding;
 Object.defineProperty(evil,'extensions',{enumerable:true,get(){calls++;throw Error('executed');}});
 expect(inspectBinding(evil,logical).valid).toBe(false);expect(()=>getBinding(evil,logical)).toThrow();expect(calls).toBe(0);
 const model=bindingMigrationCase().logical;
 Object.defineProperty(model,'id',{enumerable:true,get(){calls++;throw Error('executed');}});
 expect(inspectBinding(bindingMigrationCase().binding,model).valid).toBe(false);expect(calls).toBe(0);
});

test('published migration/receipt/rollback schema validates full retained representation and rejects missing content',async()=>{
 const {createValidator}=await import('../../src/validation/schema');const validator=createValidator(false);
 for(const file of ['schema','field-document.schema','nullability-document.schema','cardinality-document.schema','facet-document.schema','key-document.schema','relationship-document.schema'])validator.addSchema(await Bun.file(`spec/core/${file}.json`).json());
 for(const file of ['binding/schema','binding-stable/schema'])validator.addSchema(await Bun.file(`spec/extensions/${file}.json`).json());
 const check=validator.compile(await Bun.file('spec/extensions/binding-stable/migration.schema.json').json());
 const {binding,logical}=bindingMigrationCase(),r=migrateBindingRelationships(binding,logical);
 for(const value of [r,r.receipt,rollbackBindingRelationships(r.document,logical,r.receipt)])expect(check(value),JSON.stringify(check.errors)).toBe(true);
 const corrupt=structuredClone(r);delete (corrupt.receipt as any).original;expect(check(corrupt)).toBe(false);
 const missing=structuredClone(r);delete (missing.receipt.mappings[0] as any).stable;expect(check(missing)).toBe(false);
});


test('legacy duplicate identity uses names even when unknown id members differ',()=>{
 const {binding,logical}=bindingMigrationCase();const rows=payload(binding).relationships;
 rows[0].id='opaque-one';rows.push({...rows[0],id:'opaque-two'});
 expect(inspectBinding(binding,logical).diagnostics.some(d=>d.code==='BINDING_DUPLICATE')).toBe(true);
 binding.vocabularies['umf.binding']!.version='9.0.0';binding.extensions!['umf.binding']={future:true};
 expect(inspectBinding(binding,logical).valid).toBe(false);
});
