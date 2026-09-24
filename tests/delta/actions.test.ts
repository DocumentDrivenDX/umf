import {test,expect} from 'bun:test';
import {captureDeltaLog,exportDeltaLog,inspectDeltaActions,coreSchema} from '../../src';
import schema from '../../spec/extensions/delta-log/action-inspection.schema.json';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
test('US-018-AC10: known action shapes and exact integer boundaries retain source',()=>{
 for(const [token,valid] of [['9223372036854775807',true],['-9223372036854775808',true],['9223372036854775808',false],['-9223372036854775809',false],['9007199254740992.1',false],['1e400',false]] as const){const text='{"txn":{"appId":"x","version":'+token+'}}',doc=captureDeltaLog(text,{id:'integer'}),r=inspectDeltaActions(doc);expect(r.knownShapesValid).toBe(valid);expect(exportDeltaLog(r.source)).toBe(text);expect(check(r)).toBe(true);}
 for(const text of ['{"add":{}}','{"cdc":{"path":"p","partitionValues":{},"size":1,"dataChange":true}}','{"domainMetadata":{"domain":"d","configuration":{},"removed":false}}','{"protocol":{"minReaderVersion":2147483648,"minWriterVersion":2}}'])expect(inspectDeltaActions(captureDeltaLog(text,{id:'bad'})).knownShapesValid).toBe(false);
});
test('US-018-AC10: arbitrary commit provenance and opaque future content remain incomplete',()=>{
 for(const value of ['null','1e400','[]','"provenance"','{"arbitrary":true}']){const r=inspectDeltaActions(captureDeltaLog('{"commitInfo":'+value+'}',{id:'provenance'}));expect(r.knownShapesValid).toBe(true);expect(r.complete).toBe(false);}
 const r=inspectDeltaActions(captureDeltaLog('{"txn":{"appId":"x","version":1,"future":9}}\n{"__proto__":{"x":1}}',{id:'future'}));expect(r.knownShapesValid).toBe(true);expect(r.diagnostics.some(d=>d.code==='DELTA_ACTION_UNKNOWN_FIELD')).toBe(true);expect(r.diagnostics.some(d=>d.code==='DELTA_LOG_UNKNOWN_ACTION')).toBe(true);
});
