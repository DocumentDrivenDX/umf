// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {verifyFieldEvidence,verifyFieldRoundTrips,requireCurrentCoreFieldQualification,fieldConformanceStatus,fieldSystems} from '../../scripts/core-ideals/field-conformance';
import {declareCoreElementKind, inspectCoreElementKind} from '../../src';
import {projectRecordToTableSpec} from '../../src/core-ideals/record-tablespec-projection';
import type {Document} from '../../src';

test('all five binding contracts enforce policy and recover ideal/native representations',async()=>{
 const coverage=await verifyFieldRoundTrips();expect(Object.keys(coverage)).toEqual([...fieldSystems]);
 for(const system of fieldSystems){expect(coverage[system]!.idealRecoveries).toBe(6);expect(coverage[system]!.nativeRecoveries).toBe(2);}
},30000);

test('historical native/browser evidence reports partial replay; current qualification remains unavailable',async()=>{
 const evidence=await verifyFieldEvidence(undefined,{allowUnqualifiedHistorical:true});expect(evidence.systems).toEqual([...fieldSystems]);expect(evidence.records).toHaveLength(4);
 expect(evidence.historicalQualification).toBe('PARTIALLY_REVALIDATED');expect(evidence.currentCoreQualification).toBe('UNQUALIFIED');expect(evidence.unqualified.length).toBeGreaterThan(0);
 expect(fieldConformanceStatus(evidence)).toMatchObject({idealAdmitted:false,sourceOperationsVerified:true,currentNativeQualification:'UNQUALIFIED',historicalQualification:'PARTIALLY_REVALIDATED',priorityDelivery:false,qualifiedBindings:0,nativeEquivalence:false});
 expect(evidence.artifactRecovery.archiveSha256).toBe('a60ab9c3c190fc18a11ffd6968f6b6defc15c934e417979dee506f3cf425c943');
 expect(()=>requireCurrentCoreFieldQualification(evidence)).toThrow('not qualified for the current core');
 await expect(verifyFieldEvidence()).rejects.toThrow('stale dist/');
 const reader=async(path:string)=>new Uint8Array(await Bun.file(path).arrayBuffer());
 await expect(verifyFieldEvidence(async path=>{
  const bytes=await reader(path);if(!path.endsWith('field-core-acceptance-evidence.json'))return bytes;
  const record=JSON.parse(new TextDecoder().decode(bytes));delete record.sha256['spec/core/field-document.schema.json'];
  return new TextEncoder().encode(JSON.stringify(record));
 },{allowUnqualifiedHistorical:true})).rejects.toThrow('missing required proof');
 await expect(verifyFieldEvidence(async path=>{if(path.endsWith('remaining-field-bindings-acceptance-evidence.json'))throw Error('Missing native evidence');return reader(path);},{allowUnqualifiedHistorical:true})).rejects.toThrow('Missing native evidence');
 await expect(verifyFieldEvidence(async path=>{
  const bytes=await reader(path);if(!path.endsWith('field-core-acceptance-evidence.json'))return bytes;
  const record=JSON.parse(new TextDecoder().decode(bytes));delete record.sha256['fixtures/validation/core-field-browser.json'];
  return new TextEncoder().encode(JSON.stringify(record));
 },{allowUnqualifiedHistorical:true})).rejects.toThrow('missing required proof');
 await expect(verifyFieldEvidence(async path=>{
  const bytes=await reader(path);if(!path.endsWith('field-core-acceptance-evidence.json'))return bytes;
  const record=JSON.parse(new TextDecoder().decode(bytes));delete record.sha256['spec/core/kind-operation-v2.schema.json'];
  return new TextEncoder().encode(JSON.stringify(record));
 },{allowUnqualifiedHistorical:true})).rejects.toThrow('missing required proof');
},30000);

test('group names and opaque scalar-like metadata do not assert records; historical core markers refuse authoring',()=>{
 const source:Document={umf:'0.10.0',id:'group',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[{id:'order',name:'Order',extensions:{future:{scalarType:'string'}},references:[{role:'member',module:'m',element:'child'}]},{id:'child',extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'order'},'group');expect(inspectCoreElementKind(author.target,author.identity).meaning).toEqual({state:'known',kind:'group'});
 for(const mode of ['strict','report'] as const){const result=projectRecordToTableSpec(author,{id:'native',tableName:'Order',mode,fields:[]});expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();}
 const historical={...source,umf:'0.1.0'} as unknown as Document;(historical.modules[0]!.elements[0] as any).kind={opaque:['record',null]};
 expect(()=>declareCoreElementKind(historical,{module:'m',element:'order'},'group')).toThrow();
});
