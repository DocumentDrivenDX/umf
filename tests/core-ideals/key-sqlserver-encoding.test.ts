import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import proof from '../../fixtures/validation/key-sqlserver-encoding-native.json';
import {sqlServerKeyEncodingCases} from '../../scripts/core-ideals/key-sqlserver-encoding-cases';
import {importSqlServerCatalog} from '../../src/adapters/sqlserver';
import {classifySqlServerKeys,recoverSqlServerKeySource} from '../../src/core-ideals/key-sqlserver';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {encodeCoreKeyTuple} from '../../src/model/key-tuple';
import type {Document} from '../../src/model/types';
function ideal(family:'string'|'binary'):Document{return {umf:'0.6.0',id:'encoding',vocabularies:{},modules:[{id:'m',namespace:'encoding',elements:[{id:'record',kind:'record',members:[{module:'m',element:'value'}],keys:[{id:'identity',name:'Identity',fields:[{module:'m',element:'value'}]}],extensions:{}},{id:'value',kind:'field',scalarType:family,cardinality:'one',nullability:'required',extensions:{}}]}]};}
const identity={module:'m',element:'record',key:'identity'};
test('native encoding evidence asserts actual values, failures and pinned source fingerprints',async()=>{
 expect(proof.observational).toBe(false);expect(proof.serverVersion).toBe('16.0.4295.3');expect(proof.cases).toHaveLength(73);
 for(const c of sqlServerKeyEncodingCases()){const actual=proof.cases.find(r=>r.id===c.id)!;expect(actual).toBeDefined();expect(actual.statement).toBe(c.statement);expect(actual.actual.error).toBe(c.error);expect(actual.actual.value).toBe(c.value);}
 for(const [path,hash] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash);
 const capture=JSON.parse(proof.sourceText);expect(capture.keyEncodingDiscovery.computed).toHaveLength(8);expect(capture.keyEncodingDiscovery.computed.every((c:any)=>c.is_persisted&&!c.is_nullable&&c.deterministic===1&&c.precise===1&&c.indexable===1)).toBe(true);
});
test('stored byte vectors preserve the distinct core tuple values in the qualified examples',()=>{
 for(const family of ['binary','string'] as const){const seen=new Set<string>(),doc=ideal(family),prefix=family==='binary'?'binary-':'text-';
  for(const c of proof.cases.filter(c=>c.id.startsWith(prefix)&&c.id.endsWith('-stored-bytes'))){const [hex,length]=c.actual.value!.split(':');expect(hex!.length/2).toBe(Number(length));
   const value=family==='binary'?{binaryHex:hex!}:{string:Array.from({length:hex!.length/4},(_,i)=>String.fromCharCode(parseInt(hex!.slice(i*4+2,i*4+4)+hex!.slice(i*4,i*4+2),16))).join('')};
   const encoded=encodeCoreKeyTuple(doc,identity,[value]).bytesHex;expect(seen.has(encoded)).toBe(false);seen.add(encoded);
  }expect(seen.size).toBe(family==='binary'?7:12);
 }
 expect(()=>encodeCoreKeyTuple(ideal('string'),identity,[{string:'\ud800'}])).toThrow();expect(proof.cases.find(c=>c.id==='isolated-surrogate-stored')!.actual.error).toBe(0);
});
test('computed native keys remain observations and all encoding metadata recovers',()=>{
 const source=importSqlServerCatalog(proof.sourceText,{id:'encoding-capture'}),r=classifySqlServerKeys(source,{nativeSource:proof.sourceText,mode:'report',profile:'captured-stored-values'});
 expect(r.observations).toHaveLength(7);const keys=r.observations.filter(o=>o.identity.indexId>0);expect(keys).toHaveLength(4);expect(keys.every(o=>o.enforcement==='unknown'&&o.equality==='unknown'&&o.authorIntent==='unknown')).toBe(true);
 expect(r.target!.modules).toEqual(source.modules);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverSqlServerKeySource(saved,saved.target!)).toBe(proof.sourceText);}
});
