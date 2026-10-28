import {expect, test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {generateFacade} from '../../scripts/rust-migration/r8/v4-default-facade.mjs';

const source=async(path)=>readFile(new URL(path,import.meta.url),'utf8');

for(const [host,path] of [['Node','../../src/index-node-v4.ts'],['browser','../../src/index-browser-v4.ts']]){
  test(`V4 ${host} default access-temporal export is guarded by the Rust binding`,async()=>{
    const text=await source(path);
    expect(text).toMatch(/export const ACCESS_TEMPORAL_PROFILE=ACCESS_TEMPORAL_PROFILE_RUST/);
    expect(text).toMatch(/export function parseAccessTemporal\(kind:AccessTemporalKind,token:string\):AccessTemporal/);
    expect(text).toMatch(/return accessTemporal\.parseAccessTemporal\(kind,token\)/);
    expect(text).not.toContain("from './adapters/access-temporal'");
    if(host==='Node') expect(text).toContain('createAccessTemporalEngine()');
    else expect(text).toContain('createAccessTemporalEngine(wasmModule)');
  });
}

test('V4 facade selects the local host routes while ./reference remains TypeScript',async()=>{
  const generated=generateFacade();
  expect(generated.localOverrides).toContain('ACCESS_TEMPORAL_PROFILE');
  expect(generated.localOverrides).toContain('parseAccessTemporal');
  expect(generated.text).not.toContain("export { parseAccessTemporal } from './adapters/access-temporal';");
  const reference=await source('../../src/index.ts');
  expect(reference).toContain("export * from './adapters/access-temporal';");
});
