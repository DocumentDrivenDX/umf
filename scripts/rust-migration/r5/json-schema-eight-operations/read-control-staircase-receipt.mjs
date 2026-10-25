// SPDX-License-Identifier: MIT OR Apache-2.0
// Verify a compressed control-staircase receipt and optionally restore the
// exact uncompressed JSON named by predecessor-manifest.json.
import {createHash} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {readFile, rename, rm, stat} from 'node:fs/promises';
import {createGunzip} from 'node:zlib';
import {dirname, resolve} from 'node:path';
import {Transform, Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const [manifestPath, compressedRelativePath, outputPath] = process.argv.slice(2);
if (!manifestPath || !compressedRelativePath) {
  throw new Error('usage: read-control-staircase-receipt.mjs predecessor-manifest.json receipts/name.json.gz [restored.json]');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const metadata = manifest.preparedRuntimeCohort?.compressedReceiptArtifacts?.[compressedRelativePath];
if (!metadata || metadata.compression !== 'gzip') {
  throw new Error(`No gzip receipt metadata for ${compressedRelativePath}`);
}

const compressedPath = resolve(dirname(manifestPath), compressedRelativePath);
const compressedStat = await stat(compressedPath);
const compressedHash = createHash('sha256');
const uncompressedHash = createHash('sha256');
let compressedBytes = 0;
let uncompressedBytes = 0;
const temporaryOutput = outputPath ? `${outputPath}.partial-${process.pid}` : null;
if (outputPath) {
  try {
    await stat(outputPath);
    throw new Error(`Refusing to overwrite existing output ${outputPath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const compressedMeter = new Transform({
  transform(chunk, _encoding, callback) {
    compressedBytes += chunk.length;
    compressedHash.update(chunk);
    callback(null, chunk);
  },
});
const uncompressedMeter = new Transform({
  transform(chunk, _encoding, callback) {
    uncompressedBytes += chunk.length;
    uncompressedHash.update(chunk);
    callback(null, chunk);
  },
});
const sink = outputPath
  ? createWriteStream(temporaryOutput, {flags: 'wx'})
  : new Writable({write(_chunk, _encoding, callback) { callback(); }});

try {
  await pipeline(createReadStream(compressedPath), compressedMeter, createGunzip(), uncompressedMeter, sink);
  const observed = {
    compressedSha256: compressedHash.digest('hex'),
    compressedBytes,
    uncompressedSha256: uncompressedHash.digest('hex'),
    uncompressedBytes,
  };
  for (const [field, value] of Object.entries(observed)) {
    if (metadata[field] !== value) throw new Error(`${field} mismatch: expected ${metadata[field]}, observed ${value}`);
  }
  if (compressedStat.size !== metadata.compressedBytes) {
    throw new Error(`compressed file size mismatch: expected ${metadata.compressedBytes}, observed ${compressedStat.size}`);
  }
  if (outputPath) await rename(temporaryOutput, outputPath);
  console.log(JSON.stringify({status: 'verified', compressedPath, ...observed, ...(outputPath ? {outputPath} : {})}));
} catch (error) {
  if (temporaryOutput) await rm(temporaryOutput, {force: true});
  throw error;
}
