// SPDX-License-Identifier: MIT OR Apache-2.0
/** Build and qualify installed core and compiler Python, Node, Bun, WASM/browser, and CLI hosts. */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {accessSync, constants, existsSync, readdirSync, statSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {delimiter, dirname, join, relative, resolve, sep} from 'node:path';

const root = resolve(import.meta.dir, '../..');
const fixture = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json');
const evidence = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r3');
const receiptOverride = process.env.UMF_R3_QUALIFICATION_PATH ?? process.env.UMF_R2_QUALIFICATION_PATH;
const receiptPath = receiptOverride
  ? resolve(root, receiptOverride)
  : resolve(evidence, 'production-host-qualification.json');
function resolveTool(override: string | undefined, names: string[], extra: string[] = []): string {
  const directories = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const candidates = override
    ? (override.includes('/') || override.includes('\\')
      ? [override]
      : directories.map((directory) => join(directory, override)))
    : [...names.flatMap((name) => directories.map((directory) => join(directory, name))), ...extra];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return resolve(candidate);
    } catch {
      // Keep looking; a configured path may exist but not be executable.
    }
  }
  throw new Error(`Required executable not found: ${override ?? names.join(' or ')}`);
}

const python = resolveTool(process.env.UMF_PYTHON ?? process.env.PYTHON_SYS_EXECUTABLE, ['python3.11', 'python3']);
const cargo = resolveTool(process.env.CARGO, ['cargo'], ['/opt/homebrew/opt/rustup/bin/cargo']);
const uv = resolveTool(process.env.UV, ['uv'], [join(homedir(), '.local', 'bin', 'uv')]);
const node = resolveTool(process.env.NODE, ['node']);
const wasmBindgen = resolveTool(process.env.WASM_BINDGEN, ['wasm-bindgen'], [resolve(root, 'target/rust-spike/tools/bin/wasm-bindgen')]);
const npm = resolveTool(process.env.NPM, ['npm']);
const bun = resolveTool(process.env.BUN, ['bun']);
const gitTool = resolveTool(process.env.UMF_GIT, ['git']);
const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let commandSequence = 0;

function safeCommandArguments(args: string[]) {
  const secretOption = /^(?:--?)(?:dsn|password|passwd|token|secret|credential|authorization)(?:=|$)/i;
  const rendered = args.slice(0, 8).map((argument, index) => {
    if (index > 0 && secretOption.test(args[index - 1])) return '[redacted]';
    if (secretOption.test(argument)) return argument.includes('=') ? `${argument.split('=', 1)[0]}=[redacted]` : argument;
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/@]+@/i.test(argument)) return argument.replace(/^(.*:\/\/)[^/@]+@/, '$1[redacted]@');
    return argument.length > 120 ? `${argument.slice(0, 96)}…[${argument.length} chars]` : argument;
  });
  const preview = JSON.stringify(rendered);
  return preview.length > 512 ? `${preview.slice(0, 509)}…` : preview;
}

async function artifactContent(path: string) {
  const content = await readFile(path);
  return {bytes: content.byteLength, sha256: hashBytes(content)};
}

