// SPDX-License-Identifier: MIT OR Apache-2.0
/** Regenerate a current-core source-presence fixture with the real compiler. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { generateAccessPackage } from '../src/compilation/index';
import { validateDocument } from '../src/validation/document';
import { profile } from '../tests/compilation/access-fixtures';

const root = 'fixtures/access/engine-catalog-successor';
const output = process.argv[2] ?? `${root}/public-stage-one-010`;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const previous = JSON.parse(
  await readFile(join(root, 'public-stage-one/stage-one-request.json'), 'utf8'),
);
const request = structuredClone(previous);
const source = request.sources.find((item: { id: string }) => item.id === request.logical);
if (!source) throw new Error('logical source is missing');
const previousText = source.text as string;
const document = JSON.parse(previousText);
const predecessorText = JSON.stringify({ ...document, umf: undefined });
document.umf = '0.10.0';
source.text = JSON.stringify(document);
request.coreVersion = '0.10.0';

const validation = validateDocument(document);
if (!validation.valid) {
  throw new Error(`Current Core 0.10 validation refused source: ${JSON.stringify(validation.diagnostics)}`);
}
const pinned = profile();
pinned.coreVersions = ['0.10.0'];
pinned.python.version = process.env.UMF_ACCESS_PYTHON_VERSION ?? '3.11.17';
pinned.dependencies = pinned.dependencies.map((dependency) =>
  dependency.distribution === 'umf_access'
    ? { ...dependency, version: process.env.UMF_ACCESS_RUNTIME_VERSION ?? '0.1.0.dev4' }
    : dependency.distribution === 'pydantic'
      ? { ...dependency, version: process.env.UMF_ACCESS_PYDANTIC_VERSION ?? '2.13.5' }
      : dependency,
);
const generated = generateAccessPackage(request, pinned);
if (generated.outcome !== 'candidate') {
  throw new Error(`Current generator refused source: ${JSON.stringify(generated.diagnostics)}`);
}

await mkdir(output, { recursive: true });
for (const file of generated.files) {
  const destination = join(output, file.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, file.text);
}
await writeFile(join(output, 'stage-one-request.json'), `${JSON.stringify(request, null, 2)}\n`);
await writeFile(join(output, 'profile.json'), `${JSON.stringify(pinned, null, 2)}\n`);
await writeFile(
  join(output, 'source-provenance.json'),
  `${JSON.stringify({
    scope: 'Current UMF 0.10 source-generation fixture; no native compiler or engine qualification',
    predecessor: `${root}/public-stage-one/stage-one-request.json`,
    predecessorSourceSha256: sha256(previousText),
    currentSourceSha256: sha256(source.text),
    sourceMeaningChange: 'Only the envelope UMF version changed; all authored fields and extension content are retained byte-for-byte after JSON parsing.',
    currentCoreValidation: { valid: validation.valid, complete: validation.complete, diagnostics: validation.diagnostics },
    generatedInputDigest: generated.inputDigest,
  }, null, 2)}\n`,
);
