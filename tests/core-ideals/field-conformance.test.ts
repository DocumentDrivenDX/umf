import {test,expect} from 'bun:test';
import {verifyFieldEvidence,verifyFieldRoundTrips,fieldSystems} from '../../scripts/core-ideals/field-conformance';
import {declareCoreElementKind,inspectCoreElementKind,upgradeFieldEnvelope,rollbackFieldEnvelope} from '../../src';
import {projectRecordToTableSpec} from '../../src/core-ideals/record-tablespec-projection';
import type {Document} from '../../src';

test('all five binding contracts enforce policy and recover ideal/native representations',async()=>{
 const coverage=await verifyFieldRoundTrips();expect(Object.keys(coverage)).toEqual([...fieldSystems]);
 for(const system of fieldSystems){expect(coverage[system]!.idealRecoveries).toBe(6);expect(coverage[system]!.nativeRecoveries).toBe(2);}
},30000);

test('current native/browser evidence fingerprints pass; changed inputs and missing evidence fail',async()=>{
 const evidence=await verifyFieldEvidence();expect(evidence.systems).toEqual([...fieldSystems]);expect(evidence.records).toHaveLength(4);
 const reader=async(path:string)=>new Uint8Array(await Bun.file(path).arrayBuffer());
 await expect(verifyFieldEvidence(async path=>path==='src/model/types.ts'?new TextEncoder().encode('changed'):reader(path))).rejects.toThrow('stale');
 await expect(verifyFieldEvidence(async path=>{if(path.endsWith('remaining-field-bindings-acceptance-evidence.json'))throw Error('Missing native evidence');return reader(path);})).rejects.toThrow('Missing native evidence');
 await expect(verifyFieldEvidence(async path=>{
  const bytes=await reader(path);if(!path.endsWith('field-core-acceptance-evidence.json'))return bytes;
  const record=JSON.parse(new TextDecoder().decode(bytes));delete record.sha256['fixtures/validation/core-field-browser.json'];
  return new TextEncoder().encode(JSON.stringify(record));
 })).rejects.toThrow('missing required proof');
},30000);

test('group names and opaque scalar-like metadata do not assert records; legacy collisions remain recoverable',()=>{
 const source:Document={umf:'0.2.0',id:'group',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[{id:'order',name:'Order',extensions:{future:{scalarType:'string'}},references:[{role:'member',module:'m',element:'child'}]},{id:'child',extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'order'},'group');expect(inspectCoreElementKind(author.target,author.identity).meaning).toEqual({state:'known',kind:'group'});
 for(const mode of ['strict','report'] as const){const result=projectRecordToTableSpec(author,{id:'native',tableName:'Order',mode,fields:[]});expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();}
 const legacy:Document={...source,umf:'0.1.0'};legacy.modules[0]!.elements[0]!.kind={opaque:['record',null]};
 const transition=upgradeFieldEnvelope(legacy);expect(transition.target.modules[0]!.elements[0]!.kind).toBeUndefined();
 expect(rollbackFieldEnvelope(transition,transition.target).target).toEqual(legacy);
});
