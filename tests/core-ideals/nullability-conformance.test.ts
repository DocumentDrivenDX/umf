// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {verifyNullabilityRoundTrips,nullabilitySystems} from '../../scripts/core-ideals/nullability-conformance';
test('five Nullability bindings preserve ideals, native payloads and explicit loss policy',async()=>{
 const result=await verifyNullabilityRoundTrips();expect(Object.keys(result)).toEqual([...nullabilitySystems]);
 for(const system of nullabilitySystems)expect(result[system]).toEqual({authoredCases:12,strictBlocks:3,reportResiduals:3,idealRecoveries:18,nativeCases:8,nativeBlocks:2,nativeRecoveries:12});
},120000);