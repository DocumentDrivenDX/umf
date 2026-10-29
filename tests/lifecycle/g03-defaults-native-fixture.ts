// SPDX-License-Identifier: MIT OR Apache-2.0
/** Full-source, inert G03 native inputs. This module performs no compilation or I/O. */
import fixture from '../binding/fixtures/table-lifecycle-note.json';

const ref=(element:string)=>({module:'demo',element});
export const g03Configuration={module:'demo',schema:'g03_defaults',ownerRole:'g03_owner',personRole:'g03_person',batchRole:'g03_batch',groupRoles:{}};
const rows=[['a','Alice',null],['b','Bob',2],['c','Alice',9]] as const;
const requiredRows=[['ra','Alice',1],['rb','Bob',2],['rc','Alice',9]] as const;
const literalInteger=(value:'5'|'9')=>({kind:'literal',value:{integerToken:value}});

function operationDeclarations(includeOmitted=true){
 const parameters=[{id:'id',field:ref('id')},{id:'owner',field:ref('owner')}];
 const values=parameters.map(item=>({field:item.field,value:{kind:'parameter',parameter:item.id}}));
 const returning=[ref('id'),ref('owner'),ref('measure')];
 const common={version:'umf.table-operation/0.1',consistency:'transaction',replay:'caller-key-required'};
 return [
  {version:'umf.table-operation/0.1',id:'read_notes',parameters:[],consistency:'statement',replay:'none',body:{kind:'read',table:'notes',fields:returning,where:{op:'all'},orderBy:[{field:ref('id'),direction:'asc'}],result:'page',maxRows:100,cursorKey:'primary'}},
  ...(includeOmitted?[{...common,id:'create_note_omitted',parameters,body:{kind:'insert',table:'notes',values,returning,maxRows:1}}]:[]),
  {...common,id:'create_note_explicit',parameters:[...parameters,{id:'measure',field:ref('measure')}],body:{kind:'insert',table:'notes',values:[...values,{field:ref('measure'),value:{kind:'parameter',parameter:'measure'}}],returning,maxRows:1}},
  {...common,id:'update_measure',parameters:[{id:'id',field:ref('id')},{id:'measure',field:ref('measure')}],body:{kind:'update',table:'notes',where:{op:'eq',field:ref('id'),value:{kind:'parameter',parameter:'id'}},values:[{field:ref('measure'),value:{kind:'parameter',parameter:'measure'}}],returning,maxRows:1}},
 ];
}

/** Append the G03 target before bootstrap; all other original source meaning is retained. */
export function g03Source(defaultValue?:unknown,options:{required?:boolean;commands?:boolean;logicalDefault?:unknown}={}){
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,table=module.extensions['umf.tables'].tables[0]!;
 const measure={id:'measure',kind:'field',scalarType:'integer',cardinality:'one',nullability:options.required?'required':'absent-allowed',extensions:{}};
 if(options.logicalDefault!==undefined)(measure as any).default=options.logicalDefault;
 module.elements.push(measure);
 module.elements.find((item:any)=>item.id==='Note')!.members.push(ref('measure'));
 const column:any={field:ref('measure'),name:'measure',nativeType:{kind:'int4'}};
 if(defaultValue!==undefined)column.default=defaultValue;
 table.columns.push(column);
 module.extensions['umf.tables'].commands=operationDeclarations(options.commands!==false);
 return doc;
}

function typedDomainSource(scalarType:string,nativeType:unknown,defaultValue?:unknown,logicalDefault?:unknown){
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,table=module.extensions['umf.tables'].tables[0]!;
 const field:any={id:'measure',kind:'field',scalarType,cardinality:'one',nullability:'absent-allowed',extensions:{}};
 if(scalarType==='decimal')field.facets={precision:8,scale:2};
 if(logicalDefault!==undefined)field.default=logicalDefault;
 module.elements.push(field);
 module.elements.find((item:any)=>item.id==='Note')!.members.push(ref('measure'));
 const column:any={field:ref('measure'),name:'measure',nativeType};
 if(defaultValue!==undefined)column.default=defaultValue;
 table.columns.push(column);
 module.extensions['umf.tables'].commands=operationDeclarations(true);
 return doc;
}