function command(program: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const commandId = ++commandSequence;
  const startedAt = Date.now();
  const identity = {commandId, program: program.split(/[\\/]/).at(-1) ?? program, argsPreview: safeCommandArguments(args)};
  process.stderr.write(`${JSON.stringify({event: 'command-start', ...identity})}\n`);
  let result: {stdout: string | null; stderr: string | null; status: number | null; signal: NodeJS.Signals | null; error?: NodeJS.ErrnoException};
  try {
    result = spawnSync(program, args, {cwd, env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024});
  } catch (error) {
    process.stderr.write(`${JSON.stringify({event: 'command-end', ...identity, durationMs: Date.now() - startedAt, status: null, signal: null, errorCode: error instanceof Error ? error.name : 'unknown'})}\n`);
    throw error;
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.stderr.write(`${JSON.stringify({event: 'command-end', ...identity, durationMs: Date.now() - startedAt, status: result.status, signal: result.signal, errorCode: result.error?.code ?? null})}\n`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed (${result.status ?? result.signal})`);
  return {stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
}

function outputRecord(name: string, result: {stdout: string; stderr: string}) {
  const stdout = result.stdout.trim();
  let report: unknown = undefined;
  if (stdout.startsWith('{') && stdout.endsWith('}')) {
    try { report = JSON.parse(stdout); } catch { /* Preserve the raw output for non-JSON/multiline test logs. */ }
  }
  const counts: Record<string, number> = {};
  if (report && typeof report === 'object') {
    for (const [key, value] of Object.entries(report)) {
      if (typeof value === 'number' && /cases|valid|invalid|mismatch|evaluated|comparison|checked|requests/i.test(key)) counts[key] = value;
    }
  }
  for (const [label, pattern] of [['passed', /(\d+) passed\b/], ['failed', /(\d+) failed\b/], ['skipped', /(\d+) skipped\b/]] as const) {
    const match = stdout.match(pattern);
    if (match) counts[label] = Number(match[1]);
  }
  return {
    name,
    status: 'pass',
    stdoutSha256: hashBytes(Buffer.from(result.stdout)),
    stderrSha256: hashBytes(Buffer.from(result.stderr)),
    rawStdout: result.stdout,
    rawStderr: result.stderr,
    counts,
    ...(report === undefined ? {} : {report}),
  };
}

async function walk(path: string): Promise<string[]> {
  const info = await readdir(path, {withFileTypes: true});
  const entries = await Promise.all(info.map(async (entry) => {
    const full = join(path, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  }));
  return entries.flat().sort();
}

async function sourceClosure() {
  const roots = [
    'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', '.cargo/config.toml', 'package.json', 'bun.lock',
    'crates/umf-core', 'crates/umf-core-wire', 'crates/umf-codegen', 'crates/umf-metamodel', 'crates/umf-cli',
    'bindings/core', 'python/src/umf', 'python/tests', 'python/pyproject.toml', 'python/hatch_build.py',
    'python/README.md', 'python/LICENSE.md', 'python/LICENSE-MIT', 'python/LICENSE-APACHE',
    'python/umf_access/src/umf_access/generated_core.py',
    'scripts/rust-core', 'scripts/rust-migration', 'tests/rust-core', 'spec/core', 'spec/metamodel/generated',
    'spec/metamodel/umf.yaml', 'spec/metamodel/package.json',
    'spec/extensions/domain-pack/schema.json', 'spec/extensions/dataset-source/schema.json',
    'spec/extensions/tables/operation.schema.json',
    ...compilerFixtures,
    'docs/helix/04-build/evidence/rust-migration/r3/sol-shared-query-review/query.json',
    'docs/helix/04-build/evidence/rust-migration/r3/unicode-lowercase/source-data.json',
    // Private compiler/analyzer and resource-control fixtures consumed by the
    // Rust suite are inputs too, although they are outside the public replay API.
    'docs/helix/04-build/evidence/rust-migration/r3/sol-generation-schema-order-review/source.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-final-migration-meter-review/scan-inputs.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-unified-action-admission/analysis.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-unified-action-admission/bounds/analysis.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-action-closure/qualified-analysis.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-action-closure/expression-analysis.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-action-closure/selector-analysis.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-action-closure/parser-analysis.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-independent-action-review/analysis.json',
    'docs/helix/04-build/evidence/rust-migration/r3/sol-independent-action-review/parser-order.json',
    'spec/extensions/tables/package.json', 'spec/extensions/actions/package.json',
    'spec/extensions/binding/package.json', 'spec/extensions/binding-stable/package.json',
    'src', 'fixtures/access', 'tests/compilation/access-writer.test.ts',
    'tests/compilation/access-fixtures.ts', 'scripts/umf-access-generate.ts', 'scripts/access-e2e.ts',
    'tests/access-unified.test.ts', 'tests/unified',
    'docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json',
    'docs/helix/04-build/evidence/rust-migration/r2/schema-admission-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/schema-suite-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/schema-suite-predecessor-outcomes.json',
    'docs/helix/04-build/evidence/rust-migration/r2/approved-schema-compatibility-deltas.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-design.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-clarification.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-identity-companion-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-identity-companion-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-identity-design.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-anchor-companion-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-anchor-companion-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-identity-representation.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-uri-operations-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-uri-operations-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-uri-operations-independent-review.json',
    'docs/helix/04-build/evidence/rust-migration/r2/freeze-python-resource-uri-operations.py',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-yield-boundaries-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-yield-boundaries-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-reach-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-reach-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-2019-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/approved-python-schema-2019-ap-correction.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-native.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-target-proposal.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-target-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-metadata-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-metadata-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subjects-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subjects-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subject-phases.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-terminals-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-indices-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-segments-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-keys-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-keys-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-order-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-order-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-unordered-targets.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-unordered-targets-profiles.json',
    'docs/helix/04-build/evidence/rust-migration/r2/approved-python-schema-unordered-extras-correction.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-runtime-operators-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-runtime-operator-edges-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-runtime-object-provenance-decision.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-runtime-text-resource-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-ecma-coercion-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/freeze-runtime-operators.ts',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-production-decision.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-predecessor-boundaries.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-ordering-amendment.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-ordering-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-scalar-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-character-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-source-context-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-profile-edges-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-break-context-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-directive-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-directive-tail-predecessor.json',
    'docs/helix/04-build/evidence/rust-migration/r2/approved-python-yaml-nel-correction.json',
    'scripts/rust-core/python-serialization-conformance.py',
    'scripts/metamodel', 'tests/rust-core', 'src/generated',
    '.github/workflows/rust-core.yml', '.github/workflows/access-boundaries.yml',
    'scripts/check-rust-boundaries.py', 'scripts/rust-inventory.py',
  ];
  const coreEvidence=resolve(root,'docs/helix/04-build/evidence/rust-migration/r2');
  for (const name of await readdir(coreEvidence)) {
    if (/^freeze-.*\.(?:py|ts)$/.test(name)
      || /^sol-.*(?:predecessor.*|decision|amendment)\.json$/.test(name)) {
      roots.push(relative(root, join(coreEvidence, name)));
    }
  }
  const files = new Set<string>();
  for (const entry of roots) {
    const path = resolve(root, entry);
    if (!existsSync(path)) throw new Error(`Qualification source closure is missing ${entry}`);
    if (statSync(path).isDirectory()) for (const file of await walk(path)) files.add(file);
    else files.add(path);
  }
  const selected = [...files].filter((path) => !/(?:\.node|\.dylib|\.so|\.dll|\.wasm)$/.test(path)
    && !path.includes(`${sep}pkg${sep}`)
    && !path.includes(`${sep}__pycache__${sep}`)).sort();
  const entries = await Promise.all(selected.map(async (path) => ({path: relative(root, path).split(sep).join('/'), sha256: hashBytes(await readFile(path))})));
  const digest = hashBytes(Buffer.from(entries.map(({path, sha256}) => `${path}\0${sha256}\n`).join('')));
  return {digest, entries};
}

async function git(args: string[]) {
  return command(gitTool, args, root).stdout.trim();
}

function findBinary(directory: string, pattern: RegExp): string {
  const entry = readdirSync(directory).find((name) => pattern.test(name));
  const found = entry === undefined ? undefined : join(directory, entry);
  if (!found) throw new Error(`Expected build artifact matching ${pattern} under ${directory}`);
  return found;
}

function pythonVenvPython(venv: string) {
  return process.platform === 'win32' ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python');
}

async function createNoJavascriptToolPath(directory: string) {
  await mkdir(directory, {recursive: true});
  const names = [
    'uv', 'cargo', 'rustc', 'rustup', 'python', 'python3', 'python3.11',
    'cc', 'clang', 'gcc', 'as', 'ld', 'ar', 'ranlib', 'strip', 'dsymutil',
    'codesign', 'install_name_tool', 'xcode-select', 'xcrun',
  ];
  const mandatory = new Set(['uv', 'cargo', 'python', 'python3', 'python3.11']);
  const entries: {name: string; path: string}[] = [];
  for (const name of names) {
    const candidates = (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, name));
    if (name === 'uv') candidates.unshift(uv);
    if (name === 'cargo') candidates.unshift(cargo);
    if (name.startsWith('python')) candidates.unshift(python);
    candidates.push(`/usr/bin/${name}`, `/bin/${name}`, `/opt/homebrew/bin/${name}`, `/opt/homebrew/opt/rustup/bin/${name}`);
    const found = candidates.find((candidate) => {
      if (!existsSync(candidate)) return false;
      try { accessSync(candidate, constants.X_OK); return true; } catch { return false; }
    });
    if (!found) {
      if (mandatory.has(name)) throw new Error(`Missing required no-JavaScript build tool ${name}`);
      continue;
    }
    const destination = join(directory, name);
    if (!existsSync(destination)) await symlink(resolve(found), destination);
    entries.push({name, path: resolve(found)});
  }
  const path = directory;
  const env = {...process.env, PATH: path};
  const check = spawnSync(python, ['-c', 'import shutil; names=("node", "nodejs", "bun", "bunx", "npm", "npx", "yarn", "pnpm", "corepack", "deno", "tsc", "tsx", "ts-node"); found={name: shutil.which(name) for name in names if shutil.which(name)}; print(found); raise SystemExit(bool(found))'], {env, encoding: 'utf8'});
  if (check.status !== 0 || check.error) throw new Error(`No-JavaScript PATH verification failed: ${check.stdout ?? ''}${check.stderr ?? ''}`);
  return {path, entries, verification: check.stdout.trim()};
}

const compilerFixtures = [
  'docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json',
  'docs/helix/04-build/evidence/rust-migration/r3/baseline/stage-one.json',
  'docs/helix/04-build/evidence/rust-migration/r3/supplement/operations.json.gz',
  'docs/helix/04-build/evidence/rust-migration/r3/sol-migration-row-scope-review/umf-sol-r3-round3.json',
  ...(await walk(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r3')))
    .filter(path => path.endsWith(`${sep}frozen.json`) || path.endsWith(`${sep}frozen.json.gz`))
    .map(path => relative(root, path).split(sep).join('/')),
];
async function compilerQualification(host: string, executable: string, arguments_: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const records: Record<string, unknown> = {};
  for (const [index, fixturePath] of compilerFixtures.entries()) {
    const report = join(cwd, `r3-${host}-${index}.json`);
    const startedAt = Date.now();
    let status = 'pass';
    if (host === 'cli') process.stderr.write(`${JSON.stringify({event: 'cli-fixture-start', index, fixture: fixturePath})}\n`);
    let result: {stdout: string; stderr: string};
    try {
      result = command(executable, [...arguments_, root, fixturePath], cwd, {...env, UMF_R3_REPORT: report});
    } catch (error) {
      status = 'fail';
      throw error;
    } finally {
      if (host === 'cli') process.stderr.write(`${JSON.stringify({event: 'cli-fixture-end', index, fixture: fixturePath, status, durationMs: Date.now() - startedAt})}\n`);
    }
    records[fixturePath] = {...outputRecord(`r3-${host}-complete-outcome-${index}`, result), actual: await artifactContent(report)};
  }
  return records;
}

async function installPythonWheel(wheel: string, workspace: string) {
  await mkdir(workspace, {recursive: true});
  const venv = join(workspace, 'venv');
  command(uv, ['venv', '--python', python, venv], workspace, {...process.env, UV_OFFLINE: '1'});
  const py = pythonVenvPython(venv);
  command(uv, ['pip', 'install', '--offline', '--python', py, 'pytest>=8.4,<10', 'hatchling>=1.27,<2', wheel], workspace, {...process.env, UV_OFFLINE: '1'});
  const env = {...process.env, PATH: '', UMF_GIT: gitTool, UMF_REQUIRE_INSTALLED: '1'};
  const versionResult = command(py, ['-c', 'import importlib.metadata, json, pydantic, pytest, sys; print(json.dumps({"python": sys.version, "implementation": sys.implementation.name, "hatchling": importlib.metadata.version("hatchling"), "pydantic": pydantic.__version__, "pytest": pytest.__version__}))'], workspace, env);
  const versions = JSON.parse(versionResult.stdout.trim());
  const suite = command(py, ['-m', 'pytest', '-c', resolve(root, 'python/pyproject.toml'), resolve(root, 'python/tests')], workspace, env);
  const corpus = command(py, [resolve(root, 'scripts/rust-core/python-conformance.py'), fixture], workspace, env);
  const codegen = await compilerQualification('python', py, [resolve(root, 'scripts/rust-migration/r3/python-replay.py')], workspace, env);
  const admission = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/schema-admission-predecessor.json');
  const suiteReceipt = resolve(process.env.UMF_JSON_SCHEMA_SUITE_RECEIPT
    ?? join(root, 'docs/helix/04-build/evidence/rust-migration/r2/schema-suite-predecessor-outcomes.json'));
  const suiteRoot = resolve(process.env.UMF_JSON_SCHEMA_SUITE ?? '/tmp/umf-json-schema-test-suite');
  const numericReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-predecessor.json');
  const numericEdgesReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-edges-predecessor.json');
  const schema = command(py, [resolve(root, 'scripts/rust-core/schema-python-conformance.py'), admission, suiteReceipt, suiteRoot, numericReceipt, numericEdgesReceipt], workspace, env);
  const schemaEvaluationOrder = command(py, [resolve(root, 'scripts/rust-core/schema-evaluation-order-conformance.py')], workspace, env);
  const serializationReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-predecessor-boundaries.json');
  const orderingReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-ordering-predecessor.json');
  const scalarReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-scalar-predecessor.json');
  const characterReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-character-predecessor.json');
  const sourceContextReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-source-context-predecessor.json');
  const profileEdgesReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-profile-edges-predecessor.json');
  const breakContextReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-break-context-predecessor.json');
  const directiveReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-directive-predecessor.json');
  const directiveTailReceipt = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-directive-tail-predecessor.json');
  const nelCorrection = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/approved-python-yaml-nel-correction.json');
  const serialization = command(py, [resolve(root, 'scripts/rust-core/python-serialization-conformance.py'), serializationReceipt, orderingReceipt, scalarReceipt, characterReceipt, sourceContextReceipt, profileEdgesReceipt, breakContextReceipt, directiveReceipt, directiveTailReceipt, nelCorrection], workspace, env);
  return {
    python: py,
    versions,
    suite: outputRecord('installed-python-public-suite', suite),
    corpus: outputRecord('installed-python-139-and-controls', corpus),
    codegen,
    schema: outputRecord('installed-python-9282-admission-and-official-suite', schema),
    schemaEvaluationOrder: outputRecord('installed-python-schema-evaluation-order-reference-scope-identity-anchor-uri-7671-methods-and-263-errors', schemaEvaluationOrder),
    serialization: outputRecord('installed-python-typed-serialization-predecessor', serialization),
  };
}

const sourceBefore = await sourceClosure();
const commit = await git(['rev-parse', 'HEAD']);
const statusAtStart = await git(['status', '--porcelain=v1', '--untracked-files=all']);
const workspace = await mkdtemp(join(tmpdir(), 'umf-r3-full-conformance-'));
const results: Record<string, unknown> = {};
const artifacts: Record<string, unknown> = {};
try {
  const env = {...process.env, CARGO_NET_OFFLINE: 'true', RUSTUP_TOOLCHAIN: '1.90.0'};
  const nodeBuild = command(cargo, ['build', '--locked', '--release', '-p', 'umf-cli', '-p', 'umf-core-node'], root, env);
  results.nativeBuild = outputRecord('native-cli-node-release-build', nodeBuild);
  const release = resolve(root, 'target/release');
  const nodeLibrary = findBinary(release, /^libumf_core_node\.(?:dylib|so)$/);
  const nodeAddon = resolve(root, 'bindings/core/node/umf_core_node.node');
  await copyFile(nodeLibrary, nodeAddon);
  results.codegenHostAdmission = outputRecord('r3-host-constructor-copy-and-carrier-controls', command(node, ['--test', resolve(root, 'tests/rust-core/codegen-host-admission.test.mjs')], workspace));
  artifacts.nodeAddon = {
    path: relative(root, nodeAddon).split(sep).join('/'),
    ...await artifactContent(nodeAddon),
  };

  const tarballDir = join(workspace, 'npm-tarball');
  const installDir = join(workspace, 'npm-install');
  await mkdir(tarballDir, {recursive: true});
  await mkdir(installDir, {recursive: true});
  command(npm, ['pack', '--pack-destination', tarballDir], resolve(root, 'bindings/core/node'), {...process.env, npm_config_offline: 'true'});
  const tarball = findBinary(tarballDir, /\.tgz$/);
  command(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', installDir, tarball], workspace, {...process.env, npm_config_offline: 'true'});
  const installedNodeEntry = join(installDir, 'node_modules/@umf/core-rust-native/index.js');
  if (!existsSync(installedNodeEntry)) throw new Error('Packed Node addon did not install outside the checkout');
  const nodePackageContent = await artifactContent(tarball);
  const installedAddonContent = await artifactContent(join(dirname(installedNodeEntry), 'umf_core_node.node'));
  artifacts.nodePackage = {
    sha256: nodePackageContent.sha256,
    bytes: nodePackageContent.bytes,
    addonSha256: installedAddonContent.sha256,
    addonBytes: installedAddonContent.bytes,
  };
  const nodeEnv = {...process.env, UMF_CORE_NODE_PACKAGE: installedNodeEntry};
  const nodeVersion = command(node, ['-e', 'if (process.versions.bun) process.exit(2); process.stdout.write(process.version)'], workspace).stdout;
  results.node = outputRecord('packed-installed-node', command(node, [resolve(root, 'scripts/rust-core/node-conformance.mjs'), fixture], workspace, nodeEnv));
  results.bun = outputRecord('packed-installed-bun', command(bun, [resolve(root, 'scripts/rust-core/node-conformance.mjs'), fixture], workspace, nodeEnv));
  const compilerAdapter = resolve(root, 'scripts/rust-migration/r3/host-replay.mjs');
  const compilerNodeEnv = {...nodeEnv, UMF_R3_NODE_PACKAGE: installedNodeEntry};
  results.codegenNode = await compilerQualification('node', node, [compilerAdapter], workspace, compilerNodeEnv);
  results.codegenBun = await compilerQualification('bun', bun, [compilerAdapter], workspace, compilerNodeEnv);
  const stageResult = JSON.parse(await readFile(join(workspace, 'r3-node-1.json'), 'utf8'));
  const baseCandidate = stageResult.results.find((row: any) => row.id === 'candidate-base');
  if (!baseCandidate?.matches || !baseCandidate.actual?.ok || baseCandidate.actual.result?.outcome !== 'candidate') throw new Error('Rust writer qualification requires the exact frozen candidate package');
  const writerInput = join(workspace, 'r3-writer-candidate.json');
  await writeFile(writerInput, JSON.stringify(baseCandidate.actual.result));
  results.codegenWriter = outputRecord('r3-writer-drift-path-fault-ownership-stage-two-controls-on-rust-files', command(bun, ['test', resolve(root, 'tests/compilation/access-writer.test.ts')], workspace, {...process.env, UMF_R3_WRITER_CANDIDATE: writerInput}));
  const clientResult = JSON.parse(await readFile(join(workspace, 'r3-node-0.json'), 'utf8'));
  const clientCandidate = clientResult.results.find((row: any) => row.id === 'client/original-json');
  if (!clientCandidate?.matches || !clientCandidate.actual?.ok) throw new Error('Rust ontology qualification requires an exact frozen client');
  const clientInput = join(workspace, 'r3-unified-candidate.json');
  await writeFile(clientInput, JSON.stringify(clientCandidate.actual.result));
  results.codegenOntology = outputRecord('r3-unchanged-application-independent-ontology-on-rust-client-stdlib-only', command(bun, ['test', resolve(root, 'tests/access-unified.test.ts')], workspace, {...process.env, UMF_R3_UNIFIED_CANDIDATE: clientInput, UMF_UNIFIED_PYTHON: python, UMF_UNIFIED_POSTGRES_DSN: '', UMF_UNIFIED_WEFT_DIR: '', UMF_UNIFIED_PSYCOPG_DIR: ''}));

  const cli = resolve(release, 'umf');
  results.cliWireTransport = outputRecord('bounded-native-cli-wire-transport-fault-controls', command(node, ['--test', resolve(root, 'scripts/rust-core/cli-wire-transport.test.mjs')], workspace, {...process.env, UMF_CLI_PATH: cli}));
  results.cli = outputRecord('native-cli-139-path-empty', command(node, [resolve(root, 'scripts/rust-core/cli-core-conformance.mjs'), fixture], workspace, {...process.env, PATH: '', UMF_CLI_PATH: cli}));
  results.codegenCli = await compilerQualification('cli', node, [compilerAdapter], workspace, {...process.env, PATH: '', UMF_R3_HOST: 'cli', UMF_R3_CLI: cli});
  artifacts.cli = {
    path: relative(root, cli).split(sep).join('/'),
    ...await artifactContent(cli),
  };

  const defaultWasmBuild = command(cargo, ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'umf-core-wasm'], root, env);
  results.wasmDefaultBuild = outputRecord('wasm-release-default-production-build', defaultWasmBuild);
  const defaultWasmPkg = 'target/rust-core/wasm/default-pkg';
  command(wasmBindgen, ['--target', 'web', '--out-dir', defaultWasmPkg, '--out-name', 'umf_core_wasm', 'target/wasm32-unknown-unknown/release/umf_core_wasm.wasm'], root, env);
  const defaultWasmPath = resolve(root, defaultWasmPkg, 'umf_core_wasm_bg.wasm');
  const defaultWasmContent = await artifactContent(defaultWasmPath);
  const defaultWasmJsContent = await artifactContent(resolve(root, defaultWasmPkg, 'umf_core_wasm.js'));
  artifacts.wasmDefault = {
    wasmSha256: defaultWasmContent.sha256,
    wasmBytes: defaultWasmContent.bytes,
    jsSha256: defaultWasmJsContent.sha256,
    jsBytes: defaultWasmJsContent.bytes,
  };
  const defaultBrowser = command(node, ['--experimental-strip-types', resolve(root, 'scripts/rust-core/browser-conformance.ts')], workspace, {
    ...process.env,
    UMF_WASM_PKG_PATH: `${defaultWasmPkg}/umf_core_wasm.js`,
    UMF_WASM_REGEX_CONFORMANCE: '0',
    UMF_WASM_SCHEMA_DEPTH_CONFORMANCE: '0',
  });
  results.chromiumDefaultWasm = outputRecord('real-chromium-default-production-wasm-139-boundaries-controls', defaultBrowser);
  const compilerBrowser: Record<string, unknown> = {};
  for (const [index, fixturePath] of compilerFixtures.entries()) {
    const report = join(workspace, `r3-chromium-${index}.json`);
    const run = command(node, ['--experimental-strip-types', resolve(root, 'scripts/rust-migration/r3/browser-conformance.ts')], workspace, {...process.env, UMF_WASM_PKG_PATH: `${defaultWasmPkg}/umf_core_wasm.js`, UMF_R3_FIXTURE: fixturePath, UMF_R3_REPORT: report});
    compilerBrowser[fixturePath] = {...outputRecord(`r3-real-chromium-complete-outcome-${index}`, run), actual: await artifactContent(report)};
  }
  results.codegenChromium = compilerBrowser;

  const wasmBuild = command(cargo, ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'umf-core-wasm', '--features', 'conformance'], root, env);
  results.wasmFeatureBuild = outputRecord('wasm-release-python-regex-conformance-feature-build', wasmBuild);
  const featureWasmPkg = 'target/rust-core/wasm/feature-pkg';
  command(wasmBindgen, ['--target', 'web', '--out-dir', featureWasmPkg, '--out-name', 'umf_core_wasm', 'target/wasm32-unknown-unknown/release/umf_core_wasm.wasm'], root, env);
  const featureWasmPath = resolve(root, featureWasmPkg, 'umf_core_wasm_bg.wasm');
  const featureWasmContent = await artifactContent(featureWasmPath);
  const featureWasmJsContent = await artifactContent(resolve(root, featureWasmPkg, 'umf_core_wasm.js'));
  artifacts.wasmRegexFeature = {
    wasmSha256: featureWasmContent.sha256,
    wasmBytes: featureWasmContent.bytes,
    jsSha256: featureWasmJsContent.sha256,
    jsBytes: featureWasmJsContent.bytes,
  };
  const browser = command(node, ['--experimental-strip-types', resolve(root, 'scripts/rust-core/browser-conformance.ts')], workspace, {
    ...process.env,
    UMF_WASM_PKG_PATH: `${featureWasmPkg}/umf_core_wasm.js`,
    UMF_WASM_REGEX_CONFORMANCE: '1',
    UMF_WASM_SCHEMA_DEPTH_CONFORMANCE: '1',
  });
  results.chromiumRegexFeatureWasm = outputRecord('real-chromium-python-regex-feature-wasm-70542-outcomes-plus-139-core-and-schema-depth-128-129', browser);
  artifacts.pythonRegexCorpus = {
    fixtureSha256: hashBytes(await readFile(resolve(root, 'crates/umf-core/tests/fixtures/cpython-re/independent-boundaries.json'))),
    outcomesSha256: hashBytes(await readFile(resolve(root, 'crates/umf-core/tests/fixtures/cpython-re/independent-outcomes.tsv'))),
    infoFixtureSha256: hashBytes(await readFile(resolve(root, 'crates/umf-core/tests/fixtures/cpython-re/independent-info-boundaries.json'))),
    infoOutcomesSha256: hashBytes(await readFile(resolve(root, 'crates/umf-core/tests/fixtures/cpython-re/independent-info-outcomes.tsv'))),
    hexFixtureSha256: hashBytes(await readFile(resolve(root, 'crates/umf-core/tests/fixtures/cpython-re/independent-hex-boundaries.json'))),
    hexOutcomesSha256: hashBytes(await readFile(resolve(root, 'crates/umf-core/tests/fixtures/cpython-re/independent-hex-outcomes.tsv'))),
  };

  const pythonWorkspace = join(workspace, 'python-wheel');
  const originalWheelDir = join(pythonWorkspace, 'wheel');
  const sdistDir = join(pythonWorkspace, 'sdist');
  await mkdir(originalWheelDir, {recursive: true});
  await mkdir(sdistDir, {recursive: true});
  const pythonBuildEnv = {...process.env, CARGO_NET_OFFLINE: 'true', RUSTUP_TOOLCHAIN: '1.90.0', UV_OFFLINE: '1'};
  results.pythonBuild = outputRecord('offline-native-wheel-and-sdist-build', command(uv, ['build', '--wheel', '--sdist', '--out-dir', originalWheelDir], resolve(root, 'python'), pythonBuildEnv));
  const originalWheel = findBinary(originalWheelDir, /\.whl$/);
  const sdist = findBinary(originalWheelDir, /\.tar\.gz$/);
  artifacts.pythonWheel = await artifactContent(originalWheel);
  artifacts.pythonSdist = await artifactContent(sdist);
  const sdistListing = command('tar', ['-tzf', sdist], workspace).stdout;
  const sdistMembers = sdistListing.split(/\r?\n/).filter(Boolean);
  const forbiddenSdistMember = /(^|\/)(?:\.git|\.venv|__pycache__|node_modules|pkg|target|\.pytest_cache)(?:\/|$)|\.(?:node|wasm|dylib|dll|so|pyc|pyo|rlib|rmeta|o|a)$/i;
  const excludedSdistMembers = sdistMembers.filter((member) => forbiddenSdistMember.test(member));
  const requiredSdistMembers = [
    'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', '.cargo/config.toml',
    'LICENSE.md', 'LICENSE-MIT', 'LICENSE-APACHE', 'crates/umf-core/src/lib.rs',
    'crates/umf-codegen/src/lib.rs', 'crates/umf-codegen/src/generation/python_runtime.py',
    'crates/umf-codegen/src/generation/table_runtime.py', 'spec/extensions/tables/operation.schema.json',
    'bindings/core/python/Cargo.toml', 'bindings/core/node/Cargo.toml', 'bindings/core/wasm/Cargo.toml',
  ];
  const missingSdistMembers = requiredSdistMembers.filter((required) =>
    !sdistMembers.some((member) => member.endsWith(`/${required}`)));
  const sdistAudit = {
    memberCount: sdistMembers.length,
    memberListSha256: hashBytes(Buffer.from(`${sdistMembers.join('\n')}\n`)),
    requiredMembers: requiredSdistMembers,
    missingRequiredMembers: missingSdistMembers,
    excludedMembers: excludedSdistMembers,
  };
  results.sdistArchiveAudit = outputRecord('sdist-source-closure-member-audit', {
    stdout: JSON.stringify(sdistAudit),
    stderr: '',
  });
  if (missingSdistMembers.length || excludedSdistMembers.length) {
    throw new Error(`Sdist archive member audit failed: ${JSON.stringify(sdistAudit)}`);
  }
  artifacts.sdistArchive = sdistAudit;
  results.pythonWheelInstall = await installPythonWheel(originalWheel, join(pythonWorkspace, 'wheel-installed'));

  const extracted = join(pythonWorkspace, 'sdist-source');
  await mkdir(extracted, {recursive: true});
  command('tar', ['-xzf', sdist, '-C', extracted], workspace);
  const sdistPackage = (await readdir(extracted, {withFileTypes: true})).find((entry) => entry.isDirectory());
  if (!sdistPackage) throw new Error('Could not locate unpacked Python sdist root');
  const sdistRoot = join(extracted, sdistPackage.name);
  const sdistWheelDir = join(pythonWorkspace, 'sdist-wheel');
  await mkdir(sdistWheelDir, {recursive: true});
  const noJsTools = await createNoJavascriptToolPath(join(workspace, 'no-javascript-tools'));
  const noJsPath = noJsTools.path;
  const sdistEnv = {...process.env, PATH: noJsPath, CARGO: cargo, PYO3_PYTHON: python, CARGO_NET_OFFLINE: 'true', RUSTUP_TOOLCHAIN: '1.90.0', UV_OFFLINE: '1'};
  results.noJavascriptPath = {status: 'pass', path: noJsPath, entries: noJsTools.entries, verification: noJsTools.verification};
  results.sdistWheelBuild = outputRecord('offline-no-javascript-wheel-from-sdist', command(uv, ['build', '--wheel', '--out-dir', sdistWheelDir], sdistRoot, sdistEnv));
  const sdistWheel = findBinary(sdistWheelDir, /\.whl$/);
  artifacts.sdistBuiltWheel = await artifactContent(sdistWheel);
  results.pythonSdistInstall = await installPythonWheel(sdistWheel, join(pythonWorkspace, 'sdist-installed'));

  const sourceAfter = await sourceClosure();
  if (sourceAfter.digest !== sourceBefore.digest) throw new Error('R3 source closure changed during qualification; do not issue a mixed-source receipt');
  const receipt = {
    id: 'umf.rust-migration.r3.production-host-qualification',
    status: 'pass',
    capturedAt: new Date().toISOString(),
    sourceCommit: commit,
    sourceClosureSha256: sourceBefore.digest,
    sourceFileHashes: sourceBefore.entries,
    gitStatusAtStart: statusAtStart,
    runtime: {runner: process.version, node: nodeVersion, bun: (await command(bun, ['--version'], workspace)).stdout, python, rust: (await command(cargo, ['--version'], root)).stdout.trim()},
    fixtureSha256: hashBytes(await readFile(fixture)),
    artifacts,
    qualificationInputs: {
      schemaAdmission: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/schema-admission-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/schema-admission-predecessor.json'))),
      },
      schemaSuiteOutcomes: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/schema-suite-predecessor-outcomes.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/schema-suite-predecessor-outcomes.json'))),
        upstreamCommit: '89e83a74014617ffbe79a56d83d14d054cd11417',
      },
      pythonSchemaArithmeticOutcomes: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-predecessor.json'))),
        cases: 648,
      },
      pythonSchemaArithmeticEdgeOutcomes: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-edges-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-edges-predecessor.json'))),
        cases: 1938,
      },
      pythonSchemaArithmeticDecision: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-decision.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-decision.json'))),
      },
      pythonSchemaArithmeticCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-profiles.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-arithmetic-profiles.json'))),
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        sharedExpectedCases: 2586,
      },
      pythonSchemaEvaluationOrderDecision: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-decision.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-decision.json'))),
      },
      pythonSchemaRecursiveResourceScope: {
        predecessor: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-predecessor.json',
          sha256: 'c67b6602a40235a9202a00082949e6a9a8af3db1aee614110275afb303de9b15',
          cases: 89,
          admittedCases: 85,
          methodObservations: 255,
          constructorRefusals: 4,
        },
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-profiles.json',
          sha256: 'c9953569f226700e7b03bb4529981ae644649e11e40b09597fc86b2d4c703f54',
          confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
          sharedExpectedCases: 89,
          sharedExpectedMethods: 255,
        },
        design: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-design.json',
          sha256: '8a4d6da41bfabefae4ef6e8d31f755bd7336c4bb831a61cb581f9dfd6983acea',
        },
        clarification: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-recursive-resource-scope-clarification.json',
          sha256: 'a1ee054a022d62e36ed9bbb67c61b87f31afa29251dd649efdc6e97aa3feffb7',
          constructionRefusalRows: 4,
          runtimeUnresolvedPointerRows: 6,
          runtimeMethodObservations: 18,
        },
      },
      pythonSchemaResourceIdentityCompanion: {
        predecessor: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-identity-companion-predecessor.json',
          sha256: '75f772e29f3776969739c423c98b722f9597895bd6e2c215e4fe7f7c3fc44609',
          cases: 114,
          methodObservations: 342,
          constructorRefusals: 0,
          runtimeTerminals: 0,
        },
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-identity-companion-profiles.json',
          sha256: '24ad0adb3e80654d9ce105c84ffcb19f1467d124aa28aa85f81bfca1ab5ea103',
          confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
          sharedExpectedCases: 114,
          sharedExpectedMethods: 342,
          uriAdmissionProfileEqual: true,
        },
        design: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-identity-design.json',
          sha256: '18832e1b97dc010fbee2418865541cc2c23f9468441821ed384d8a248b155b88',
        },
      },
      pythonSchemaResourceAnchorCompanion: {
        predecessor: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-anchor-companion-predecessor.json',
          sha256: 'ba8357b3d85b64edefea6f57b3ca91872ef8053d3182406ee7543af5bbd2f2d5',
          cases: 24,
          methodObservations: 72,
          constructorRefusals: 0,
          runtimeTerminals: 0,
        },
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-anchor-companion-profiles.json',
          sha256: '2b0502daba9e9d04d3e72da71ea2c8c325cbee3242b11de0e6a7885eccbe084d',
          confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
          sharedExpectedCases: 24,
          sharedExpectedMethods: 72,
          uriAdmissionProfileEqual: true,
        },
        representation: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-identity-representation.json',
          sha256: '7d657027d557ad143e8e057c0b9821909f641deedd85ff554ce0700a4712265f',
        },
      },
      pythonSchemaResourceUriOperations: {
        predecessor: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-uri-operations-predecessor.json',
          sha256: 'e79cdee8693892517cc372f9b5b05d902199e78b734175bf10359baadeabfae9',
          cases: 24,
          methodObservations: 72,
          constructorRefusals: 0,
          nativeUriOperationCases: 140,
        },
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-uri-operations-profiles.json',
          sha256: '1017a9140607d05e84c8f5998cb23ebcb8b4cc3d97cb3c78f691da50768e86fb',
          confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
          sharedExpectedCases: 24,
          sharedExpectedMethods: 72,
          uriOperations: 140,
        },
        independentReview: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-uri-operations-independent-review.json',
          sha256: 'b859d271d81252dfc66e74e6ee1557c85e0878f568b75bd1211f96cc0daf98d2',
        },
        generator: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/freeze-python-resource-uri-operations.py',
          sha256: 'db2a75afe2d98c13f6c1def642c1e029198c800efd701d14cb90bfd1c1399fd8',
        },
      },
      pythonSchemaEvaluationOrderOutcomes: [
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-predecessor.json'))),
          cases: 792,
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-ordinary-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-ordinary-predecessor.json'))),
          cases: 264,
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-yield-boundaries-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-yield-boundaries-predecessor.json'))),
          cases: 226,
          methodObservations: 675,
          schemaAdmissionRefusals: 1,
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-reach-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-reach-predecessor.json'))),
          cases: 96,
          methodObservations: 285,
          schemaAdmissionRefusals: 1,
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-predecessor.json'))),
          cases: 140,
          methodObservations: 393,
          schemaAdmissionRefusals: 9,
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-2019-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-2019-predecessor.json'))),
          cases: 28,
          methodObservations: 81,
          schemaAdmissionRefusals: 1,
          targetStatus: 'frozen predecessor baseline; no correction applied',
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-order-predecessor.json',
          sha256: '47bd4de4cc8c6d3b15c187694e93a443e40ab878610133f10399f8c0ebb32c5c',
          cases: 53,
          methodObservations: 159,
          schemaAdmissionRefusals: 0,
          targetStatus: 'frozen predecessor baseline; no correction applied',
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-metadata-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-metadata-predecessor.json'))),
          cases: 63,
          errorObservations: 51,
          schemaAdmissionRefusals: 1,
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-native.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-native.json'))),
          cases: 37,
          methodObservations: 108,
          schemaAdmissionRefusals: 1,
          role: 'native baseline for reviewed correction selection; original 28 legacy rows equal their frozen predecessor fixture',
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-target-proposal.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-target-proposal.json'))),
          cases: 37,
          methodObservations: 108,
          schemaAdmissionRefusals: 1,
          role: 'approved target selected only for eight changed case IDs and 21 listed methods',
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-keys-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-keys-predecessor.json'))),
          cases: 132,
          errorObservations: 132,
          admissionRefusals: 0,
          role: 'exact ordinary typed Python schema key values, including slash, tilde, numeric-string, empty, marker-shaped and astral keys',
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subjects-predecessor.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subjects-predecessor.json'))),
          cases: 63,
          errorObservations: 38,
          schemaAdmissionRefusals: 11,
          runtimeErrorObservations: 6,
        },
        {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-unordered-targets.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-unordered-targets.json'))),
          cases: 36,
          methodObservations: 108,
          reviewedCorrection: 'R2-SOL-CORRECTION-003',
        },
      ],
      pythonSchemaEvaluationOrderCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-profiles.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-profiles.json'))),
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        sharedMethodObservations: 3168,
      },
      pythonSchemaResourceUriOperationsProfiles: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-resource-uri-operations-profiles.json',
        sha256: '1017a9140607d05e84c8f5998cb23ebcb8b4cc3d97cb3c78f691da50768e86fb',
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        publicCases: 24,
        sharedMethodObservations: 72,
        nativeUriOperationCases: 140,
      },
      pythonSchemaYieldBoundariesCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-yield-boundaries-profiles.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-yield-boundaries-profiles.json'))),
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        cases: 226,
        sharedMethodObservations: 675,
        schemaAdmissionRefusals: 1,
      },
      pythonSchemaAnnotationReachCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-reach-profiles.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-reach-profiles.json'))),
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        cases: 96,
        sharedMethodObservations: 285,
        schemaAdmissionRefusals: 1,
      },
      pythonSchemaAnnotationMechanismCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-profiles.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-profiles.json'))),
        receiptId: 'R2-SOL-PYTHON-SCHEMA-ANNOTATION-MECHANISM-PROFILES-001',
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        fixtures: [
          {file: 'sol-python-schema-annotation-mechanism-predecessor.json', sha256: '787391e56f71759bf4b39542210466fca06d47ccd95b195529ddceed6e204008', cases: 140, methodObservations: 393, schemaAdmissionRefusals: 9},
          {file: 'sol-python-schema-annotation-mechanism-2019-predecessor.json', sha256: '42e39726fe537b4f39d5bf1c691d598dd14aa51e4ca4e4f4b5299b4e7fcbfce8', cases: 28, methodObservations: 81, schemaAdmissionRefusals: 1},
        ],
      },
      pythonSchemaAnnotationOrderCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-order-profiles.json',
        sha256: '08a25a650d341ce56f781f92c6ed598958ee9fd6fd0063d0dd6c99326bb040b0',
        receiptId: 'R2-SOL-PYTHON-SCHEMA-ANNOTATION-ORDER-PROFILES-001',
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        cases: 53,
        sharedMethodObservations: 159,
        schemaAdmissionRefusals: 0,
        completeRecordsEqual: true,
        profileCaptures: {
          '3.12.15': '7c74450985180353d1e454c8d36baf7ae8ea45313a04a1bcd3d811c163fd5af9',
          '3.13.16': 'd6c3077d68e9a794a729607d5380a826d79e57e95117b1c2ca309911f07537fe',
        },
      },
      pythonSchema2019AdditionalPropertiesCorrection: {
        decision: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/approved-python-schema-2019-ap-correction.json',
          sha256: 'e4f8210cbea8959d20dfd738791fe3a214564c8f7e90c7967e7bc499bc1d21f2',
          id: 'R2-SOL-CORRECTION-001-AMENDMENT-001',
          selectedRows: 8,
          selectedMethods: 21,
        },
        native: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-native.json',
          sha256: '8666440936228516f5357d1776a26c69189bf6843139607c56c63da2c2128d07',
        },
        target: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-target-proposal.json',
          sha256: '68807db9a1256d2e2f1ed9598ac99db40e39c83a3d5407b7cc947ee4a0d907f3',
        },
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-target-profiles.json',
          sha256: '13971ee20ac08bda3ec5f6e4eb3a1035d98e1b58b92bdfd186ee8c31acaeae56',
          confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
          cases: 37,
          methodObservations: 108,
          schemaAdmissionRefusals: 1,
        },
        selection: 'Use approved target outcomes only for listed case ID and method pairs; require all remaining target/native methods and every admission outcome to match the immutable predecessor baseline.',
      },
      pythonSchemaErrorMetadataCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-metadata-profiles.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-metadata-profiles.json'))),
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        cases: 63,
        sharedErrorObservations: 51,
        schemaAdmissionRefusals: 1,
      },
      pythonSchemaErrorSubjectsCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subjects-profiles.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subjects-profiles.json'))),
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        cases: 63,
        sharedErrorObservations: 38,
        schemaAdmissionRefusals: 11,
        runtimeErrorObservations: 6,
        phaseReceipt: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subject-phases.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subject-phases.json'))),
          receiptId: 'R2-SOL-PYTHON-SCHEMA-ERROR-SUBJECT-PHASES-001',
          constructionRefusals: 11,
          admittedRuntimeFailures: 2,
          runtimeErrorObservations: 6,
        },
      },
      pythonSchemaUnorderedTargetsCrossVersionConfirmation: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-unordered-targets-profiles.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-unordered-targets-profiles.json'))),
        confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        cases: 36,
        sharedMethodObservations: 108,
        reviewedCorrection: 'R2-SOL-CORRECTION-003',
      },
      pythonSchemaUnorderedTargetsCorrection: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/approved-python-schema-unordered-extras-correction.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/approved-python-schema-unordered-extras-correction.json'))),
        id: 'R2-SOL-CORRECTION-003',
      },
      pythonSchemaReferenceTerminals: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-terminals-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-terminals-predecessor.json'))),
        cases: 363,
        methodObservations: 1089,
        admissionRefusals: 0,
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-terminals-profiles.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-terminals-profiles.json'))),
        },
        decision: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-terminal-decision.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-terminal-decision.json'))),
          id: 'R2-SOL-PYTHON-SCHEMA-REFERENCE-TERMINALS-001',
        },
      },
      pythonSchemaReferenceIndices: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-indices-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-indices-predecessor.json'))),
        cases: 315,
        methodObservations: 945,
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-indices-profiles.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-indices-profiles.json'))),
        },
        profileAmendment: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-profile-amendment.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-reference-profile-amendment.json'))),
          id: 'R2-SOL-PYTHON-SCHEMA-REFERENCE-PROFILE-002',
        },
      },
      pythonSchemaPathSegments: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-segments-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-segments-predecessor.json'))),
        cases: 48,
        errorObservations: 42,
        admissionRefusals: 1,
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-segments-profiles.json',
          sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-segments-profiles.json'))),
        },
      },
      pythonSchemaPathKeys: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-keys-predecessor.json',
        sha256: 'e9151ff4ae770e372b7251b897fa1278b88f77da47c13ebfcd72d8314c74bbd9',
        cases: 132,
        errorObservations: 132,
        admissionRefusals: 0,
        profiles: {
          path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-path-keys-profiles.json',
          sha256: '05c89f3719d2686800e866feb436b9291d9572e50b4d26390dcede3605f74fc5',
          receiptId: 'R2-SOL-PYTHON-SCHEMA-PATH-KEYS-PROFILES-001',
          confirmedPython: ['3.11.17', '3.12.15', '3.13.16'],
        },
      },
      pythonSerializationDecision: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-production-decision.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-production-decision.json'))),
      },
      pythonSerializationOutcomes: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-predecessor-boundaries.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-predecessor-boundaries.json'))),
      },
      pythonSerializationOrderingAmendment: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-ordering-amendment.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-ordering-amendment.json'))),
      },
      pythonSerializationOrderingOutcomes: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-ordering-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-serialization-ordering-predecessor.json'))),
      },
      pythonYamlScalarOutcomes: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-scalar-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-scalar-predecessor.json'))),
      },
      pythonYamlCharacterOutcomes: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-character-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-character-predecessor.json'))),
      },
      approvedPythonYamlNelCorrection: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/approved-python-yaml-nel-correction.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/approved-python-yaml-nel-correction.json'))),
      },
      pythonYamlDirectiveTailOutcomes: {
        path: 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-directive-tail-predecessor.json',
        sha256: hashBytes(await readFile(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2/sol-python-yaml-directive-tail-predecessor.json'))),
      },
    },
    results,
    qualifications: {
      python: 'wheel install and wheel rebuilt from sdist, outside checkout; full public Python suite, frozen 139 and host controls, 9,282 schema admission decisions, official JSON Schema outcome controls, 2,586 Python numeric schema predecessor cases, 7,671 Python schema evaluation-order/reference/annotation/resource-scope/resource-identity/anchor/URI public method observations including the approved narrow legacy2019 additionalProperties correction, 263 error metadata/subject/path records, and 6 runtime TypeError observations with phase attribution',
      javascript: 'npm-packed native addon installed outside checkout, tested under Node and Bun',
      browser: 'real Chromium qualifies the default shipped WASM separately for 139 boundaries and the conformance-feature WASM for 70,542 frozen Python regex outcomes plus the 139 core boundaries, with no external requests',
      cli: 'native binary validated against the frozen 139 corpus with PATH empty',
      resourceProfile: 'cooperative host controls exercised; HardIsolated remains refused before work',
    },
  };
  await mkdir(dirname(receiptPath), {recursive: true});
  const tempReceipt = `${receiptPath}.tmp`;
  await writeFile(tempReceipt, `${JSON.stringify(receipt, null, 2)}\n`, {flag: 'w'});
  await rm(receiptPath, {force: true});
  await (await import('node:fs/promises')).rename(tempReceipt, receiptPath);
  process.stdout.write(`${JSON.stringify({status: 'pass', receipt: relative(root, receiptPath), sourceClosureSha256: sourceBefore.digest, hostRuns: Object.keys(results)}, null, 2)}\n`);
} finally {
  await rm(workspace, {recursive: true, force: true});
}
