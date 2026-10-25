// SPDX-License-Identifier: MIT OR Apache-2.0
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avroRecordTypeCases } from '../core-ideals/avro-record-type-cases';
import { importAvroSchema, getAvroFieldMetadata } from '../../src/adapters/avro';
import { classifyAvroRecordType, recoverAvroRecordTypeBundle } from '../../src/core-ideals/avro-record-type';
import { declareCoreElementKind } from '../../src/model/field-kind';
import { copyJson } from '../../src/model/json';
import { readJsonValue, writeJsonValue } from '../../src/model/serialization';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const root = resolve(here, '../..');
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-avro-record-type/typescript-predecessor.json');
const pinPaths = [
  'src/core-ideals/avro-record-type.ts', 'src/core-ideals/avro-record.ts', 'src/core-ideals/avro-field.ts', 'src/core-ideals/avro-records.ts',
  'src/adapters/avro/index.ts', 'src/adapters/avro/metadata.ts', 'src/model/field-kind.ts', 'src/model/json.ts', 'src/model/serialization.ts',
  'spec/core/avro-record-type-classification.schema.json', 'spec/core/schema.json', 'spec/core/kind-operation-v6.schema.json',
  'scripts/core-ideals/avro-record-type-cases.ts', 'scripts/core-ideals/avro-field-cases.ts', 'tests/core-ideals/avro-record-type.test.ts',
];
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, (x as Record<string, unknown>)[k]])) : x);
const error = (e: unknown) => ({ name: e instanceof Error ? e.name : typeof e, message: e instanceof Error ? e.message : String(e), code: (e as {code?:string})?.code ?? null });
const capture = (work: () => unknown) => { try { return { ok: true, value: work() }; } catch (e) { return { ok: false, error: error(e) }; } };

