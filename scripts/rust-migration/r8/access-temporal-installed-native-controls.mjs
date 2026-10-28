import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const packageRoot = path.resolve(process.argv[2]);
const temp = await mkdtemp(path.join(tmpdir(), 'umf-installed-native-controls-'));
try {
  const dist = path.join(temp, 'dist');
  await (await import('node:fs/promises')).mkdir(dist, {recursive: true});
  for (const name of ['umf-node.js', 'umf_core_node.node']) {
    await cp(path.join(packageRoot, 'dist', name), path.join(dist, name));
  }
  const addon = path.join(dist, 'umf_core_node.node');
  const entry = path.join(dist, 'umf-node.js');
  const invoke = async suffix => {
    const api = await import(`${pathToFileURL(entry).href}?${suffix}=${Date.now()}-${Math.random()}`);
    return api.parseAccessTemporal('date', '2024-01-01');
  };

  const missingPath = `${addon}.saved`;
  await rename(addon, missingPath);
  let missingError;
  try { await invoke('missing'); } catch (error) { missingError = `${error.name}: ${error.message}`; }
  assert.match(missingError ?? '', /Cannot find module|cannot find module/i);
  await rename(missingPath, addon);

  const original = await readFile(addon);
  await writeFile(addon, Buffer.alloc(original.length));
  let corruptError;
  try { await invoke('corrupt'); } catch (error) { corruptError = `${error.name}: ${error.message}`; }
  assert.match(corruptError ?? '', /not valid mach-o|invalid|dlopen/i);
  console.log(JSON.stringify({
    runtime: `Node ${process.version}`, missingNativeFailsClosed: true,
    missingNativeError: missingError, corruptNativeFailsClosed: true,
    corruptNativeError: corruptError, typescriptFallback: false,
  }));
} finally {
  await rm(temp, {recursive: true, force: true});
}
