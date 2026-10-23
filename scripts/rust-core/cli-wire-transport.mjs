// SPDX-License-Identifier: MIT OR Apache-2.0
/** Deliver one exact UTF-8 wire request to a bounded native CLI process. */
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {chmod, mkdtemp, open, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';

export class CliWireTransportError extends Error {
  constructor(code, message, details = {}) {
    super(message, details.cause ? {cause: details.cause} : undefined);
    this.name = 'CliWireTransportError';
    this.code = code;
    this.details = details;
  }
}

function signalProcessGroup(child) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      try { child.kill('SIGKILL'); } catch { /* Preserve the original transport failure. */ }
    }
  }
}

function diagnostic(label, event, fields) {
  const identity = typeof label === 'string' ? label : 'cli';
  process.stderr.write(`${JSON.stringify({event, label: identity, ...fields})}\n`);
}

/**
 * Run a CLI with a closed, read-only stdin file descriptor so EOF is explicit.
 * POSIX process groups let timeout and output-limit failures reap descendants
 * that inherit the child pipes as well as the direct child.
 */
export async function runCliWire({
  command,
  args,
  wireBytes,
  cwd,
  env,
  maxBuffer,
  timeoutMs,
  label,
  tempRoot = tmpdir(),
}) {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new CliWireTransportError('UNSUPPORTED_PLATFORM', 'Bounded CLI wire transport is qualified only on POSIX macOS and Linux');
  }
  if (typeof command !== 'string' || command.length === 0 || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('CLI command and arguments must be explicit strings');
  }
  if (!Buffer.isBuffer(wireBytes)) throw new TypeError('wireBytes must be a Buffer');
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 1) throw new TypeError('maxBuffer must be a positive safe integer');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('timeoutMs must be a positive safe integer');

  const startedAt = performance.now();
  const wireSha256 = createHash('sha256').update(wireBytes).digest('hex');
  let tempDirectory;
  let writer;
  let input;
  let child;
  let closePromise;
  let timer;
  let timedOut = false;
  let outputOverflow = false;
  let spawnError;
  let resultStatus = null;
  let resultSignal = null;
  let staging;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const stdoutChunks = [];
  const stderrChunks = [];
  diagnostic(label, 'start', {wireBytes: wireBytes.length, wireSha256});

  try {
    tempDirectory = await mkdtemp(join(tempRoot, 'umf-cli-wire-'));
    await chmod(tempDirectory, 0o700);
    const inputPath = join(tempDirectory, 'stdin.wire');
    writer = await open(inputPath, 'wx', 0o600);
    await writer.writeFile(wireBytes);
    const fileMode = (await writer.stat()).mode & 0o777;
    await writer.close();
    writer = undefined;
    const directoryMode = (await stat(tempDirectory)).mode & 0o777;
    if (fileMode !== 0o600 || directoryMode !== 0o700) {
      throw new CliWireTransportError('STAGING_MODE', 'Temporary CLI wire input permissions are not private', {directoryMode, fileMode});
    }
    staging = {directoryMode, fileMode};
    diagnostic(label, 'staged', {directoryMode, fileMode, wireBytes: wireBytes.length, wireSha256});
    input = await open(inputPath, 'r');

    child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: [input.fd, 'pipe', 'pipe'],
      windowsHide: true,
    });
    closePromise = new Promise((resolve) => {
      child.once('close', (status, signal) => resolve({status, signal}));
    });
    child.once('error', (error) => { spawnError = error; });
    child.once('exit', (status, signal) => {
      if (status !== 0 || signal !== null) signalProcessGroup(child);
    });

    const append = (chunks, lengthKey) => (chunk) => {
      if (outputOverflow) return;
      const nextLength = lengthKey === 'stdout' ? stdoutBytes + chunk.length : stderrBytes + chunk.length;
      if (nextLength > maxBuffer) {
        outputOverflow = true;
        signalProcessGroup(child);
        return;
      }
      if (lengthKey === 'stdout') stdoutBytes = nextLength;
      else stderrBytes = nextLength;
      chunks.push(chunk);
    };
    child.stdout.on('data', append(stdoutChunks, 'stdout'));
    child.stderr.on('data', append(stderrChunks, 'stderr'));

    timer = setTimeout(() => {
      timedOut = true;
      signalProcessGroup(child);
    }, timeoutMs);
    await new Promise((resolveSpawn, rejectSpawn) => {
      child.once('spawn', resolveSpawn);
      child.once('error', rejectSpawn);
    });
    await input.close();
    input = undefined;
    const {status, signal} = await closePromise;
    resultStatus = status;
    resultSignal = signal;
    clearTimeout(timer);
    timer = undefined;

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    if (timedOut) throw new CliWireTransportError('TIMEOUT', `CLI transport timed out after ${timeoutMs}ms`, {timeoutMs, label});
    if (outputOverflow) throw new CliWireTransportError('OUTPUT_LIMIT', `CLI transport exceeded the ${maxBuffer}-byte output limit`, {maxBuffer, label});
    if (spawnError) throw new CliWireTransportError('SPAWN_FAILED', `Could not start CLI process: ${spawnError.message}`, {label, cause: spawnError});
    if (status !== 0 || signal !== null) {
      signalProcessGroup(child);
      throw new CliWireTransportError('CHILD_FAILED', `CLI exited with ${signal ?? status}`, {status, signal, stderr, label});
    }
    diagnostic(label, 'end', {durationMs: Math.round(performance.now() - startedAt), status, signal, stdoutBytes, stderrBytes, wireSha256});
    return {stdout, stderr, status, signal, wireSha256, wireBytes: wireBytes.length, stdoutBytes, stderrBytes, staging};
  } catch (error) {
    clearTimeout(timer);
    if (child && !child.killed) signalProcessGroup(child);
    if (closePromise) await closePromise;
    const failure = spawnError && !(error instanceof CliWireTransportError)
      ? new CliWireTransportError('SPAWN_FAILED', `Could not start CLI process: ${spawnError.message}`, {label, cause: spawnError})
      : error;
    diagnostic(label, 'end', {durationMs: Math.round(performance.now() - startedAt), status: resultStatus, signal: resultSignal, timedOut, outputOverflow, wireSha256, error: failure.code ?? failure.name});
    throw failure;
  } finally {
    if (writer) await writer.close().catch(() => {});
    if (input) await input.close().catch(() => {});
    if (tempDirectory) await rm(tempDirectory, {recursive: true, force: true});
  }
}
