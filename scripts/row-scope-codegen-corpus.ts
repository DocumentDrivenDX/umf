// SPDX-License-Identifier: MIT OR Apache-2.0
/** Cross-runtime cases for the shared TypeScript/Python row_scope authoring API. */
import {normalizeRowScope} from '../src/table-authoring/row-scope';
import {inspectTableLifecycle} from '../src/extensions/tables';
import {compileTableDeployment} from '../src/table-deployment';
import {relatedSource} from '../tests/unified/table-related-fixture';
const configuration={module:'demo',schema:'row_scope_demo',ownerRole:'row_scope_owner',personRole:'row_scope_person',batchRole:'row_scope_batch',groupRoles:{reviewers:'row_scope_reviewers'}};
const source=relatedSource();
const baseContext:any={record:{module:'demo',element:'Note'},ownerColumns:{owner:{module:'demo',element:'owner'}},via:[{name:'membership',record:{module:'demo',element:'Membership'},personColumnName:'memberPerson',keyColumnName:'memberNote',sourceField:{module:'demo',element:'id'},keyField:{module:'demo',element:'memberNote'},personField:{module:'demo',element:'memberPerson'}}],groups:{reviewers:'reviewers'},lifecycleDocument:source,tableId:'notes',deploymentConfiguration:configuration};
function bind(document:any,context:any){return {...context,lifecycleDocument:document,admitPolicy(policy:any){const candidate=structuredClone(document);candidate.modules[0].extensions['umf.tables'].tables.find((t:any)=>t.id===context.tableId).policy=policy;const checked=inspectTableLifecycle(candidate);if(!checked.valid||!checked.complete)return checked.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message}));const result=compileTableDeployment({text:JSON.stringify(candidate),configuration});return result.status==='blocked'?result.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message})):[];}};}
const cases:any[]=[];
const add=(id:string,input:any,document=source,context=baseContext)=>cases.push({id,input,context:{...context,lifecycleDocument:document},expected:normalizeRowScope(input,bind(document,context))});
add('supplied-owner-via-group-batch',{row_scope:{owner_column:'owner',commands:['select','insert','update','delete'],via:[{table:'membership',person_column:'memberPerson',key_column:'memberNote'}],batch:['select','insert'],groups:[{name:'reviewers',commands:['select']}]}});
add('unknown-content-preserved',{row_scope:{commands:['select'],batch:[],future:{retained:true}}});
add('ambiguous-via-binding',{row_scope:{commands:['select'],batch:[],via:[{table:'membership',person_column:'memberPerson',key_column:'memberNote'}]}},source,{...baseContext,via:[...baseContext.via,{...baseContext.via[0]}]});
add('group-command-widening-refused',{row_scope:{owner_column:'owner',commands:['select'],batch:[],groups:[{name:'reviewers',commands:['delete']}]}});
const cyclic=structuredClone(source),member=cyclic.modules[0].extensions['umf.tables'].tables[1];member.policy.person.select={kind:'related',record:{module:'demo',element:'Note'},matches:[{source:{module:'demo',element:'memberNote'},target:{module:'demo',element:'id'}}],rule:{kind:'owner',field:{module:'demo',element:'owner'}}};
add('policy-cycle-refused',{row_scope:{commands:['select'],batch:[],via:[{table:'membership',person_column:'memberPerson',key_column:'memberNote'}]}},cyclic);
const noSelect=structuredClone(source);noSelect.modules[0].extensions['umf.tables'].tables[1].policy.person.select={kind:'deny'};
add('related-select-dependency-refused',{row_scope:{commands:['select'],batch:[],via:[{table:'membership',person_column:'memberPerson',key_column:'memberNote'}]}},noSelect);
await Bun.write(process.argv[2]??'/private/tmp/umf-row-scope-codegen-corpus.json',JSON.stringify(cases,null,2)+'\n');
console.log(JSON.stringify({cases:cases.map(c=>({id:c.id,valid:c.expected.valid}))}));
