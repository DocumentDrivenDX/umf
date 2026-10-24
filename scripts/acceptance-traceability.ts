// SPDX-License-Identifier: MIT OR Apache-2.0
import { readdir } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import { parse } from 'yaml';

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

// relative() yields native separators; the ledger records repository paths with '/'.
function repositoryPath(path: string): string {
  return relative(root, path).split(sep).join('/');
}

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
  evidence.add(`${repositoryPath(path)}:${line}`);
  index.set(id, evidence);
}

// Bound filesystem concurrency while retaining the sorted input order. Each
// invocation reads fresh contents; there is no process-wide citation cache.
async function readSources(paths: string[]): Promise<string[]> {
  const texts = new Array<string>(paths.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(16, paths.length)}, async () => {
    while (next < paths.length) {
      const index = next++;
      texts[index] = await Bun.file(paths[index]!).text();
    }
  }));
  return texts;
}

async function indexFiles(paths: string[]) {
  const citations = new Map<string, Set<string>>();
  const mentions = new Map<string, Set<string>>();
  const texts = await readSources(paths);
  for (const [index, path] of paths.entries()) {
    const lines = texts[index]!.split('\n');
    lines.forEach((line, offset) => {
      for (const match of line.matchAll(citationPattern)) add(citations, match[1]!, path, offset + 1);
      for (const id of line.match(mentionPattern) ?? []) add(mentions, id, path, offset + 1);
    });
  }
  return { citations, mentions };
}

export async function buildAcceptanceLedger() {
  const storyFiles = (await filesBelow(storiesRoot)).filter(path => path.endsWith('.md'));
  const criteria = new Map<string, string>();
  const storyAcceptance = new Map<string,boolean>();
  const storyTexts = await readSources(storyFiles);
  for (const [index, path] of storyFiles.entries()) {
    const text = storyTexts[index]!;
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const storyId = frontmatter ? parse(frontmatter[1]!).ddx?.id : undefined;
    if (typeof storyId !== 'string' || !/^US-\d{3}$/.test(storyId)) {
      if (/^US-\d{3}-/.test(path.split('/').at(-1)!) && text.match(criterionPattern)?.length) throw new Error(`Missing governed story identity: ${path}`);
      continue;
    }
    for (const match of text.matchAll(criterionPattern)) {
      const id = match[0];
      // Dependencies may cite another story's AC; only its owner defines it.
      if (!id.startsWith(storyId + '-AC')) continue;
      const story = repositoryPath(path);
      if (criteria.has(id) && criteria.get(id) !== story) throw new Error(`Duplicate acceptance criterion ${id}`);
      criteria.set(id, story);
      storyAcceptance.set(id,new RegExp(`^- \\[x\\] \\*\\*${id}\\*\\*`, 'm').test(text));
    }
  }
  const testFiles = (await filesBelow('tests')).filter(path => /\.(?:ts|py)$/.test(path));
  const scriptFiles = (await filesBelow('scripts')).filter(path => /\.(?:ts|py)$/.test(path));
  const tests = await indexFiles(testFiles);
  const scripts = await indexFiles(scriptFiles);
  const securityPlan=await Bun.file('docs/helix/03-test/security/cases.json').json();
  const securityCriteria=new Set<string>(securityPlan.cases.flatMap((c:{covers:string[]})=>c.covers));
  // Citation presence is partial evidence. Security acceptance requires the separate
  // reviewed, fresh execution gate and an authored acceptance decision.
  const securityGatePath='docs/helix/04-build/evidence/security/acceptance.json';
  const securityGate=await Bun.file(securityGatePath).exists()?await Bun.file(securityGatePath).json():null;
  const nativePolicyPath='docs/helix/04-build/evidence/metamodel-authority/current-native-qualification.json';
  const nativePolicy=await Bun.file(nativePolicyPath).json();
  const nativeCriteria=new Map<string,{evidence:string[];rationale:string}>();
  for(const row of nativePolicy.criteria){
    if(!criteria.has(row.criterion)||nativeCriteria.has(row.criterion)||row.currentQualification!=='UNQUALIFIED'||!Array.isArray(row.evidence)||typeof row.rationale!=='string')throw Error('Invalid current native qualification disposition: '+row.criterion);
    nativeCriteria.set(row.criterion,row);
  }
  const retirementPolicy=await Bun.file('docs/helix/04-build/evidence/metamodel-authority/retired-core-acceptance.json').json();
  const retiredCriteria=new Map<string,{evidence:string[];rationale:string}>();
  for(const row of retirementPolicy.criteria){
    if(!/^US-04[0-5]-AC10$/.test(row.criterion)||!criteria.has(row.criterion)||retiredCriteria.has(row.criterion)||nativeCriteria.has(row.criterion)||row.status!=='REVIEWED_EXCEPTION'||!Array.isArray(row.evidence)||typeof row.rationale!=='string')throw Error('Invalid retired core acceptance disposition: '+row.criterion);
    retiredCriteria.set(row.criterion,row);
  }
  if(retiredCriteria.size!==6)throw Error('Incomplete retired core acceptance dispositions');
  const dangling = [...new Set([...tests.citations.keys(), ...scripts.citations.keys()])]
    .filter(id => !criteria.has(id)).sort();
  if (dangling.length) throw new Error(`Dangling @covers citations: ${dangling.join(', ')}`);

  const rows: AcceptanceLedgerRow[] = [...criteria].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([id, story]) => {
    const testCitations = [...(tests.citations.get(id) ?? [])].sort();
    const scriptCitations = [...(scripts.citations.get(id) ?? [])].sort();
    const testMentions = [...(tests.mentions.get(id) ?? [])].filter(item => !testCitations.includes(item)).sort();
    const retiredDisposition=retiredCriteria.get(id);
    if(retiredDisposition)return {id,story,status:'REVIEWED_EXCEPTION' as const,evidence:[...testCitations,...scriptCitations,...retiredDisposition.evidence],rationale:retiredDisposition.rationale};
    const nativeDisposition=nativeCriteria.get(id);
    if(nativeDisposition)return {id,story,status:'UNTESTED' as const,evidence:[...testCitations,...scriptCitations,...nativeDisposition.evidence],rationale:nativeDisposition.rationale};
    if(securityCriteria.has(id)){
      const authored=storyAcceptance.get(id)??false;
      if(!authored||securityGate?.status!=='passed')return {id,story,status:'UNTESTED' as const,
        evidence:[...testCitations,...scriptCitations],rationale:'Partial citations may exist; shared security acceptance remains open until all required fresh cases pass and the criterion is explicitly accepted.'};
    }
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
