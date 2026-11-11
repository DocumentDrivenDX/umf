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

test('workspace SEC selection follows the host-selected Rust root',async()=>{
  const [workspaceRoot,packageMetadata,nodeRoot,browserRoot]=await Promise.all([
    source('../../src/index.ts'),readFile(new URL('../../package.json',import.meta.url),'utf8').then(JSON.parse),
    source('../../src/index-node-v4.ts'),source('../../src/index-browser-v4.ts'),
  ]);
  expect(workspaceRoot).toContain("export * from '#umf-source';");
  expect(packageMetadata.imports['#umf-source']).toMatchObject({
    node:'./src/index-node-v4.ts',browser:'./src/index-browser-v4.ts',
  });
  for(const root of [nodeRoot,browserRoot])for(const operation of operations)expect(root).toContain(operation);
});
