import {declareCoreNullability,type Document,type Nullability,type NullabilityTableSpecRequest,type ScalarType} from '../../src';
const types:Record<NullabilityTableSpecRequest['nativeType'],ScalarType>={BOOLEAN:'boolean',INTEGER:'integer',DECIMAL:'decimal',FLOAT:'float',TEXT:'string',VARCHAR:'string',CHAR:'string',DATE:'date',DATETIME:'timestamp',TIMESTAMP:'timestamp'};
export function nullabilityTableSpecAuthor(nullability:Nullability='required',variant:'clean'|'loss'='clean',nativeType:NullabilityTableSpecRequest['nativeType']='VARCHAR'){
 const source:Document={umf:'0.3.0',id:'authored',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',scalarType:types[nativeType],description:'Availability example',extensions:{}}]}]};
 if(variant==='loss'){source.modules[0]!.namespace='sales';source.vocabularies.future={version:'1.0.0'};source.modules[0]!.elements[0]!.extensions.future={constraint:{exactInteger:'9007199254740993'},default:'not-execution'};}
 return declareCoreNullability(source,{module:'m',element:'value'},nullability);
}
export function nullabilityTableSpecProjectionCases(){
 const rows=[];
 for(const variant of ['clean','loss'] as const)for(const ideal of ['required','absent-allowed','unspecified'] as const)for(const profile of ['runtime-model','checked-schema','unresolved'] as const)for(const context of [null,'MD'])for(const carrier of ['null-value','unresolved'] as const)for(const mode of ['strict','report'] as const){
  const request:NullabilityTableSpecRequest={id:'native',tableName:'Orders',columnName:'value',nativeType:'VARCHAR',mode,profile,context,carrier};
  const encoded=profile!=='unresolved'&&ideal!=='unspecified'&&carrier==='null-value'&&(context!==null||profile==='runtime-model');
  const availabilityLoss=profile==='unresolved'||ideal!=='unspecified'&&!encoded,loss=variant==='loss'||availabilityLoss;
  rows.push({variant,ideal,author:nullabilityTableSpecAuthor(ideal,variant),request,encoding:encoded?(context===null?'boolean':'context-map'):'omitted',status:mode==='strict'&&loss?'blocked':'projected'});
 }
 for(const nativeType of Object.keys(types) as NullabilityTableSpecRequest['nativeType'][])for(const ideal of ['required','absent-allowed','unspecified'] as const)for(const context of [null,'production']){
  const request:NullabilityTableSpecRequest={id:'typed-native',tableName:'Types',columnName:'value',nativeType,mode:'strict',profile:'runtime-model',context,carrier:'null-value'};
  rows.push({variant:'typed',ideal,author:nullabilityTableSpecAuthor(ideal,'clean',nativeType),request,encoding:ideal==='unspecified'?'omitted':context===null?'boolean':'context-map',status:'projected'});
 }
 return rows;
}
