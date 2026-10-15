import {test,expect} from 'bun:test';
import {runCatalogScanCorpus} from './catalog-scan-corpus';
test('complete logical scans retain all typed read duties and refuse unresolved populations atomically',()=>{
 for(const row of runCatalogScanCorpus())expect(row.passed,row.id).toBe(true);
});
