// SPDX-License-Identifier: MIT OR Apache-2.0
// Direct-source oracle for a deliberately bounded subset of R8 stages 1-5.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importJsonSchema } from '../../../src/adapters/json-schema/index.ts';

type Event = string;
type CaseResult = { id: string; events: Event[]; outcome: Record<string, unknown> };
const trace: Event[] = [];
const mark = (s: string) => { trace.push(s); };
function thrown(error: unknown) {
  const e = error as {name?: string; message?: string; code?: string};
  return { kind: 'throw', name: e?.name ?? typeof error, message: e?.message ?? String(error), code: e?.code ?? null };
}
function run(id: string, build: () => {text: unknown; options: any}, expectedThrow?: object): CaseResult {
  trace.length = 0;
  try {
    const {text, options} = build();
    const document = importJsonSchema(text as string, options);
    const payload = document.modules[0]!.elements[0]!.extensions['umf.json-schema'] as any;
    return {id, events:[...trace], outcome:{kind:'return', documentId:document.id, namespace:document.modules[0]!.namespace, baseUri:payload.baseUri, resources:Object.keys(payload.resources)}};
  } catch (error) { return {id, events:[...trace], outcome:{...thrown(error), ...(expectedThrow ? {sameObject:error===expectedThrow} : {})}}; }
}
const cases: CaseResult[] = [];
const successOptions = Object.create(null);
let base = 0;
Object.defineProperty(successOptions, 'baseUri', {get(){ mark(`baseUri#${++base}`); return 'https://example.test/root'; }});
Object.defineProperty(successOptions, 'resources', {get(){ mark('resources'); return {get 'https://example.test/dep'(){mark('resource:get'); return '{}';}}; }});
Object.defineProperty(successOptions, 'id', {get(){mark('id'); return 'doc';}});
cases.push(run('success-getter-order-with-resource-accessor', () => ({text:'{}', options:successOptions})));

const uriOptions = Object.defineProperties({}, {
  baseUri:{get(){mark('baseUri#1'); return 'relative#bad';}},
  resources:{get(){mark('resources'); return {};}}
});
cases.push(run('invalid-base-uri-precedes-resources-and-root', () => ({text:'{', options:uriOptions})));

const sentinel = Object.assign(new Error('sentinel getter failure'), {code:'HOST_SENTINEL'});
const throwingBase = Object.defineProperties({}, {
  baseUri:{get(){mark('baseUri#1'); throw sentinel;}},
  resources:{get(){mark('resources'); return {};}}
});
const baseThrow = run('base-uri-getter-throws-original-object', () => ({text:'{', options:throwingBase}), sentinel);
cases.push(baseThrow);

const resourcesThrow = Object.defineProperties({}, {
  baseUri:{get(){mark('baseUri#1'); return 'https://example.test/root';}},
  resources:{get(){mark('resources'); throw sentinel;}}
});
cases.push(run('resources-getter-throws-before-root', () => ({text:'{', options:resourcesThrow})));

const ownEntries = Object.defineProperties({}, {
  baseUri:{get(){mark('baseUri#1'); return 'https://example.test/root';}},
  resources:{get(){mark('resources'); return new Proxy({}, {ownKeys(){mark('ownKeys'); throw sentinel;}});}}
});
cases.push(run('resource-ownKeys-trap-throws-before-root', () => ({text:'{', options:ownEntries})));

const parseOrder = Object.defineProperties({}, {
  baseUri:{get(){mark('baseUri#1'); return 'https://example.test/root';}},
  resources:{get(){mark('resources'); return {'https://example.test/bad':'{'};}},
  id:{get(){mark('id'); return 'doc';}}
});
const coercionRoot = {toString(){mark('root-toString'); return '{';}};
cases.push(run('resource-parse-failure-precedes-root-coercion', () => ({text:coercionRoot, options:parseOrder})));

