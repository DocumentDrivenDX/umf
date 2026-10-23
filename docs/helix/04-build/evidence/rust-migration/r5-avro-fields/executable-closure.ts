// SPDX-License-Identifier: MIT OR Apache-2.0
// Additive completeness manifest for the frozen TypeScript predecessor packet.
// Run with `bun .../executable-closure.ts --write` once, then `--check`.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=process.cwd();
const directory='docs/helix/04-build/evidence/rust-migration/r5-avro-fields';
const output=resolve(directory,'executable-closure.json');
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const base=[
 'package.json','bun.lock','src/adapters/avro/metadata.ts','src/adapters/avro/index.ts',
 'src/adapters/json-schema/tree.ts','src/model/json.ts','src/model/serialization.ts',
 'src/model/types.ts','src/model/native-json.ts','src/model/errors.ts',
 'src/model/internal/json-number.ts','src/model/internal/scan-json-frame.ts',
 'tests/avro/metadata.test.ts','tests/avro/integer-metadata.test.ts',
 'tests/avro/temporal-metadata.test.ts','fixtures/avro/field-metadata.json',
 'fixtures/avro/integer-metadata.json','fixtures/avro/temporal-metadata.json',
 'fixtures/avro/upstream/manifest.json','scripts/avro-metadata-oracle.py',
 'scripts/avro-integer-metadata-oracle.py','scripts/avro-temporal-metadata-oracle.py',
 'spec/extensions/avro/schema.json','spec/extensions/avro/package.json',
 'spec/extensions/avro/field-metadata.schema.json',
 'docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md',
 'docs/helix/02-design/contracts/CONTRACT-007-avro.md',
 'docs/helix/02-design/contracts/CONTRACT-008-avro-document-projection.md',
 'docs/helix/03-test/test-plan.md','docs/helix/04-build/rust-migration-plan.md',
 `${directory}/capture.ts`,`${directory}/native-oracle.py`,
 'fixtures/avro/upstream/lang/java/avro/src/test/resources/SchemaBuilder.avsc',
 'fixtures/avro/upstream/lang/java/avro/src/test/resources/TestRecordWithLogicalTypes.avsc',
 'fixtures/avro/upstream/lang/java/avro/src/test/resources/TestRecordWithMapsAndArrays.avsc',
 'fixtures/avro/upstream/lang/java/avro/src/test/resources/TestUnionRecord.avsc',
 'fixtures/avro/upstream/lang/java/avro/src/test/resources/multipleFile/ApplicationEvent.avsc',
 'fixtures/avro/upstream/lang/java/avro/src/test/resources/multipleFile/DocumentInfo.avsc',
 'fixtures/avro/upstream/lang/java/avro/src/test/resources/multipleFile/MyResponse.avsc',
 'fixtures/avro/upstream/lang/java/compiler/src/test/resources/foo.Bar.avsc',
 'fixtures/avro/upstream/lang/java/compiler/src/test/resources/full_record_v1.avsc',
 'fixtures/avro/upstream/lang/java/compiler/src/test/resources/full_record_v2.avsc',
].sort();
const bundling=await Bun.build({entrypoints:[`${directory}/capture.ts`],target:'bun',write:false,metafile:true});
if(!bundling.success||!bundling.metafile)throw new Error('Could not enumerate predecessor executable imports');
const localInputs=Object.keys(bundling.metafile.inputs).filter(path=>!path.startsWith('node:')&&!path.startsWith('bun:')).sort();
const avsc=[...new Bun.Glob('**/*').scanSync('node_modules/avsc')].filter(path=>!path.endsWith('/')).map(path=>`node_modules/avsc/${path}`).sort();
const yaml=[...new Bun.Glob('**/*').scanSync('node_modules/yaml')].filter(path=>!path.endsWith('/')).map(path=>`node_modules/yaml/${path}`).sort();
const files=[...new Set([...base,...localInputs,...avsc,...yaml])].sort();
const digests:Record<string,string>={};
for(const path of files)digests[path]=hash(await readFile(resolve(root,path)));
const predecessor=await readFile(`${directory}/predecessor.json`);
const predecessorReport=JSON.parse(predecessor.toString());
const captureSourceDrift=Object.entries<string>(predecessorReport.sourceHashes).filter(([path,expected])=>digests[path]!==undefined&&digests[path]!==expected).map(([path,expected])=>({path,capturedSha256:expected,currentSha256:digests[path]}));
const manifest={kind:'umf-r5-avro-fields-executable-closure/1',predecessorSha256:hash(predecessor),bundler:'Bun.build metafile for capture.ts',runtime:{bun:Bun.version,platform:process.platform,arch:process.arch},counts:{files:files.length,localBundlerInputs:localInputs.length,avscFiles:avsc.length,yamlFiles:yaml.length,captureSourceDrift:captureSourceDrift.length},captureSourceDrift,files:digests};
if(process.argv.includes('--write')){
 await writeFile(output,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({output,sha256:hash(await readFile(output)),counts:manifest.counts},null,2));
}else{
 const prior=JSON.parse(await readFile(output,'utf8'));
 if(process.argv.includes('--check-executable')){
  const missing=Object.keys(prior.files??{}).filter(path=>!(path in digests));
  const added=files.filter(path=>!(path in (prior.files??{})));
  const changed=files.filter(path=>path!=='docs/helix/04-build/rust-migration-plan.md'&&prior.files?.[path]!==digests[path]);
  const countsMatch=prior.counts?.files===manifest.counts.files&&prior.counts?.localBundlerInputs===manifest.counts.localBundlerInputs&&prior.counts?.avscFiles===manifest.counts.avscFiles&&prior.counts?.yamlFiles===manifest.counts.yamlFiles;
  if(missing.length||added.length||changed.length||!countsMatch||prior.predecessorSha256!==manifest.predecessorSha256){
   throw new Error(`Executable closure changed: ${changed.length} executable digest mismatches, ${missing.length} missing files, ${added.length} added files, countsMatch=${countsMatch}`);
  }
  const contextPath='docs/helix/04-build/rust-migration-plan.md';
  console.log(JSON.stringify({checked:files.length,predecessorSha256:manifest.predecessorSha256,counts:prior.counts,historicalContextDrift:{path:contextPath,capturedSha256:prior.files[contextPath],currentSha256:digests[contextPath]}},null,2));
 }else if(JSON.stringify(prior)!==JSON.stringify(manifest)){
  const changed=files.filter(path=>prior.files?.[path]!==digests[path]);
  const missing=Object.keys(prior.files??{}).filter(path=>!(path in digests));
  throw new Error(`Executable closure changed: ${changed.length} digest mismatches, ${missing.length} missing files; first=${changed[0]??missing[0]??'manifest metadata'}`);
 }
 if(!process.argv.includes('--check-executable'))console.log(JSON.stringify({checked:files.length,predecessorSha256:manifest.predecessorSha256,counts:manifest.counts},null,2));
}
