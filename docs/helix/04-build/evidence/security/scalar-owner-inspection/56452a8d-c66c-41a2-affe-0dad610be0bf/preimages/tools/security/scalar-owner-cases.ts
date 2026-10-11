import {inspectCoreScalarType} from '../../src/model/scalar-type';
import {SCALAR_TYPES,type Document} from '../../src/model/types';
import sourceSchema from '../../spec/core/relationship-document.schema.json';
import resultSchema from '../../spec/core/scalar-type-inspection.schema.json';
import {createValidator} from '../../src/validation/schema';
export function runScalarOwnerCases(){
 const rows:{id:string;passed:boolean}[]=[];
 const source=(properties:Record<string,unknown>):Document=>({umf:'0.7.0',id:'d',vocabularies:{},modules:[{id:'m',namespace:'m',elements:[{id:'v',extensions:{},...properties}]}]});
 const identity={module:'m',element:'v'};
 const validator=createValidator();validator.addSchema(sourceSchema);const validResult=validator.compile(resultSchema);
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 function check(id:string,passed:boolean){rows.push({id,passed});if(!passed)throw Error(id)}
 function refused(id:string,run:()=>unknown,code:string){let actual='';try{run()}catch(error){actual=(error as {code:string}).code}check(id,actual===code)}
 for(const scalarType of SCALAR_TYPES){const d=source({kind:'field',scalarType}),r=inspectCoreScalarType(d,identity);check('known-'+scalarType,same(r.meaning,{state:'known',scalarType})&&same(r.source,d)&&same(r.identity,identity)&&r.path==='/modules/0/elements/0/scalarType'&&r.provenance==='unverified')}
 for(const [id,properties,meaning] of [
  ['future-label',{kind:'field',scalarType:'future-scalar'},{state:'unknown',value:'future-scalar'}],
  ['missing-field-label',{kind:'field'},{state:'missing'}],
  ['group-without-label',{kind:'group'},{state:'inapplicable'}],
  ['unspecified-role',{scalarType:'integer'},{state:'inapplicable',authoredScalarType:'integer'}],
  ['future-role',{kind:'future-role',scalarType:'future-scalar'},{state:'inapplicable',authoredScalarType:'future-scalar'}],
 ] as const){const d=source(properties);check(id,same(inspectCoreScalarType(d,identity).meaning,meaning))}
 const opaque=source({kind:'field',scalarType:'string',future:{tuple:['a','b']}}),r=inspectCoreScalarType(opaque,identity);
 (opaque.modules[0]!.elements[0]!.future as {tuple:string[]}).tuple.reverse();check('original-copy-isolation',same(r.source.modules[0]!.elements[0]!.future,{tuple:['a','b']}));
 r.source.modules[0]!.elements[0]!.scalarType='integer';check('result-cannot-mutate-input',opaque.modules[0]!.elements[0]!.scalarType==='string');
 check('scalar-one',same(inspectCoreScalarType(source({kind:'field',scalarType:'decimal',cardinality:'one'}),identity).meaning,{state:'known',scalarType:'decimal'}));
 for(const cardinality of ['array','map']){
  refused('container-scalar-conflict-'+cardinality,()=>inspectCoreScalarType(source({kind:'field',scalarType:'decimal',cardinality}),identity),'CORE_SCALAR_TYPE_SOURCE');
  const d=source({kind:'field',cardinality,itemType:{module:'m',element:'item'}});d.modules[0]!.elements.push({id:'item',kind:'field',scalarType:'decimal',extensions:{}});
  check('container-does-not-inherit-item-label-'+cardinality,same(inspectCoreScalarType(d,identity).meaning,{state:'missing'}));
  check('item-label-remains-qualified-'+cardinality,same(inspectCoreScalarType(d,{module:'m',element:'item'}).meaning,{state:'known',scalarType:'decimal'}));
 }
 const qualified=source({kind:'field',scalarType:'string'});qualified.modules.push({id:'other',namespace:'other',elements:[{id:'v',kind:'field',scalarType:'integer',extensions:{}}]});
 const q=inspectCoreScalarType(qualified,{module:'other',element:'v'});check('qualified-module-identity',q.path==='/modules/1/elements/0/scalarType'&&same(q.meaning,{state:'known',scalarType:'integer'}));
 const d=source({kind:'field',scalarType:'string'});
 const honest=inspectCoreScalarType(d,identity);check('result-contract-positive',validResult(honest));
 for(const [id,mutation] of [
  ['unknown-recognized-label',{meaning:{state:'unknown',value:'string'}}],
  ['known-future-label',{meaning:{state:'known',scalarType:'future-scalar'}}],
  ['missing-with-label',{meaning:{state:'missing',scalarType:'string'}}],
  ['future-operation-version',{version:'future'}],
  ['invented-provenance',{provenance:'authenticated'}],
  ['extra-result-member',{enforcement:'database'}],
 ] as const)check('closed-result-refusal-'+id,!validResult({...honest,...mutation}));
 refused('missing-module',()=>inspectCoreScalarType(d,{module:'absent',element:'v'}),'CORE_SCALAR_TYPE_MISSING');
 refused('missing-element',()=>inspectCoreScalarType(d,{module:'m',element:'absent'}),'CORE_SCALAR_TYPE_MISSING');
 for(const identity of [null,[],{}, {module:'m',element:''},{module:'m',element:'v',future:true}])refused('malformed-identity-'+JSON.stringify(identity),()=>inspectCoreScalarType(d,identity as any),'CORE_SCALAR_TYPE_IDENTITY');
 const duplicate=source({kind:'field',scalarType:'string'});duplicate.modules[0]!.elements.push({...duplicate.modules[0]!.elements[0]!});
 refused('duplicate-source-identity',()=>inspectCoreScalarType(duplicate,identity),'CORE_SCALAR_TYPE_SOURCE');
 refused('group-label-forbidden-by-source',()=>inspectCoreScalarType(source({kind:'group',scalarType:'string'}),identity),'CORE_SCALAR_TYPE_SOURCE');
 refused('invalid-source-label',()=>inspectCoreScalarType(source({kind:'field',scalarType:3}),identity),'CORE_SCALAR_TYPE_SOURCE');
 for(const umf of ['0.1.0','0.6.0','0.8.0','future'])refused('unsupported-envelope-'+umf,()=>inspectCoreScalarType({...d,umf} as Document,identity),'CORE_SCALAR_TYPE_VERSION');
 let callbacks=0;const hostile={...d};Object.defineProperty(hostile,'modules',{enumerable:true,get(){callbacks++;return d.modules}});
 refused('getter-refusal',()=>inspectCoreScalarType(hostile,identity),'NON_JSON');check('getter-not-invoked',callbacks===0);
 return rows;
}
