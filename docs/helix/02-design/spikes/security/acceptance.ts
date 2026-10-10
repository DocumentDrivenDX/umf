/** Fresh execution evidence gate. Trusted reviewed runners remain a prerequisite. */
import {createHash, randomUUID} from "node:crypto";
import {resolve, relative, isAbsolute} from "node:path";
import {runSecurityCommand} from "../../../../../tools/security/run-command";
const root = "docs/helix/";
const planPath = root + "03-test/security/cases.json";
const plan = await Bun.file(planPath).json();
const errors: string[] = [];
const ids = new Set<string>();
const allocated = new Set<string>();
const execution: unknown[] = [];
const allowedRoots: Record<string, string[]> = {
  semantic: [process.cwd()], "pg-raw": [process.cwd(), "/Users/erik/Projects/truss/packages/pg-runtime", "/private/tmp/ashlar-truss-runtime/node_modules"], "delta-raw": [process.cwd()],
  truss: [process.cwd(), "/Users/erik/Projects/truss"],
  ashlar: [process.cwd(), "/Users/erik/Projects/ashlar"]
};
const permitted = (file: string, backend: string): boolean =>
  (allowedRoots[backend] ?? []).some(base => {
    const path = relative(base, resolve(file));
    return path !== ".." && !path.startsWith("../") && !isAbsolute(path);
  });
const hash = async (file: string) => createHash("sha256").update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest("hex");
for (const c of plan.cases) {
  if (ids.has(c.id)) errors.push(`duplicate case ${c.id}`);
  ids.add(c.id);
  for (const ac of c.covers) allocated.add(ac);
  if (!c.required) {errors.push(`${c.id}: all initial security cases are required`);continue;}
  // Stored receipts cannot self-certify; execute a reviewed runner freshly.
  if (!Array.isArray(c.command) || c.command.length < 2 || !["bun", "python3"].includes(c.command[0]) ||
      !c.testSource || !c.oracleSource || !c.implementationSources?.length ||
      ![c.testSource, c.oracleSource, ...c.implementationSources].every((p: string) => permitted(p,c.backend))) {
    errors.push(`${c.id}: required reviewed runner/oracle/implementation binding not implemented`);
    continue;
  }
  if (resolve(c.command[1]) !== resolve(c.testSource)) {
    errors.push(`${c.id}: command does not execute fingerprinted test source`); continue;
  }
  const source = await Bun.file(c.testSource).text();
  if (!c.covers.every((ac: string) => source.includes(`@covers ${ac}`))) {
    errors.push(`${c.id}: uncited exercising source`); continue;
  }
  const runId = randomUUID();
  const fingerprints: Record<string,string> = {};
  for (const file of [c.testSource,c.oracleSource,...c.implementationSources]) fingerprints[file] = await hash(file);
  const result = await runSecurityCommand(c.command, {timeoutMs:c.timeoutMs ?? 30000,
    env:{...process.env,UMF_SECURITY_RUN_ID:runId,UMF_SECURITY_CASE_ID:c.id}});
  const {stdout,exitCode,timedOut} = result;
  const outcome={id:c.id,runId,command:c.command,...result,fingerprints,accepted:false};
  execution.push(outcome);
  if (timedOut || result.outputExceeded || result.error || exitCode !== 0) {
    errors.push(`${c.id}: runner failed, exceeded output bound or timed out`);continue;
  }
  let receipt: any;
  try {receipt=JSON.parse(stdout);} catch {errors.push(`${c.id}: missing structured runner result`);continue;}
  if (receipt.status !== "passed" || receipt.id !== c.id || receipt.backend !== c.backend ||
      receipt.runId !== runId || JSON.stringify(receipt.command) !== JSON.stringify(c.command) ||
      !receipt.versions || !Object.keys(receipt.versions).length ||
      !receipt.sourceDigests || !Object.keys(receipt.sourceDigests).length ||
      !c.covers.every((ac: string) => receipt.covers?.includes(ac)) ||
      !receipt.observations?.length || !c.assertionIds?.length ||
      !c.assertionIds.every((id:string) => receipt.observations.some((x:any) => x.assertionId === id)) ||
      receipt.observations.some((x:any) => !Object.hasOwn(x,"expected") || !Object.hasOwn(x,"observed") ||
        JSON.stringify(x.expected) !== JSON.stringify(x.observed)) ||
      (c.backend !== "semantic" && (!receipt.nativeInventory?.digest || !receipt.nativeInventory?.ordinaryActor ||
        !receipt.nativeInventory?.objects?.length))) {
    errors.push(`${c.id}: malformed, replayed or nonpassing execution evidence`);continue;
  }
  const validationErrorsBefore=errors.length;
  for (const [file,expected] of Object.entries(fingerprints)) {
    if (receipt.sourceDigests[file] !== expected || await hash(file) !== expected) errors.push(`${c.id}: stale/missing source ${file}`);
  }
  outcome.accepted=errors.length===validationErrorsBefore;
}
for (const [n, count] of [[55, 10], [56, 10], [57, 8]]) {
  for (let i = 1; i <= count!; i++) if (!allocated.has(`US-${String(n).padStart(3, "0")}-AC${i}`)) {
    errors.push(`unallocated US-${String(n).padStart(3, "0")}-AC${i}`);
  }
}
const receipt = {status: errors.length ? "failed" : "passed", requiredCases: ids.size,
  allocatedAcceptanceCriteria: allocated.size, errors,
  execution,planDigest:await hash(planPath),gateSourceDigests:{
    [root + '02-design/spikes/security/acceptance.ts']:await hash(root + '02-design/spikes/security/acceptance.ts'),
    'tools/security/run-command.ts':await hash('tools/security/run-command.ts')},
  scope:"Fresh execution from trusted reviewed runners; metadata does not prove runner honesty or independent native inventory"};
await Bun.write(root + "04-build/evidence/security/acceptance.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({status: receipt.status, requiredCases: ids.size, allocatedAcceptanceCriteria: allocated.size, missingOrFailed: errors.length}));
process.exitCode = errors.length ? 1 : 0;
