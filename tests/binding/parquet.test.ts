import {expect,test} from 'bun:test';
import {captureParquet,copyJson,exportParquetCapture,projectBindingToParquet,readBindingDocument,writeBindingDocument,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/parquet/case.json').json();
const logical=fixture.logical as Document,binding=fixture.binding as Document;
const bytes=new Uint8Array(await Bun.file(fixture.native).arrayBuffer());
const native=captureParquet(bytes,{id:'source-parquet'});

test('@covers US-046-AC4 @covers US-047-AC4: strict Parquet projection blocks every unsupported physical obligation',()=>{
  const report=projectBindingToParquet(logical,binding,'strict',native);
  expect(report.status).toBe('blocked');
  expect('candidate'in report).toBe(false);
  expect(report.residuals.filter(x=>x.path.includes('/indexes/'))).toHaveLength(8);
  expect(exportParquetCapture(report.nativeArchive!)).toEqual(bytes);
});

test('@covers US-046-AC5 @covers US-047-AC5: report retains every target-specific loss and source',()=>{
  const before=copyJson(binding);
  const report=projectBindingToParquet(logical,binding,'report',native);
  expect(report.status).toBe('reported');
  expect(report.residuals).toHaveLength(12);
  expect(report.binding).toEqual(binding);
  expect(report.logical).toEqual(logical);
  expect(binding).toEqual(before as unknown as Document);
  expect(report.residuals.some(x=>x.path.endsWith('/partition'))).toBe(true);
  expect(report.residuals.some(x=>x.path.endsWith('/table'))).toBe(true);
});

test('@covers US-046-AC6 @covers US-046-AC7 @covers US-047-AC6 @covers US-047-AC7: both retained recovery directions',()=>{
  const report=projectBindingToParquet(logical,binding,'report',native);
  for(const format of ['json','yaml'] as const){
    const recovered=readBindingDocument(writeBindingDocument(report.binding,logical,format),logical,format);
    expect(recovered).toEqual(binding);
  }
  expect(exportParquetCapture(report.nativeArchive!)).toEqual(bytes);
});

test('@covers US-046-AC8 @covers US-047-AC8: Parquet version is qualified and index intent is never invented from native file',()=>{
  const report=projectBindingToParquet(logical,binding,'report',native);
  expect(report.target).toEqual({system:'parquet',version:'2.9',subset:'file-schema'});
  expect(JSON.stringify(native)).not.toContain('btree_idx');
  const wrong=copyJson(binding) as unknown as Document;
  (wrong.extensions!['umf.binding'] as any).target.version='1.0';
  expect(()=>projectBindingToParquet(logical,wrong,'report',native)).toThrow('Unsupported Parquet');
});

test('@covers US-046-AC5: unknown physical refinement remains in source and blocks unsafe lowering',()=>{
  const future=copyJson(binding) as unknown as Document;
  (future.extensions!['umf.binding'] as any).fields[0].future={encoding:'unrecognized'};
  expect(()=>projectBindingToParquet(logical,future,'report',native)).toThrow('Unknown binding content');
  expect((future.extensions!['umf.binding'] as any).fields[0].future).toEqual({encoding:'unrecognized'});
});
