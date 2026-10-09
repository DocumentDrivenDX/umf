import { expect, test } from 'bun:test';
import { buildAcceptanceLedger } from '../../scripts/acceptance-traceability';

test('every governed acceptance criterion has one auditable traceability classification', async () => {
  const ledger = await buildAcceptanceLedger();
  // The committed inventory is the snapshot; adding governed stories must not
  // leave an unrelated historical criterion count baked into this gate.
  expect(ledger).toEqual(await Bun.file('docs/helix/03-test/acceptance-criteria-ledger.json').json());
  expect(ledger.total).toBeGreaterThan(0);
  expect(ledger.criteria).toHaveLength(ledger.total);
  expect(new Set(ledger.criteria.map(row => row.id)).size).toBe(ledger.total);
  expect(ledger.danglingCitations).toEqual([]);
  for (const row of ledger.criteria) {
    expect(['SATISFIED', 'UNTESTED', 'UNCITED_COVERAGE', 'ASSERTED_UNBACKED', 'REVIEWED_EXCEPTION']).toContain(row.status);
    if (row.status === 'SATISFIED') {
      expect(row.evidence.length).toBeGreaterThan(0);
      expect(row.evidence.every(path => path.startsWith('tests/'))).toBe(true);
    }
  }
});

test('the PostgreSQL generator browser-parity criterion retains reviewed harness evidence', async () => {
  const ledger = await buildAcceptanceLedger();
  const row = ledger.criteria.find(item => item.id === 'US-048-AC9');
  expect(row?.status).toBe('REVIEWED_EXCEPTION');
  expect(row?.evidence.some(path => path.startsWith('scripts/projections/ddd-postgresql-browser.ts:'))).toBe(true);
});
