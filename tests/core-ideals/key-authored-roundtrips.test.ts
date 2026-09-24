import {test, expect} from 'bun:test';
import {verifyKeyAuthoredRoundTrips} from '../../scripts/core-ideals/key-roundtrips';

test('Key shared authored contract preserves plural identity and rejects forged receipts across five systems', async () => {
 const coverage = await verifyKeyAuthoredRoundTrips();
 expect(Object.keys(coverage)).toEqual(['tablespec', 'postgresql', 'sqlserver', 'avro', 'parquet']);
 expect(Object.fromEntries(Object.entries(coverage).map(([system, result]) => [system, result.projected])))
  .toEqual({tablespec: 12, postgresql: 17, sqlserver: 19, avro: 16, parquet: 21});
 for (const result of Object.values(coverage)) {
  expect(result.recoveries).toBe(result.projected * 2);
  expect(result.forgedRefusals).toBe(result.recoveries);
  expect(result.strictBlocks).toBe(result.projected);
 }
}, 120000);
