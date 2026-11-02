// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {validateBit128Dataset} from '../../src/index-node-v4';
import {uuidModel,PARENT,CHILD} from '../helpers/uuid-model-fixtures';
import type {Document} from '../../src/model/types';

const nil='00000000-0000-0000-0000-000000000000';
const max='ffffffff-ffff-ffff-ffff-ffffffffffff';
const ref=(element:string)=>({module:'m',element});
const uuid=(element:string,value:string|null)=>({field:ref(element),value:value===null?null:{uuid:value}});

function junctionModel():{logical:Document;binding:Document}{
 const model=uuidModel('words64','sqlserver'),pack=model.binding.extensions!['umf.binding'] as any;
 const link=ref('link'),linkId=ref('linkId'),left=ref('left'),right=ref('right');
 model.logical.modules[0]!.elements.push(
  {id:'link',kind:'record',members:[linkId,left,right],keys:[{id:'pk',name:'link key',primary:true,fields:[linkId]}],extensions:{}},
  ...['linkId','left','right'].map(id=>({id,kind:'field',scalarType:'uuid',cardinality:'one',nullability:'required',extensions:{}})) as any[],
 );
 pack.elements.push({...link,table:'links'});
 for(const element of ['linkId','left','right'])pack.fields.push({module:'m',element,storage:'scalar-carrier',carrier:{kind:'words64',highColumn:`${element}_hi`,lowColumn:`${element}_lo`,signed:true}});
 const relationship={id:'association',name:'association',source:[PARENT],target:[{...CHILD,key:'pk'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true,associationRecord:link};
 model.logical.modules[0]!.relationships!.push(relationship as any);
 pack.relationships.push({module:'m',id:'association',storage:'junction',record:link,source:[{record:PARENT,key:'pk',fields:[left]}],target:[{record:CHILD,key:'pk',fields:[right]}]});
 return model;
}

describe('V4 Rust Bit128 dataset validation',()=>{
 it('validates a minimal UUID parent/child/junction population and rejects an orphan endpoint',()=>{
  const {logical,binding}=junctionModel();
  const data=[
   {record:PARENT,rows:[[uuid('parentId',nil)]]},
   {record:CHILD,rows:[[uuid('childId',max),uuid('parentRef',null)]]},
   {record:ref('link'),rows:[[uuid('linkId',nil),uuid('left',nil),uuid('right',max)]]},
  ];
  expect(validateBit128Dataset(binding,logical,data as any)).toEqual(data);
  const orphan=structuredClone(data) as any;
  orphan[2].rows[0][1].value.uuid=max;
  expect(()=>validateBit128Dataset(binding,logical,orphan)).toThrow('Orphan endpoint');
 },240_000);

 it('retains ordinary opaque timestamp and float values without applying undefined refinements',()=>{
  const {logical,binding}=uuidModel('words64','sqlserver'),pack=binding.extensions!['umf.binding'] as any;
  pack.target.subset='uuid-model2';
  logical.modules[0]!.elements.push(...['observed','ratio'].map((id)=>({id,kind:'field',scalarType:id==='observed'?'timestamp':'float',cardinality:'one',nullability:'required',extensions:{}})) as any[]);
  (logical.modules[0]!.elements[0] as any).members.push(ref('observed'),ref('ratio'));
  pack.fields.push(...['observed','ratio'].map((element)=>({module:'m',element,storage:'column',column:element})));
  const data=[
   {record:PARENT,rows:[[
    uuid('parentId',nil),
    {field:ref('observed'),value:{timestamp:'2026-10-16T12:00:00Z'}},
    {field:ref('ratio'),value:{floatToken:'1.5'}},
   ]]},
   {record:CHILD,rows:[[uuid('childId',max),uuid('parentRef',null)]]},
  ];
  expect(validateBit128Dataset(binding,logical,data as any)).toEqual(data);
 },240_000);
});
