import {copyJson} from '../../model/json';
import {getLinkmlDocumentNode} from './index';
import {inspectLinkmlClassSlots} from './class-slots';
import {pointer,type Document,type Diagnostic,UmfError} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
export const LINKML_SCALAR_SLOT_FIELDS={domain:'string',inherited:'boolean',readonly:'string',ifabsent:'string',list_elements_unique:'boolean',list_elements_ordered:'boolean',shared:'boolean',key:'boolean',identifier:'boolean',designates_type:'boolean',role:'string',relational_role:'string',range:'string',required:'boolean',recommended:'boolean',multivalued:'boolean',inlined:'boolean',inlined_as_list:'boolean',minimum_value:'number',maximum_value:'number',pattern:'string',value_presence:'string',equals_string:'string',equals_number:'number',equals_expression:'string',exact_cardinality:'number',minimum_cardinality:'number',maximum_cardinality:'number',description:'string'} as const;
export type LinkmlScalarSlotField=keyof typeof LINKML_SCALAR_SLOT_FIELDS;
export interface LinkmlSlotValuesReport {
 source:Document;className:string;slotName:string;scope:'document-scalar-slot-values';status:'resolved'|'blocked';complete:false;
 fields:Partial<Record<LinkmlScalarSlotField,NativeJson>>;
 derivations:{field:LinkmlScalarSlotField;path:string;rule:'base'|'slot-inheritance'|'slot-usage'|'default-range'|'identifier-required'|'key-required'|'list-inlined';value:NativeJson}[];
 diagnostics:Diagnostic[];
}
// Exact JSON decimal comparison without conversion to binary floating point or exponent expansion.
function compare(a:string,b:string):number {
 const parts=(s:string)=>{const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s)!;let digits=(m[2]!+(m[3]??'')).replace(/^0+/,'');if(!digits)return {sign:0,digits:'',power:0n};const power=BigInt(m[4]??0)-BigInt((m[3]??'').length)+BigInt(digits.length);return {sign:m[1]?-1:1,digits,power};};
 const x=parts(a),y=parts(b);if(x.sign!==y.sign)return Math.sign(x.sign-y.sign);if(!x.sign)return 0;if(x.power!==y.power)return (x.power<y.power?-1:1)*x.sign;const length=Math.max(x.digits.length,y.digits.length),u=x.digits.padEnd(length,'0'),v=y.digits.padEnd(length,'0');return (u===v?0:u<v?-1:1)*x.sign;
}
export function inspectLinkmlSlotValues(document:Document,className:string,slotName:string):LinkmlSlotValuesReport {
 if(typeof slotName!=='string'||!slotName.length||slotName.length>4096)throw new UmfError('LINKML_SLOT_NAME','Expected bounded slot name');
 const membership=inspectLinkmlClassSlots(document,className),r:LinkmlSlotValuesReport={source:membership.source,className,slotName,scope:'document-scalar-slot-values',status:'resolved',complete:false,fields:{},derivations:[],diagnostics:[...membership.diagnostics]};
 const fail=(path:string,message:string)=>{r.status='blocked';r.diagnostics.push({code:'LINKML_SLOT_VALUES',path,message,severity:'error'});};
 if(membership.status==='blocked'||!membership.slots.some(s=>s.name===slotName)){fail('','Cannot induce a slot outside resolved local membership');return r;}
 const root=getLinkmlDocumentNode(r.source,'') as Extract<NativeJson,{kind:'object'}>,classes=root.members.classes as Extract<NativeJson,{kind:'object'}>;
 const object=(n:NativeJson|undefined,path:string):Record<string,NativeJson>|undefined=>{if(n?.kind==='null')return {};if(n?.kind==='object')return n.members;fail(path,'Expected supplied declaration object');return undefined;};
 const lookup=(m:Record<string,NativeJson>,key:string)=>Object.hasOwn(m,key)?m[key]:undefined;
 const fieldNames=Object.keys(LINKML_SCALAR_SLOT_FIELDS) as LinkmlScalarSlotField[];
 const set=(field:LinkmlScalarSlotField,value:NativeJson,path:string,rule:LinkmlSlotValuesReport['derivations'][number]['rule'])=>{r.fields[field]=copyJson(value) as unknown as NativeJson;r.derivations.push({field,value:copyJson(value) as unknown as NativeJson,path,rule});};
 const values=(decl:Record<string,NativeJson>,path:string)=>{const out:Partial<Record<LinkmlScalarSlotField,NativeJson>>={};for(const field of fieldNames){const v=lookup(decl,field);if(!v||v.kind==='null')continue;if(v.kind!==LINKML_SCALAR_SLOT_FIELDS[field]){fail(path+'/'+field,'Expected '+LINKML_SCALAR_SLOT_FIELDS[field]+' scalar; loader coercion is not applied');continue;}if(v.kind==='number'&&['equals_number','exact_cardinality','minimum_cardinality','maximum_cardinality'].includes(field)){const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(v.value)!;if(compare(v.value,'0')!==0&&BigInt(m[4]??0)<BigInt((m[3]??'').length)-BigInt((m[2]!+(m[3]??'')).length-(m[2]!+(m[3]??'')).replace(/0+$/,'').length)){fail(path+'/'+field,'Expected exact integer; native integer coercion is not applied');continue;}}out[field]=v;}return out;};
 let base:Record<string,NativeJson>|undefined,basePath='',attribute=false;
 for(const ancestor of membership.ancestors){const c=classes.members[ancestor] as Extract<NativeJson,{kind:'object'}>,attrs=c.members.attributes;if(attrs?.kind==='object'&&Object.hasOwn(attrs.members,slotName)){basePath='/classes/'+pointer(ancestor)+'/attributes/'+pointer(slotName);base=object(attrs.members[slotName],basePath);attribute=true;break;}}
 const global=root.members.slots?.kind==='object'?root.members.slots.members:{};
 if(!attribute){basePath='/slots/'+pointer(slotName);base=object(lookup(global,slotName),basePath);}
 if(!base)return r;
 if(base.name&&(base.name.kind!=='string'||base.name.value!==slotName)){fail(basePath+'/name','Slot key and explicit name disagree');return r;}
 for(const [field,value] of Object.entries(values(base,basePath)))set(field as LinkmlScalarSlotField,value,basePath+'/'+field,'base');
 if(!attribute){const ordered=[slotName],seen=new Set(ordered),todo=[slotName],decls=new Map<string,Record<string,NativeJson>>();
  while(todo.length){const name=todo.pop()!,path='/slots/'+pointer(name),decl=object(lookup(global,name),path);if(!decl)continue;if(decl.name&&(decl.name.kind!=='string'||decl.name.value!==name)){fail(path+'/name','Slot key and explicit name disagree');continue;}decls.set(name,decl);const parents:string[]=[];if(decl.mixins){if(decl.mixins.kind!=='array'||decl.mixins.items.some(x=>x.kind!=='string'))fail(path+'/mixins','Expected explicit parent names');else parents.push(...decl.mixins.items.map(x=>(x as {value:string}).value));}if(decl.is_a){if(decl.is_a.kind!=='string')fail(path+'/is_a','Expected parent name');else parents.push(decl.is_a.value);}for(const p of parents)if(!seen.has(p)){seen.add(p);ordered.push(p);todo.push(p);}}
  for(const name of ordered.reverse()){const decl=decls.get(name);if(!decl)continue;const path='/slots/'+pointer(name);for(const [f,v] of Object.entries(values(decl,path))){if(f==='description')continue;const truthy=v.kind==='boolean'?v.value:v.kind==='number'?compare(v.value,'0')!==0:v.kind==='string'?v.value.length>0:false;if(truthy)set(f as LinkmlScalarSlotField,v,path+'/'+f,'slot-inheritance');}}
 }
 for(const ancestor of [...membership.ancestors].reverse()){const c=classes.members[ancestor] as Extract<NativeJson,{kind:'object'}>,usage=c.members.slot_usage;if(!usage)continue;if(usage.kind!=='object'){fail('/classes/'+pointer(ancestor)+'/slot_usage','Expected slot usage dictionary');continue;}if(!Object.hasOwn(usage.members,slotName))continue;const path='/classes/'+pointer(ancestor)+'/slot_usage/'+pointer(slotName),decl=object(usage.members[slotName],path);if(!decl)continue;
  for(const [f,v] of Object.entries(values(decl,path))){const field=f as LinkmlScalarSlotField,old=r.fields[field];if((field==='minimum_value'||field==='maximum_value')&&old?.kind==='number'&&v.kind==='number'){const comparison=compare(v.value,old.value);if(field==='minimum_value'?comparison<=0:comparison>=0)continue;}set(field,v,path+'/'+field,'slot-usage');}
 }
 if(!r.fields.range&&root.members.default_range){const v=root.members.default_range;if(v.kind==='string')set('range',v,'/default_range','default-range');else if(v.kind!=='null')fail('/default_range','Expected range string');}
 for(const [trigger,field,rule] of [['identifier','required','identifier-required'],['key','required','key-required'],['inlined_as_list','inlined','list-inlined']] as const)if(r.fields[trigger]?.kind==='boolean'&&(r.fields[trigger] as {value:boolean}).value)set(field,{kind:'boolean',value:true},[...r.derivations].reverse().find(d=>d.field===trigger)?.path??'',rule);
 if(r.status==='blocked'){r.fields={};r.derivations=[];}
 r.diagnostics.push({code:'LINKML_SLOT_CONTEXT',path:'',severity:'warning',message:'29 explicit scalar fields only. Source includes all omitted metadata. No import merging, structured constraints, aliases, owner/domain_of normalization, instance validation or inheritance legality is asserted. Unset scalar fields are omitted; native loader coercion is not performed.'});return r;
}
