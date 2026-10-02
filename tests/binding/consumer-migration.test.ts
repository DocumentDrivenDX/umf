import {expect,test} from 'bun:test';
import {getBinding,inspectBinding,projectBindingIndexes,migrateBindingRelationships,rollbackBindingRelationships,readJsonValue,writeJsonValue,type Document} from '../../src';
import {bindingMigrationCase} from '../../scripts/binding/stable-ids-cases';
const payload=(d:Document)=>d.extensions!['umf.binding'] as any;
function indexedCase(){
 const c=bindingMigrationCase();
 const order=c.logical.modules[0]!.elements.find(e=>e.id==='Order')!;
 order.extensions['umf.ddd']={kind:'entity',fields:{id:{type:{kind:'scalar',name:'integer'},cardinality:'one'},region:{type:{kind:'scalar',name:'string'},cardinality:'one'}}};
 c.logical.vocabularies['umf.ddd']={version:'0.1.0'};
 const p=payload(c.binding);p.elements=[{module:'m',element:'Order',table:'orders'}];
 p.fields=['id','region'].map(name=>({module:'m',element:'Order',field:name,storage:'column',column:name}));
 p.indexes=[{name:'ordered',kind:'btree',on:p.fields.map((f:any)=>({field:{module:f.module,element:f.element,field:f.field}})),unique:false}];
 delete p.future;delete p.relationships[0].future;delete c.binding.vocabularies['umf.binding']!.future;delete (c.binding as any).future;
 return c;
}
test('@covers US-046-AC10 @covers US-047-AC2: consumer selects the binding and support report before exposing index access',()=>{
 const {binding,logical}=indexedCase(),sibling=structuredClone(binding),before=structuredClone(logical);
 sibling.id='parquet-physical';payload(sibling).target={system:'parquet',version:'2.6',subset:'file-schema'};
 const decisions=[binding,sibling].map(selected=>{
  expect(inspectBinding(selected,logical).valid).toBe(true);
  const declared=getBinding(selected,logical),report=projectBindingIndexes(selected,logical,'report');
  expect(report.target).toEqual(declared.target);
  const index=declared.indexes.find(i=>i.name==='ordered')!,support=report.outcomes.find(o=>o.name===index.name)!;
  // This consumer's index-backed access policy is conditional on the selected
  // binding report; it is not a claim that native engines cannot scan or sort.
  const indexBacked=support.outcome==='exact'&&index.kind==='btree';
  return {target:declared.target.system,filterableByDeclaredIndex:indexBacked,sortableByDeclaredIndex:indexBacked,outcome:support.outcome};
 });
 expect(decisions).toEqual([{target:'postgresql',filterableByDeclaredIndex:true,sortableByDeclaredIndex:true,outcome:'exact'},{target:'parquet',filterableByDeclaredIndex:false,sortableByDeclaredIndex:false,outcome:'not-expressible'}]);
 expect(projectBindingIndexes(sibling,logical,'strict').candidate).toBeUndefined();
 expect(logical).toEqual(before);
 for(const e of logical.modules[0]!.elements){expect(Object.hasOwn(e,'filterable')).toBe(false);expect(Object.hasOwn(e,'sortable')).toBe(false);}
 expect(payload(binding).target.system).toBe('postgresql');
});
test('@covers US-047-AC10 @covers US-046-AC9: index tuple order, predicate provenance and unknown content survive binding migration and edited rollback',()=>{
 const {binding,logical}=indexedCase(),p=payload(binding);
 p.indexes.push({name:'conditional',kind:'partial',on:structuredClone(p.indexes[0].on).reverse(),unique:false,predicate:{language:'postgresql',version:'17',expression:"region = 'east'",future:{opaque:'predicate'}},future:{opaque:['9007199254740993']}});
 p.future={opaque:['retained']};const original=structuredClone(binding),r=migrateBindingRelationships(binding,logical);
 for(const format of ['json','yaml'] as const){
  const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;
  expect(payload(saved.document).indexes).toEqual(p.indexes);
  expect(rollbackBindingRelationships(saved.document,logical,saved.receipt)).toEqual({document:original,residuals:[]});
 }
 payload(r.document).indexes[0].on.reverse();payload(r.document).indexes[1].predicate.expression="region = 'west'";
 payload(r.document).indexes[1].future.edited=true;
 const edited=structuredClone(r.document),rolled=rollbackBindingRelationships(r.document,logical,r.receipt);
 expect(rolled.document).toEqual(original);
 expect(rolled.residuals.some(x=>JSON.stringify(x.value)===JSON.stringify(edited))).toBe(true);
 payload(r.document).indexes[1].future.edited=false;
 expect(rolled.residuals.some(x=>JSON.stringify(x.value)===JSON.stringify(edited))).toBe(true);
});