export function buildG03DefaultsNativeFixture(){
 const source=(doc:any)=>({format:'json',utf8:JSON.stringify(doc)});
 const campaignRoster=[
  {caseId:'G03-N01',scenarios:['transitions']},{caseId:'G03-N02',scenarios:['empty']},
  {caseId:'G03-N03',scenarios:['required']},{caseId:'G03-N04',scenarios:['admission-refusal']},
  {caseId:'G03-N05',scenarios:['semantic-null','semantic-decimal']},{caseId:'G03-N06',scenarios:['rollback']},
  {caseId:'G03-N07',scenarios:['commit-observation','finalize-observation','finalize-before-publication']},
  {caseId:'G03-N08',scenarios:['unknown-no-commit']},{caseId:'G03-N09',scenarios:['writer-barrier']},
  {caseId:'G03-N10',scenarios:['domain-date','domain-text','domain-decimal']},
  {caseId:'G03-N11',scenarios:['domain-uuid','domain-currentTimestamp']},
  {caseId:'G03-N12',scenarios:['ordinary']},{caseId:'G03-N13',scenarios:['tampering']},
  {caseId:'G03-N14',scenarios:['campaign-cleanup']},
 ];
 return {
  version:'umf.praxis.g03-defaults-native-fixture/1',status:'SOURCE_ONLY_ALL_NATIVE_CASES_UNRUN',configuration:g03Configuration,
  campaignExpectedManifestProfile:'umf.g03-native-campaign-expected-data/0.1',campaignRoster,
  initialSource:source(g03Source()),
  variants:{absent:source(g03Source()),set5:source(g03Source(literalInteger('5'))),set9:source(g03Source(literalInteger('9'))),drop:source(g03Source()),literalNull:source(g03Source({kind:'literal',value:null})),matchingLogical5:source(g03Source(literalInteger('5'),{logicalDefault:{on:'missing',value:{integerToken:'5'}}})),requiredSet5:source(g03Source(literalInteger('5'),{required:true,commands:false})),requiredSet5RetainedOmission:source(g03Source(literalInteger('5'),{required:true})),requiredSet9:source(g03Source(literalInteger('9'),{required:true,commands:false})),requiredDrop:source(g03Source(undefined,{required:true,commands:false})),requiredDropRetainedOmission:source(g03Source(undefined,{required:true})),dateAbsent:source(typedDomainSource('date',{kind:'date'})),date:source(typedDomainSource('date',{kind:'date'},{kind:'literal',value:{date:'2000-02-29'}})),textAbsent:source(typedDomainSource('string',{kind:'text'})),text:source(typedDomainSource('string',{kind:'text'},{kind:'literal',value:{string:'G03 \u{1f9ed} text'}})),decimalAbsent:source(typedDomainSource('decimal',{kind:'numeric',precision:8,scale:2})),decimal:source(typedDomainSource('decimal',{kind:'numeric',precision:8,scale:2},{kind:'literal',value:{decimalToken:'1.0'}})),decimalExponent:source(typedDomainSource('decimal',{kind:'numeric',precision:8,scale:2},{kind:'literal',value:{decimalToken:'1e0'}})),uuidAbsent:source(typedDomainSource('uuid',{kind:'uuid'})),uuid:source(typedDomainSource('uuid',{kind:'uuid'},{kind:'randomUuid'})),currentTimestampAbsent:source(typedDomainSource('timestamp',{kind:'timestamptz'})),currentTimestamp:source(typedDomainSource('timestamp',{kind:'timestamptz'},{kind:'currentTimestamp'}))},
  compileOnlyControls:[
   {id:'invalid-gregorian-date',source:source(typedDomainSource('date',{kind:'date'},{kind:'literal',value:{date:'1900-02-29'}})),expected:'blocked'},
   {id:'wrong-date-carrier',source:source(typedDomainSource('date',{kind:'date'},{kind:'literal',value:{timestamp:'2000-02-29T00:00:00Z'}})),expected:'blocked'},
   {id:'wrong-date-native-domain',source:source(typedDomainSource('date',{kind:'timestamptz'},{kind:'literal',value:{date:'2000-02-29'}})),expected:'blocked'},
   {id:'temporal-logical-default',source:source(typedDomainSource('date',{kind:'date'},{kind:'literal',value:{date:'2000-02-29'}},{on:'missing',value:{date:'2000-02-29'}})),expected:'blocked'},
   {id:'numeric-capacity-overflow',source:source(typedDomainSource('decimal',{kind:'numeric',precision:8,scale:2},{kind:'literal',value:{decimalToken:'1234567.89'}})),expected:'blocked'},
  ],
  chains:{nullable:['absent','set5','set9','drop'],empty:['absent','set5','set9','drop'],required:['requiredSet5','requiredSet9','requiredDrop']},
  historicalRows:rows,requiredHistoricalRows:requiredRows,
  manualExpected:{afterSet5:[['a','g03_alice',null],['b','g03_bob',2],['c','g03_alice',9]],afterSet9:[['a','g03_alice',null],['b','g03_bob',2],['c','g03_alice',9]],omittedAt5:5,omittedAt9:9,explicitNull:null,explicit13:13},
  caseStatus:{
   'G03-N01':'TRANSITIONS_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N02':'EMPTY_TABLE_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N03':'REQUIRED_SET_REPLACE_DROP_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N04':'RETAINED_OMISSION_SOURCE_REFUSAL_AND_READONLY_NATIVE_ABSENCE_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N05':'NULL_AND_DECIMAL_SPELLING_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N06':'KNOWN_ABORT_RETRY_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N07':'COMMIT_AND_PREPUBLICATION_RECOVERY_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N08':'UNKNOWN_UNCOMMITTED_FENCE_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N09':'WRITER_BARRIER_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N10':'DATE_TEXT_DECIMAL_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N11':'UUID_AND_TRANSACTION_TIMESTAMP_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N12':'UNQUALIFIED_COMPATIBLE_WEFT_02_COHORT_REQUIRED',
   'G03-N13':'FULL_PRE_EFFECT_TAMPERING_MATRIX_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
   'G03-N14':'SERIAL_CLEANUP_CAMPAIGN_SOURCE_IMPLEMENTED_NATIVE_UNRUN_FULL_CASE_OPEN',
  },
 };
}

if(import.meta.main){
 const output=process.argv[2]??'/private/tmp/g03-defaults-native-fixture.json';
 await Bun.write(output,JSON.stringify(buildG03DefaultsNativeFixture(),null,2)+'\n');
 console.log(JSON.stringify({output,status:'SOURCE_ONLY_ALL_NATIVE_CASES_UNRUN',variants:Object.keys(buildG03DefaultsNativeFixture().variants).length,caseStatus:buildG03DefaultsNativeFixture().caseStatus}));
}
