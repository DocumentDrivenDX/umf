import {declareCoreCardinality,type CoreCardinalityDeclaration} from '../../src/model/cardinality';
import type {Document,Json} from '../../src/model/types';
import type {CardinalityAvroRequest} from '../../src/core-ideals/cardinality-avro-projection';
export interface AvroCardinalityProjectionCase {id:string;author:CoreCardinalityDeclaration;request:CardinalityAvroRequest;sample:Json;expectedValue:Json;}
export function avroCardinalityProjectionCases():AvroCardinalityProjectionCase[]{
 const rows:AvroCardinalityProjectionCase[]=[],base={recordName:'Example',namespace:'',fieldName:'value',dependencies:[],availability:'avro-null-value' as const,requireExactValues:false};
 const doc=():Document=>({umf:'0.4.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]});
 const add=(author:CoreCardinalityDeclaration,nativeType:unknown,sample:Json,extra:Partial<CardinalityAvroRequest>={},expectedValue=sample)=>{
  for(const mode of ['strict','report'] as const){const id='avro-cardinality-'+rows.length;rows.push({id,author,request:{...base,id,nativeType:JSON.stringify(nativeType),mode,...extra},sample,expectedValue});}
 };
 for(const shape of ['one','array','map','unspecified'] as const)for(const type of ['long',{type:'array',items:'long'},{type:'map',values:'long'}])add(declareCoreCardinality(doc(),{module:'m',element:'f'},{cardinality:shape}),type,{value:typeof type==='string'?7:type.type==='array'?[2,1,2]:{a:2}});
 for(const [type,family,sample,expected] of [
  ['boolean','boolean',true,true],['int','integer',2147483647,2147483647],['long','integer',{$integer:'9223372036854775807'},{$integer:'9223372036854775807'}],
  ['float','float',1.0000000000000002,1],['double','float',1.0000000000000002,1.0000000000000002],['bytes','binary',{$bytes:'00ff'},{$bytes:'00ff'}],['string','string','snow-雪','snow-雪'],
 ] as const)for(const requireExactValues of [false,true]){
  const d=doc();d.modules[0]!.elements[0]!.scalarType=family;
  add(declareCoreCardinality(d,{module:'m',element:'f'},{cardinality:'one'}),type,{value:sample},{requireExactValues},{value:expected});
 }
 for(const availability of ['avro-null-value','unresolved'] as const){
  const d=doc();d.modules[0]!.elements[0]!.nullability='required';
  d.modules[0]!.elements.push({id:'map',kind:'field',cardinality:'map',nullability:'absent-allowed',itemType:{module:'m',element:'array'},extensions:{}},{id:'array',kind:'field',cardinality:'array',itemType:{module:'m',element:'integer'},extensions:{}},{id:'integer',kind:'field',cardinality:'one',scalarType:'integer',nullability:'required',extensions:{}});
  add(declareCoreCardinality(d,{module:'m',element:'f'},{cardinality:'array',itemType:{module:'m',element:'map'}}),{type:'array',items:['null',{type:'map',values:{type:'array',items:'long'}}]},{value:[null,{x:[2,1,2]}]},{availability});
 }
 for(const nullability of ['required','absent-allowed']){
  const d=doc();d.modules[0]!.elements[0]!.nullability=nullability;d.modules[0]!.elements.push({id:'value',kind:'field',cardinality:'one',scalarType:'string',extensions:{}});
  add(declareCoreCardinality(d,{module:'m',element:'f'},{cardinality:'map',itemType:{module:'m',element:'value'}}),['null',{type:'map',values:'string'}],{value:{['__proto__']:'own',constructor:'kept'}});
 }
 {
  const d=doc();d.modules[0]!.elements[0]!.scalarType='string';
  add(declareCoreCardinality(d,{module:'m',element:'f'},{cardinality:'one'}),'dep.Choice',{value:'A'},{dependencies:[{id:'choice',schema:' {"type":"enum","name":"dep.Choice","symbols":["A","B"]} '} ]});
 }
 {
  const d=doc();d.extensions={future:{meaning:'uninterpreted'}};d.vocabularies.future={version:'1.0.0'};d.modules[0]!.elements[0]!.extensions.future={opaque:'retain'};
  add(declareCoreCardinality(d,{module:'m',element:'f'},{cardinality:'one'}),{type:'long',future:'retained'},{value:7});
 }
 {
  const d=doc();add(declareCoreCardinality(d,{module:'m',element:'f'},{cardinality:'array',itemType:{module:'m',element:'f'}}),{type:'array',items:'long'},{value:[2,1,2]});
 }
 // Native shapes that cannot be recovered by assuming every valid field is singular.
 add(declareCoreCardinality(doc(),{module:'m',element:'f'},{cardinality:'one'}),'null',{value:null});
 const mixed=[{type:'array',items:'long'},{type:'map',values:'long'}];
 add(declareCoreCardinality(doc(),{module:'m',element:'f'},{cardinality:'array'}),mixed,{value:[2,1,2]});
 add(declareCoreCardinality(doc(),{module:'m',element:'f'},{cardinality:'map'}),mixed,{value:{a:2}});
 {
  const d=doc();d.modules[0]!.elements[0]!.scalarType='binary';
  add(declareCoreCardinality(d,{module:'m',element:'f'},{cardinality:'one'}),{type:'fixed',name:'Bytes2',size:2},{value:{$bytes:'00ff'}});
 }
 add(declareCoreCardinality(doc(),{module:'m',element:'f'},{cardinality:'one'}),{type:'record',name:'Node',fields:[{name:'id',type:'long'},{name:'children',type:{type:'array',items:'Node'}}]},{value:{id:1,children:[{id:2,children:[]}]}});
 {
  const d=doc();d.modules[0]!.elements.push({id:'item',kind:'field',cardinality:'one',scalarType:'integer',nullability:'absent-allowed',extensions:{}});
  add(declareCoreCardinality(d,{module:'m',element:'f'},{cardinality:'array',itemType:{module:'m',element:'item'}}),{type:'array',items:'null'},{value:[null,null]});
 }
 return rows;
}
