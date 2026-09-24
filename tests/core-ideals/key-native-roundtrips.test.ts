import {test,expect} from 'bun:test';
import {verifyKeyNativeRoundTrips} from '../../scripts/core-ideals/key-native-roundtrips';
test('five-system native Key observations preserve unknown meanings and exact archives without author inference',async()=>{
 const coverage=await verifyKeyNativeRoundTrips();
 for(const count of Object.values(coverage)){expect(count.recoveries).toBe(count.cases*2);expect(count.classified).toBeGreaterThan(0);expect(count.refusals).toBeGreaterThan(0);}
 expect(coverage.parquet!.blocked).toBe(1);
},120000);
