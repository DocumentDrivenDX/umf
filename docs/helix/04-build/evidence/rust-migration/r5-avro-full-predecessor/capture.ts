// SPDX-License-Identifier: MIT OR Apache-2.0
// Focused frozen observation of the current public Avro adapter operations.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import avsc from 'avsc';
import {
  editAvroNode, exportAvroBundle, exportAvroSchema, getAvroNode,
  importAvroSchema, inspectAvro, proposeAvroNodeEdit,
} from '../../../../../../src/adapters/avro';
import { readDocument, writeDocument } from '../../../../../../src/model/document';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../../../');
const sha = (path: string) => createHash('sha256').update(readFileSync(resolve(repo, path))).digest('hex');
const error = (fn: () => unknown) => {
  try { fn(); return { outcome: 'accepted' }; }
  catch (e) { return { outcome: 'refused', name: (e as Error).name, message: (e as Error).message }; }
};
const schema = JSON.stringify({type:'record',name:'Invoice',namespace:'billing',doc:'source-doc',aliases:['OldInvoice'],'x/y~z':{retained:true},fields:[
  {name:'amount',type:{type:'bytes',logicalType:'decimal',precision:8,scale:2,customFieldTag:{x:1}}},
  {name:'memo',type:['null','string'],default:null},
  {name:'count',type:'long',default:7},
],customTopTag:{preserve:[1,'x']}});
const dependency = JSON.stringify({type:'record',name:'Currency',namespace:'billing',fields:[{name:'code',type:'string'}],customDepTag:true});
const doc = importAvroSchema(schema,{id:'invoice',dependencies:[{id:'currency.avsc',schema:dependency}]});
const inspect = inspectAvro(doc);
const rootExport = error(() => exportAvroSchema(doc));
const bundle = exportAvroBundle(doc);
const node = getAvroNode(doc,'/fields/0/type');
node.members.logicalType!.value = 'changed';
const originalAfterReturnedNodeMutation = getAvroNode(doc,'/fields/0/type').members.logicalType!.value;
const proposal = proposeAvroNodeEdit(doc,'/fields/0/type/scale','3');
const conservativeEdit = error(() => editAvroNode(doc,'/fields/0/type/scale','3'));
proposal.document.id = 'mutated-report-document';
const proposalCopiesIsolated = doc.id === 'invoice' && proposal.source.id === 'invoice' && proposal.edit.replacement.kind === 'number' && proposal.edit.replacement.value === '3';
const bundleCopy = exportAvroBundle(doc); bundleCopy.source.id = 'mutated-bundle-source';
const bundleCopyIsolated = exportAvroBundle(doc).source.id === 'invoice';
const recoveries = ['json','yaml'].map(format => {
  const encoded = writeDocument(doc,format as 'json'|'yaml');
  const returned = readDocument(encoded,format as 'json'|'yaml');
  return {format, sameDocument: JSON.stringify(returned) === JSON.stringify(doc), root: exportAvroBundle(returned).schema};
});

const unknown = structuredClone(doc);
const payload = unknown.modules[0]!.elements[0]!.extensions['umf.avro'] as any;
payload.root.futureTaggedField = {kept:true};
const unknownOutcome = {inspect: inspectAvro(unknown), rootExport: error(() => exportAvroSchema(unknown)), proposal: error(() => proposeAvroNodeEdit(unknown,'/missing','0'))};
const stale = structuredClone(doc);
stale.modules.find(m => m.id === 'avro.fields')!.elements[0]!.name = 'stale';
const attached = structuredClone(doc);
attached.modules.find(m => m.id === 'avro.fields')!.elements.find(e => e.name === 'amount')!['future.metadata'] = {keep:true};
const dependencyOutcomes = {
  selected: getAvroNode(doc,'/fields/0/type','currency.avsc'),
  missing: error(() => getAvroNode(doc,'','missing')),
  duplicateIds: error(() => importAvroSchema(schema,{id:'duplicate',dependencies:[{id:'d',schema:dependency},{id:'d',schema:dependency}]})),
  unresolvedStandalone: inspectAvro(importAvroSchema('"billing.Currency"',{id:'unresolved'})).complete,
};
const pointers = {
  escapedMember: getAvroNode(doc,'/x~1y~0z'),
  missingPath: error(() => getAvroNode(doc,'/absent')),
  malformedPointer: error(() => getAvroNode(doc,'fields/0')),
  badReplacement: error(() => proposeAvroNodeEdit(doc,'/fields/0/type','not-json')),
};
const refusals = {
  staleMaterializedMetadata: error(() => proposeAvroNodeEdit(stale,'/fields/0/type','"string"')),
  unknownBeforePathResolution: unknownOutcome.proposal,
  guardedFieldRename: error(() => proposeAvroNodeEdit(attached,'/fields/0/name','"renamed"')),
  guardedFieldRemoval: error(() => proposeAvroNodeEdit(attached,'/fields','[]')),
};
const outcome = {
  profile:'r5-avro-full-predecessor/1.0.0',
  capturedAt:new Date().toISOString(),
  versions:{bun:Bun.version,avsc:'5.7.9 (package.json pin)'},
  sourceHashes:Object.fromEntries([
    'src/adapters/avro/index.ts','src/adapters/avro/facet-type.ts','src/adapters/avro/metadata.ts',
    'src/adapters/json-schema/tree.ts','src/model/json.ts','src/model/serialization.ts',
    'src/model/document.ts','src/validation/document.ts','spec/extensions/avro/package.json',
    'docs/helix/02-design/contracts/CONTRACT-007-avro.md','docs/helix/02-design/contracts/CONTRACT-008-avro-document-projection.md',
  ].map(path => [path,sha(path)])),
  input:{schema,dependency},
  operations:{import:{extension:doc.modules[0]!.elements[0]!.extensions['umf.avro'],fieldMetadata:doc.modules.find(m=>m.id==='avro.fields')!.elements},inspect,rootExport,bundle,nodeReturnedMutationIsolated:originalAfterReturnedNodeMutation==='decimal',proposal:{status:proposal.status,validation:proposal.validation,edit:proposal.edit},proposalCopiesIsolated,bundleCopyIsolated,conservativeEdit,recoveries},
  unknownRetention:{nativeMetadataExportRetained:JSON.parse(bundle.schema).customTopTag,fieldMetadataRetained:JSON.parse(bundle.schema).fields[0].customFieldTag,unknownRepresentation:unknownOutcome},
  dependencies:dependencyOutcomes,
  pointers,
  refusalPrecedence:refusals,
  controls:{resourceCancellationDeadline:'not-applicable: current public operations are synchronous and expose no such controls'},
  nativeOracle:{avscVersion:'5.7.9',accepted:avsc.Type.forSchema(JSON.parse(schema))!==undefined,exactInt64RetainedByAdapterButRejectedByHostNumberValidator:error(()=>avsc.Type.forSchema({type:'record',name:'Exact',fields:[{name:'n',type:'long',default:9223372036854775807}]})),apacheAvro:'not-run: pinned Apache Avro Python module and Java artifact are unavailable in this worktree environment'},
  scope:'Captures current TS adapter behavior and a pinned avsc acceptance check; not full Avro qualification, not Rust parity, not support for IDL/protocol/container data or datum codecs.'
};
writeFileSync(resolve(here,'outcomes.json'),JSON.stringify(outcome,null,2)+'\n');
console.log(`captured ${Object.keys(outcome.sourceHashes).length} source hashes; avsc ${outcome.nativeOracle.avscVersion} accepted sample`);
