// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Element} from '../../model/types';
import {schemaCoefficient} from '../../model/schema-literals';
import type {TableContext} from './context';
import {refKey} from './context';
import type {RowExpression,RowExpressionPredicate,TableDeclaration,TableRef} from './types';

export const ROW_EXPRESSION_MAX_DEPTH=16;
export const ROW_EXPRESSION_MAX_NODES=256;
export const ROW_EXPRESSION_MAX_FANOUT=32;
export const ROW_EXPRESSION_MAX_LITERAL_BYTES=1_048_576;

type Shape={scalar:string|null;nullable:boolean;native:string;integral:number;fractional:number;staticallyIntegral:boolean};
const fail=(message:string,path:string,code:'TABLES_OPERATION_SHAPE'|'TABLES_OPERATION_DOMAIN'|'TABLES_OPERATION_SOURCE'|'TABLES_OPERATION_CAPACITY'='TABLES_OPERATION_SHAPE'):never=>{throw Object.assign(new Error(message),{path,code});};
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,keys:readonly string[]):boolean=>object(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const literalWrapper=(value:unknown):{kind:string;value:any;I:number;S:number;staticallyIntegral?:boolean}|undefined=>{
 if(value===null)return {kind:'null',value:null,I:0,S:0};
 if(!object(value)||Object.keys(value).length!==1)return;
 const key=Object.keys(value)[0]!,v=value[key];
 if(typeof v!=='string'&&typeof v!=='boolean')return;
 if(key==='boolean'&&typeof v==='boolean')return {kind:'boolean',value:v,I:0,S:0};
 if(key==='string'&&typeof v==='string')return {kind:'string',value:v,I:0,S:0};
 if(key==='date'&&typeof v==='string')return {kind:'date',value:v,I:0,S:0};
 if(key==='timestamp'&&typeof v==='string')return {kind:'timestamp',value:v,I:0,S:0};
 if(key==='uuid'&&typeof v==='string')return {kind:'uuid',value:v,I:0,S:0};
 if((key==='integerToken'||key==='decimalToken')&&typeof v==='string'){
  const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(v);
  if(!m||m[0]!==v)return;
  let digits=(m[2]!+(m[3]??'')).replace(/^0+/,'');
  if(!digits)return {kind:key==='integerToken'?'integer':'decimal',value:v,I:1,S:0};
  const exponentText=m[4]??'0';
  // The shared exact coefficient parser caps nonzero exponent length. Keep
  // this check before BigInt conversion so a 1 MiB exponent cannot consume
  // disproportionate resources.
  if(exponentText.replace(/^[+-]/,'').length>32)return;
  let scale=BigInt((m[3]??'').length)-BigInt(exponentText);
  while(digits.endsWith('0')){digits=digits.slice(0,-1);scale--;}
  const coefficientDigits=BigInt(digits.length),fractional=scale>0n?scale:0n;
  const integral=scale<0n?coefficientDigits-scale:scale>=coefficientDigits?0n:coefficientDigits-scale;
  if(integral+fractional>1000n)return {kind:key==='integerToken'?'integer':'decimal',value:v,I:1001,S:0};
  const I=Number(integral);
  const S=Number(fractional);
  let staticallyIntegral=false;
  try{schemaCoefficient(v,0,1000);staticallyIntegral=true;}catch{/* fractional literals remain valid decimal values */}
  return {kind:key==='integerToken'?'integer':'decimal',value:v,I,S,staticallyIntegral};
 }
 return;
};
function validText(value:string):boolean{
 if(value.includes('\0'))return false;
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(i+1);if(!(next>=0xdc00&&next<=0xdfff))return false;i++;}
  else if(c>=0xdc00&&c<=0xdfff)return false;
 }
 return true;
}
function validateLiteral(item:{kind:string;value:any;I:number;S:number},path:string):void{
 const token=typeof item.value==='string'?item.value:'';
 if(new TextEncoder().encode(token).length>ROW_EXPRESSION_MAX_LITERAL_BYTES)fail('Literal exceeds its byte limit',path,'TABLES_OPERATION_CAPACITY');
 if((item.kind==='integer'||item.kind==='decimal')&&item.I+item.S>1000)fail('Numeric literal exceeds the 1000 digit bound',path,'TABLES_OPERATION_CAPACITY');
 if(item.kind==='string'&&!validText(token))fail('Text literal contains NUL or an unpaired UTF-16 surrogate',path,'TABLES_OPERATION_SHAPE');
}
function predicateLiteral(value:unknown):{kind:string;value:any;I:number;S:number}|undefined{
 if(!exact(value,['kind','value'])||(value as any).kind!=='literal')return;
 return literalWrapper((value as any).value);
}
function validateLiteralBytes(value:unknown,path:string):void{
 const raw=object(value)&&Object.hasOwn(value,'kind')&&value.kind==='literal'?(value as any).value:value;
 if(object(raw)&&Object.keys(raw).length===1){const inner=Object.values(raw)[0];if(typeof inner==='string'&&new TextEncoder().encode(inner).length>ROW_EXPRESSION_MAX_LITERAL_BYTES)fail('Literal exceeds its byte limit',path,'TABLES_OPERATION_CAPACITY');}
}

