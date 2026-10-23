// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native G01 inputs: existing optional field, an exact NULL-only command and reviewed tightening. */
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges} from '../../src/table-migration';

const ref=(element:string)=>({module:'demo',element});
const configuration={module:'demo',schema:'g01_native',ownerRole:'g01_owner',personRole:'g01_person',batchRole:'g01_batch',groupRoles:{}};
function source(rows:{id:string;owner:string;summary?:string|null}[],withFillCommand=true,maxRows=100,valueKind:'text'|'date'|'clock'='text',constraintKind?:'check'|'unique'|'foreignKey',futureDefault=false){
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,payload=module.extensions['umf.tables'];
 const scalarType=valueKind==='date'?'date':valueKind==='clock'?'timestamp':'string';
 const nativeType=valueKind==='date'?{kind:'date'}:valueKind==='clock'?{kind:'timestamptz'}:{kind:'text'};
 const value=valueKind==='date'?{kind:'literal',value:{date:'2026-10-22'}}:valueKind==='clock'?{kind:'currentTimestamp'}:{kind:'literal',value:{string:'filled'}};
 module.elements.push({id:'summary',kind:'field',scalarType,cardinality:'one',nullability:'absent-allowed',extensions:{}});
 module.elements.find((item:any)=>item.id==='Note')!.members.push(ref('summary'));
 payload.tables[0]!.columns.push({field:ref('summary'),name:'summary',nativeType,...(futureDefault?{default:{kind:'literal',value:{string:'future'}}}:{})});
 if(constraintKind==='check')payload.tables[0]!.checks.push({id:'summary_not_filled',name:'summary_not_filled',expression:{op:'ne',left:{op:'field',field:ref('summary')},right:{op:'literal',value:{string:'filled'}}}});
 if(constraintKind==='unique')payload.tables[0]!.indexes.push({id:'summary_unique',name:'summary_unique',fields:[ref('summary')],unique:true,include:[]});
 if(constraintKind==='foreignKey')payload.tables[0]!.foreignKeys.push({id:'summary_fk',name:'summary_fk',fields:[ref('summary')],target:{record:ref('Note'),key:'primary'},onUpdate:'restrict',onDelete:'restrict',deferrable:false});
 if(withFillCommand)payload.commands.push({version:'umf.table-operation/0.1',id:'fill_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:ref('summary')},values:[{field:ref('summary'),value}],returning:[],maxRows}});
 payload.seedSets=[];
 return doc;
}
function deployed(doc:any){const result=compileTableDeployment({text:JSON.stringify(doc),configuration});if(result.status!=='compiled')throw Error('G01 native source failed deployment: '+JSON.stringify(result.diagnostics));return result.bundle;}
const scenarios=[
 {id:'empty',rows:[],expected:[]},
 {id:'all-null',rows:[{id:'a',owner:'g01_alice'},{id:'b',owner:'g01_bob'}],expected:[['a','filled'],['b','filled']]},
 {id:'mixed',rows:[{id:'a',owner:'g01_alice',summary:'kept'},{id:'b',owner:'g01_bob'}],expected:[['a','kept'],['b','filled']]},
 {id:'populated',rows:[{id:'a',owner:'g01_alice',summary:'first'},{id:'b',owner:'g01_bob',summary:'second'}],expected:[['a','first'],['b','second']]},
 {id:'clock-unknown-commit',rows:[{id:'a',owner:'g01_alice'}],expected:[['a','__transaction_clock__']],valueKind:'clock'},
 {id:'paired-finalize-retry',rows:[{id:'a',owner:'g01_alice'}],expected:[['a','filled']]},
 {id:'date-literal',rows:[{id:'a',owner:'g01_alice'}],expected:[['a','2026-10-22']],valueKind:'date'},
 {id:'future-default-preserved',rows:[{id:'a',owner:'g01_alice',summary:null},{id:'b',owner:'g01_bob',summary:null}],expected:[['a','filled'],['b','filled']],futureDefault:true},
 {id:'paired-not-null-failure-rollback',rows:[{id:'a',owner:'g01_alice'},{id:'b',owner:'g01_bob'}],expected:[['a',null],['b',null]],expectedFailure:'native-not-null-violation'},
 {id:'check-violation-rollback',rows:[{id:'a',owner:'g01_alice'},{id:'b',owner:'g01_bob'}],expected:[['a',null],['b',null]],expectedFailure:'native-constraint-violation',constraintKind:'check'},
 {id:'unique-key-violation-rollback',rows:[{id:'a',owner:'g01_alice'},{id:'b',owner:'g01_bob'}],expected:[['a',null],['b',null]],expectedFailure:'native-constraint-violation',constraintKind:'unique'},
 {id:'foreign-key-violation-rollback',rows:[{id:'a',owner:'g01_alice'},{id:'b',owner:'g01_bob'}],expected:[['a',null],['b',null]],expectedFailure:'native-constraint-violation',constraintKind:'foreignKey'},
 {id:'overbound-rollback',rows:[{id:'a',owner:'g01_alice'},{id:'b',owner:'g01_bob'}],expected:[['a',null],['b',null]],maxRows:1,expectedFailure:'backfill-effect-bound'},
];
const cases=scenarios.map((scenario,index)=>{
 const valueKind=('valueKind' in scenario?scenario.valueKind:'text') as 'text'|'date'|'clock';
 const constraintKind=('constraintKind' in scenario?scenario.constraintKind:undefined) as 'check'|'unique'|'foreignKey'|undefined;
 const futureDefault='futureDefault' in scenario&&scenario.futureDefault===true;
 const previous=deployed(source(scenario.rows,false,100,valueKind,constraintKind,futureDefault)),nextSource=JSON.parse(deployed(source(scenario.rows,true,'maxRows' in scenario?scenario.maxRows:100,valueKind,constraintKind,futureDefault)).source.utf8);
 nextSource.modules[0]!.elements.find((item:any)=>item.id==='summary')!.nullability='required';
 const next=deployed(nextSource),candidate=discoverTableMigrationChanges(previous,next).find(item=>item.kind==='tighten-not-null');
 if(!candidate)throw Error('G01 native tighten marker missing: '+scenario.id);
 const {oldValue:_old,newValue:_new,...marker}=candidate;
 const request={id:'g01-'+scenario.id+'-002',predecessor:{id:'g01-'+scenario.id+'-001',digest:index.toString(16).padStart(64,'0')},previous,next,options:{version:'umf.table-migration-options/0.3' as const,backfills:[{table:'notes',column:ref('summary'),operation:'fill_summary',scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[marker],validations:[]}};
 const result=compileTableMigration(request);if(result.status!=='compiled')throw Error('G01 native plan failed compile: '+scenario.id+' '+JSON.stringify(result.diagnostics));
 return {id:scenario.id,configuration,initialSource:previous.source,source:next.source,plan:result.plan,initialRows:scenario.rows,expectedRows:scenario.expected,...('expectedFailure' in scenario?{expectedFailure:scenario.expectedFailure}:{})};
});
await Bun.write(process.argv[2]??'/private/tmp/umf-g01-native-fixture.json',JSON.stringify({version:'umf.praxis.g01-native-fixture/1',cases},null,2)+'\n');
console.log(JSON.stringify({cases:cases.map(item=>({id:item.id,planVersion:item.plan.version,phases:item.plan.phases?.map(phase=>phase.kind)}))}));
