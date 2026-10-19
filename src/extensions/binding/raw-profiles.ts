import {CURRENT_CORE_VERSION} from '../../generated/core-model';
import {getBinding,inspectBinding} from './index';
import {copyJson} from '../../model/json';
import {inspectCoreRecordMembers} from '../../model/record-members';
import {UmfError,type Diagnostic,type Document,type Validation} from '../../model/types';

/** Declarative identity only. Native versions and capabilities need separate qualification. */
export const RAW_TABLE_BINDING_SUBSET='typed-access-columns/0.1';
export const rawTableBindingProfiles=Object.freeze(
  (['lakebase','unity-catalog','spark-delta'] as const).map(system=>Object.freeze({
    system,subset:RAW_TABLE_BINDING_SUBSET,bindingProfile:'umf-binding-2' as const,
    vocabularyVersion:'0.2.0' as const,nativeQualification:'UNTESTED' as const,
    directions:Object.freeze([] as string[]),
  })),
);
export interface RawTableBindingTarget {platform:string;majorVersion:string}

/** Inspect the explicit, direct-column subset; never infer SQL, native types or enforcement. */
export function inspectRawTableBinding(binding:Document,logical:Document,target:RawTableBindingTarget,module:string):Validation {
  try {
    binding=copyJson(binding) as unknown as Document;
    logical=copyJson(logical) as unknown as Document;
    target=copyJson(target) as unknown as RawTableBindingTarget;
  }catch(error){
    if(!(error instanceof UmfError))throw error;
    return {valid:false,complete:false,diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};
  }
  const base=inspectBinding(binding,logical);
  if(!base.valid)return base;
  const diagnostics:Diagnostic[]=[...base.diagnostics];
  const add=(suffix:string,message:string)=>diagnostics.push({code:'BINDING_RAW_PROFILE',path:'/extensions/umf.binding'+suffix,message,severity:'error'});
  if(!base.complete)add('','Uninterpreted binding content blocks the declarative profile');
  const p=getBinding(binding,logical);
  if(p.profile!=='umf-binding-2'||binding.vocabularies['umf.binding']?.version!=='0.2.0')add('/profile','Expected stable-ID binding 0.2.0');
  if(logical.umf!==CURRENT_CORE_VERSION)add('/logical/coreVersion','Expected core 0.10.0 logical model');
  if(!rawTableBindingProfiles.some(profile=>profile.system===p.target.system)||p.target.subset!==RAW_TABLE_BINDING_SUBSET)add('/target','Unsupported declarative target profile');
  if(!target||typeof target!=='object'||Array.isArray(target)||Object.keys(target).some(key=>!['platform','majorVersion'].includes(key))||typeof target.platform!=='string'||typeof target.majorVersion!=='string'||!target.majorVersion.length||target.platform!==p.target.system||target.majorVersion!==p.target.version)add('/target','ColumnSet target must match the exact authored platform and version identity');
  if(typeof module!=='string'||!logical.modules.some(m=>m.id===module)||!p.elements.some(e=>e.module===module))add('/elements','ColumnSet module must have an explicit bound Record');
  if(p.relationships.length)add('/relationships','Relationship layout is outside this declarative profile');
  if(p.indexes.length)add('/indexes','Index or clustering intent needs a separately qualified profile');
  const tables=new Set<string>();
  const owners=new Map<string,string[]>();
  const key=(ref:{module:string;element:string})=>JSON.stringify([ref.module,ref.element]);
  p.elements.forEach((row,index)=>{
    const record=logical.modules.find(m=>m.id===row.module)?.elements.find(e=>e.id===row.element);
    if(record?.kind!=='record'||!row.table||Object.hasOwn(row,'partition'))add(`/elements/${index}`,'Expected explicit Record table without partition semantics');
    if(row.table){if(tables.has(row.table))add(`/elements/${index}/table`,'Duplicate physical table identity');tables.add(row.table);}
    if(record?.kind==='record'&&logical.umf===CURRENT_CORE_VERSION){
      const {meaning}=inspectCoreRecordMembers(logical,{module:row.module,element:row.element});
      if(meaning.state!=='known')add(`/elements/${index}`,'Explicit fully interpreted Record membership is required');
      else for(const member of meaning.members){const id=key(member),list=owners.get(id)??[];list.push(key(row));owners.set(id,list);}
    }
  });
  const columns=new Set<string>();
  p.fields.forEach((row,index)=>{
    const id=key(row),owner=owners.get(id)??[];
    if(row.storage!=='column'||!row.column||row.field!==undefined||owner.length!==1)add(`/fields/${index}`,'Expected direct core member Field with one bound Record owner and explicit column');
    if(row.column&&owner.length===1){const columnKey=JSON.stringify([owner[0],row.column]);if(columns.has(columnKey))add(`/fields/${index}/column`,'Duplicate physical column identity in table');columns.add(columnKey);}
  });
  return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
