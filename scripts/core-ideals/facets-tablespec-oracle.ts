/** Native checks for both facet directions; complete compatibility refresh still gates binding acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const python=process.env.UMF_TABLESPEC_PYTHON??'/home/erik/Projects/tablespec/.venv/bin/python';
const commands=[['bun','scripts/core-ideals/facets-tablespec-profile-oracle.ts'],['bun','scripts/core-ideals/facets-tablespec-capture.ts'],[python,'scripts/core-ideals/facets-tablespec-classification-oracle.py'],[python,'scripts/core-ideals/facets-tablespec-suite-oracle.py'],['bun','scripts/core-ideals/facets-tablespec-projection-capture.ts'],[python,'scripts/core-ideals/facets-tablespec-projection-oracle.py'],[python,'scripts/core-ideals/facets-tablespec-projection-values-oracle.py']];
const runs=[];
for(const command of commands){const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:{...process.env,JAVA_HOME:process.env.JAVA_HOME??'/home/erik/.local/share/mise/installs/java/openjdk-21.0.2'}});const exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`Facet native check failed: ${command.join(' ')}`);}
const paths=['scripts/core-ideals/facets-tablespec-oracle.ts','scripts/core-ideals/facets-tablespec-capture.ts','scripts/core-ideals/facets-tablespec-cases.ts','src/core-ideals/facets-tablespec.ts','src/core-ideals/facets-tablespec-projection.ts','src/core-ideals/tablespec-facet-suite.ts','scripts/core-ideals/facets-tablespec-projection-cases.ts','spec/core/facets-tablespec-projection.schema.json','spec/core/tablespec-facet-classification.schema.json','spec/extensions/tablespec-facets/package.json','spec/extensions/tablespec-facets/schema.json'];
for(const path of ['fixtures/validation/facets-tablespec-profile-native.json','fixtures/validation/facets-tablespec-classification-native.json','fixtures/validation/facets-tablespec-suite-native.json','fixtures/validation/facets-tablespec-projection-native.json','fixtures/validation/facets-tablespec-projection-values-native.json']){
 const proof=await Bun.file(path).json();assert.equal(proof.nativeVersion,'647e8e566ad78b864282ec65c0b0b2237aa63084');
 for(const [p,h] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'),h,`Stale native proof: ${p}`);
 paths.push(path,...Object.keys(proof.sha256));
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/facets-tablespec-native.json',JSON.stringify({scope:'Experimental facet classification, authored projection and retained recovery; complete compatibility refresh required before binding acceptance',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',bindingAccepted:false,idealAdmitted:false,nativeEquivalence:false,runs,sha256},null,2)+'\n');
console.log(JSON.stringify({nativeCommands:runs.length,bindingAccepted:false}));
