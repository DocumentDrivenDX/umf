// SPDX-License-Identifier: MIT OR Apache-2.0
// Frozen public-API predecessor capture. --check never rewrites the baseline.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  importJsonSchema, inspectJsonSchema, exportJsonSchema, exportJsonSchemaResources,
  exportJsonSchemaBundle, getJsonSchemaNode, walkJsonSchema, editJsonSchemaNode,
  parseNativeJson,
} from '../../../src/index';

const root = resolve(import.meta.dir, '../../..');
const output = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-json-schema/baseline.json');
const sourcePaths = [
  'src/adapters/json-schema/index.ts', 'src/adapters/json-schema/tree.ts',
  'tests/json-schema/native.test.ts', 'tests/json-schema/upstream.test.ts',
  'spec/extensions/json-schema/schema.json', 'spec/extensions/json-schema/package.json',
  'fixtures/json-schema/upstream/manifest.json',
  'docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md',
  'docs/helix/02-design/contracts/CONTRACT-002-json-schema.md',
  'docs/helix/02-design/adr/ADR-006-shared-rust-implementation.md',
  'docs/helix/04-build/rust-migration-plan.md',
  'docs/helix/03-test/test-plan.md',
];
const hash = async (path: string) => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const outcome = async (fn: () => unknown | Promise<unknown>) => {
  try { return { ok: true, value: await fn() }; }
  catch (e) { const error = e as Error & {code?: string}; return {ok:false,error:{name:error.name,code:error.code??null,message:error.message}}; }
};
const stringify = (x: unknown) => JSON.stringify(x);
const cases: Record<string, () => unknown | Promise<unknown>> = {
  importInspect: () => {
    const doc=importJsonSchema('{"type":"object","properties":{"price":{"type":"number","minimum":9007199254740993}}}',{id:'r5-baseline',baseUri:'https://example.test/root'});
    return {doc,inspection:inspectJsonSchema(doc)};
  },
  rootResourceBundle: () => {
    const doc=importJsonSchema('{"$ref":"https://example.test/types.json#/$defs/amount"}',{id:'r5-baseline',baseUri:'https://example.test/root',resources:{'https://example.test/types.json':'{"$id":"https://example.test/types.json","$defs":{"amount":{"type":"number","multipleOf":0.10000000000000000001}}}'}});
    const bundle=exportJsonSchemaBundle(doc);
    const before=exportJsonSchema(doc);
    (bundle.source.modules[0]!.elements[0]!.extensions['umf.json-schema'] as any).root={kind:'boolean',value:false};
    if(exportJsonSchema(doc)!==before)throw new Error('Bundle source mutation reached original document');
    return {root:before,resources:exportJsonSchemaResources(doc),bundle,bundleSourceCopyIsolated:true};
  },
  getWalk: () => {
    const doc=importJsonSchema('{"properties":{"a/b~c":{"type":"string"}},"default":{"properties":{"ignored":true}},"allOf":[true]}',{id:'r5-baseline',baseUri:'https://example.test/walk'});
    const node=getJsonSchemaNode(doc,'/properties/a~1b~0c');
    const positions=walkJsonSchema(doc);
    if(node.kind==='object')node.members.type={kind:'string',value:'mutated'};
    const rootPosition=positions.find(p=>p.pointer==='')!;
    if(rootPosition.node.kind==='object')rootPosition.node.members.injected={kind:'boolean',value:true};
    const rereadNode=getJsonSchemaNode(doc,'/properties/a~1b~0c');
    const rereadWalk=walkJsonSchema(doc);
    const getCopyIsolated=rereadNode.kind==='object'&&rereadNode.members.type?.kind==='string'&&rereadNode.members.type.value==='string';
    const walkCopyIsolated=rereadWalk[0]?.node.kind==='object'&&!Object.hasOwn(rereadWalk[0]!.node.members,'injected');
    if(!getCopyIsolated||!walkCopyIsolated)throw new Error('get/walk result mutation reached original document');
    return {node,positions,getCopyIsolated,walkCopyIsolated};
  },
  atomicEdit: async () => {
    const doc=importJsonSchema('{"properties":{"n":{"type":"integer","minimum":1}}}',{id:'r5-baseline',baseUri:'https://example.test/edit'});
    const before=stringify(doc);
    const success=await outcome(()=>editJsonSchemaNode(doc,'/properties/n/minimum','2'));
    const invalid=await outcome(()=>editJsonSchemaNode(doc,'/properties/n/type','"unrecognized"'));
    const missing=await outcome(()=>editJsonSchemaNode(doc,'/absent','true'));
    const successDocument=success.ok?success.value:null;
    const successNative=successDocument?exportJsonSchema(successDocument as Parameters<typeof exportJsonSchema>[0]):null;
    if(!success.ok||!successNative||JSON.parse(successNative).properties.n.minimum!==2)throw new Error('Successful atomic edit result was not captured');
    if(invalid.ok||invalid.error?.code!=='INVALID_EDIT')throw new Error(`Expected INVALID_EDIT, observed ${JSON.stringify(invalid)}`);
    if(missing.ok||missing.error?.code!=='JSON_SCHEMA_POINTER')throw new Error(`Expected JSON_SCHEMA_POINTER, observed ${JSON.stringify(missing)}`);
    return {sourceUnchanged:before===stringify(doc),success:{ok:success.ok,native:successNative,document:successDocument},invalid,missing};
  },
  admissionAndPrecedence: async () => {
    const tests:Record<string,()=>unknown>={
      duplicateKeys:()=>importJsonSchema('{"type":"string","type":"number"}',{id:'r5',baseUri:'https://example.test/x'}),
      malformedJson:()=>importJsonSchema('{"type":',{id:'r5',baseUri:'https://example.test/malformed'}),
      invalidRoot:()=>importJsonSchema('[]',{id:'r5',baseUri:'https://example.test/array-root'}),
      malformedRetrievalUri:()=>importJsonSchema('{}',{id:'r5',baseUri:'relative'}),
      rootResourceCollision:()=>importJsonSchema('{}',{id:'r5',baseUri:'https://example.test/x',resources:{'https://example.test/x':'{}'}}),
      missingReference:()=>inspectJsonSchema(importJsonSchema('{"$ref":"missing.json"}',{id:'r5',baseUri:'https://example.test/root'})),
      unknownDialect:()=>{const d=importJsonSchema('{"$schema":"https://example.test/dialect","type":"alien"}',{id:'r5',baseUri:'https://example.test/d'});return {inspection:inspectJsonSchema(d),export:exportJsonSchema(d)};},
      unknownKeyword:()=>inspectJsonSchema(importJsonSchema('{"x-opaque":1}',{id:'r5',baseUri:'https://example.test/k'})),
      invalidKnownAndUnknown:()=>importJsonSchema('{"type":"alien","x-opaque":1}',{id:'r5',baseUri:'https://example.test/both'}),
    };
    return Object.fromEntries(await Promise.all(Object.entries(tests).map(async ([k,fn])=>[k,await outcome(fn)])));
  },
  exactNumbersAndUnknownRetention: () => {
    const text='{"minimum":9007199254740993,"maximum":1e400,"multipleOf":0.10000000000000000001,"default":-0,"x-opaque":{"kind":"number","value":"literal"}}';
    const d=importJsonSchema(text,{id:'r5',baseUri:'https://example.test/n'});
    return {native:exportJsonSchema(d),diagnostics:inspectJsonSchema(d).diagnostics,tree:parseNativeJson('1e-5000')};
  },
  unknownRepresentation: async () => {
    const d=importJsonSchema('{}',{id:'r5',baseUri:'https://example.test/u'});
    const payload=d.modules[0]!.elements[0]!.extensions['umf.json-schema'] as any;
    payload.root.futureRepresentation='retained';
    const exported=await outcome(()=>exportJsonSchema(d));
    const bundle=await outcome(()=>exportJsonSchemaBundle(d));
    if(exported.ok||exported.error?.code!=='JSON_SCHEMA_EXPORT')throw new Error(`Expected JSON_SCHEMA_EXPORT, observed ${JSON.stringify(exported)}`);
    if(bundle.ok||bundle.error?.code!=='JSON_SCHEMA_EXPORT')throw new Error(`Expected bundle JSON_SCHEMA_EXPORT, observed ${JSON.stringify(bundle)}`);
    return {inspection:inspectJsonSchema(d),export:exported,bundle};
  },
};

async function capture() {
  const results:Record<string,unknown>={};
  for(const [name,fn] of Object.entries(cases)) results[name]=await outcome(fn);
  const sourceHashes:Record<string,string>={}; for(const p of sourcePaths)sourceHashes[p]=await hash(p);
  return {format:'umf-r5-json-schema-baseline-v1',bunVersion:typeof Bun==='undefined'?'unknown':Bun.version,sourceHashes,results};
}
const result=JSON.stringify(await capture(),null,2)+'\n';
if(process.argv.includes('--check')) {
  const expected=await readFile(output,'utf8');
  if(expected!==result){console.error(`Baseline differs: ${output}`);process.exitCode=1;}
  else console.log(`Baseline matches ${output}`);
} else {
  await writeFile(output,result);
  console.log(`Wrote ${output}`);
}
