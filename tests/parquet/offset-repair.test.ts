import {test,expect} from 'bun:test';
import {repairParquetDictionaryOffsets,exportParquetCapture,captureParquet,inspectParquetPages,decodeParquetValues,reconcileDeltaParquetCheckpoint,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/parquet/offset-repair.schema.json';
const ajv=createValidator(false);ajv.addSchema(coreSchema);const check=ajv.compile(schema),base='fixtures/parquet/offset-repair/',report=await Bun.file(base+'results.json').json();
test('US-019-AC20: explicit legacy offset repair preserves source and every byte before footer',()=>{
 for(const c of report.results){const expected=c.result,r=repairParquetDictionaryOffsets(expected.source);expect(r).toEqual(expected);expect(check(r)).toBe(true);expect(inspectParquetPages(r.source).status).toBe('blocked');expect(inspectParquetPages(r.output!).status).toBe('checked');expect(decodeParquetValues(r.output!).status).toBe('projected');expect(exportParquetCapture(r.output!).slice(0,r.unchangedPrefixBytes)).toEqual(exportParquetCapture(r.source).slice(0,r.unchangedPrefixBytes));expect(r.source).not.toBe(expected.source);const version=BigInt(c.path.split('/').at(-1).split('.')[0]).toString();expect(reconcileDeltaParquetCheckpoint({version,source:r.output!},[],'v1').status).toBe('reconciled');}
});
test('US-019-AC20: already-correct files and damaged dictionaries do not produce repair candidates',()=>{
 for(const c of report.results){const correct=repairParquetDictionaryOffsets(c.result.output);expect(correct.status).toBe('blocked');expect(correct.output).toBeUndefined();expect(check(correct)).toBe(true);
 const pages=inspectParquetPages(c.result.output).pages!,dict=pages.find(p=>p.offset===c.result.repairs[0].dictionaryOffset)!;const bytes=exportParquetCapture(c.result.source);bytes[dict.bodyOffset]=255;const broken=repairParquetDictionaryOffsets(captureParquet(bytes,{id:'damaged'}));expect(broken.status).toBe('blocked');expect(broken.output).toBeUndefined();expect(exportParquetCapture(broken.source)).toEqual(bytes);expect(check(broken)).toBe(true);}
});