async function produce() {
  const pins: Record<string,string> = {};
  for (const p of pinPaths) pins[p] = createHash('sha256').update(await readFile(resolve(root,p))).digest('hex');
  const outcomes: Record<string,unknown> = {};
  let classified=0, blocked=0, recovered=0;
  for (const c of avroRecordTypeCases) {
    const source = importAvroSchema(c.schema,{id:c.id,dependencies:c.dependencies});
    for (const f of getAvroFieldMetadata(source)) for (const mode of ['strict','report'] as const) {
      const id = `matrix/${c.id}/${f.element.name ?? f.element.id}/${mode}`;
      const expected = c.id==='dependencies' && ['left','right'].includes(f.element.name!) || c.id==='direct' && ['child','again','recursive'].includes(f.element.name!);
      const result = classifyAvroRecordType(source,{column:f.element.id,nativeSource:c.schema,dependencies:c.dependencies,mode,recordModule:'records',recordId:'type'});
      if ((result.status==='classified')!==expected) throw new Error(`Unexpected status at ${id}: ${result.status}`);
      const recovery: Record<string,unknown> = {};
      if (result.status==='classified') {
        classified++;
        for (const format of ['json','yaml'] as const) {
          const receipt = readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;
          const recoveredValue = recoverAvroRecordTypeBundle(receipt,receipt.target!);
          recovery[format] = recoveredValue;
          recovered++;
        }
      } else blocked++;
      outcomes[id] = { result, recovery };
    }
  }
  const c = avroRecordTypeCases[1]!;
  const source = importAvroSchema(c.schema,{id:c.id,dependencies:c.dependencies});
  const f = getAvroFieldMetadata(source).find(x=>x.element.name==='left')!;
  const request = {column:f.element.id,nativeSource:c.schema,dependencies:c.dependencies,mode:'strict' as const,recordModule:'records',recordId:'type'};
  const authorField = declareCoreElementKind(source,{module:'avro.fields',element:f.element.id},'field');
  const authorRecord = declareCoreElementKind(source,{module:'avro.fields',element:f.element.id},'record');
  const good = classifyAvroRecordType(authorField.target,{...request,authors:[authorField]});
  const rightField = getAvroFieldMetadata(source).find(x=>x.element.name==='right')!;
  const unrelatedAuthor = declareCoreElementKind(source,{module:'avro.fields',element:rightField.element.id},'field');
  const forgedAuthor = copyJson(authorField) as unknown as typeof authorField;
  forgedAuthor.provenance.kind = 'record';
  const scalarSource=copyJson(source) as typeof source;
  scalarSource.modules.find(m=>m.id==='avro.fields')!.elements.find(e=>e.id===f.element.id)!.scalarType='string';
  const recordAssertionSource=copyJson(source) as typeof source;
  recordAssertionSource.modules.find(m=>m.id==='avro.fields')!.elements.find(e=>e.id===f.element.id)!.references=[{role:'record-type',module:'records',element:'prior'}];
  const classifiedResult = classifyAvroRecordType(source,request);
  const tampered = copyJson(classifiedResult) as unknown as typeof classifiedResult;
  tampered.target!.future = true;
  const targetEdit = copyJson(classifiedResult.target!) as unknown as typeof classifiedResult.target;
  targetEdit!.id += '-changed';
  const receiptEdit=copyJson(classifiedResult) as unknown as typeof classifiedResult;
  receiptEdit.mappings[0]!.nativePath += '/changed';
  const authors: Record<string,unknown> = {
    conflicting: capture(()=>classifyAvroRecordType(authorRecord.target,{...request,authors:[authorRecord]})),
    valid: {result:good, recovery:recoverAvroRecordTypeBundle(good,good.target!)},
    duplicate: capture(()=>classifyAvroRecordType(authorField.target,{...request,authors:[authorField,authorField]})),
    unrelated: capture(()=>classifyAvroRecordType(source,{...request,authors:[unrelatedAuthor]})),
    forged: capture(()=>classifyAvroRecordType(authorField.target,{...request,authors:[forgedAuthor]})),
    existingScalarAssertion: capture(()=>classifyAvroRecordType(scalarSource,request)),
    existingRecordTypeAssertion: capture(()=>classifyAvroRecordType(recordAssertionSource,request)),
    missingDependency: capture(()=>classifyAvroRecordType(source,{...request,dependencies:[]})),
    tamperedTarget: capture(()=>recoverAvroRecordTypeBundle(tampered,tampered.target!)),
    changedCurrentTarget: capture(()=>recoverAvroRecordTypeBundle(classifiedResult,targetEdit!)),
    changedReceipt: capture(()=>recoverAvroRecordTypeBundle(receiptEdit,receiptEdit.target!)),
    missingCurrentTarget: capture(()=>recoverAvroRecordTypeBundle(classifiedResult,source)),
  };
  // Capture the library's observable descriptor/proxy access sequence and prove accessors do not run.
  const events:string[]=[]; const hostSource = new Proxy(source,{getPrototypeOf(t){events.push('source.getPrototypeOf');return Reflect.getPrototypeOf(t)},ownKeys(t){events.push('source.ownKeys');return Reflect.ownKeys(t)},getOwnPropertyDescriptor(t,k){events.push(`source.descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k)}});
  const getterEvents:string[]=[]; const accessorOptions={...request}; Object.defineProperty(accessorOptions,'mode',{enumerable:true,get(){getterEvents.push('options.mode.get');return 'strict'}});
  const host = {outcome:capture(()=>classifyAvroRecordType(hostSource,request)),events,getterEvents};
  const accessor = capture(()=>classifyAvroRecordType(source,accessorOptions as typeof request));
  const overLimit=copyJson(source) as typeof source;
  (overLimit as unknown as Record<string,unknown>).packetBoundary=Array(100_001).fill(null);
  const resourceBoundary=capture(()=>classifyAvroRecordType(overLimit,request));
  outcomes['controls/authors-tamper-recovery'] = authors;
  outcomes['controls/host-proxy-order'] = host;
  outcomes['controls/options-getter'] = {outcome:accessor,getterEvents};
  outcomes['controls/resource-boundary'] = resourceBoundary;
  const ambiguousSchema='{"type":"record","name":"Root","namespace":"app","fields":[{"name":"child","type":"Customer"}]}';
  const ambiguousDependencies=[{id:'sales',schema:'{"type":"record","name":"sales.Customer","fields":[]}'},{id:'support',schema:'{"type":"record","name":"support.Customer","fields":[]}'}];
  const ambiguousSource=importAvroSchema(ambiguousSchema,{id:'same-name-dependencies',dependencies:ambiguousDependencies});
  const ambiguousField=getAvroFieldMetadata(ambiguousSource)[0]!;
  const ambiguous:Record<string,unknown>={};
  for(const mode of ['strict','report'] as const) ambiguous[mode]=classifyAvroRecordType(ambiguousSource,{column:ambiguousField.element.id,nativeSource:ambiguousSchema,dependencies:ambiguousDependencies,mode,recordModule:'records',recordId:'type'});
  outcomes['ambiguity/same-name-qualified-dependencies']={schema:ambiguousSchema,dependencies:ambiguousDependencies,results:ambiguous};
  return { packet: 'umf-r8-avro-record-type-typescript-predecessor-v1', operation: ['classifyAvroRecordType','recoverAvroRecordTypeBundle'], runtime: {bun:process.versions.bun}, sourcePins: pins, counts: {classified,blocked,recovered}, outcomes };
}

const actual = await produce();
if (process.argv.includes('--check')) {
  const expected = JSON.parse(await readFile(packetPath,'utf8'));
  if (canonical(actual)!==canonical(expected)) { console.error('Avro Record Type predecessor packet differs; regenerate only after reviewing the TypeScript source cohort.'); process.exitCode=1; }
  else console.log(`Avro Record Type predecessor packet matches (${actual.counts.classified} classified, ${actual.counts.blocked} blocked, ${actual.counts.recovered} recovered).`);
} else {
  await writeFile(packetPath,JSON.stringify(actual,null,2)+'\n');
  console.log(`Wrote ${packetPath}`);
}
