import {describe,expect,it} from 'bun:test';
import {captureParquet,exportParquetCapture,exportDeltaLog,projectDeltaParquetActions} from '../../src/index-node-v4';

const typedStatistics='fixtures/delta/parquet-actions/authored/typed-statistics.parquet';
const unsupportedFloat='fixtures/delta/parquet-actions/authored/float-needs-policy.parquet';

async function bytes(path:string):Promise<Uint8Array>{return new Uint8Array(await Bun.file(path).arrayBuffer());}

describe('Delta Parquet action projection through the native default root',()=>{
  it('projects decoded action rows, exact scalar conversions, and retains authoritative Parquet bytes',async()=>{
    const parquet=await bytes(typedStatistics);
    const source=captureParquet(parquet,{id:'typed-statistics'});
    const result=projectDeltaParquetActions(source);
    expect(result.status).toBe('projected');
    expect(exportParquetCapture(result.source)).toEqual(parquet);
    expect(result.actions?.map(action=>action.action)).toEqual(['add']);
    expect(exportDeltaLog(result.log!)).toBe(await Bun.file('fixtures/delta/parquet-actions/typed-statistics.jsonl').text());
    expect(result.scalarConversions?.map(conversion=>conversion.output)).toEqual([
      {kind:'string',value:'1969-12-31'},
      {kind:'string',value:'1969-12-31T23:59:59.999999999Z'},
      {kind:'string',value:'1969-12-31T23:59:59.999999'},
      {kind:'number',value:'123456789012345678901.123456789'},
      {kind:'number',value:'-0'},
    ]);
  },60_000);

  it('blocks unsupported typed columns without returning a partial log or action list',async()=>{
    const parquet=await bytes(unsupportedFloat);
    const source=captureParquet(parquet,{id:'float-needs-policy'});
    const result=projectDeltaParquetActions(source);
    expect(result.status).toBe('blocked');
    expect(exportParquetCapture(result.source)).toEqual(parquet);
    expect(result.log).toBeUndefined();
    expect(result.actions).toBeUndefined();
    expect(result.diagnostics.some(item=>item.code==='DELTA_PARQUET_CONVERSION'&&item.severity==='error')).toBe(true);
  },30_000);
});
