// SPDX-License-Identifier: MIT OR Apache-2.0
import {compileTableDeployment,type TableDeploymentBundle} from '../src/table-deployment';
import {compileTableMigration,type TableMigrationRequest} from '../src/table-migration';
import {writeDocument} from '../src/model/document';
import {hashCanonical} from '../src/compilation/bundle/hash';
import {appendedTableSource,indexedTableSource} from '../tests/unified/table-migration-fixture';
import {tableOperationSource} from '../tests/unified/table-operation-fixture';
import fixture from '../tests/binding/fixtures/table-lifecycle-note.json';
const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
function deployment(document:any=structuredClone(fixture),format:'json'|'yaml'='json',config=configuration):TableDeploymentBundle{
 const r=compileTableDeployment({text:writeDocument(document,format),format,configuration:config});if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.bundle;
}
const initial=(next=deployment()):TableMigrationRequest=>({id:'001',predecessor:null,previous:null,next});
const forward=():TableMigrationRequest=>({id:'002',predecessor:{id:'001',digest:'a'.repeat(64)},previous:deployment(),next:deployment(appendedTableSource())});
const cases:{name:string;request:TableMigrationRequest}[]=[];
const add=(name:string,request:TableMigrationRequest)=>cases.push({name,request});
add('initial-json',initial());add('initial-yaml',initial(deployment(structuredClone(fixture),'yaml')));add('append-table',forward());
const indexes=forward();indexes.next=deployment(indexedTableSource());add('append-index',indexes);
const together=forward();together.next=deployment(indexedTableSource(appendedTableSource()));add('append-index-and-table',together);
const declared:any=tableOperationSource(),revised=structuredClone(declared);revised.modules[0]!.extensions['umf.tables'].commands[0]!.body.maxRows=2;
const commands={...forward(),previous:deployment(declared),next:deployment(revised)};add('command-only-revision',commands);
revised.modules[0]!.extensions['umf.tables'].commands=[];add('command-retirement',{...commands,next:deployment(revised)});
const rewritten=indexedTableSource();rewritten.modules[0].extensions['umf.tables'].tables[0].indexes[0].unique=true;
add('existing-index-replacement-refuses',{...indexes,previous:deployment(indexedTableSource()),next:deployment(rewritten)});
const unicode=forward();unicode.id='révision-😀-"002"';unicode.next=deployment(appendedTableSource(),'yaml');add('unicode-id-and-yaml-next',unicode);
const absent=forward();absent.predecessor=null;add('missing-predecessor-refuses',absent);
const repeat=forward();repeat.predecessor!.id=repeat.id;add('self-predecessor-refuses',repeat);
const unchanged=forward();unchanged.next=unchanged.previous!;add('unchanged-cohort-refuses',unchanged);
const backward=forward();[backward.previous,backward.next]=[backward.next,backward.previous!];add('removal-refuses',backward);
const different=forward();different.next=deployment(appendedTableSource(),'json',{...configuration,schema:'plugin_other'});add('namespace-change-refuses',different);
const changed=forward(),doc=appendedTableSource();doc.modules[0].extensions['umf.tables'].tables[0].policy.batch.select={kind:'deny'};changed.next=deployment(doc);add('existing-policy-change-refuses',changed);
const seeded=structuredClone(fixture) as any;seeded.modules[0].extensions['umf.tables'].seedSets=[{id:'empty',conflict:'error',rows:[]}];add('unqualified-seeds-refuse',initial(deployment(seeded)));
const forged=forward();forged.previous!.steps[0]!.sql='DROP SCHEMA public CASCADE';const {bundleDigest,...body}=forged.previous!;forged.previous!.bundleDigest=hashCanonical(body);add('rehashed-previous-SQL-refuses',forged);
const corpus=cases.map(c=>({...c,expected:compileTableMigration(c.request)}));
await Bun.write(process.argv[2]!,JSON.stringify(corpus,null,2)+'\n');console.log(JSON.stringify({cases:corpus.length,compiled:corpus.filter(c=>c.expected.status==='compiled').length}));
