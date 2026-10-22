import {buildASTSchema,parseType,typeFromAST,isInputType,isNonNullType,isListType,isScalarType,isEnumType,isInputObjectType,type GraphQLInputType} from 'graphql';
import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type JsonObject} from '../model/types';
import {inspectGraphql,getGraphqlAst} from '../adapters/graphql';
import {importJsonSchema,inspectJsonSchema} from '../adapters/json-schema';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface GraphqlInputBindings {
 id:string;schemaId:string;inputType:string;list:'array-only';idEncoding:'string-or-integer';lossPolicy:'strict'|'allow-reported-loss';
}
export interface GraphqlInputProjection {
 status:'blocked'|'projected';source:Document;policy:GraphqlInputBindings;issues:ProjectionIssue[];
 mappings:{name:string;targetPointer:string}[];target?:Document;nativeSchema?:string;
}
export function projectGraphqlInputToJsonSchema(source:Document,input:GraphqlInputBindings):GraphqlInputProjection {
 const policy=copyJson(input) as unknown as GraphqlInputBindings;
 if(typeof policy.id!=='string'||!policy.id||typeof policy.schemaId!=='string'||typeof policy.inputType!=='string'||!policy.inputType||policy.list!=='array-only'||policy.idEncoding!=='string-or-integer'||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['id','schemaId','inputType','list','idEncoding','lossPolicy'].includes(k)))throw new UmfError('GRAPHQL_BINDINGS','Explicit supported GraphQL input bindings are required');
 try{const uri=new URL(policy.schemaId);if(uri.hash)throw new Error('fragment');}catch{throw new UmfError('GRAPHQL_BINDINGS','Schema ID must be absolute and fragment-free');}
 const checked=inspectGraphql(source);if(!checked.valid)throw new UmfError('GRAPHQL_SOURCE','Invalid GraphQL source');
 const result:GraphqlInputProjection={status:'blocked',source:copyJson(source) as unknown as Document,policy,issues:[],mappings:[]};
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 let fatal=false;const fail=(path:string,detail:string)=>{fatal=true;issue(path,'GRAPHQL_INPUT_UNSUPPORTED','unsupported',detail);return {} as JsonObject;};
 for(const d of checked.diagnostics){issue(d.path,d.code,'unsupported',d.message);if(['GRAPHQL_FRAGMENT','GRAPHQL_REPRESENTATION','GRAPHQL_PRINT_CHANGE','GRAPHQL_PROFILE_EXTENSION'].includes(d.code))fatal=true;}
 if(fatal)return result;
 const schema=buildASTSchema(getGraphqlAst(source));
 let root:GraphQLInputType;
 try{const type=typeFromAST(schema,parseType(policy.inputType));if(!type||!isInputType(type))throw new Error('Unknown or non-input type');root=type;}catch(error){fail('/policy/inputType',String(error));return result;}
 const defs:Record<string,JsonObject>=Object.create(null);const names=new Map<string,string>();
 function shape(type:GraphQLInputType,path:string,nonNull=false):JsonObject {
  if(isNonNullType(type))return shape(type.ofType,path,true);
  let value:JsonObject;
  if(isListType(type)){
   issue(path,'LIST_COERCION','representation-change','Target requires arrays; GraphQL also wraps a non-list input into a singleton list, recursively');
   value={type:'array',items:shape(type.ofType,path+'/items')};
  }else if(isScalarType(type)){
   switch(type.name){
    case 'String':value={type:'string'};break;
    case 'Boolean':value={type:'boolean'};break;
    case 'Int':value={type:'integer',minimum:-2147483648,maximum:2147483647};break;
    case 'Float':value={type:'number'};issue(path,'FLOAT_RUNTIME','not-enforced','JSON Schema mathematical numbers do not enforce finite host double-precision parsing');break;
    case 'ID':value={anyOf:[{type:'string'},{type:'integer'}]};issue(path,'ID_COERCION','representation-change','String/integer ID inputs are accepted, but integer-to-string coercion and host precision are not performed');break;
    default:value=fail(path,'Custom scalar '+type.name+' requires an explicit coercion/representation contract');
   }
  }else if(isEnumType(type))value={type:'string',enum:type.getValues().map(v=>v.name)};
  else if(isInputObjectType(type)){
   let key=names.get(type.name);
   if(!key){
    key='input_'+names.size;names.set(type.name,key);result.mappings.push({name:type.name,targetPointer:'/$defs/'+key});
    const properties:Record<string,JsonObject>=Object.create(null);const required:string[]=[];
    defs[key]={title:type.name,type:'object',properties,additionalProperties:false};
    if(type.description)defs[key]!.description=type.description;
    for(const field of Object.values(type.getFields())){
     const fieldPath='/types/'+pointer(type.name)+'/fields/'+pointer(field.name);
     properties[field.name]=shape(field.type,fieldPath);
     if(field.description)properties[field.name]={...properties[field.name],description:field.description};
     if(isNonNullType(field.type)&&field.default===undefined)required.push(field.name);
     if(field.default!==undefined)issue(fieldPath+'/default','INPUT_DEFAULT','not-enforced','Omission is accepted where GraphQL supplies a default, but JSON validation does not insert or coerce that value');
     if(field.deprecationReason!==undefined)properties[field.name]={...properties[field.name],deprecated:true};
    }
    if(required.length)defs[key]!.required=required;
    if(type.isOneOf){
     defs[key]!.minProperties=1;defs[key]!.maxProperties=1;
     defs[key]!.oneOf=Object.keys(properties).map(name=>({required:[name],properties:{[name]:{not:{type:'null'}}}}));
    }
   }
   value={$ref:'#/$defs/'+key};
  }else value=fail(path,'Unsupported GraphQL input kind');
  return nonNull?value:{anyOf:[value,{type:'null'}]};
 }
 const target=shape(root,'/inputType');
 issue('','INPUT_MODEL_ONLY','not-enforced','Selected input shape does not represent operations, output selection, resolvers, directive behavior, variable/argument processing or source schema identity');
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSchema=JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$id:policy.schemaId,...target,$defs:defs},null,2)+'\n';
 result.target=importJsonSchema(result.nativeSchema,{id:policy.id,baseUri:policy.schemaId});
 if(!inspectJsonSchema(result.target).valid)throw new UmfError('GRAPHQL_TARGET','Generated input schema is invalid');
 result.status='projected';return result;
}
