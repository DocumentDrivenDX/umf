// SPDX-License-Identifier: MIT OR Apache-2.0
// Shared fail-closed artifact and JSON identity helpers for the five schema
// graph default-route replays.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const OPERATIONS = Object.freeze([
  {name:'generateDomainPackSchema', provider:'domainPackSchemaGraphJson', wasmExport:'domain_pack_schema_graph_json'},
  {name:'generateDatasetSourceSchema', provider:'datasetSourceSchemaGraphJson', wasmExport:'dataset_source_schema_graph_json'},
  {name:'generateArtifactCollectionSchema', provider:'artifactCollectionSchemaGraphJson', wasmExport:'artifact_collection_schema_graph_json'},
  {name:'generateDomainPackLoaderSchema', provider:'domainPackLoaderSchemaGraphJson', wasmExport:'domain_pack_loader_schema_graph_json'},
  {name:'generateLoaderInventorySchema', provider:'loaderInventorySchemaGraphJson', wasmExport:'loader_inventory_schema_graph_json'},
]);

const HEX = /^[a-f0-9]{64}$/;
const MAX_ERROR = 600;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function fail(message) {
  throw new Error(String(message).slice(0, MAX_ERROR));
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!flag.startsWith('--') || index + 1 >= args.length) fail(`Invalid argument near ${flag}`);
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) fail(`Duplicate option --${key}`);
    options[key] = args[++index];
  }
  for (const key of ['input','artifact-sha256','package-json-sha256','source-closure-sha256']) {
    if (!options[key]) fail(`Missing --${key}`);
  }
  for (const key of ['artifact-sha256','package-json-sha256','source-closure-sha256']) {
    if (!HEX.test(options[key])) fail(`--${key} must be a lowercase SHA-256`);
  }
  if (options['package-manifest-sha256'] && !HEX.test(options['package-manifest-sha256'])) fail('--package-manifest-sha256 must be a lowercase SHA-256');
  return options;
}

export function parseReplayOptions(args = process.argv.slice(2)) {
  return parseOptions(args);
}

async function findPackageRoot(fromPath) {
  let current = resolve(fromPath);
  for (;;) {
    try {
      const info = await stat(join(current, 'package.json'));
      if (info.isFile()) return current;
    } catch {}
    const parent = dirname(current);
    if (parent === current) fail(`No package.json is an ancestor of ${fromPath}`);
    current = parent;
  }
}

function safeArchiveListing(archivePath) {
  const verbose = execFileSync('tar', ['-tvzf', archivePath], {encoding:'utf8', maxBuffer:16 * 1024 * 1024});
  const names = execFileSync('tar', ['-tzf', archivePath], {encoding:'utf8', maxBuffer:16 * 1024 * 1024}).split(/\r?\n/).filter(Boolean);
  for (const line of verbose.split(/\r?\n/).filter(Boolean)) {
    const type = line[0];
    if (!['-','d'].includes(type)) fail('SDK archive contains a non-regular member');
  }
  for (const name of names) {
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..')) fail('SDK archive has an unsafe member path');
  }
}

function packageExportTarget(packageJson, key, condition) {
  const value = packageJson.exports?.[key];
  const target = typeof value === 'string' ? value : value?.[condition] ?? value?.import;
  if (typeof target !== 'string' || target.startsWith('../') || target.startsWith('/')) fail(`Package export ${key}.${condition} is not a local target`);
  return target.replaceAll('\\','/');
}

