import {test,expect} from 'bun:test';
import {runCatalogOperationBatchCorpus} from './catalog-operation-batch-corpus';
test('mixed reads and action checks share one atomic logical operation',()=>{for(const row of runCatalogOperationBatchCorpus())expect(row.passed,row.id+': '+JSON.stringify(row.observed)).toBe(true);});
