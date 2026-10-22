// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runNestedGraphConditionsCorpus} from './nested-graph-conditions-corpus';
test('bounded nested graph conditions retain incidence semantics and global preflight',()=>{for(const c of runNestedGraphConditionsCorpus())expect(c.passed,c.id).toBe(true);});
