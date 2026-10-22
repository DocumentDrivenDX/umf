// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import authored from '../../fixtures/access/commerce/census-completeness.expected.json';
import {generateAccessPackage,type AccessResult} from '../../src/compilation/index';
import type {Obligation,Disposition} from '../../src/compilation/ir/index';
import {profile,request} from './access-fixtures';

const fixturePath=new URL('../../fixtures/access/commerce/census-completeness.expected.json',import.meta.url);
const sha=(text:string)=>new Bun.CryptoHasher('sha256').update(text).digest('hex');
const exactSource=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
const esc=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
function at(value:unknown,pointer:string):unknown {
 let found=value;
 for(const token of pointer.slice(1).split('/')){
  const key=token.replace(/~1/g,'/').replace(/~0/g,'~');
  if(found===null||typeof found!=='object'||!Object.hasOwn(found,key))throw new Error('Non-authored census pointer '+pointer);
  found=(found as Record<string,unknown>)[key];
 }
 return found;
}
function leaves(value:unknown,pointer:string):string[]{
 if(value!==null&&typeof value==='object'&&Object.keys(value).length)return Object.entries(value).flatMap(([key,child])=>leaves(child,pointer+'/'+esc(key)));
 return [pointer];
}
const allExpected=Object.values(authored.expectedPointers).flat().sort();
function candidate(mode:'strict'|'report'='strict'){
 const req=request();req.mode=mode;req.bindings=['orders-binding'];req.actions=[{module:'commerce',action:'shipOrder'}];
 req.sources=[{id:'logical',format:'json',text:exactSource(authored.logical)},{id:'orders-binding',format:'json',text:exactSource(authored.binding)}];
 return {req,result:generateAccessPackage(req,profile())};
}
function requireReciprocal(result:Pick<AccessResult,'dispositions'|'obligations'>){
 const dispositions=new Map(result.dispositions.map(d=>[d.id,d])),obligations=new Map(result.obligations.map(o=>[o.id,o]));
 expect(dispositions.size).toBe(result.dispositions.length);expect(obligations.size).toBe(result.obligations.length);
 for(const obligation of result.obligations){
  expect(Object.keys(obligation).sort()).toEqual(['description','dispositionIds','id','owner']);
  expect(['host','database','engine','catalog','qualifier']).toContain(obligation.owner);
  expect(obligation.id.length).toBeGreaterThan(0);expect(obligation.description.trim().length).toBeGreaterThan(0);
  expect(obligation.dispositionIds.length).toBeGreaterThan(0);
  expect(new Set(obligation.dispositionIds).size).toBe(obligation.dispositionIds.length);
  const reverse=result.dispositions.filter(d=>d.obligationIds.includes(obligation.id)).map(d=>d.id).sort();
  expect([...obligation.dispositionIds].sort()).toEqual(reverse);
  for(const id of obligation.dispositionIds){expect(dispositions.has(id)).toBe(true);expect(dispositions.get(id)!.obligationIds).toContain(obligation.id);}
 }
 for(const disposition of result.dispositions){
  expect(Object.keys(disposition).sort()).toEqual(['assertion','checks','fidelity','id','obligationIds','pointer','reason','relevance','sourceId']);
  expect(new Set(disposition.obligationIds).size).toBe(disposition.obligationIds.length);
  for(const id of disposition.obligationIds){expect(obligations.has(id)).toBe(true);expect(obligations.get(id)!.dispositionIds).toContain(disposition.id);}
 }
}

// @covers US-080-AC3
// Independently authored current core + PostgreSQL18 declaration; NOT native execution.
test('authored selected/reached census scope is frozen independently of generator output',async()=>{
 expect(sha(await Bun.file(fixturePath).text())).toBe('fd6ddcbf2b30541458330ca697bd8c9c068e63bb881877bc0f9b474a972daf71');
 expect(authored.counts).toEqual({headers:6,metadata:5,selected:135,dependency:37});
 expect(allExpected.length).toBe(183);expect(new Set(allExpected).size).toBe(183);
 expect(sha(exactSource(authored.logical))).toBe(authored.sourceSha256.logical);
 expect(sha(exactSource(authored.binding))).toBe(authored.sourceSha256.binding);
 for(const group of ['headers','metadata','selected','dependency'] as const){
  const independent=authored.scopeRoots[group].flatMap(pointer=>leaves(at(authored.logical,pointer),pointer)).sort();
  expect(independent).toEqual(authored.expectedPointers[group]);
  expect(independent.length).toBe(authored.counts[group]);
 }
});

