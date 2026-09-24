import {test, expect} from 'bun:test';
import {verifyKeyEvidence} from '../../scripts/core-ideals/key-evidence';
const read = async (p: string) => new Uint8Array(await Bun.file(p).arrayBuffer());
test('Key evidence requires complete current five-system qualifications without granting admission', async () => {
 const result = await verifyKeyEvidence();
 expect(result.records).toHaveLength(21); expect(result.fingerprints).toBeGreaterThan(186);
 expect(result.idealAdmitted).toBe(false); expect(result.nativeEquivalence).toBe(false);
});
test('Key evidence rejects missing, stale, failed, unsafe, incompatible and incomplete proofs', async () => {
 const cases: [string, (r:any)=>void, string][] = [
  ['key-gate-refresh-evidence', r => r.complete=false, 'incomplete refresh'],
  ['key-gate-refresh-evidence', r => r.runs.pop(), 'incomplete command matrix'],
  ['key-gate-refresh-evidence', r => r.runs[0].exitCode=1, 'failed command'],
  ['key-gate-refresh-evidence', r => delete r.sha256['fixtures/validation/key-avro-browser.json'], 'missing required proof'],
  ['key-postgresql-projection-native', r => r.serverVersion=180000, 'incompatible PostgreSQL'],
  ['key-postgresql-projection-native', r => r.rows.find((x:any)=>x.status==='projected').probes.find((x:any)=>x.id==='duplicate-tuple').sqlstate='00000', 'failed projection control'],
  ['key-sqlserver-discovery-native', r => r.cases.find((x:any)=>x.id==='disabled-accepts-duplicate').actual.error=2627, 'failed native control'],
  ['key-sqlserver-projection-native', r => r.rows.find((x:any)=>x.id==='required').actual.error=0, 'failed projection control'],
  ['key-tablespec-projection-native', r => r.rows[0].enforcementEstablished=true, 'Expected values'],
  ['key-avro-projection-native', r => r.rows[0].values[1]={changed:true}, 'missing duplicate record control'],
  ['key-parquet-projection-native', r => r.rows[0].decoded[1]={changed:true}, 'missing duplicate record control'],
  ['key-parquet-projection-native', r => r.rows=[], 'empty native evidence'],
  ['key-sqlserver-browser', r => r.checks.strictBlocked=false, 'incomplete browser coverage'],
  ['key-avro-browser', r => r.externalRequests=['https://example.invalid'], 'external browser requests'],
  ['key-parquet-browser', r => r.sha256['../../outside']='0'.repeat(64), 'unsafe evidence path'],
  ['key-parquet-browser', r => r.sha256['/etc/passwd']='0'.repeat(64), 'unsafe evidence path'],
 ];
 for (const [name, change, message] of cases) {
  const path=`fixtures/validation/${name}.json`, value=JSON.parse(new TextDecoder().decode(await read(path)));change(value);
  await expect(verifyKeyEvidence(p => p===path ? Promise.resolve(new TextEncoder().encode(JSON.stringify(value))) : read(p))).rejects.toThrow(message);
 }
 await expect(verifyKeyEvidence(p => p==='src/core-ideals/key-avro.ts' ? Promise.resolve(new TextEncoder().encode('changed')) : read(p))).rejects.toThrow('stale');
 await expect(verifyKeyEvidence(p => p.endsWith('key-parquet-browser.json') ? Promise.reject(Error('missing proof')) : read(p))).rejects.toThrow('missing proof');
});
