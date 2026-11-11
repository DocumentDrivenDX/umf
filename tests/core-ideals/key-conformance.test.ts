// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {verifyKeyConformance} from '../../scripts/core-ideals/key-conformance';
test('Key source operations retain both recovery directions across five bindings',async()=>{
 const r=await verifyKeyConformance();
 expect(r.sourceUsefulSystems).toEqual(['postgresql','sqlserver']);
 expect(Object.keys(r.native)).toHaveLength(5);
},120000);
