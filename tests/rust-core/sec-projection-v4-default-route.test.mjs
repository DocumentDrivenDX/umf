import {expect, test} from 'bun:test';
import {readFile} from 'node:fs/promises';

const source=async(path)=>readFile(new URL(path,import.meta.url),'utf8');
const operations=['projectSecSubmissions','projectSecCompanyFacts'];

for(const [host,path] of [['Node','../../src/index-node-v4.ts'],['browser','../../src/index-browser-v4.ts']]){
  test(`V4 ${host} root selects Rust SEC operations as defaults and keeps candidate aliases`,async()=>{
    const text=await source(path);
    expect(text).toMatch(/const \{projectSecSubmissions,projectSecCompanyFacts\}=secProjection;/);
    expect(text).toMatch(/export \{projectSecSubmissions,projectSecCompanyFacts\};/);
    expect(text).toMatch(/export \{projectSecSubmissions as projectSecSubmissionsRustCandidate,projectSecCompanyFacts as projectSecCompanyFactsRustCandidate\};/);
    if(host==='Node'){
      expect(text).toContain('projectSecSubmissionsUtf16Wire');
      expect(text).toContain('projectSecCompanyFactsUtf16Wire');
      expect(text).toContain('Buffer.from(utf16LittleEndianBytes(input))');
    }else{
      expect(text).toMatch(/secWasmModule\.projectSecSubmissionsUtf16Wire\(input,sourceId\)/);
      expect(text).toMatch(/secWasmModule\.projectSecCompanyFactsUtf16Wire\(input,sourceId\)/);
    }
  });
}

test('V4 SEC default selection leaves the TypeScript reference exports intact',async()=>{
  const [v4Default,reference]=await Promise.all([
    source('../../src/index-v4-default.ts'),source('../../src/index.ts'),
  ]);
  for(const operation of operations){
    expect(v4Default).not.toContain(`export { ${operation} } from './domain-packs/public-company';`);
    expect(reference).toContain("export * from './domain-packs/public-company';");
  }
});