// @covers US-080-AC3
// Checks all183 authored pointers, including no-code metadata and complete action declarations.
test('every authored selected and dependency leaf has an exact census disposition',()=>{
 for(const mode of ['strict','report'] as const){
 const {req,result}=candidate(mode);expect(result.outcome).toBe('candidate');expect(result.diagnostics).toEqual([]);
 const actual=new Set(result.dispositions.filter(d=>d.sourceId==='logical'&&d.relevance!=='unselected').map(d=>d.pointer));
 const missing=allExpected.filter(pointer=>!actual.has(pointer));expect(missing).toEqual([]);
 for(const group of ['headers','metadata','selected','dependency'] as const)for(const pointer of authored.expectedPointers[group]){
  const dispositions=result.dispositions.filter(d=>d.sourceId==='logical'&&d.pointer===pointer);
  expect(dispositions.length).toBeGreaterThan(0);
  expect([...new Set(dispositions.map(d=>d.relevance))]).toEqual([group==='dependency'?'dependency':'selected']);
  expect([...new Set(dispositions.map(d=>d.fidelity))]).toEqual(['exact']);
 }
 for(const pointer of authored.metadataInformational){
  const dispositions=result.dispositions.filter(d=>d.sourceId==='logical'&&d.pointer===pointer);
  expect(dispositions.length).toBeGreaterThan(0);
  for(const disposition of dispositions)expect(disposition.checks).toEqual(['informational']);
  expect(result.symbols.filter(symbol=>symbol.sourceId==='logical'&&symbol.pointer===pointer)).toEqual([]);
 }
 const archive=result.files.find(f=>f.path==='shop/_umf/sources.json');expect(archive).toBeDefined();
 const archived=JSON.parse(archive!.text) as typeof req.sources;expect(archived).toEqual(req.sources);
 for(const source of req.sources)expect(archived.find(entry=>entry.id===source.id)!.text).toBe(source.text);
 const unknown=result.dispositions.filter(d=>d.pointer===authored.unselectedUnknown.pointer);
 expect(unknown.length).toBe(1);expect(unknown[0]!.relevance).toBe('unselected');expect(unknown[0]!.fidelity).toBe('unknown');
 expect(at(JSON.parse(archived[0]!.text),authored.unselectedUnknown.pointer)).toBe(authored.unselectedUnknown.value);
 }
});

// @covers US-080-AC3
// Every external duty remains an owned, linked obligation; generation cannot discharge it.
test('all obligations have closed owner fields and valid reciprocal links without discharge claims',()=>{
 const {result}=candidate();expect(result.outcome).toBe('candidate');expect(result.obligations.length).toBeGreaterThan(0);
 requireReciprocal(result);
 const actualOwners=[...new Set(result.obligations.map(o=>o.owner))].sort();expect(actualOwners).toEqual(['engine','qualifier']);
 for(const obligation of result.obligations)expect(Object.hasOwn(obligation,'status')).toBe(false);
});

// @covers US-080-AC3
// Prove this oracle rejects corruption instead of accepting one matching obligation.
test('reciprocal obligation oracle detects every missing owner or broken relation',()=>{
 const {result}=candidate();
 for(const mutate of [
  (o:Obligation[],_d:Disposition[])=>{delete (o[0] as Partial<Obligation>).owner;},
  (o:Obligation[],_d:Disposition[])=>{o[0]!.dispositionIds=[];},
  (o:Obligation[],_d:Disposition[])=>{o[0]!.dispositionIds.push('nonexistent');},
  (o:Obligation[],d:Disposition[])=>{const id=o[0]!.dispositionIds[0]!;d.find(x=>x.id===id)!.obligationIds=[];},
  (o:Obligation[],_d:Disposition[])=>{Object.assign(o[0]!,{status:'discharged',enforced:true});},
 ]){
  const obligations=structuredClone(result.obligations),dispositions=structuredClone(result.dispositions);mutate(obligations,dispositions);
  expect(()=>requireReciprocal({obligations,dispositions})).toThrow();
 }
});
