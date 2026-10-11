import {readJsonValue} from '../model/serialization';
import {type NativeJson} from '../model/native-json';
import {UmfError,pointer} from '../model/types';
import {type CoreFacetPatch} from '../model/facets';
type Concept='length'|'decimal'|'integerWidth';
export interface TableSpecSuiteClaim {concept:Concept;path:string;basis:string}
export interface TableSpecSuiteIssue {path:string;value:NativeJson;reason:string}
const number=(node:NativeJson|undefined):number|undefined=>{
 if(node?.kind!=='number')return undefined;
 try{const n=readJsonValue(node.value,'json');return typeof n==='number'&&Number.isSafeInteger(n)?n:undefined;}catch(e){if(!(e instanceof UmfError))throw e;return undefined;}
};
const string=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
const boolean=(n:NativeJson|undefined)=>n?.kind==='boolean'?n.value:undefined;
/** Closed, unconditional suite subset. Unknown native content is reported, never evaluated. */
export function inspectTableSpecFacetSuite(table:NativeJson,column:number):{facets:CoreFacetPatch;claims:TableSpecSuiteClaim[];issues:TableSpecSuiteIssue[]}{
 const facets:CoreFacetPatch={},claims:TableSpecSuiteClaim[]=[],issues:TableSpecSuiteIssue[]=[];
 const base='/extensions/umf.tablespec/root',suitePath=base+'/members/expectations';
 const issue=(path:string,value:NativeJson|undefined,reason:string)=>issues.push({path,value:value??{kind:'null'},reason});
 if(table.kind!=='object'||table.members.columns?.kind!=='array')throw new UmfError('TABLESPEC_SUITE_SOURCE','Expected native table');
 const col=table.members.columns.items[column];if(col?.kind!=='object')throw new UmfError('TABLESPEC_SUITE_COLUMN','Expected native column');
 const type=string(col.members.data_type),name=string(col.members.name),columnPath=base+'/members/columns/items/'+column;
 const suite=table.members.expectations;
 if(suite?.kind!=='object'||suite.members.expectations?.kind!=='array'){issue(suitePath,suite,'Explicit unified expectation suite is absent or unsupported');return {facets,claims,issues};}
 for(const [key,value] of Object.entries(suite.members))if(key!=='expectations'&&value.kind!=='null'&&!(value.kind==='array'&&value.items.length===0))issue(suitePath+'/members/'+pointer(key),value,'Suite-level policy or unknown content is not interpreted as a facet');
 const candidates:{concept:Concept;value:CoreFacetPatch;path:string}[]=[];
 for(const [index,rule] of suite.members.expectations.items.entries()){
  const at=suitePath+'/members/expectations/items/'+index;
  if(rule.kind!=='object'||rule.members.kwargs?.kind!=='object'){issue(at,rule,'Malformed or unfamiliar native expectation');continue;}
  const kwargs=rule.members.kwargs.members,target=string(kwargs.column);
  if(target!==name){issue(at,rule,'Expectation for another column or table remains outside this Field interpretation');continue;}
  const kind=string(rule.members.type),meta=rule.members.meta;
  const length=kind==='expect_column_value_lengths_to_be_between',numeric=kind==='expect_column_values_to_be_between';
  const allowedRule=['type','kwargs','meta'],allowedArgs=['column','min_value','max_value','mostly'],allowedMeta=['stage','severity','blocking','description','tags','generated_from'];
  if(!length&&!numeric||Object.keys(rule.members).some(k=>!allowedRule.includes(k))||Object.keys(kwargs).some(k=>!allowedArgs.includes(k))||meta?.kind!=='object'||Object.keys(meta.members).some(k=>!allowedMeta.includes(k))||number(kwargs.mostly)!==1||boolean(meta.members.blocking)!==true||!['error','critical'].includes(string(meta.members.severity)??'')||string(meta.members.stage)!==(length?'raw':'ingested')){
   issue(at,rule,'Only explicit, unconditional mostly=1 facet rules with appropriate stage and blocking/error metadata establish this bound');continue;
  }
  const low=number(kwargs.min_value),high=number(kwargs.max_value);
  if(low===undefined||high===undefined||low>high){issue(at,rule,'Range endpoints must be exact safe integers in ascending order');continue;}
  if(length&&['VARCHAR','CHAR','TEXT'].includes(type??'')&&low===0&&high>=0)candidates.push({concept:'length',value:{length:{max:high,unit:'unicode-scalar'}},path:at});
  else if(numeric&&type==='INTEGER'){
   let width:{bits:number;signed:boolean}|undefined;
   for(let bits=1;bits<=32;bits++){
    if(low===-(2**(bits-1))&&high===2**(bits-1)-1)width={bits,signed:true};
    if(bits<=31&&low===0&&high===2**bits-1)width={bits,signed:false};
   }
   if(width)candidates.push({concept:'integerWidth',value:{integerWidth:width},path:at});else issue(at,rule,'Range is not a canonical width domain within the signed-32-bit native carrier');
  }else if(numeric&&type==='DECIMAL'){
   let precision:number|undefined;for(let p=1;p<=10;p++)if(low===-(10**p-1)&&high===10**p-1)precision=p;
   if(precision)candidates.push({concept:'decimal',value:{precision,scale:0},path:at});else issue(at,rule,'Range is not a canonical precision domain on the native DecimalType(10,0) carrier');
  }else issue(at,rule,'Predicate and native scalar family do not establish a supported core facet');
 }
 for(const concept of ['length','decimal','integerWidth'] as const){
  const found=candidates.filter(c=>c.concept===concept);
  if(found.length===1){Object.assign(facets,found[0]!.value);claims.push({concept,path:found[0]!.path,basis:'Canonical native unified suite rule evaluated on the general Spark carrier; no whole-pipeline acceptance guarantee'});}
  else if(found.length>1)issue(suitePath,suite,'Multiple '+concept+' rules require explicit intersection semantics; no array-order choice is made');
 }
 if(type==='INTEGER'&&!facets.integerWidth){facets.integerWidth={bits:32,signed:true};claims.push({concept:'integerWidth',path:columnPath+'/members/data_type',basis:'Native general Spark INTEGER carrier supplies signed-32-bit capacity; unclassified suite rules remain residuals'});}
 for(const key of ['length','max_length','precision','scale']){
  const value=col.members[key];if(!value||value.kind==='null')continue;
  const actual=number(value),expected=key==='length'||key==='max_length'?facets.length?.max:key==='precision'?facets.precision:facets.scale;
  if(actual===undefined||expected===undefined||actual!==expected)issue(columnPath+'/members/'+key,value,'Column metadata has no matching interpreted bound in this explicit suite profile');
 }
 return {facets,claims,issues};
}
