import { readdir } from 'node:fs/promises';
import { relative } from 'node:path';

export type AcceptanceStatus =
  | 'SATISFIED'
  | 'UNTESTED'
  | 'UNCITED_COVERAGE'
  | 'ASSERTED_UNBACKED'
  | 'REVIEWED_EXCEPTION';

export interface AcceptanceLedgerRow {
  id: string;
  story: string;
  status: AcceptanceStatus;
  evidence: string[];
  rationale: string;
}

const root = process.cwd();
const storiesRoot = 'docs/helix/01-frame/user-stories';
const outputPath = 'docs/helix/03-test/acceptance-criteria-ledger.json';
const criterionPattern = /US-\d{3}-AC\d+/g;
const citationPattern = /@covers\s+(US-\d{3}-AC\d+)/g;
const mentionPattern = /US-\d{3}-AC\d+/g;

async function filesBelow(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const child = `${path}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(child) : Promise.resolve([child]);
  }));
  return files.flat().sort();
}

function add(index: Map<string, Set<string>>, id: string, path: string, line: number) {
  const evidence = index.get(id) ?? new Set<string>();
  evidence.add(`${relative(root, path)}:${line}`);
  index.set(id, evidence);
}

async function indexFiles(paths: string[]) {
  const citations = new Map<string, Set<string>>();
  const mentions = new Map<string, Set<string>>();
  // Bounded parallel I/O keeps large ledgers responsive without exhausting
  // file descriptors. Promise.all preserves the deterministic path order.
  for (let start = 0; start < paths.length; start += 32) {
    const batch = paths.slice(start, start + 32);
    const contents = await Promise.all(batch.map(path => Bun.file(path).text()));
    for (const [index, path] of batch.entries()) {
      const lines = contents[index]!.split('\n');
      lines.forEach((line, offset) => {
        for (const match of line.matchAll(citationPattern)) add(citations, match[1]!, path, offset + 1);
        for (const id of line.match(mentionPattern) ?? []) add(mentions, id, path, offset + 1);
      });
    }
  }
  return { citations, mentions };
}

export async function buildAcceptanceLedger() {
  const storyFiles = (await filesBelow(storiesRoot)).filter(path => path.endsWith('.md'));
  const criteria = new Map<string, string>();
  for (const path of storyFiles) {
    const text = await Bun.file(path).text();
    for (const match of text.matchAll(criterionPattern)) {
      const id = match[0];
      const story = relative(root, path);
      if (criteria.has(id) && criteria.get(id) !== story) throw new Error(`Duplicate acceptance criterion ${id}`);
      criteria.set(id, story);
    }
  }
  const testFiles = (await filesBelow('tests')).filter(path => /\.(?:ts|py)$/.test(path));
  const scriptFiles = (await filesBelow('scripts')).filter(path => /\.(?:ts|py)$/.test(path));
  const tests = await indexFiles(testFiles);
  const scripts = await indexFiles(scriptFiles);
  const dangling = [...new Set([...tests.citations.keys(), ...scripts.citations.keys()])]
    .filter(id => !criteria.has(id)).sort();
  if (dangling.length) throw new Error(`Dangling @covers citations: ${dangling.join(', ')}`);

  const rows: AcceptanceLedgerRow[] = [...criteria].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([id, story]) => {
    const testCitations = [...(tests.citations.get(id) ?? [])].sort();
    const scriptCitations = [...(scripts.citations.get(id) ?? [])].sort();
    const testMentions = [...(tests.mentions.get(id) ?? [])].filter(item => !testCitations.includes(item)).sort();
    if (testCitations.length) return { id, story, status: 'SATISFIED' as const, evidence: testCitations, rationale: 'A live Bun test carries a canonical citation.' };
    if (scriptCitations.length) return { id, story, status: 'REVIEWED_EXCEPTION' as const, evidence: scriptCitations, rationale: 'A native or browser harness carries the canonical citation; the harness is executed by the conformance workflow rather than bun:test.' };
    if (testMentions.length) return { id, story, status: 'UNCITED_COVERAGE' as const, evidence: testMentions, rationale: 'A live test names the criterion, but its title/comment has not yet been promoted to canonical @covers form.' };
    return { id, story, status: 'UNTESTED' as const, evidence: [], rationale: 'No criterion-specific executable evidence was found; this is a traceability gap, not an implementation claim.' };
  });
  const counts = Object.fromEntries(['SATISFIED', 'UNTESTED', 'UNCITED_COVERAGE', 'ASSERTED_UNBACKED', 'REVIEWED_EXCEPTION'].map(status => [status, rows.filter(row => row.status === status).length]));
  return { profile: 'umf-acceptance-traceability-1', generatedFrom: { stories: storiesRoot, liveTests: 'tests', conformanceHarnesses: 'scripts' }, total: rows.length, counts, danglingCitations: dangling, criteria: rows };
}

if (import.meta.main) {
  const ledger = `${JSON.stringify(await buildAcceptanceLedger(), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (!await Bun.file(outputPath).exists() || await Bun.file(outputPath).text() !== ledger) throw new Error(`${outputPath} is stale; run bun scripts/acceptance-traceability.ts`);
    console.log(`Acceptance traceability ledger is current: ${JSON.parse(ledger).total} criteria.`);
  } else {
    await Bun.write(outputPath, ledger);
    console.log(`Wrote ${outputPath}.`);
  }
}
