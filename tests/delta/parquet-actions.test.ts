import {test,expect} from 'bun:test';
import {captureParquet,exportParquetCapture,projectDeltaParquetActions,exportDeltaLog,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/delta-log/parquet-actions.schema.json';
const ajv=createValidator(false);ajv.addSchema(coreSchema);const check=ajv.compile(schema),base='fixtures/delta/parquet-actions/';
test('US-018-AC15: native checkpoint corpus projects exact actions or blocks with source intact',async()=>{
 const report=await Bun.file(base+'results.json').json();expect(report.projected).toBe(30);
 for(const c of report.results){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),source=captureParquet(bytes,{id:c.id}),r=projectDeltaParquetActions(source);expect(r.status).toBe(c.status);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(r.source).not.toBe(source);expect(r.complete).toBe(false);
 if(r.log){expect(exportDeltaLog(r.log)).toBe(await Bun.file(base+c.id+'.jsonl').text());expect(r.actions).toHaveLength(c.actions);expect(r.omittedNullFields).toEqual(c.omittedNullFields);expect(r.scalarConversions).toEqual(c.scalarConversions);}else{expect(r.actions).toBeUndefined();expect(r.diagnostics.some(d=>d.severity==='error')).toBe(true);}}
},30000);
test('US-018-AC15: ambiguous maps, typed values, missing required fields and action conflicts cannot silently lower',async()=>{
 const m=await Bun.file(base+'authored/manifest.json').json();
 for(const c of m.cases){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=projectDeltaParquetActions(captureParquet(bytes,{id:c.id}));expect(r.status).toBe(c.status);expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);
 if(c.id==='exact-and-unknown'){const text=exportDeltaLog(r.log!);expect(text).toContain('9223372036854775807');expect(text).toContain('"__proto__":"preserved"');expect(text).toContain('"missing":null');}
 if(c.id==='typed-statistics'){expect(r.scalarConversions).toHaveLength(5);const out=Object.fromEntries(r.scalarConversions!.map(c=>[c.path.split('/').at(-1),c.output]));expect(out).toEqual({date:{kind:'string',value:'1969-12-31'},utc:{kind:'string',value:'1969-12-31T23:59:59.999999999Z'},local:{kind:'string',value:'1969-12-31T23:59:59.999999'},decimal:{kind:'number',value:'123456789012345678901.123456789'},float:{kind:'number',value:'-0'}});}
 if(c.id==='null-pointer')expect(r.omittedNullFields).toEqual([{row:1,path:'/sidecar/tags'}]);
 if(c.id==='unknown-action'){expect(exportDeltaLog(r.log!)).toContain('"a/b~c":null');expect(r.omittedNullFields).toEqual([]);}
 if(r.status==='blocked')expect(r.log).toBeUndefined();}
});
test('US-018-AC17: annotated statistics dates and timestamp fractions have explicit bounds',async()=>{
 const {deltaStatScalar}=await import('../../src/adapters/delta/stat-scalar');
 for(const [days,expected] of [['-719162','0001-01-01'],['2932896','9999-12-31'],['0','1970-01-01']])expect(deltaStatScalar({kind:'date',value:days!,physical:{type:'INT32',value:days!}})).toEqual({kind:'string',value:expected!});
 for(const value of ['-719163','2932897'])expect(()=>deltaStatScalar({kind:'date',value,physical:{type:'INT32',value}})).toThrow();
 for(const unit of ['MILLIS','MICROS','NANOS'] as const){const digits={MILLIS:3,MICROS:6,NANOS:9}[unit];expect(deltaStatScalar({kind:'timestamp',value:'-1',unit,isAdjustedToUTC:true,physical:{type:'INT64',value:'-1'}})).toEqual({kind:'string',value:'1969-12-31T23:59:59.'+'9'.repeat(digits)+'Z'});}
 for(const value of ['NaN','Infinity','-Infinity'])expect(()=>deltaStatScalar({kind:'float',bits:64,value,physical:{type:'DOUBLE',hex:'0000000000000000'}})).toThrow();
});
