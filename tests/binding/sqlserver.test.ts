import {test,expect} from 'bun:test';
import {sqlServerPhysicalCases} from '../../scripts/binding/sqlserver-cases';
import {projectBindingToSqlServer,recoverBindingSqlServerSources,recoverBindingSqlServerNative,verifyBindingSqlServerProjection} from '../../src/projections/binding-sqlserver';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
// @covers US-046-AC4 @covers US-046-AC6 @covers US-046-AC7 @covers US-047-AC4 @covers US-047-AC5 @covers US-047-AC6 @covers US-047-AC7
for(const c of sqlServerPhysicalCases())test('full SQL Server physical binding '+c.id,()=>{
 const before=JSON.stringify(c),r=projectBindingToSqlServer(c.logical,c.binding,c.policy,'report');expect(JSON.stringify(c)).toBe(before);expect(r.status).toBe('reported');expect(r.candidate).toContain('[quantity] decimal(12,2) NOT NULL');expect(r.candidate).toContain('ISJSON');expect(r.candidate).toContain('CREATE NONCLUSTERED INDEX');expect(r.candidate).not.toContain('Unsupported_');expect(r.residuals.filter(x=>x.path.startsWith('/extensions/umf.binding/indexes/'))).toHaveLength(3);
 expect(projectBindingToSqlServer(c.logical,c.binding,c.policy,'strict').candidate).toBeUndefined();
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverBindingSqlServerSources(saved,saved.candidate!)).toEqual({logical:c.logical,binding:c.binding,policy:c.policy});expect(recoverBindingSqlServerNative(saved,saved.candidate!)).toEqual({sql:r.candidate!});}
 const fake=structuredClone(r);fake.residuals.pop();expect(()=>verifyBindingSqlServerProjection(fake,r.candidate!)).toThrow();expect(()=>verifyBindingSqlServerProjection(r,r.candidate+'-- changed')).toThrow();
},30000);
// @covers US-046-AC3
test('exact mapping, association attributes, case collisions and unsupported Key widths refuse',()=>{
 const base=sqlServerPhysicalCases()[0]!;
 const mutations=[(c:any)=>c.policy.layout.fieldLayouts.splice(c.policy.layout.fieldLayouts.findIndex((f:any)=>f.coreField.element==='field_OrderProduct_quantity'),1),(c:any)=>delete c.policy.layout.relationshipLayouts[1].associationKey,(c:any)=>c.policy.layout.relationshipLayouts[0].targetComponents[0].keyField.element='field_Product_id',(c:any)=>c.policy.layout.relationshipLayouts[0].targetConstraint='pk_orders',(c:any)=>c.policy.layout.fieldLayouts[0].sqlType='bigint\n',(c:any)=>c.policy.layout.fieldLayouts[0].column='ID',(c:any)=>c.binding.extensions['umf.binding'].future=true];
 for(const change of mutations){const c=structuredClone(base);change(c);let refused=false;try{refused=projectBindingToSqlServer(c.logical,c.binding,c.policy,'report').candidate===undefined;}catch{refused=true;}expect(refused).toBe(true);}
 const anonymous=structuredClone(sqlServerPhysicalCases().find(c=>c.id==='anonymous-junction')!);anonymous.policy.layout.relationshipLayouts[1]!.sourceComponents![0]!.carrierColumn='tuple_value';anonymous.policy.layout.relationshipLayouts[1]!.targetComponents[0]!.carrierColumn='TUPLE_VALUE';expect(projectBindingToSqlServer(anonymous.logical,anonymous.binding,anonymous.policy,'report').status).toBe('blocked');
 const shared=structuredClone(sqlServerPhysicalCases().find(c=>c.id==='shared-edge')!);shared.policy.layout.relationshipLayouts[2]!.carrierTable=shared.policy.layout.relationshipLayouts[2]!.carrierTable.toUpperCase();expect(projectBindingToSqlServer(shared.logical,shared.binding,shared.policy,'report').status).toBe('blocked');
 const edge=structuredClone(sqlServerPhysicalCases().find(c=>c.id==='edge')!);edge.policy.layout.relationshipLayouts[1]!.discriminator!.column=edge.policy.layout.relationshipLayouts[1]!.sourceComponents![0]!.carrierColumn.toUpperCase();expect(projectBindingToSqlServer(edge.logical,edge.binding,edge.policy,'report').status).toBe('blocked');
 for(const sqlType of ['nvarchar(max)','nvarchar(451)']){
  const wide=structuredClone(base);
  for(const [owner,name] of [['Customer','id'],['Order','customerId']]){
   const f=wide.policy.layout.fieldLayouts.find(f=>f.coreField.element==='field_'+owner+'_'+name)!;f.sqlType=sqlType;f.collation='Latin1_General_100_BIN2';wide.logical.modules[0]!.elements.find(e=>e.id===f.coreField.element)!.scalarType='string';(wide.logical.modules[0]!.elements.find(e=>e.id===owner)!.extensions['umf.ddd'] as any).fields[name!].type.name='string';
  }
  Object.assign(wide.policy.layout.keyLayouts.find(k=>k.record.element==='Customer')!.components[0]!,{sqlType,collation:'Latin1_General_100_BIN2'});Object.assign(wide.policy.layout.relationshipLayouts[0]!.targetComponents[0]!,{sqlType,collation:'Latin1_General_100_BIN2'});
  expect(()=>projectBindingToSqlServer(wide.logical,wide.binding,wide.policy,'report')).toThrow('900');
 }

},30000);
// @covers US-047-AC9
test('hostile getters and noncanonical filtered predicates never execute or normalize silently',()=>{
 const c=sqlServerPhysicalCases()[0]!;let reads=0;expect(()=>projectBindingToSqlServer(c.logical,c.binding,{...c.policy,get partitionFamilies(){reads++;return [];}},'report')).toThrow();expect(reads).toBe(0);
 for(const ending of ['\n','\r','\u2028','\u2029','\0']){const b=structuredClone(c.binding);(b.extensions!['umf.binding'] as any).indexes[2].predicate.expression+=ending;expect(()=>projectBindingToSqlServer(c.logical,b,c.policy,'report')).toThrow();}
},30000);
// @covers US-046-AC7 @covers US-047-AC7
test('optional original catalog archive recovers exact text and unrelated native content',async()=>{
 const c=sqlServerPhysicalCases()[0]!,nativeSource=await Bun.file('fixtures/binding/sqlserver/catalog.json').text(),r=projectBindingToSqlServer(c.logical,c.binding,c.policy,'report',nativeSource);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverBindingSqlServerNative(saved,saved.candidate!).catalog).toBe(nativeSource);}
},30000);

// @covers US-046-AC5 @covers US-047-AC5
test('every retained residual and mapping resolves against its declared source',()=>{
 const resolve=(root:unknown,path:string):unknown=>{if(path==='/')return root;let value:any=root;for(const token of path.slice(1).split('/')){const key=token.replaceAll('~1','/').replaceAll('~0','~');expect(value!==null&&typeof value==='object'&&Object.hasOwn(value,key)).toBe(true);value=value[key];}return value;};
 for(const c of sqlServerPhysicalCases())for(const mode of ['strict','report'] as const){const r=projectBindingToSqlServer(c.logical,c.binding,c.policy,mode);for(const residual of r.residuals)resolve(residual.source==='logical'?r.logical:residual.source==='binding'?r.binding:residual.source==='policy'?r.policy:r.nativeSource,residual.path);for(const mapping of r.mappings)resolve(r,mapping.sourcePath);}
},30000);
