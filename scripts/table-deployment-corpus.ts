// SPDX-License-Identifier: MIT OR Apache-2.0
import {compileTableDeployment} from '../src/table-deployment';
import {writeDocument} from '../src/model/document';
import fixture from '../tests/binding/fixtures/table-lifecycle-note.json';
import {deploymentFixtureSource} from '../tests/unified/table-deployment-fixture';
const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const source=()=>structuredClone(fixture) as any;
const cases:{name:string;request:Parameters<typeof compileTableDeployment>[0]}[]=[];
const add=(name:string,document=source(),config:unknown=configuration)=>cases.push({name,request:{text:JSON.stringify(document),configuration:config}});
add('simple');add('parent-scope',deploymentFixtureSource);cases.push({name:'yaml',request:{text:writeDocument(fixture as any,'yaml'),format:'yaml',configuration}});
const quote=source();quote.modules[0].extensions['umf.tables'].tables[0].name='notes";--';quote.modules[0].extensions['umf.tables'].tables[0].columns[1].default={kind:'literal',value:{string:"é 😀 O'Reilly\\n%;--"}};add('quoted-unicode-default',quote);
add('shared-schema-refuses',source(),{...configuration,schema:'public'});add('principal-collision-refuses',source(),{...configuration,batchRole:configuration.personRole});
add('unknown-configuration-refuses',source(),{...configuration,future:true});add('invalid-unicode-configuration-refuses',source(),{...configuration,schema:'\ud800'});
const unknown=source();unknown.modules[0].extensions['umf.tables'].future={preserve:true};add('unknown-selected-meaning-refuses',unknown);
const missing=source();missing.modules[0].extensions['umf.tables'].tables[0].columns.pop();add('missing-native-mapping-refuses',missing);
const padded=source();padded.modules[0].extensions['umf.tables'].tables[0].columns[0].nativeType={kind:'char',length:4};add('unqualified-codec-refuses',padded);
const named=source();named.modules[0].extensions['umf.tables'].commands.push({future:'retained'});add('unqualified-command-refuses',named);
const corpus=cases.map(item=>({...item,expected:compileTableDeployment(item.request)}));
await Bun.write(process.argv[2]!,JSON.stringify(corpus,null,2)+'\n');console.log(JSON.stringify({cases:corpus.length,compiled:corpus.filter(c=>c.expected.status==='compiled').length}));
