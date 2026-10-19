// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import {expect,test} from 'bun:test';
import {validateCoreFieldValue} from '../../src/model/schema-properties';
import type {Document} from '../../src/model/types';
import {generateAccessPackage} from '../../src/compilation/index';
import {request,profile} from './access-fixtures';
const presence=[{missing:false,null:false},{missing:false,null:true},{missing:true,null:false},{missing:true,null:true}];
const bits=(p:{missing:boolean;null:boolean})=>`${+p.missing}${+p.null}`;
// Independent normative table, driven through real documents/admission/emission.
const rows=[
 {key:true,availability:'required',null:false,default:'none',generated:false,bound:['00'],engine:['00'],create:['00']},
 {key:true,availability:'required',null:false,default:'missing',generated:true,bound:['00'],engine:['00'],create:['10']},
 {key:false,availability:'required',null:false,default:'none',generated:false,bound:['00'],engine:['00'],create:['00']},
 {key:false,availability:'required',null:false,default:'null',generated:false,bound:['00'],engine:['00'],create:['00']},
 {key:false,availability:'required',null:false,default:'missing',generated:false,bound:['00'],engine:['00'],create:['00','10']},
 {key:false,availability:'required',null:false,default:'missing-or-null',generated:false,bound:['00'],engine:['00'],create:['00','10']},
 {key:false,availability:'required',null:false,default:'none',generated:true,bound:['00'],engine:['00'],create:['10']},
 {key:false,availability:'absent-allowed',null:true,default:'none',generated:false,bound:['01'],engine:['11'],create:['00','01','10','11']},
 {key:false,availability:'absent-allowed',null:false,default:'none',generated:false,bound:['00'],engine:['10'],create:['00','10']},
 {key:false,availability:'absent-allowed',null:false,default:'none',generated:true,bound:['00'],engine:['00'],create:['10']},
 {key:false,availability:'absent-allowed',null:true,default:'none',generated:true,bound:['01'],engine:['00'],create:['10']},
];
for(const [index,r] of rows.entries())for(const bound of [false,true])for(const row of presence)for(const create of presence){
 // @covers US-080-AC2
 test(`document allow matrix ${index}; bound=${bound}; row=${bits(row)}; create=${bits(create)}`,()=>{
  const ref=(element:string)=>({module:'m',element});
  const value={id:'value',kind:'field',scalarType:'string',cardinality:'one',nullability:r.availability,extensions:{},...(!r.null&&r.availability==='absent-allowed'?{allowedValues:[{string:'x'}]}:{}),...(r.default!=='none'?{default:{on:r.default,value:{string:'x'}}}:{})};
  const access={views:[{record:ref('Row'),selectedKey:{...ref('Row'),key:'pk'},fields:[{field:ref('id'),row:{missing:false,null:false},create:{missing:false,null:false},mutable:false,generated:false},{field:ref('value'),row,create,mutable:!r.key,generated:r.generated}]}],columns:bound?[{binding:{sourceId:'binding',module:'m'},target:{platform:'postgresql',majorVersion:'18'},columns:[{field:ref('id'),type:'text',notNull:true,generation:null},{field:ref('value'),type:'text',notNull:!r.null,generation:r.generated?'default':null}]}]:[],search:[],searchBindings:[]};
  const document={umf:CURRENT_CORE_VERSION,id:'matrix',vocabularies:{'umf.access':{version:'0.1.0'}},modules:[{id:'m',namespace:'matrix',elements:[{id:'id',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},value,{id:'Row',kind:'record',members:[ref('id'),ref('value')],keys:[{id:'pk',name:'Primary',primary:true,fields:[ref(r.key?'value':'id')]}],extensions:{}}],extensions:{'umf.access':access}}]};
  const q=request();q.package='matrix';q.records=[ref('Row')];q.sources=[{id:'logical',format:'json',text:JSON.stringify(document)}];
  if(bound){q.bindings=['binding'];q.sources.push({id:'binding',format:'json',text:JSON.stringify({umf:CURRENT_CORE_VERSION,id:'matrix-binding',vocabularies:{'umf.binding':{version:'0.2.0'}},modules:[],extensions:{'umf.binding':{profile:'umf-binding-2',logical:{documentId:'matrix',coreVersion:CURRENT_CORE_VERSION},target:{system:'postgresql',version:'18',subset:'contract070 declaration fixture; no native execution'},elements:[{...ref('Row'),table:'rows'}],fields:[{...ref('id'),storage:'column',column:'id'},{...ref('value'),storage:'column',column:'value'}],relationships:[],indexes:[]}}})});}
  const before=JSON.stringify(q),result=generateAccessPackage(q,profile());
  // Core 0.8 handles explicit null before its non-null allowed-value set.
  // Row 8 is a policy-only hypothetical: the attempted authored witness below
  // still has Null=yes. Assert that upstream fact; never invent a no-null rule.
  if(index===8)expect(validateCoreFieldValue(document as unknown as Document,ref('value'),null).valid).toBe(true);
  const expected=index===8?(bound?bits(row)==='00':bits(row)==='11'):(bound?r.bound:r.engine).includes(bits(row))&&r.create.includes(bits(create));
  expect(result.outcome).toBe(expected?'candidate':'refused');expect(JSON.stringify(q)).toBe(before);
  if(!expected){expect(result.files).toEqual([]);expect(result.symbols).toEqual([]);expect(result.diagnostics.some(d=>d.code==='ACCESS'&&d.accessCode==='ACCESS_CONFLICT')).toBe(true);}
 });
}
