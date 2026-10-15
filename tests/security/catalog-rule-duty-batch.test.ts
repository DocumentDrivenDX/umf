import {test,expect} from 'bun:test';
import {runCatalogRuleDutyBatchCorpus} from './catalog-rule-duty-batch-corpus';
test('field-free original rule evidence and action duties share one atomic operation',()=>{for(const c of runCatalogRuleDutyBatchCorpus())expect(c.observed,c.id).toEqual(c.expected);});
