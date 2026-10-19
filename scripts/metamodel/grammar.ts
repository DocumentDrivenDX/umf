// SPDX-License-Identifier: MIT OR Apache-2.0
/** Compiler grammar is generic machinery; language decisions belong in umf.yaml. */
export type Shape = Record<string, any>;
export {assertConstraintProgram as checkProgram,expressionOperators,statementOperators} from '../../src/validation/constraint-language';
/** This descriptor defines the annotation grammar and its package projection. */
export const annotationProperties={language:{type:'object'},constraints:{type:'object'},domains:{type:'object'},description:{type:'string'},definition:{type:'string'},shape:{type:['object','boolean']},presence:{enum:['required','optional']},concept:{type:'string'},connections:{type:'array'},specializes:{type:'string'},role:{type:'string'}};
export const annotationSchema={type:'object',properties:annotationProperties,additionalProperties:false};
export function checkAnnotation(value:any,document=false):void{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('METAMODEL_ANNOTATION_OBJECT');
 const allowed=document?['language','constraints','domains','description']:Object.keys(annotationProperties).filter(k=>!['language','constraints','domains'].includes(k));
 for(const key of Object.keys(value))if(!allowed.includes(key))throw Error('METAMODEL_ANNOTATION_KEY '+key);
 if(value.presence!==undefined&&!['required','optional'].includes(value.presence))throw Error('METAMODEL_PRESENCE');
 if(value.definition!==undefined&&(typeof value.definition!=='string'||!value.definition))throw Error('METAMODEL_DEFINITION_NAME');
 if(value.shape!==undefined)checkShape(value.shape);
}
const common=['tag','description'];
const keys:Record<string,string[]>={any:[],object:['fields','mandatory','open','key','requires','conditions'],sequence:['item','min','max','unique','contains'],text:['min','max','pattern'],integer:['min','max'],number:['min','max'],boolean:[],null:[],link:['target'],constant:['value'],choice:['options'],'exclusive-choice':['options'],all:['options'],not:['value'],conditional:['condition','yes','no']};
export function checkShape(shape:any):void {
 if(typeof shape==='boolean')return;
 if(!shape||typeof shape!=='object'||!Object.hasOwn(keys,shape.tag))throw Error('METAMODEL_UNKNOWN_SHAPE '+shape?.tag);
 for(const key of Object.keys(shape))if(![...common,...keys[shape.tag]!].includes(key))throw Error('METAMODEL_SHAPE_KEY '+key);
 if(shape.tag==='link'&&(typeof shape.target!=='string'||!shape.target))throw Error('METAMODEL_LINK_TARGET');
 if(['choice','exclusive-choice','all'].includes(shape.tag)&&(!Array.isArray(shape.options)||shape.options.length===0))throw Error('METAMODEL_SHAPE_OPTIONS');
 if(shape.tag==='constant'&&!Object.hasOwn(shape,'value'))throw Error('METAMODEL_CONSTANT_VALUE');
 if(shape.tag==='conditional'&&(!Object.hasOwn(shape,'condition')||!Object.hasOwn(shape,'yes')))throw Error('METAMODEL_CONDITIONAL');
 if(shape.mandatory&&(!Array.isArray(shape.mandatory)||shape.mandatory.some((v:any)=>typeof v!=='string')||new Set(shape.mandatory).size!==shape.mandatory.length))throw Error('METAMODEL_REQUIRED_KEYS');
 if(shape.open!==undefined&&typeof shape.open!=='boolean'&&(shape.open===null||typeof shape.open!=='object'))throw Error('METAMODEL_OPEN_SHAPE');
 for(const bound of ['min','max'])if(shape[bound]!==undefined&&(typeof shape[bound]!=='number'||!Number.isSafeInteger(shape[bound])))throw Error('METAMODEL_BOUND');
 if(shape.pattern!==undefined){if(typeof shape.pattern!=='string')throw Error('METAMODEL_PATTERN');new RegExp(shape.pattern);}
 for(const child of Object.values(shape.fields??{}))checkShape(child);
 for(const child of shape.options??[])checkShape(child);
 for(const key of ['item','key','contains','condition','yes','no'])if(shape[key]!==undefined)checkShape(shape[key]);
 if(shape.tag==='not')checkShape(shape.value);
 if(typeof shape.open==='object')checkShape(shape.open);
 for(const child of shape.conditions??[])checkShape(child);
}
export function emitShape(shape:any,targets:Set<string>):any {
 checkShape(shape);if(typeof shape==='boolean')return shape;
 const desc=shape.description?{description:shape.description}:{};
 switch(shape.tag){
 case 'any':return desc;
 case 'link':if(!targets.has(shape.target))throw Error('METAMODEL_DANGLING_TARGET '+shape.target);return {...desc,$ref:shape.target.startsWith('urn:')?shape.target:'#/$defs/'+shape.target};
 case 'constant':return {...desc,const:shape.value};
 case 'choice':if(shape.options.every((x:any)=>x.tag==='constant'))return {...desc,enum:shape.options.map((x:any)=>x.value)};
 case 'exclusive-choice':case 'all':return {...desc,[shape.tag==='choice'?'anyOf':shape.tag==='exclusive-choice'?'oneOf':'allOf']:shape.options.map((x:any)=>emitShape(x,targets))};
 case 'not':return {...desc,not:emitShape(shape.value,targets)};
 case 'conditional':return {...desc,if:emitShape(shape.condition,targets),then:emitShape(shape.yes,targets),...(shape.no!==undefined?{else:emitShape(shape.no,targets)}:{})};
 case 'object':return {...desc,type:'object',...(shape.mandatory?.length?{required:shape.mandatory}:{}),...(shape.fields?{properties:Object.fromEntries(Object.entries(shape.fields).map(([k,v])=>[k,emitShape(v,targets)]))}:{}),...(shape.open!==undefined?{additionalProperties:typeof shape.open==='boolean'?shape.open:emitShape(shape.open,targets)}:{}),...(shape.key?{propertyNames:emitShape(shape.key,targets)}:{}),...(shape.requires?{dependentRequired:shape.requires}:{}),...(shape.conditions?.length?{allOf:shape.conditions.map((x:any)=>emitShape(x,targets))}:{})};
 case 'sequence':return {...desc,type:'array',...(shape.item?{items:emitShape(shape.item,targets)}:{}),...(shape.min!==undefined?{minItems:shape.min}:{}),...(shape.max!==undefined?{maxItems:shape.max}:{}),...(shape.unique!==undefined?{uniqueItems:shape.unique}:{}),...(shape.contains?{contains:emitShape(shape.contains,targets)}:{})};
 default:return {...desc,type:shape.tag==='text'?'string':shape.tag,...(shape.min!==undefined?{[shape.tag==='text'?'minLength':'minimum']:shape.min}:{}),...(shape.max!==undefined?{[shape.tag==='text'?'maxLength':'maximum']:shape.max}:{}),...(shape.pattern?{pattern:shape.pattern}:{})};
 }
}
