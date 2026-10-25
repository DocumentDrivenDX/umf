import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSemanticTypeRegistry,UmfCoreError} from '@umf/core-rust-native';

const ref={vocabulary:'example.test',version:'1.0.0',term:'email'};
let calls=0;
const registry=createSemanticTypeRegistry({controls:{maxWork:1_000_000}}).register(ref,{format:'email'},(_value,_definition,{reportWork})=>{calls++;reportWork(2);reportWork(3);return {status:'valid',complete:true,issues:[]};});
assert.equal(registry.check(ref,'person@example.test').status,'valid');
assert.equal(calls,1);
assert.equal(registry.lookup({vocabulary:'example.test',version:'1.0.0',term:'missing'}),undefined);
assert.equal(registry.check({...ref,future:true},null).status,'unknown');
let controlCode;
const invalid=createSemanticTypeRegistry().register({...ref,term:'bad-work'},{},(_v,_d,{reportWork})=>{reportWork(-1);return {status:'valid',complete:true,issues:[]};});
try{invalid.check({...ref,term:'bad-work'},null)}catch(error){controlCode=error.code}
assert.equal(controlCode,'HOST_CONTROL');
const packet=JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r5-core-semantic-types/frozen-typescript.json','utf8'));
const source=structuredClone(packet.cases.inspect.value.source);
delete source.modules[0].elements[0].semanticTypes[0].qualifier;
const paths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json'};
const resources=Object.fromEntries(Object.entries(paths).map(([name,path])=>[name,JSON.parse(readFileSync(path,'utf8'))]));
let aggregateCalls=0;
const aggregate=createSemanticTypeRegistry().register({vocabulary:'example.contact',version:'1.0.0',term:'email'},{},()=>{aggregateCalls++;return {status:'valid',complete:true,issues:[]};})
  .validateCoreSemanticTypeValue(resources,source,{module:'m',element:'e'},'x');
assert.equal(aggregate.status,'valid');assert.equal(aggregateCalls,1);
assert.throws(()=>registry.register(ref,{},42),e=>e instanceof UmfCoreError&&e.code==='SEMANTIC_TYPE_STRUCTURE'&&e.message==='Expected explicit validator function');
console.log(JSON.stringify({status:'pass',runtime:process.versions.bun?{host:'Bun',version:Bun.version}:{host:'Node',version:process.version},binding:'clean-installed-package-name-import',registry:'admit-lookup-check',aggregate:'valid',reportedWork:'5',invalidReportWork:controlCode}));
