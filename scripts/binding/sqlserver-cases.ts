import {postgresqlLayoutCases} from '../relationship-postgresql-layout-cases';
import type {SqlServerPhysicalPolicy} from '../../src/projections/binding-sqlserver';
import type {Document} from '../../src/model/types';
export function sqlServerPhysicalCases(){
 const source=postgresqlLayoutCases();
 const selected=source.filter(c=>['keyed-association-and-fk','alternate-unique-target','nullable-composite','anonymous-junction','edge'].includes(c.id));
 const rows=selected.map(c=>{
  const logical=c.logical,binding=c.binding,payload=binding.extensions!['umf.binding'] as any,layout=JSON.parse(JSON.stringify(c.policy).replaceAll('postgresql-relationship-layout-1','sqlserver-relationship-layout-1').replaceAll('"C"','"Latin1_General_100_BIN2"'));
  payload.target={system:'sqlserver',version:'2022',subset:'ordinary-tables-json-text-relationships-indexes'};layout.targetVersion='2022';
  for(const f of layout.fieldLayouts){f.sqlType=f.sqlType.replace('numeric(', 'decimal(');if(f.sqlType==='text')f.sqlType='nvarchar(80)';if(f.sqlType==='integer')f.sqlType='int';}
  for(const l of layout.relationshipLayouts)if(l.discriminator)l.discriminator.sqlType='nvarchar(128)';
  // Add supported and unsupported physical capability declarations on the same graph.
  payload.indexes=[
   {name:'IX_Orders_Status',kind:'btree',on:[{field:{module:'sales',element:'Order',field:'status'}}],unique:false,include:[{module:'sales',element:'Order',field:'id'}]},
   {name:'UX_Customers_Name',kind:'unique',on:[{field:{module:'sales',element:'Customer',field:'name'}}],unique:true},
   {name:'IX_Orders_Positive',kind:'partial',on:[{field:{module:'sales',element:'Order',field:'id'}}],unique:false,predicate:{language:'tsql',version:'2022',expression:'[id] > 0'}},
   {name:'Unsupported_Gin',kind:'gin',on:[{field:{module:'sales',element:'Order',field:'status'}}],unique:false},
   {name:'Unsupported_Gist',kind:'gist',on:[{field:{module:'sales',element:'Order',field:'status'}}],unique:false},
   {name:'Unsupported_Path',kind:'expression',on:[{documentPath:{field:{module:'sales',element:'Order',field:'details'},path:payload.fields.find((f:any)=>f.element==='Order'&&f.field==='details').path}}],unique:false}
  ];
  return {id:c.id,logical:logical as Document,binding:binding as Document,policy:{layout,partitionFamilies:[]} as SqlServerPhysicalPolicy};
 });
 const inline=structuredClone(rows[0]!);inline.id='inline-residual';(inline.binding.extensions!['umf.binding'] as any).relationships[0].storage='inline';inline.policy.layout.relationshipLayouts.shift();rows.push(inline);
 const shared=structuredClone(rows.find(r=>r.id==='edge')!);shared.id='shared-edge';const rel=structuredClone((shared.logical.modules[0]!.relationships as any[])[1]);rel.id='recommended-products';rel.name='recommended';delete rel.inverse;(shared.logical.modules[0]!.relationships as any[]).push(rel);const layout=structuredClone(shared.policy.layout.relationshipLayouts[1]!);layout.relationship.id=rel.id;layout.targetConstraint='fk_recommended_product';layout.sourceConstraint='fk_recommended_order';layout.discriminator!.value='recommended';shared.policy.layout.relationshipLayouts.push(layout);(shared.binding.extensions!['umf.binding'] as any).relationships.push({module:'sales',id:rel.id,storage:'edge'});rows.push(shared);
 return rows;
}
if(import.meta.main){const rows=sqlServerPhysicalCases();await Bun.write('fixtures/binding/sqlserver/cases.json',JSON.stringify({scope:'Full SQL Server binding cases from shared keyed DDD graph; qualified physical projections',cases:rows},null,2)+'\n');}
