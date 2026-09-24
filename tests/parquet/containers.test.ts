import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,inspectParquetContainers,coreSchema,parquetContainerInspectionSchema,type ParquetContainerInspection} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetContainerInspectionSchema);
test('US-019-AC9: container interpretations preserve source and match qualified native evidence',async()=>{
 const base='fixtures/parquet/containers/',m=await Bun.file(base+'manifest.json').json(),existing=await Bun.file('fixtures/parquet/capture-results.json').json();expect(m.cases).toHaveLength(18);
 for(const c of [...m.cases,...existing.results.map((c:any)=>({...c,expected:'checked'}))]){
  const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=inspectParquetContainers(captureParquet(bytes,{id:c.id}));expect(r.status).toBe(c.expected);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(r.complete).toBe(false);
  if(c.native&&c.id!=='map-repeated-value')expect(r.status==='checked').toBe(c.native.status==='accepted');
  if(c.native&&r.status==='checked'){
   const schema=(r.metadata as any).schema;
   function view(index:number):any {const container=r.containers!.find(v=>v.index===index);if(container?.kind==='list')return {kind:'list',elementNullable:container.elementNullable,element:view(container.elementIndex)};if(container?.kind==='map')return container.valueIndex===undefined?{kind:'list',elementNullable:false,element:view(container.keyIndex)}:{kind:'map',valueNullable:container.valueNullable,key:view(container.keyIndex),value:view(container.valueIndex)};
    const find=(n:any):any=>n.index===index?n:n.children.map(find).find(Boolean),node=find(r.tree);return schema[index].type!==undefined?{kind:'int32'}:{kind:'struct',fields:node.children.map((n:any)=>({name:n.name,nullable:schema[n.index].repetition_type==='1',type:view(n.index)}))};}
   expect(view(1)).toEqual(c.native.type);expect(r.containers![0]!.nullable).toBe(c.native.nullable);
  }
 }
});
test('US-019-AC9: preserve key-only map intent and diagnose repeated map values',async()=>{
 const inspect=async(id:string):Promise<ParquetContainerInspection>=>inspectParquetContainers(captureParquet(new Uint8Array(await Bun.file('fixtures/parquet/containers/'+id+'.parquet').arrayBuffer()),{id}));
 const key=await inspect('map-key-only');expect(key.containers![0]).toMatchObject({kind:'map',valueNullable:true,duplicateKeys:'last-value'});expect(key.containers![0]).not.toHaveProperty('valueIndex');
 const bad=await inspect('map-repeated-value');expect(bad.status).toBe('blocked');expect(bad.diagnostics.some(d=>d.code==='PARQUET_CONTAINER_STRUCTURE')).toBe(true);expect(bad.metadata).toBeDefined();expect(bad.tree).toBeDefined();
 const nested=await inspect('list-nested-repeated');expect(nested.containers!.map(c=>c.kind)).toEqual(['list','list']);
});