/** Return source Field references in stable first-occurrence order; repeated leaves count toward limits. */
export function rowExpressionInputRefs(expression:RowExpression):TableRef[]{
 const refs:TableRef[]=[],seen=new Set<string>(),active=new WeakSet<object>();let nodes=0;
 const charge=(value:unknown,depth:number,path:string):void=>{
  if(++nodes>ROW_EXPRESSION_MAX_NODES||depth>ROW_EXPRESSION_MAX_DEPTH)fail('Row expression exceeds its node or depth limit',path,'TABLES_OPERATION_CAPACITY');
  if(!object(value))fail('Row expression node must be an object',path);
  if(active.has(value as object))fail('Cyclic row expression input',path,'TABLES_OPERATION_CAPACITY');
 };
 const chargeLiteral=(depth:number,path:string):void=>{
  if(++nodes>ROW_EXPRESSION_MAX_NODES||depth>ROW_EXPRESSION_MAX_DEPTH)fail('Row expression exceeds its node or depth limit',path,'TABLES_OPERATION_CAPACITY');
 };
 const add=(value:unknown,path:string):void=>{
  if(!exact(value,['module','element']))return fail('Row expression Field reference is malformed',path);
  const raw=value as Record<string,unknown>;if(typeof raw.module!=='string'||typeof raw.element!=='string')return fail('Row expression Field reference is malformed',path);
  const ref=raw as unknown as TableRef,id=refKey(ref);if(!seen.has(id)){seen.add(id);refs.push({module:ref.module,element:ref.element});}
 };
 const predicate=(raw:unknown,depth:number,path:string):void=>{
  charge(raw,depth,path);const n=raw as Record<string,any>;active.add(n);
  try{
   if(n.op==='all'){if(!exact(n,['op']))fail('Unknown predicate members',path);return;}
   if(n.op==='and'||n.op==='or'){if(!exact(n,['op','args'])||!Array.isArray(n.args)||n.args.length<1||n.args.length>ROW_EXPRESSION_MAX_FANOUT)fail('Predicate fanout or shape is invalid',path);for(let i=0;i<n.args.length;i++)predicate(n.args[i],depth+1,path+'/args/'+i);return;}
   if(n.op==='not'){if(!exact(n,['op','arg']))fail('Unknown predicate members',path);predicate(n.arg,depth+1,path+'/arg');return;}
   if(n.op==='isNull'){if(!exact(n,['op','field']))fail('Unknown predicate members',path);add(n.field,path+'/field');return;}
   if(n.op==='in'){if(!exact(n,['op','field','values'])||!Array.isArray(n.values)||n.values.length<1||n.values.length>ROW_EXPRESSION_MAX_FANOUT)fail('Predicate membership fanout or shape is invalid',path,'TABLES_OPERATION_CAPACITY');add(n.field,path+'/field');for(let i=0;i<n.values.length;i++){chargeLiteral(depth+1,path+'/values/'+i);validateLiteralBytes(n.values[i],path+'/values/'+i);const found=predicateLiteral(n.values[i]);if(found===undefined)return fail('Predicate operands must be finite literal values',path+'/values/'+i);validateLiteral(found,path+'/values/'+i);}return;}
   if(['eq','ne','lt','le','gt','ge','startsWith'].includes(n.op)){if(!exact(n,['op','field','value']))fail('Unknown predicate members',path);add(n.field,path+'/field');chargeLiteral(depth+1,path+'/value');validateLiteralBytes(n.value,path+'/value');const found=predicateLiteral(n.value);if(found===undefined)return fail('Predicate operands must be finite literal values',path+'/value');validateLiteral(found,path+'/value');return;}
   fail('Predicate operation is outside the row-expression profile',path);
  }finally{active.delete(n);}
 };
 const visit=(raw:unknown,depth:number,path:string):void=>{
  charge(raw,depth,path);const n=raw as Record<string,any>;active.add(n);
  try{
   if(n.op==='field'){if(!exact(n,['op','field']))fail('Unknown row expression members',path);add(n.field,path+'/field');return;}
   if(n.op==='literal'){if(!exact(n,['op','value']))fail('Unknown row expression members',path);validateLiteralBytes(n.value,path+'/value');const found=literalWrapper(n.value);if(found===undefined)return fail('Literal is unsupported or malformed',path+'/value');validateLiteral(found,path+'/value');return;}
   if(n.op==='coalesce'||n.op==='concat'){if(!exact(n,['op','args'])||!Array.isArray(n.args)||n.args.length<2||n.args.length>ROW_EXPRESSION_MAX_FANOUT)fail('Expression fanout or shape is invalid',path);for(let i=0;i<n.args.length;i++)visit(n.args[i],depth+1,path+'/args/'+i);return;}
   if(['add','subtract','multiply'].includes(n.op)){if(!exact(n,['op','left','right']))fail('Unknown row expression members',path);visit(n.left,depth+1,path+'/left');visit(n.right,depth+1,path+'/right');return;}
   if(n.op==='conditional'){if(!exact(n,['op','when','then','else']))fail('Unknown row expression members',path);predicate(n.when,depth+1,path+'/when');visit(n.then,depth+1,path+'/then');visit(n.else,depth+1,path+'/else');return;}
   fail('Unknown row expression operation',path);
  }finally{active.delete(n);}
 };
 visit(expression,0,'');return refs;
}

