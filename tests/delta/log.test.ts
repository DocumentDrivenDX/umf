import {test,expect} from 'bun:test';
import {captureDeltaLog,exportDeltaLog,inspectDeltaLog,readDocument,writeDocument,coreSchema,deltaLogInspectionSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(deltaLogInspectionSchema);
test('US-018-AC9: full log text preserves line endings, exact numbers, future actions and invalid lines',()=>{
 const text=' {"txn":{"version":9223372036854775807,"appId":"😀"}}\r\n\n{"future":{"n":1e400}}\nnot json\n{"add":{},"remove":{}}\n{"metaData":null}';const doc=captureDeltaLog(text,{id:'log'});for(const f of ['json','yaml'] as const)expect(exportDeltaLog(readDocument(writeDocument(doc,f),f))).toBe(text);const report=inspectDeltaLog(doc);expect(check(report)).toBe(true);expect(report.parsedAll).toBe(false);expect(report.complete).toBe(false);expect(report.lines.map(l=>l.status)).toEqual(['parsed','blank','parsed','invalid','invalid','invalid']);let reconstructed='';for(const l of report.lines)reconstructed+=text.slice(l.start,l.end)+l.terminator;expect(reconstructed).toBe(text);expect(report.diagnostics.some(d=>d.code==='DELTA_LOG_UNKNOWN_ACTION')).toBe(true);expect(exportDeltaLog(report.source)).toBe(text);
});
test('US-018-AC9: empty and duplicate-key input stay captured; representation additions block export',()=>{
 expect(exportDeltaLog(captureDeltaLog('',{id:'empty'}))).toBe('');const text='{"txn":{},"txn":{"version":2}}\n',doc=captureDeltaLog(text,{id:'duplicate'});expect(inspectDeltaLog(doc).parsedAll).toBe(false);expect(exportDeltaLog(doc)).toBe(text);(doc.modules[0]!.elements[0]!.extensions['umf.delta.log'] as any).future=true;expect(()=>exportDeltaLog(doc)).toThrow('Unknown representation');expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);
});
test('US-018-AC9: inspection bounds leave uninspected source intact',()=>{
 const text='\n'.repeat(10001),doc=captureDeltaLog(text,{id:'bounded'}),r=inspectDeltaLog(doc);
 expect(r.lines).toHaveLength(10000);expect(r.parsedAll).toBe(false);expect(r.diagnostics.at(-1)?.code).toBe('DELTA_LOG_LINE_LIMIT');expect(exportDeltaLog(r.source)).toBe(text);
 expect(()=>captureDeltaLog('x'.repeat(1000001),{id:'too-large'})).toThrow('UTF-16');
 const manual=captureDeltaLog('',{id:'manual'});(manual.modules[0]!.elements[0]!.extensions['umf.delta.log'] as any).text='😀'.repeat(500001);expect(()=>exportDeltaLog(manual)).toThrow('UTF-16');
});
