import {test,expect} from 'bun:test';
import {inspectParquetFacetType as inspect} from '../../src/adapters/parquet/facet-type';
import type {Json} from '../../src/model/types';
import corpus from '../../fixtures/validation/facets-parquet-discovery.json';

test('interprets all independently emitted native scalar declarations without consuming refinements',()=>{
 for(const row of corpus.fields){
  const result=inspect(row.nativeField as Json);
  expect(result.state).toBe('declared');expect(String(result.meaning?.family)).toBe(row.scalarType);
  expect(result.native).toEqual(row.nativeField);expect(result.enforcement).toBe('unverified');
  expect(result.unclaimedPaths).toContain('/field_id');expect(result.unclaimedPaths).toContain('/repetition_type');
  if(result.meaning?.family==='integer'){
   const match=/^(u?int)(8|16|32|64)-/.exec(row.id)!;
   expect(Number(result.meaning.bits)).toBe(Number(match[2]));expect(result.meaning.signed).toBe(match[1]==='int');
  }
 }
});
test('validates logical/converted integer carriers and refuses disagreements',()=>{
 for(const bits of [8,16,32,64] as const)for(const signed of [true,false]){
  const converted=String((signed?15:11)+[8,16,32,64].indexOf(bits));
  const physical=bits===64?'2':'1';
  const legacy={type:physical,converted_type:converted};
  expect(inspect(legacy).meaning).toEqual({family:'integer',bits,signed});
  const logical={...legacy,logicalType:{INTEGER:{bitWidth:String(bits),isSigned:signed}}};
  expect(inspect(logical).meaning).toEqual(inspect(legacy).meaning);
  expect(inspect({...logical,type:physical==='1'?'2':'1'}).state).toBe('unsupported');
  expect(inspect({...logical,logicalType:{INTEGER:{bitWidth:String(bits),isSigned:!signed}}}).state).toBe('unsupported');
 }
 for(const token of ['08','8.0','8e0','8\n','-8','9007199254740993'])expect(inspect({type:'1',logicalType:{INTEGER:{bitWidth:token,isSigned:true}}}).state).toBe('unsupported');
});
test('decimal capacity, exact token and annotation conflict checks retain native input',()=>{
 const d=(type:string,p:string,s:string,extra:Record<string,Json>={})=>({type,logicalType:{DECIMAL:{precision:p,scale:s}},...extra});
 for(const [type,max] of [['1',9],['2',18]] as const){
  expect(inspect(d(type,String(max),'0')).state).toBe('declared');
  expect(inspect(d(type,String(max+1),'0')).state).toBe('unsupported');
 }
 expect(inspect(d('7','2','1',{type_length:'1'})).meaning).toEqual({family:'decimal',precision:2,scale:1,carrier:'fixed',exactBytes:1});
 for(const input of [d('7','3','0',{type_length:'1'}),d('7','2','0',{type_length:'0'}),d('7','2','0',{type_length:'4097'}),d('6','3','-1'),d('6','3','4'),d('6','3.0','1'),d('6','3','1',{scale:'2'}),d('6','3','1',{converted_type:'0'}),d('4','3','1')]){
  const result=inspect(input);expect(result.state).toBe('unsupported');expect(result.native).toEqual(input);expect(result.meaning).toBeUndefined();
 }
 expect(inspect({type:'6',converted_type:'5',precision:'76'}).meaning).toEqual({family:'decimal',precision:76,scale:0,carrier:'bytes',exactBytes:null});
});
test('fixed is exact length; floats and unknown declarations do not imply facets or enforcement',()=>{
 expect(inspect({type:'7',type_length:'2'}).meaning).toEqual({family:'binary',exactBytes:2});
 expect(inspect({type:'6'}).meaning).toEqual({family:'binary',exactBytes:null});
 expect(inspect({type:'4'}).meaning).toEqual({family:'float',bits:32});
 expect(inspect({type:'5'}).meaning).toEqual({family:'float',bits:64});
 for(const input of [{type:'1',num_children:'0'},{type:'1',$unknown:[]},{type:'1',logicalType:{FUTURE:{}}},{type:'1',logicalType:{INTEGER:{bitWidth:'8',isSigned:true,future:1}}},{type:'6',logicalType:{STRING:{},DECIMAL:{precision:'2',scale:'0'}}},{type:'6',precision:'2'},{type:'1',type_length:'4'},{type:'1',converted_type:'6'}])expect(inspect(input).state).toBe('unsupported');
 const input={type:'1',repetition_type:'2',future:{arbitrary:'retained'}};
 const result=inspect(input);expect(result.unclaimedPaths).toEqual(['/future','/repetition_type']);
 input.future.arbitrary='changed';expect((result.native as any).future.arbitrary).toBe('retained');
 let calls=0;const getter=Object.defineProperty({type:'1'},'future',{enumerable:true,get(){calls++;return 1;}});
 expect(()=>inspect(getter)).toThrow();expect(calls).toBe(0);
});
