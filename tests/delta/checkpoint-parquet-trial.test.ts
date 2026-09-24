import {test,expect} from 'bun:test';
import {readCheckpointParquetTrial,normalizeCheckpointTrial} from '../../scripts/experiments/checkpoint-parquet-decoder';
test('US-018-AC14: Parquet decoder trial agrees with typed native values and exact decimal boundaries',async()=>{
 const base='fixtures/delta/checkpoint-upstream/',r=await Bun.file(base+'native-results.json').json();expect(r.files).toBe(35);expect(r.rows).toBe(991);
 for(const c of r.results){const file=await Bun.file(base+c.path).arrayBuffer();expect(new Bun.CryptoHasher('sha256').update(new Uint8Array(file)).digest('hex')).toBe(c.sha256);expect(normalizeCheckpointTrial(await readCheckpointParquetTrial(file))).toEqual(normalizeCheckpointTrial(await Bun.file(base+'typed/'+c.id+'.json').json()));}
 const m=await Bun.file(base+'decimal-boundaries/manifest.json').json();for(const c of m.cases){const file=await Bun.file(base+'decimal-boundaries/'+c.id+'.parquet').arrayBuffer();expect(new Bun.CryptoHasher('sha256').update(new Uint8Array(file)).digest('hex')).toBe(c.sha256);expect(normalizeCheckpointTrial(await readCheckpointParquetTrial(file))).toEqual(normalizeCheckpointTrial(await Bun.file(base+'decimal-boundaries/'+c.id+'.json').json()));}
});
