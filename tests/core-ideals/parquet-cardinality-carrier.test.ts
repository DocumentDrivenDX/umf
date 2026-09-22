import {test,expect} from 'bun:test';
import {parquetCardinalityFile,type ParquetCardinalityCarrier} from '../../src/core-ideals/parquet-cardinality-carrier';
import {parquetCardinalityCarrierCases} from '../../scripts/core-ideals/cardinality-parquet-carrier-cases';
import {captureParquet,exportParquetCapture,writeDocument,readDocument,inspectParquetContainers} from '../../src';
import {inspectParquetCardinalityShape} from '../../src/core-ideals/parquet-cardinality-shape';
test('native nested schema carriers preserve exact bytes and match checked logical roles',()=>{
 for(const row of parquetCardinalityCarrierCases()){
  const before=structuredClone(row.carrier),bytes=parquetCardinalityFile('NativeRecord','value',row.carrier);
  const source=captureParquet(bytes,{id:row.id}),shape=inspectParquetCardinalityShape(source,1);
  expect(shape.nodes[0]!.shape).toBe(row.carrier.kind==='scalar'||row.carrier.kind==='record'?'one':row.carrier.kind);
  expect(shape.nodes[0]!.nativeNullable).toBe(row.carrier.nullable);
  expect((shape.nodes[0]!.nativeFragment as any).field_id).toBe('37');
  expect(inspectParquetContainers(source).status).toBe('checked');
  for(const format of ['json','yaml'] as const)expect(exportParquetCapture(readDocument(writeDocument(source,format),format))).toEqual(bytes);
  expect(row.carrier).toEqual(before);
 }
},120000);
test('carrier writer refuses malformed, cyclic, oversized and unknown inputs instead of dropping content',()=>{
 const scalar:ParquetCardinalityCarrier={kind:'scalar',nativeType:'int32',nullable:false};
 const invalid:any[]=[null,[],{}, {...scalar,nullable:undefined},{...scalar,nativeType:'unknown'},
  {...scalar,extra:'future'},{...scalar,fieldId:2147483648},{...scalar,fieldId:1.5},
  {kind:'array',nullable:false}, {kind:'map',nullable:false,keyType:'unknown',value:scalar},
  {kind:'record',nullable:false,fields:[]},
  {kind:'record',nullable:false,fields:[{name:'a',type:scalar},{name:'a',type:scalar}]},
  {kind:'record',nullable:false,fields:[{name:'a',type:scalar,unknown:true}]},
 ];
 const cycle:any={kind:'array',nullable:false};cycle.item=cycle;invalid.push(cycle);
 let deep:ParquetCardinalityCarrier=scalar;for(let i=0;i<26;i++)deep={kind:'array',nullable:false,item:deep};invalid.push(deep);
 invalid.push({kind:'record',nullable:false,fields:Array.from({length:1001},(_,i)=>({name:'f'+i,type:scalar}))});
 for(const carrier of invalid)expect(()=>parquetCardinalityFile('Record','value',carrier)).toThrow();
 for(const name of ['', '\u0000', '\ud800', '\udfff']){
  expect(()=>parquetCardinalityFile(name,'value',scalar)).toThrow();
  expect(()=>parquetCardinalityFile('Record',name,scalar)).toThrow();
 }
 for(const name of ['__proto__','雪','😀','a.b','line\nbreak']){
  const bytes=parquetCardinalityFile('Record',name,scalar);
  expect(inspectParquetCardinalityShape(captureParquet(bytes,{id:'names'}),1).nodes[0]!.path).toEqual([name]);
 }
});