function logical(element:Element):string|null{return element.scalarType??null;}
function literalShape(value:unknown):Shape|undefined{
 const item=literalWrapper(value);if(!item)return;
 const scalar=({boolean:'boolean',integer:'integer',decimal:'decimal',string:'string',date:'date',timestamp:'timestamp',uuid:'uuid',null:null} as Record<string,string|null>)[item.kind];
 if(item.kind==='null')return {scalar:null,nullable:true,native:'null',integral:0,fractional:0,staticallyIntegral:true};
 if(scalar===undefined)return;
 const native=item.kind==='timestamp'?'instant':item.kind;
 return {scalar,nullable:false,native,integral:item.I,fractional:item.S,staticallyIntegral:item.staticallyIntegral??(item.kind==='integer'||item.kind==='decimal'&&item.S===0)};
}

const numeric=(shape:Shape)=>shape.scalar==='integer'||shape.scalar==='decimal';
const identityCarrier=(shape:Shape)=>['boolean','date','instant','uuid'].includes(shape.native);
function compatible(a:Shape,b:Shape):boolean{
 if(a.scalar===null||b.scalar===null)return true;
 if(numeric(a)&&numeric(b))return true;
 if(a.scalar!==b.scalar)return false;
 if(identityCarrier(a)||identityCarrier(b))return a.native===b.native;
 return a.scalar==='string'||a.native===b.native;
}
function nativeCarrier(column:TableDeclaration['columns'][number]):string{
 const rawKind=String(column.nativeType.kind);
 // Keep the Boolean carrier aligned with CoreLiteral's `boolean` spelling,
 // including native introspection profiles that report PostgreSQL `bool`.
 const kind=rawKind==='bool'?'boolean':rawKind;
 if(['int2','int4','int8'].includes(kind))return 'integer';
 if(kind==='numeric')return 'decimal';
 if(kind==='text'||kind==='varchar')return 'string';
 if(kind==='timestamptz')return 'instant';
 return kind;
}
function numericBound(column:TableDeclaration['columns'][number],path:string,ctx:TableContext):{I:number;S:number}|undefined{
 const type=column.nativeType;
 if(type.kind==='numeric'){
  if(!Number.isInteger(type.precision)||!Number.isInteger(type.scale)||type.precision<1||type.precision>1000||type.scale<0||type.scale>type.precision){ctx.add('TABLES_OPERATION_DOMAIN',path,'Numeric source requires explicit finite precision and nonnegative scale no greater than precision');return;}
  return {I:type.precision-type.scale,S:type.scale};
 }
 if(type.kind==='int2')return {I:5,S:0};
 if(type.kind==='int4')return {I:10,S:0};
 if(type.kind==='int8')return {I:19,S:0};
 return;
}