export async function openArtifact(options, {requireBrowser = false} = {}) {
  const inputPath = resolve(options.input);
  let packageRoot;
  let dist;
  let tempRoot = null;
  let artifactSha;
  const inputInfo = await stat(inputPath).catch(() => null);
  if (!inputInfo) fail(`Input does not exist: ${inputPath}`);
  if (inputInfo.isDirectory()) {
    dist = await stat(join(inputPath, 'rust-default-manifest.json')).then(info => info.isFile() ? inputPath : null).catch(() => null);
    if (dist) packageRoot = await findPackageRoot(dirname(dist));
    else {
      packageRoot = inputPath;
      dist = join(packageRoot, 'dist');
      if (!(await stat(join(dist, 'rust-default-manifest.json')).catch(() => null))) fail('Directory must be a Rust SDK dist or package root');
    }
    artifactSha = sha256(await readFile(join(dist, 'rust-default-manifest.json')));
  } else {
    const archiveBytes = await readFile(inputPath);
    artifactSha = sha256(archiveBytes);
    if (artifactSha !== options['artifact-sha256']) fail('SDK archive SHA-256 mismatch');
    safeArchiveListing(inputPath);
    tempRoot = await mkdtemp(join(tmpdir(), 'umf-schema-graph-route-'));
    execFileSync('tar', ['-xzf', inputPath, '-C', tempRoot, '--no-same-owner', '--no-same-permissions'], {stdio:'ignore'});
    packageRoot = join(tempRoot, 'package');
    dist = join(packageRoot, 'dist');
    if (!(await stat(join(dist, 'rust-default-manifest.json')).catch(() => null))) fail('Archive lacks package/dist/rust-default-manifest.json');
    if (!options['package-manifest-sha256']) fail('Archive input requires --package-manifest-sha256');
    const archiveManifest = await readFile(join(packageRoot,'manifest.json'));
    if (sha256(archiveManifest) !== options['package-manifest-sha256']) fail('package/manifest.json SHA-256 mismatch');
    const archiveIndex = JSON.parse(archiveManifest.toString('utf8'));
    const listed = archiveIndex.sha256;
    if (!listed || typeof listed !== 'object' || Array.isArray(listed)) fail('Archive package manifest has no SHA-256 member map');
    for (const [member, expectedHash] of Object.entries(listed)) {
      if (!HEX.test(expectedHash) || member.startsWith('/') || /^[A-Za-z]:/.test(member) || member.split('/').includes('..')) fail('Archive package manifest has an unsafe member');
      const file = resolve(packageRoot,member);
      if (!file.startsWith(packageRoot + sep)) fail('Archive package manifest member escaped package root');
      if (sha256(await readFile(file)) !== expectedHash) fail(`Archive package member hash mismatch: ${member}`);
    }
  }

  try {
    const packageBytes = await readFile(join(packageRoot, 'package.json'));
    const packageSha = sha256(packageBytes);
    if (packageSha !== options['package-json-sha256']) fail('package.json SHA-256 mismatch');
    const packageJson = JSON.parse(packageBytes.toString('utf8'));
    const manifestBytes = await readFile(join(dist, 'rust-default-manifest.json'));
    const manifestSha = sha256(manifestBytes);
    if (inputInfo.isDirectory() && manifestSha !== options['artifact-sha256']) fail('Rust default manifest SHA-256 mismatch');
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.format !== 'umf.r7-rust-sdk-default/1' || manifest.profile !== 'umf.python-client-host-read/4') fail('Unexpected Rust SDK manifest format/profile');
    const closure = manifest.sourceClosure;
    if (closure?.sha256 !== options['source-closure-sha256']
        || closure?.capturedLiveSha256 !== options['source-closure-sha256']
        || closure?.transform?.status !== 'fixed-point'
        || !Array.isArray(closure.transform.generatedInputs)
        || closure.transform.generatedInputs.length !== 0) fail('Source closure is not the requested zero-transform fixed point');
    if (!manifest.assets || typeof manifest.assets !== 'object' || Array.isArray(manifest.assets) || Object.keys(manifest.assets).length < 1) fail('Rust SDK manifest has no asset map');
    for (const [member, expectedHash] of Object.entries(manifest.assets)) {
      if (!HEX.test(expectedHash) || member.startsWith('/') || member.split('/').includes('..')) fail('Rust SDK manifest contains an invalid asset entry');
      const assetPath = member.startsWith('dist/')
        ? resolve(dist, member.slice('dist/'.length))
        : resolve(packageRoot, member);
      const assetBase = member.startsWith('dist/') ? dist : packageRoot;
      if (!assetPath.startsWith(assetBase + sep)) fail('Rust SDK asset escaped package root');
      if (sha256(await readFile(assetPath)) !== expectedHash) fail(`SDK asset hash mismatch: ${member}`);
    }
    const nodeTarget = packageExportTarget(packageJson, '.', 'node');
    const browserTarget = packageExportTarget(packageJson, '.', 'browser');
    const referenceTarget = packageExportTarget(packageJson, './reference', 'import');
    const normalizeTarget = target => target.startsWith('./') ? target.slice(2) : target;
    if (normalizeTarget(nodeTarget) !== 'dist/umf-node.js') fail(`Node export must target dist/umf-node.js, got ${nodeTarget}`);
    if (normalizeTarget(browserTarget) !== 'dist/umf-browser.js') fail(`Browser export must target dist/umf-browser.js, got ${browserTarget}`);
    if (normalizeTarget(referenceTarget) !== 'dist/umf.js') fail(`Reference export must target dist/umf.js, got ${referenceTarget}`);
    const distFiles = {
      node: join(dist, basename(nodeTarget)),
      browser: join(dist, basename(browserTarget)),
      reference: join(dist, basename(referenceTarget)),
      wasm: join(dist, 'umf_core_wasm_bg.wasm'),
      addon: join(dist, 'umf_core_node.node'),
    };
    for (const [name, file] of Object.entries(distFiles)) {
      if (name === 'wasm' && !requireBrowser) continue;
      if (!(await stat(file).catch(() => null))) fail(`SDK dist lacks ${name} artifact`);
    }
    if (requireBrowser && !Object.values(manifest.assets).includes(sha256(await readFile(distFiles.wasm)))) fail('Adjacent WASM is not pinned by the SDK manifest');
    return {
      packageRoot, dist, packageJson, manifest, manifestSha, packageSha, packageManifestSha256:options['package-manifest-sha256']??null, artifactSha, sourceClosureSha256: closure.sha256,
      files: distFiles,
      cleanup: async () => { if (tempRoot) await rm(tempRoot, {recursive:true,force:true}); },
    };
  } catch (error) {
    if (tempRoot) await rm(tempRoot, {recursive:true,force:true});
    throw error;
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function escapePointerPart(part) {
  return String(part).replaceAll('~','~0').replaceAll('/','~1');
}

function decodePointerPart(part) {
  return part.replaceAll('~1','/').replaceAll('~0','~');
}

export function getPointer(root, pointer) {
  if (pointer === '') return root;
  if (!pointer.startsWith('/')) fail(`Invalid JSON Pointer in provider graph: ${pointer}`);
  return pointer.slice(1).split('/').map(decodePointerPart).reduce((value, part) => value?.[part], root);
}

export function identityAliasClasses(root) {
  const paths = new WeakMap();
  const active = new WeakSet();
  const visit = (value, pointer) => {
    if (value === null || typeof value !== 'object') return;
    const locations = paths.get(value) ?? [];
    locations.push(pointer);
    paths.set(value, locations);
    if (active.has(value)) return;
    active.add(value);
    if (Array.isArray(value)) value.forEach((child,index) => visit(child, `${pointer}/${index}`));
    else for (const key of Object.keys(value)) visit(value[key], `${pointer}/${escapePointerPart(key)}`);
    active.delete(value);
  };
  visit(root, '');
  const groups = [];
  const seen = new WeakSet();
  const collect = value => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const locations = paths.get(value);
    if (locations?.length > 1) groups.push([...locations].sort());
    if (Array.isArray(value)) value.forEach(collect);
    else Object.keys(value).forEach(key => collect(value[key]));
  };
  collect(root);
  return groups.sort((left,right) => left[0].localeCompare(right[0]));
}

