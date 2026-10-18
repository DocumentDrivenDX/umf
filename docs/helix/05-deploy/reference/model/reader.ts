export interface ReaderRow {name:string;type:string;optional:boolean;description:string;links:string[]}
export interface ApiReader {id:string;kind:string;task:string;purpose:string;authored:boolean;type:string;value?:string;example?:string;parameters:ReaderRow[];returns:string;members:ReaderRow[];alternatives:string[];related:string[]}
export interface Concept {key:string;title:string;pointer:string;description:string;role?:string}
export interface ReaderCatalog {profile:'umf.reference.reader/1';latest:{id:string;version:string};concepts:Concept[];api:{id:string;title:string;kind:string;task:string;summary:string;href:string}[];propertyText:Record<string,string>;scalarMeanings:Record<string,string>;examples:Record<string,unknown>[]}
export function compareVersions(a:string,b:string):number {const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]!-y[i]!;return 0;}
export function latestProfile<T extends {version:string}>(profiles:T[]):T {if(!profiles.length||profiles.some(p=>!/^\d+\.\d+\.\d+$/.test(p.version)))throw Error('REFERENCE_STRUCTURE invalid core profiles');return [...profiles].sort((a,b)=>compareVersions(b.version,a.version))[0]!;}
export function treeValue(n:any):any {if(!n)return undefined;if(n.kind==='object')return Object.fromEntries(Object.entries(n.members).map(([k,v])=>[k,treeValue(v)]));if(n.kind==='array')return n.items.map(treeValue);if(n.kind==='number')return {numberToken:n.value};return n.kind==='null'?null:n.value;}
export const pointerPart=(s:string)=>s.replaceAll('~','~0').replaceAll('/','~1');
export function schemaNode(root:any,pointer:string):any {if(pointer&&(!pointer.startsWith('/')||/~(?![01])/.test(pointer)))throw Error('REFERENCE_LINK invalid schema pointer');let n=root;for(const s of pointer.split('/').slice(1)){const k=s.replaceAll('~1','/').replaceAll('~0','~');n=n?.kind==='object'?n.members[k]:n?.kind==='array'&&/^(0|[1-9][0-9]*)$/.test(k)?n.items[Number(k)]:undefined;}if(!n)throw Error('REFERENCE_LINK unknown schema pointer');return n;}
export function resolveSchema(root:any,node:any,seen=new Set<string>()):any {const ref=node?.members?.$ref?.value;if(!ref?.startsWith('#/'))return node;if(seen.has(ref))return node;return resolveSchema(root,schemaNode(root,ref.slice(1)),new Set([...seen,ref]));}
const text=(v:any)=>typeof v==='string'?v:v&&typeof v==='object'&&'numberToken'in v?v.numberToken:JSON.stringify(v);
export function shape(root:any,node:any,seen=new Set<any>()):string {
 if(!node)return 'Unresolved schema';if(seen.has(node))return 'Recursive reference';seen=new Set([...seen,node]);
 const resolved=resolveSchema(root,node);if(resolved!==node)return shape(root,resolved,seen);
 const s=treeValue(node);if(typeof s==='boolean')return s?'Any JSON value':'Not allowed';if(!s)return 'Unresolved schema';
 const parts:string[]=[];
 if(s.const!==undefined)parts.push('Exactly '+text(s.const));
 if(s.enum)parts.push(s.enum.map(text).join(' | '));
 if(s.type)parts.push(Array.isArray(s.type)?s.type.join(' or '):s.type);
 if(s.$ref)parts.push('Reference to '+s.$ref);
 for(const k of ['anyOf','oneOf','allOf'])if(s[k])parts.push((k==='anyOf'?'Any of: ':k==='oneOf'?'Exactly one of: ':'All of: ')+node.members[k].items.map((v:any)=>shape(root,v,seen)).join('; '));
 if(s.items)parts.push('items: '+shape(root,node.members.items,seen));
 if(s.minLength!==undefined)parts.push('minimum length '+text(s.minLength));
 if(s.pattern)parts.push('pattern '+s.pattern);
 for(const k of ['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','maxLength','minItems','maxItems','minProperties','maxProperties'])if(s[k]!==undefined)parts.push(k+' '+text(s[k]));
 if(s.uniqueItems===true)parts.push('unique items');
 return parts.join(' · ')||'See schema constraints';
}
export function conditionText(s:any):string {
 if(s===false)return 'no value is allowed';if(s===true)return 'any value is allowed';const out:string[]=[];
 if(s.required?.length)out.push(s.required.map((k:string)=>'`'+k+'` is present').join(' and '));
 if(s.properties)for(const [k,v]of Object.entries(s.properties) as [string,any][]){if(v===false)out.push('`'+k+'` is not allowed');else if(v.const!==undefined)out.push('`'+k+'` = '+text(v.const));else if(v.enum)out.push('`'+k+'` is one of '+v.enum.map(text).join(', '));}
 if(s.not)out.push('not ('+conditionText(s.not)+')');
 for(const key of ['allOf','anyOf','oneOf'])if(s[key])out.push(s[key].map(conditionText).join(key==='allOf'?' and ':key==='oneOf'?' or (exactly one) ':' or '));
 return out.join('; ')||'additional constraints apply (see original rule)';
}
export function schemaRules(node:any):{text:string;source:any}[] {const s=treeValue(node);return (s?.allOf??[]).map((rule:any)=>({text:rule.if?'When '+conditionText(rule.if)+', '+conditionText(rule.then??{})+(rule.else?'; otherwise '+conditionText(rule.else):''):conditionText(rule),source:rule}));}
export function propertyPresence(node:any,key:string,role?:string):string {
 const s=treeValue(node);let forbidden=false;
 for(const rule of s?.allOf??[]){const guard=rule.if,target=rule.then;if(!guard||!target)continue;
  const kinds=guard.properties?.kind;if(role&&kinds&&(kinds.const===role||kinds.enum?.includes(role))&&target.properties?.[key]===false)forbidden=true;
  if(role&&guard.required?.includes(key)&&target.properties?.kind?.const&&target.properties.kind.const!==role)forbidden=true;
 }
 if(forbidden)return 'Not allowed for '+role;
 const conditional=!!(s?.oneOf||s?.anyOf||s?.dependentRequired||s?.dependentSchemas||s?.if)||(s?.allOf??[]).some((r:any)=>JSON.stringify(r).includes('"'+key+'"'));
 return (s?.required??[]).includes(key)?'Required':conditional?'Conditional — see rules':'Optional';
}
export function unknownKeyPolicy(node:any):string {const s=treeValue(node);if(s?.additionalProperties===false||s?.unevaluatedProperties===false)return 'Additional keys are rejected by this object schema.';if(s?.patternProperties||s?.propertyNames||typeof s?.additionalProperties==='object')return 'Additional keys are constrained by the map/key rules below. Retention does not establish interpreted meaning.';return 'Additional keys are structurally allowed and retained. Unrecognized content has no implied UMF meaning.';}