const rootCoercion = {toString(){mark('root-toString'); return '{}';}};
let rootBaseRead = 0;
const rootOptions = Object.defineProperties({}, {
  baseUri:{get(){mark(`baseUri#${++rootBaseRead}`); return 'https://example.test/root';}},
  resources:{get(){mark('resources'); return {};}}
});
cases.push(run('non-string-root-toString-observed-before-yaml-type-refusal', () => ({text:rootCoercion, options:rootOptions})));

let distinctRead = 0;
const distinctOptions = Object.defineProperties({}, {
  baseUri:{get(){const n=++distinctRead; mark(`baseUri#${n}`); return `https://example.test/read-${n}`;}},
  resources:{get(){mark('resources'); return {}; }},
  id:{get(){mark('id'); return 'distinct-uri-doc';}}
});
cases.push(run('three-distinct-base-uri-reads-preserved', () => ({text:'{}', options:distinctOptions})));

let parseFailureRead = 0;
const parseFailureOptions = Object.defineProperties({}, {
  baseUri:{get(){mark(`baseUri#${++parseFailureRead}`); return 'https://example.test/root';}},
  resources:{get(){mark('resources'); return {}; }},
  id:{get(){mark('id'); return 'must-not-be-read';}}
});
cases.push(run('root-parse-failure-precedes-id-and-base-uri-read-three', () => ({text:'{', options:parseFailureOptions})));

const source = resolve('src/adapters/json-schema/index.ts');
const hash = createHash('sha256').update(readFileSync(source)).digest('hex');
const receipt = {
  title:'R8 direct TypeScript import host-observation oracle',
  status:'observed', scope:'Seven direct-call cases covering success getter order and selected stage 1-5 refusal/coercion boundaries.',
  source:{path:'src/adapters/json-schema/index.ts', sha256:hash, hashScope:'This hashes only the entry module; imported files and generated inputs are not included.'},
  runtime:{bun:process.versions.bun ?? null, node:process.versions.node, platform:process.platform, arch:process.arch},
  negativeControls:{baseUriThrowPreservesObjectIdentity:cases.find(c=>c.id==='base-uri-getter-throws-original-object')?.outcome.sameObject===true,
    invalidUriLeavesResourcesUntouched:cases.find(c=>c.id==='invalid-base-uri-precedes-resources-and-root')?.events.join(',')==='baseUri#1',
    resourceParseRefusalPrecedesRootCoercion:cases.find(c=>c.id==='resource-parse-failure-precedes-root-coercion')?.events.includes('root-toString')===false,
    nonStringRootToStringPrecedesTypeRefusal:(()=>{const c=cases.find(x=>x.id==='non-string-root-toString-observed-before-yaml-type-refusal');return c?.events.at(-1)==='root-toString'&&c.outcome.name==='TypeError'&&c.outcome.message==='source is not a string';})(),
    threeDistinctUriReadsReachSeparatePayloadAndNamespace:(()=>{const c=cases.find(x=>x.id==='three-distinct-base-uri-reads-preserved');return c?.events.join(',')==='baseUri#1,resources,baseUri#2,id,baseUri#3'&&c.outcome.kind==='return'&&c.outcome.baseUri==='https://example.test/read-2'&&c.outcome.namespace==='https://example.test/read-3';})(),
    rootParseFailureStopsBeforeIdAndReadThree:(()=>{const c=cases.find(x=>x.id==='root-parse-failure-precedes-id-and-base-uri-read-three');return c?.events.join(',')==='baseUri#1,resources,baseUri#2'&&c.outcome.kind==='throw'&&c.outcome.code==='JSON_SCHEMA_SYNTAX';})()},
  cases
};
if (Object.values(receipt.negativeControls).some(value => value !== true)) {
  throw new Error(`Direct-source negative control failed: ${JSON.stringify(receipt.negativeControls)}`);
}
const out = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations/import-host-observation.json');
writeFileSync(out, JSON.stringify(receipt, null, 2)+'\n');
console.log(JSON.stringify({out, cases:cases.length, controls:receipt.negativeControls, sourceHash:hash}, null, 2));