export function validateGraph(graphText, actual, reference, operationName) {
  let graph;
  try { graph = JSON.parse(graphText); } catch { fail(`${operationName} provider returned malformed JSON`); }
  if (!graph || typeof graph !== 'object' || !graph.schema || !Array.isArray(graph.aliasGroups)) fail(`${operationName} provider returned an invalid schema graph`);
  if (canonicalJson(actual) !== canonicalJson(reference)) fail(`${operationName} default/reference JSON differs`);
  if (canonicalJson(graph.schema) !== canonicalJson(actual)) fail(`${operationName} provider schema differs from public default`);
  const expectedAliases = identityAliasClasses(reference);
  const actualAliases = identityAliasClasses(actual);
  const wireAliases = graph.aliasGroups.map(group => {
    if (!Array.isArray(group) || group.length < 2) fail(`${operationName} provider has a malformed alias group`);
    const values = group.map(pointer => getPointer(graph.schema,pointer));
    if (values.some(value => value === null || typeof value !== 'object')) fail(`${operationName} alias path does not resolve to an object`);
    if (values.some(value => canonicalJson(value) !== canonicalJson(values[0]))) fail(`${operationName} alias values differ`);
    return [...group].sort();
  }).sort((left,right) => left[0].localeCompare(right[0]));
  if (canonicalJson(actualAliases) !== canonicalJson(expectedAliases)) fail(`${operationName} public identity classes differ from TypeScript predecessor`);
  if (canonicalJson(wireAliases) !== canonicalJson(expectedAliases)) fail(`${operationName} Rust graph alias classes differ from TypeScript predecessor`);
  return {graph, expectedAliases};
}

export function verifyMutationAndFreshInstance(first, second, reference, aliasGroups, operationName) {
  if (first === second) fail(`${operationName} returned a reused top-level schema`);
  if (canonicalJson(second) !== canonicalJson(reference)) fail(`${operationName} second instance differs from predecessor`);
  for (let index = 0; index < aliasGroups.length; index++) {
    const group = aliasGroups[index];
    const firstValue = getPointer(first, group[0]);
    if (!firstValue || typeof firstValue !== 'object') fail(`${operationName} alias group has a non-object source`);
    const marker = `__umf_schema_graph_probe_${index}__`;
    firstValue[marker] = true;
    for (const pointer of group) if (getPointer(first,pointer) !== firstValue || getPointer(first,pointer)[marker] !== true) fail(`${operationName} alias mutation did not propagate`);
  }
  if (canonicalJson(second) !== canonicalJson(reference)) fail(`${operationName} mutation escaped into a fresh instance`);
  return {freshInstance:true,mutationPropagation:true,groups:aliasGroups.length};
}

export async function importEntrypoint(filePath) {
  return import(pathToFileURL(resolve(filePath)).href);
}
