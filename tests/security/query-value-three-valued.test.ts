// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {runQueryValueThreeValuedCorpus} from './query-value-three-valued-corpus';
test('all eight-rule three-valued vectors preserve deny, unknown and disclosure precedence across rule order',()=>{const r=runQueryValueThreeValuedCorpus();expect(r.states).toBe(13122);expect(r.permit).toBeGreaterThan(0);expect(r.unknown).toBeGreaterThan(0);expect(r.deny).toBeGreaterThan(0);},60000);
