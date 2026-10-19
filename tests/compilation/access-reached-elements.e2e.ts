// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {profile,request} from './access-fixtures';

// Explicit structural capacity E2E; excluded from default *.test.ts discovery.
// Public core inspectors remain active. No native/database execution is claimed.
// @covers US-080-AC3 @covers US-080-AC4
// A relevance path is not an element: dependency id/kind/Key paths share one root.
test('valid owned-Key dependencies count unique reached elements rather than census paths',async()=>{
 const {readDocument,validateDocument}=await import('../../src/index');
 const {admitAccessRequest}=await import('../../src/compilation/admission/index');
 const req=request();const doc=JSON.parse(req.sources[0]!.text);
 const module=doc.modules[0];
 const dependencyCount=2000;
 const relationships=[];
 for(let i=0;i<dependencyCount;i++){
  const id='Dependency'+i,fieldId='dependencyId'+i,ownedKey={module:'commerce',element:fieldId};
  module.elements.push({id:fieldId,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
  module.elements.push({id,kind:'record',members:[ownedKey],keys:[{id:'pk',name:'Primary',fields:[ownedKey],primary:true}],extensions:{}});
  relationships.push({id:'related'+i,name:'Related '+i,source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:id,key:'pk'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true});
 }
 // Relationship inspection retains the whole source plus this module's own
 // relationships; split declarations acrossfourmodules so each real core
 // inspector result, as well as the source, stays below100000values.
 for(let i=0;i<4;i++)doc.modules.push({id:'links'+i,namespace:'links'+i,elements:[],relationships:relationships.slice(i*500,(i+1)*500),extensions:{}});
 req.sources[0]!.text=JSON.stringify(doc);
 const countValues=(value:unknown):number=>1+(value!==null&&typeof value==='object'?Object.values(value).reduce<number>((count,child)=>count+countValues(child),0):0);
 const values=countValues(doc);console.info('authored element-cap proof',JSON.stringify({values,sourceBytes:new TextEncoder().encode(req.sources[0]!.text).byteLength,uniqueElements:4006,legacyPaths:10006}));expect(values).toBeLessThanOrEqual(100000);
 expect(new TextEncoder().encode(req.sources[0]!.text).byteLength).toBeLessThanOrEqual(4000000);
 expect(validateDocument(readDocument(req.sources[0]!.text,'json')).valid).toBe(true);
 // Independently declared source closure: one selected Record, its five Fields,
 // and2000Key-only dependency Records with2000independently owned KeyFields.
 const expectedRoots=['/modules/0/elements/5',...Array.from({length:5},(_,i)=>`/modules/0/elements/${i}`),...Array.from({length:dependencyCount},(_,i)=>[`/modules/0/elements/${12+2*i}`,`/modules/0/elements/${13+2*i}`]).flat()].sort();
 expect(expectedRoots.length).toBe(4006);expect(new Set(expectedRoots).size).toBe(4006);
 // The previous relevance inventory adds id/kind/keys/0 + Record for each
 // dependency plus its own Field, exceeding10000paths with only4006elements.
 expect(6+dependencyCount*5).toBe(10006);
 const admitted=admitAccessRequest(req,profile());
 expect(admitted.diagnostics).toEqual([]);
 const actualRoots=[...new Set(admitted.dispositions.filter(d=>d.relevance!=='unselected').flatMap(d=>{
  const match=d.pointer.match(/^\/modules\/\d+\/elements\/\d+(?:\/|$)/);return match?[match[0].replace(/\/$/,'')]:[];
 }))].sort();
 expect(actualRoots).toEqual(expectedRoots);
 expect(admitted.dispositions.length).toBeLessThanOrEqual(100000);
},120000);
