// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import * as securityRuntime from '../../src/index-node-v4';
import {configureQueryValueRustApi,runQueryValueSourceCorpus} from './query-value-source-corpus';
configureQueryValueRustApi(securityRuntime);
test('source value domains and authority paths remain distinct before native query admission',()=>{for(const row of runQueryValueSourceCorpus())expect(row.passed,row.id+': '+JSON.stringify(row.observed)).toBe(true);});