/** Semantic admission for the closed G02 value algebra. Migration checks predecessor/successor equivalence. */
export function inspectRowExpression(expression:RowExpression,targetRef:TableRef,table:TableDeclaration,ctx:TableContext,path:string):void{
 let refs:TableRef[];try{refs=rowExpressionInputRefs(expression);}catch(error){const e=error as Error&{path?:string;code?:string};ctx.add(e.code??'TABLES_OPERATION_SHAPE',path+(e.path??''),e.message);return;}
 const target=table.columns.find(c=>refKey(c.field)===refKey(targetRef)),targetElement=target&&ctx.element(target.field);
 if(!target||!targetElement){ctx.add('TABLES_OPERATION_SOURCE',path,'Row expression target must be a mapped Field of the selected table');return;}
 const columns=new Map(table.columns.map(c=>[refKey(c.field),c]));
 const elements=new Map<string,Element>();
 const bounded=(shape:Shape,p:string):Shape=>{if(numeric(shape)&&shape.integral+shape.fractional>1000)ctx.add('TABLES_OPERATION_CAPACITY',p,'Numeric inference exceeds the 1000 digit bound');return shape;};
 for(const ref of refs){
  const p=path+'/input/'+ref.element,col=columns.get(refKey(ref)),element=ctx.field(ref,p);
  if(!col||!element){ctx.add('TABLES_OPERATION_SOURCE',p,'Input Field must be mapped by the selected table');continue;}
  if(refKey(ref)===refKey(targetRef))ctx.add('TABLES_OPERATION_SOURCE',p,'Expression cannot read its assignment target');
  if(col.generated||Object.keys(element.extensions??{}).length||element.semanticTypes?.length)ctx.add('TABLES_OPERATION_SOURCE',p,'Generated or separately interpreted input meaning is unsupported');
  if(!['boolean','integer','decimal','string','date','timestamp','uuid'].includes(element.scalarType??'')||['float4','float8','char','bytea'].includes(col.nativeType.kind))ctx.add('TABLES_OPERATION_DOMAIN',p,'Input carrier is outside the finite row-expression profile');
  elements.set(refKey(ref),element);
 }
 const infer=(node:RowExpression,p:string,depth:number):Shape|undefined=>{
  if(depth>ROW_EXPRESSION_MAX_DEPTH)return;
  if(node.op==='field'){
   const element=elements.get(refKey(node.field)),column=columns.get(refKey(node.field));if(!element||!column)return;
   const bound=numericBound(column,p,ctx)??{I:0,S:0};
   return bounded({scalar:logical(element),nullable:element.nullability!=='required',native:nativeCarrier(column),integral:bound.I,fractional:bound.S,staticallyIntegral:bound.S===0},p);
  }
  if(node.op==='literal'){
   const shape=literalShape(node.value);if(!shape){ctx.add('TABLES_OPERATION_SHAPE',p,'Literal wrapper is not an admitted finite scalar');return;}
   if(node.value!==null){const element=targetElement,facets=shape.scalar==='decimal'?{precision:Math.max(1,shape.integral+shape.fractional),scale:shape.fractional}:{};const literalElement={...element,scalarType:shape.scalar??undefined,facets} as unknown as Element;delete (literalElement as any).allowedValues;ctx.literal(literalElement,node.value,p+'/value');}
   return bounded(shape,p);
  }
  if(node.op==='coalesce'||node.op==='concat'){
   const args=node.args.map((arg,i)=>infer(arg,p+'/args/'+i,depth+1));if(args.some(x=>!x))return;
   if(node.op==='concat'){
    if(args.some(x=>x!.scalar!==null&&x!.scalar!=='string'))ctx.add('TABLES_OPERATION_DOMAIN',p,'Concatenation operands must be text or NULL');
    return {scalar:'string',nullable:args.some(x=>x!.nullable),native:'string',integral:0,fractional:0,staticallyIntegral:false};
   }
   const nonNull=args.filter(x=>x!.scalar!==null) as Shape[];
   const base=nonNull[0]??{scalar:null,nullable:true,native:'null',integral:0,fractional:0,staticallyIntegral:true};
   if(nonNull.some(x=>!compatible(x,base)))ctx.add('TABLES_OPERATION_DOMAIN',p,'Coalesce operands require compatible logical and native carriers');
   return bounded({...base,scalar:nonNull.some(x=>x.scalar==='decimal')?'decimal':base.scalar,native:nonNull.some(x=>x.scalar==='decimal')?'numeric':base.native,nullable:args.every(x=>x!.nullable),integral:Math.max(...args.map(x=>x!.integral)),fractional:Math.max(...args.map(x=>x!.fractional)),staticallyIntegral:args.every(x=>x!.staticallyIntegral)},p);
  }
  if(node.op==='conditional'){
   inspectPredicate(node.when,p+'/when',depth+1);
   const a=infer(node.then,p+'/then',depth+1),b=infer(node.else,p+'/else',depth+1);if(!a||!b)return;
   if(!compatible(a,b))ctx.add('TABLES_OPERATION_DOMAIN',p,'Conditional branches require compatible logical and native carriers');
   const numeric=[a,b].filter(x=>['integer','decimal'].includes(x.scalar??''));
   const base=a.scalar===null?b:a;
   return bounded({...base,scalar:numeric.some(x=>x.scalar==='decimal')?'decimal':base.scalar,native:numeric.some(x=>x.scalar==='decimal')?'numeric':base.native,nullable:a.nullable||b.nullable,integral:Math.max(a.integral,b.integral),fractional:Math.max(a.fractional,b.fractional),staticallyIntegral:a.staticallyIntegral&&b.staticallyIntegral},p);
  }
  if(node.op!=='add'&&node.op!=='subtract'&&node.op!=='multiply')return;
  const left=infer(node.left,p+'/left',depth+1),right=infer(node.right,p+'/right',depth+1);if(!left||!right)return;
  if(left.scalar!==null&&!numeric(left)||right.scalar!==null&&!numeric(right))ctx.add('TABLES_OPERATION_DOMAIN',p,'Arithmetic operands must be exact integer or decimal values');
  if(left.scalar===null||right.scalar===null){
   // Arithmetic has an intrinsic numeric carrier even when both literal
   // operands are NULL. Keep that carrier so target typing cannot erase the
   // operator's meaning (NULL + NULL is still numeric NULL).
   if(left.scalar===null&&right.scalar===null)return bounded({scalar:'decimal',nullable:true,native:'numeric',integral:0,fractional:0,staticallyIntegral:true},p);
   const base=left.scalar===null?right:left;
   return bounded({...base,nullable:true,staticallyIntegral:base.staticallyIntegral},p);
  }
  const I=node.op==='multiply'?left.integral+right.integral:Math.max(left.integral,right.integral)+1;
  const S=node.op==='multiply'?left.fractional+right.fractional:Math.max(left.fractional,right.fractional);
  if(I+S>1000)ctx.add('TABLES_OPERATION_CAPACITY',p,'Numeric result exceeds the 1000 digit inference limit');
  return bounded({scalar:left.scalar==='decimal'||right.scalar==='decimal'?'decimal':'integer',nullable:left.nullable||right.nullable,native:'numeric',integral:I,fractional:S,staticallyIntegral:left.staticallyIntegral&&right.staticallyIntegral},p);
 };
 const inspectPredicate=(node:RowExpressionPredicate,p:string,depth:number):void=>{
  if(node.op==='all')return;
  if(node.op==='and'||node.op==='or'){node.args.forEach((child,i)=>inspectPredicate(child,p+'/args/'+i,depth+1));return;}
  if(node.op==='not'){inspectPredicate(node.arg,p+'/arg',depth+1);return;}
  if(!('field' in node))return;
  const element=elements.get(refKey(node.field)),column=columns.get(refKey(node.field));if(!element||!column)return;
  if(node.op==='isNull')return;
  const literals=node.op==='in'?node.values: [node.value];
  for(const [i,value]of literals.entries()){
   if(value.kind!=='literal'){ctx.add('TABLES_OPERATION_SOURCE',p,'Predicate values must be literal-only TableOperationValue wrappers');continue;}
   const shape=literalShape(value.value);if(!shape||shape.scalar!==null&&shape.scalar!==element.scalarType||shape&&identityCarrier(shape)&&shape.native!==nativeCarrier(column))ctx.add('TABLES_OPERATION_DOMAIN',p,'Predicate literal carrier must match its input Field');
   ctx.literal(element,value.value,p+(node.op==='in'?'/values/'+i:'/value'));
  }
  if(node.op==='startsWith'&&element.scalarType!=='string'||['lt','le','gt','ge'].includes(node.op)&&!['integer','decimal','string','date','timestamp'].includes(element.scalarType??''))ctx.add('TABLES_OPERATION_DOMAIN',p,'Predicate operator is not defined for this input carrier');
 };
 const result=infer(expression,path,0);
 const targetBound=numericBound(target,path,ctx);
 const resolved=result?.scalar===null&&result?{...result,scalar:targetElement.scalarType??null,native:nativeCarrier(target),integral:targetBound?.I??0,fractional:targetBound?.S??0,staticallyIntegral:true}:result;
 const numericTarget=['integer','decimal'].includes(targetElement.scalarType??'');
 if(resolved&&resolved.scalar!==null&&resolved.scalar!==targetElement.scalarType&&!(numericTarget&&numeric(resolved)&&(targetElement.scalarType==='decimal'||resolved.staticallyIntegral)))ctx.add('TABLES_OPERATION_DOMAIN',path,'Expression result scalar type differs from its target Field');
 if(result&&['integer','decimal'].includes(result.scalar??'')){
  if(targetElement.scalarType==='integer'&&!result.staticallyIntegral)ctx.add('TABLES_OPERATION_DOMAIN',path,'Integer targets require a statically integral expression');
 }
 if(resolved){
  const family=nativeCarrier(target);
  if(identityCarrier(resolved)){if(resolved.native!==family)ctx.add('TABLES_OPERATION_DOMAIN',path,'Identity-sensitive expression carrier must match target native storage exactly');}
  else if(resolved.scalar!==null&&resolved.scalar!==family&&!(resolved.scalar==='integer'&&family==='decimal')&&!(resolved.scalar==='decimal'&&family==='integer'&&resolved.staticallyIntegral))ctx.add('TABLES_OPERATION_DOMAIN',path,'Expression carrier does not match target native storage');
  if(numeric(resolved)){
   if(resolved.integral+resolved.fractional>1000)ctx.add('TABLES_OPERATION_CAPACITY',path,'Target numeric inference exceeds 1000 digits');
  }
  if(!qualifiedTargetDomain(targetElement))ctx.add('TABLES_OPERATION_DOMAIN',path,'Target refinements are outside the qualified native domain profile');
 }
}

function qualifiedTargetDomain(field:Element):boolean{
 const facets=field.facets??{};
 if(Object.keys(facets).some(key=>!['precision','scale','integerWidth','range','length'].includes(key)))return false;
 if(field.allowedValues!==undefined&&!['string','boolean','integer','decimal'].includes(field.scalarType??''))return false;
 if(facets.range&&!['integer','decimal'].includes(field.scalarType??''))return false;
 if(facets.length&&(!['string','binary'].includes(field.scalarType??'')||facets.length.unit!==(field.scalarType==='string'?'unicode-scalar':'byte')))return false;
 if(facets.integerWidth&&field.scalarType!=='integer')return false;
 if((facets.precision!==undefined||facets.scale!==undefined)&&field.scalarType!=='decimal')return false;
 return true;
}
