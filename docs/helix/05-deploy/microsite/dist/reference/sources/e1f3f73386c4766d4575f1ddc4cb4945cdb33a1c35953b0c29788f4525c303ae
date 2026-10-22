import {getTypeName,getSourceLocation,getDoc,type Type,type Value} from '@typespec/compiler';
import {copyJson,LIMITS} from '../../model/json';
import {UmfError,type Document,type Json} from '../../model/types';
import {exportTypeSpecSources} from './index';
import {compileTypeSpecProgram,typeSpecCompilerReport} from './compiler';
export interface TypeSpecSemanticNode {id:string;kind:string;label:string;attributes:Record<string,Json>;edges:{role:string;target:string;name?:string;index?:number}[];location?:{file:string;start:number;end:number};}
/** Selected compiled graph snapshot; source remains authoritative for omitted compiler state. */
export async function getTypeSpecSemanticGraph(document:Document,input:{roots:string[]}){
 const options=copyJson(input) as unknown as typeof input;
 if(Object.keys(options).some(k=>k!=='roots')||!Array.isArray(options.roots)||!options.roots.length||options.roots.length>1000||options.roots.some(x=>typeof x!=='string'||!x))throw new UmfError('TYPESPEC_GRAPH_OPTIONS','Select 1–1000 native type expressions');
 const bundle=exportTypeSpecSources(document);const program=await compileTypeSpecProgram(bundle.files,bundle.entrypoint,bundle.libraries);const compilation=typeSpecCompilerReport(program,bundle.libraries);
 const result:{status:'available'|'blocked';source:Document;compilation:typeof compilation;roots:{expression:string;target:string}[];nodes:TypeSpecSemanticNode[];complete:false;limitations:string[];issues:{code:string;detail:string}[]}={status:'blocked',source:copyJson(document) as unknown as Document,compilation,roots:[],nodes:[],complete:false,limitations:['Selected compiled type graph only; compiler state maps, arbitrary decorator effects and reverse relationships are not fully serialized','Node IDs are snapshot-local, not stable cross-version identities','Source remains authoritative; snapshot editing and cross-system equivalence are not established'],issues:[]};
 if(!compilation.valid)return result;
 const ids=new Map<Type,string>();let depth=0;
 function value(v:Value,depth=0):Json {
  if(depth>LIMITS.maxDepth)throw new UmfError('LIMIT','Semantic value exceeds depth limit');
  switch(v.valueKind){
   case 'NumericValue':return {kind:v.valueKind,value:v.value.toString(),type:visit(v.type),...(v.scalar?{scalar:visit(v.scalar)}:{})};
   case 'StringValue':case 'BooleanValue':return {kind:v.valueKind,value:v.value,type:visit(v.type),...(v.scalar?{scalar:visit(v.scalar)}:{})};
   case 'NullValue':return {kind:v.valueKind,value:null,type:visit(v.type)};
   case 'EnumValue':return {kind:v.valueKind,member:visit(v.value),type:visit(v.type)};
   case 'ArrayValue':return {kind:v.valueKind,items:v.values.map(x=>value(x,depth+1)),type:visit(v.type)};
   case 'ObjectValue':return {kind:v.valueKind,properties:[...v.properties].map(([name,p])=>({name,value:value(p.value,depth+1)})),type:visit(v.type)};
   case 'ScalarValue':return {kind:v.valueKind,scalar:visit(v.scalar),constructor:v.value.name,args:v.value.args.map(x=>value(x,depth+1)),type:visit(v.type)};
   default:result.issues.push({code:'TYPESPEC_VALUE_STATE',detail:'Unencoded value kind '+v.valueKind+' retained in source'});return {kind:v.valueKind,type:visit(v.type)};
  }
 }
 function visit(type:Type):string {
  const found=ids.get(type);if(found)return found;
  if(++depth>LIMITS.maxDepth)throw new UmfError('LIMIT','Semantic type traversal exceeds depth limit');
  if(ids.size>=LIMITS.maxValues)throw new UmfError('LIMIT','Semantic graph exceeds node limit');
  const id='type_'+ids.size;ids.set(type,id);
  const node:TypeSpecSemanticNode={id,kind:type.kind,label:getTypeName(type),attributes:Object.create(null),edges:[]};result.nodes.push(node);
  if(type.node){const at=getSourceLocation(type.node);if(at)node.location={file:at.file.path,start:at.pos,end:at.end};}
  const doc=getDoc(program,type);if(doc!==undefined)node.attributes.doc=doc;
  const edge=(role:string,target:Type|undefined,name?:string,index?:number)=>{if(target)node.edges.push({role,target:visit(target),...(name===undefined?{}:{name}),...(index===undefined?{}:{index})});};
  if('decorators'in type&&type.decorators.length)node.attributes.decorators=type.decorators.map(d=>({name:d.definition?getTypeName(d.definition):d.decorator.name,args:d.args.map(a=>a.value.entityKind==='Value'?{value:value(a.value)}:{type:visit(a.value)})}));
  switch(type.kind){
   case 'Model':
    for(const [name,p]of type.properties)edge('property',p,name);edge('baseModel',type.baseModel);edge('sourceModel',type.sourceModel);
    type.sourceModels.forEach((source,i)=>edge('source:'+source.usage,source.model,undefined,i));
    if(type.indexer){edge('indexKey',type.indexer.key);edge('indexValue',type.indexer.value);}break;
   case 'ModelProperty':node.attributes.optional=type.optional;edge('type',type.type);edge('sourceProperty',type.sourceProperty);if(type.defaultValue)node.attributes.default=value(type.defaultValue);break;
   case 'Scalar':edge('baseScalar',type.baseScalar);if(type.constructors.size)result.issues.push({code:'TYPESPEC_CONSTRUCTORS',detail:node.label+' has constructors retained in source'});break;
   case 'Interface':for(const [name,op]of type.operations)edge('operation',op,name);type.sourceInterfaces.forEach((x,i)=>edge('sourceInterface',x,undefined,i));break;
   case 'Operation':edge('parameters',type.parameters);edge('returnType',type.returnType);edge('sourceOperation',type.sourceOperation);break;
   case 'Enum':for(const [name,member]of type.members)edge('member',member,name);break;
   case 'EnumMember':
    if(typeof type.value==='string')node.attributes.value={kind:'string',value:type.value};
    if(typeof type.value==='number'){const n=type.node?.value;if(n&&'valueAsString'in n)node.attributes.value={kind:'number',value:n.valueAsString};else if(Number.isSafeInteger(type.value))node.attributes.value={kind:'number',value:String(type.value)};else result.issues.push({code:'TYPESPEC_ENUM_NUMBER',detail:node.label+' lacks an exact numeric source; value is retained only in source'});}
    edge('sourceMember',type.sourceMember);break;
   case 'Union':for(const [name,variant]of type.variants)edge('variant',variant,typeof name==='string'?name:undefined,node.edges.length);edge('baseType',type.baseType);node.attributes.expression=type.expression;break;
   case 'UnionVariant':edge('type',type.type);break;
   case 'Tuple':type.values.forEach((v,i)=>edge('item',v,undefined,i));break;
   case 'Number':node.attributes.value={kind:'number',value:type.valueAsString};break;
   case 'String':case 'Boolean':node.attributes.value={kind:type.kind.toLowerCase(),value:type.value};break;
   case 'Intrinsic':break;
   case 'StringTemplate':if(type.stringValue!==undefined)node.attributes.stringValue=type.stringValue;type.spans.forEach((v,i)=>edge('span',v,undefined,i));break;
   case 'StringTemplateSpan':node.attributes.isInterpolated=type.isInterpolated;edge('type',type.type);break;
   default:result.issues.push({code:'TYPESPEC_GRAPH_KIND',detail:'Unexpanded '+type.kind+' '+node.label+' remains in source'});
  }
  depth--;return id;
 }
 for(const expression of options.roots){const [type,diagnostics]=program.resolveTypeReference(expression);if(!type||diagnostics.some(d=>d.severity==='error')){result.issues.push({code:'TYPESPEC_GRAPH_ROOT',detail:'Cannot resolve '+expression+': '+diagnostics.map(d=>d.message).join('; ')});continue;}result.roots.push({expression,target:visit(type)});}
 if(result.roots.length===options.roots.length)result.status='available';
 return copyJson(result) as unknown as typeof result;
}
