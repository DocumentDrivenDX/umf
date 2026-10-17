import {describe,expect,test} from 'bun:test';
import {checkAccessPresence} from '../../src/compilation/admission/access/index';

const presences=[{missing:false,null:false},{missing:false,null:true},{missing:true,null:false},{missing:true,null:true}];
// @covers US-080-AC2
// Independent expected allow table. Enumerate every presence pair, rather than
// testing the implementation's own generated fixture expectations.
describe('access_views_validated: CONTRACT-070 complete allow table',()=>{
 const rows=[
  {key:true,availability:'required',admitsNull:false,defaultOn:'none',generated:false,bound:['00'],engine:['00'],create:['00']},
  {key:true,availability:'required',admitsNull:false,defaultOn:'missing',generated:true,bound:['00'],engine:['00'],create:['10']},
  {key:false,availability:'required',admitsNull:false,defaultOn:'none',generated:false,bound:['00'],engine:['00'],create:['00']},
  {key:false,availability:'required',admitsNull:false,defaultOn:'null',generated:false,bound:['00'],engine:['00'],create:['00']},
  {key:false,availability:'required',admitsNull:false,defaultOn:'missing',generated:false,bound:['00'],engine:['00'],create:['00','10']},
  {key:false,availability:'required',admitsNull:false,defaultOn:'missing-or-null',generated:false,bound:['00'],engine:['00'],create:['00','10']},
  {key:false,availability:'required',admitsNull:false,defaultOn:'none',generated:true,bound:['00'],engine:['00'],create:['10']},
  {key:false,availability:'absent-allowed',admitsNull:true,defaultOn:'none',generated:false,bound:['01'],engine:['11'],create:['00','01','10','11']},
  {key:false,availability:'absent-allowed',admitsNull:false,defaultOn:'none',generated:false,bound:['00'],engine:['10'],create:['00','10']},
  {key:false,availability:'absent-allowed',admitsNull:false,defaultOn:'none',generated:true,bound:['00'],engine:['00'],create:['10']},
  {key:false,availability:'absent-allowed',admitsNull:true,defaultOn:'none',generated:true,bound:['01'],engine:['00'],create:['10']},
 ] as const;
 const bits=(p:{missing:boolean;null:boolean})=>`${+p.missing}${+p.null}`;
 for(const [i,r] of rows.entries())for(const bound of [false,true])for(const row of presences)for(const create of presences){
  test(`row ${i}; bound=${bound}; row=${bits(row)}; create=${bits(create)}`,()=>{
   const facts={key:r.key,availability:r.availability,admitsNull:r.admitsNull,defaultOn:r.defaultOn,bound,notNull:bound?[!r.admitsNull]:[],generated:r.generated};
   const expected=(bound?r.bound:r.engine as readonly string[]).includes(bits(row) as never)&&(r.create as readonly string[]).includes(bits(create));
   expect(checkAccessPresence(facts,{row,create,mutable:!r.key,generated:r.generated})).toBe(expected);
  });
 }
 test('optional nullable bound column may declare NOT NULL',()=>expect(checkAccessPresence({key:false,availability:'absent-allowed',admitsNull:true,defaultOn:'none',bound:true,notNull:[true,true],generated:false},{row:presences[0]!,create:presences[3]!,mutable:true,generated:false})).toBe(true));
 test('unspecified and nullable Key refuse',()=>{
  for(const availability of ['unspecified','absent-allowed'])expect(checkAccessPresence({key:true,availability,admitsNull:true,defaultOn:'none',bound:false,notNull:[],generated:false},{row:presences[0]!,create:presences[0]!,mutable:false,generated:false})).toBe(false);
 });
 test('nested values never carry missing or generated values',()=>{
  const facts={key:false,availability:'absent-allowed',admitsNull:true,defaultOn:'none',bound:false,notNull:[],generated:false,nested:true};
  expect(checkAccessPresence(facts,{row:presences[1]!,create:presences[1]!,mutable:false,generated:false})).toBe(true);
  expect(checkAccessPresence(facts,{row:presences[3]!,create:presences[1]!,mutable:false,generated:false})).toBe(false);
  expect(checkAccessPresence(facts,{row:presences[0]!,create:presences[1]!,mutable:false,generated:false})).toBe(false);
  expect(checkAccessPresence(facts,{row:presences[1]!,create:presences[0]!,mutable:false,generated:false})).toBe(false);
 });
});

import manifest from '../../spec/extensions/access/package.json';
import engine from '../../fixtures/access/commerce/engine-only.json';
import relational from '../../fixtures/access/commerce/postgresql18.json';
import binding from '../../fixtures/access/commerce/postgresql18-binding.json';
import {Registry} from '../../src/registry/registry';
import type {ExtensionPackage,Document} from '../../src/model/types';
import {validateDocument} from '../../src/validation/document';
import {inspectBinding} from '../../src/extensions/binding/index';
// @covers US-080-AC2
 test('commerce source and extension schema fixtures admit structurally',()=>{
 const registry=new Registry().register(manifest as unknown as ExtensionPackage);
 for(const document of [engine,relational]){
  expect(validateDocument(document,registry).valid).toBe(true);
  const payload=document.modules[0]!.extensions['umf.access'];
  expect(registry.get('umf.access','0.1.0')!.structure(payload)).toBe(true);
  const malformed=structuredClone(payload);delete (malformed as Partial<typeof payload>).columns;
  expect(registry.get('umf.access','0.1.0')!.structure(malformed)).toBe(false);
 }
 expect(inspectBinding(binding as unknown as Document,relational as unknown as Document)).toEqual({valid:true,complete:true,diagnostics:[]});
 });

// @covers US-080-AC2 -- structural validation does not observe a native target.
test('native collation facts have a structural shape in the published package',()=>{
 const check=new Registry().register(manifest as unknown as ExtensionPackage).get('umf.access','0.1.0')!.structure;
 const payload=structuredClone(relational.modules[0]!.extensions['umf.access']) as any;
 for(const collation of [null,{schema:'pg_catalog',name:'default'}]){
  payload.columns[0].columns[0].collation=collation;expect(check(payload)).toBe(true);
 }
 for(const collation of ['C',{}, {schema:'pg_catalog'}, {schema:'pg_catalog',name:5}]){
  payload.columns[0].columns[0].collation=collation;expect(check(payload)).toBe(false);
 }
});
