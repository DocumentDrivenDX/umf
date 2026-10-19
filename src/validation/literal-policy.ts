import {UmfError} from '../model/errors';
import {copyJson} from '../model/json';
const descriptors:Record<string,{required:string[];optional:string[]}>= {
 'count-bounds':{required:['min','max','error','domainError'],optional:['unit','unitError']},
 'integer-width':{required:['bits','signed','error'],optional:[]},
 'coefficient-range':{required:['min','max','minInclusive','maxInclusive','error','nullError'],optional:[]},
 'allowed-membership':{required:['error'],optional:[]},
};
const propertySelectors=['role','references','referenceRole','item','facets','family','cardinality','availability','precision','scale'];
const lookupSelectors=['modules','moduleId','elements','elementId','moduleRef','elementRef'];
export function assertLiteralPolicy(input:any):void{
 const policy:any=copyJson(input);
 const error=(message:string):never=>{throw new UmfError('CONSTRAINT_POLICY',message);};
 const string=(v:any)=>{if(typeof v!=='string'||!v)error('Expected property selector');};
 const path=(v:any)=>{if(!Array.isArray(v)||!v.length)error('Expected refinement selector');v.forEach(string);};
 const record=(value:any)=>{if(!value||typeof value!=='object'||Array.isArray(value))error('Expected policy object');};
 const keys=(value:any,required:string[],optional:string[]=[])=>{record(value);if(required.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>![...required,...optional].includes(k)))error('Malformed policy declaration');};
 const strings=(value:any)=>{if(!Array.isArray(value))error('Expected selector list');value.forEach(string);if(new Set(value).size!==value.length)error('Duplicate selector');};
 const allowed=['fieldKind','recordReferenceRole','nullability','itemReferenceKeys','facetKeys','facetGroups','containers','singular','families','numericFacetKeys','errors','fields','wrapperKeys','itemLookup','interval','refinements'];
 keys(policy,allowed);for(const key of ['fieldKind','recordReferenceRole','nullability'])string(policy[key]);
 for(const key of ['itemReferenceKeys','facetKeys','singular','numericFacetKeys'])strings(policy[key]);
 record(policy.facetGroups);for(const [key,value]of Object.entries(policy.facetGroups)){string(key);strings(value);}
 record(policy.containers);for(const [key,value]of Object.entries(policy.containers) as [string,any][]){string(key);keys(value,['carrier','mechanic']);string(value.carrier);if(!['sequence','mapping'].includes(value.mechanic))error('Unknown container mechanic');}
 record(policy.families);
 record(policy.errors);for(const [key,value]of Object.entries(policy.errors) as [string,any][]){string(key);keys(value,['code','message','severity']);string(value.code);if(typeof value.message!=='string'||!['error','warning'].includes(value.severity))error('Malformed literal diagnostic');}
 // These are failures of the generic mechanics, rather than domain eligibility.
 for(const key of ['numeric-token','numeric-exponent','numeric-rounding','numeric-resource','numeric-precision','unicode','object','unknown','null-equality','equality','bits128','uuid','decimal-domain','hex','boolean','mechanic','depth','field-role','record-value','null','wrapper','container','item-required','item-missing','cardinality','family','refinements','text','numeric-null','interval'])if(!Object.hasOwn(policy.errors,key))error('Missing literal diagnostic');
 for(const [group,selectors]of [[policy.fields,propertySelectors],[policy.itemLookup,lookupSelectors]] as const){keys(group,selectors);for(const key of selectors)string(group[key]);}
 if(!Number.isSafeInteger(policy.wrapperKeys)||policy.wrapperKeys<1)error('Invalid wrapper key count');
 if(!Array.isArray(policy.refinements))error('Expected literal refinements');
 for(const rule of policy.refinements){record(rule);const descriptor=typeof rule?.mechanic==='string'&&Object.hasOwn(descriptors,rule.mechanic)?descriptors[rule.mechanic]:undefined;if(!descriptor)error('Unknown refinement mechanic');const required=['mechanic','selector','applies','mode','phase',...descriptor!.required],allowed=[...required,'enabled',...descriptor!.optional];if(Object.keys(rule).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(rule,k)))error('Malformed refinement declaration');if(Object.hasOwn(rule,'unit')!==Object.hasOwn(rule,'unitError'))error('Unit selector requires diagnostic');path(rule.selector);if(!['before','after'].includes(rule.phase)||!['scalar','container','all'].includes(rule.applies)||!['always','refinements'].includes(rule.mode)||rule.enabled!==undefined&&typeof rule.enabled!=='boolean')error('Invalid refinement applicability');for(const key of [...descriptor!.required,...descriptor!.optional])if(rule[key]!==undefined){string(rule[key]);if(key.toLowerCase().endsWith('error')&&!Object.hasOwn(policy.errors,rule[key]))error('Unknown refinement diagnostic');}}
 const interval=policy.interval;keys(interval,['min','max','minInclusive','maxInclusive','width','bits','signed','omit','qualifierKeys']);path(interval.width);for(const key of ['min','max','minInclusive','maxInclusive','bits','signed'])string(interval[key]);strings(interval.omit);record(interval.qualifierKeys);for(const [key,keys]of Object.entries(interval.qualifierKeys)){string(key);strings(keys);}
 for(const family of Object.values(policy.families) as any[]){keys(family,['mechanic','carrier','equality','refinements'],['lengthUnit']);if(Object.hasOwn(family,'lengthUnit'))string(family.lengthUnit);if(!['boolean','integer','decimal','unicode','hex','bits128','uuid','text'].includes(family.mechanic)||typeof family.carrier!=='string'||!family.carrier||typeof family.equality!=='boolean'||typeof family.refinements!=='boolean')error('Malformed literal family mechanics');}
}
