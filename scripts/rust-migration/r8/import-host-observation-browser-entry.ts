// SPDX-License-Identifier: MIT OR Apache-2.0
// Browser bundle entrypoint: the same seven direct calls, without Node APIs.
import { importJsonSchema } from '../../../src/adapters/json-schema/index.ts';

const events: string[] = [];
const mark = (value:string) => events.push(value);
const run = (id:string, text:unknown, options:any, expected?:object) => {
  events.length=0;
  try {
    const doc=importJsonSchema(text as string, options);
    const p=doc.modules[0]!.elements[0]!.extensions['umf.json-schema'] as any;
    return {id,events:[...events],outcome:{kind:'return',documentId:doc.id,namespace:doc.modules[0]!.namespace,baseUri:p.baseUri,resources:Object.keys(p.resources)}};
  } catch(e) {
    const x=e as any;
    return {id,events:[...events],outcome:{kind:'throw',name:x?.name??typeof e,message:x?.message??String(e),code:x?.code??null,...(expected?{sameObject:e===expected}:{})}};
  }
};
const results:any[]=[];
const success=Object.create(null); let n=0;
Object.defineProperty(success,'baseUri',{get(){mark(`baseUri#${++n}`);return 'https://example.test/root';}});
Object.defineProperty(success,'resources',{get(){mark('resources');return {get 'https://example.test/dep'(){mark('resource:get');return '{}';}};}});
Object.defineProperty(success,'id',{get(){mark('id');return 'doc';}});
results.push(run('success-getter-order-with-resource-accessor','{}',success));
const invalid=Object.defineProperties({}, {baseUri:{get(){mark('baseUri#1');return 'relative#bad';}},resources:{get(){mark('resources');return {};}}});
results.push(run('invalid-base-uri-precedes-resources-and-root','{',invalid));
const sentinel=Object.assign(new Error('sentinel getter failure'),{code:'HOST_SENTINEL'});
const baseThrow=Object.defineProperties({}, {baseUri:{get(){mark('baseUri#1');throw sentinel;}},resources:{get(){mark('resources');return {};}}});
results.push(run('base-uri-getter-throws-original-object','{',baseThrow,sentinel));
const resourcesThrow=Object.defineProperties({}, {baseUri:{get(){mark('baseUri#1');return 'https://example.test/root';}},resources:{get(){mark('resources');throw sentinel;}}});
results.push(run('resources-getter-throws-before-root','{',resourcesThrow));
const ownEntries=Object.defineProperties({}, {baseUri:{get(){mark('baseUri#1');return 'https://example.test/root';}},resources:{get(){mark('resources');return new Proxy({}, {ownKeys(){mark('ownKeys');throw sentinel;}});}}});
results.push(run('resource-ownKeys-trap-throws-before-root','{',ownEntries));
const parseOrder=Object.defineProperties({}, {baseUri:{get(){mark('baseUri#1');return 'https://example.test/root';}},resources:{get(){mark('resources');return {'https://example.test/bad':'{'};}},id:{get(){mark('id');return 'doc';}}});
results.push(run('resource-parse-failure-precedes-root-coercion',{toString(){mark('root-toString');return '{';}},parseOrder));
let read=0;
const rootOptions=Object.defineProperties({}, {baseUri:{get(){mark(`baseUri#${++read}`);return 'https://example.test/root';}},resources:{get(){mark('resources');return {};}}});
results.push(run('non-string-root-toString-observed-before-yaml-type-refusal',{toString(){mark('root-toString');return '{}';}},rootOptions));
let distinctRead=0;
const distinctOptions=Object.defineProperties({}, {baseUri:{get(){const n=++distinctRead;mark(`baseUri#${n}`);return `https://example.test/read-${n}`;}},resources:{get(){mark('resources');return {}; }},id:{get(){mark('id');return 'distinct-uri-doc';}}});
results.push(run('three-distinct-base-uri-reads-preserved','{}',distinctOptions));
let parseFailureRead=0;
const parseFailureOptions=Object.defineProperties({}, {baseUri:{get(){mark(`baseUri#${++parseFailureRead}`);return 'https://example.test/root';}},resources:{get(){mark('resources');return {}; }},id:{get(){mark('id');return 'must-not-be-read';}}});
results.push(run('root-parse-failure-precedes-id-and-base-uri-read-three','{',parseFailureOptions));
(globalThis as any).R8ImportHostObservation={results};
