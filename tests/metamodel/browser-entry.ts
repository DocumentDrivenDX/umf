import {validateDocument} from '../../src/validation/document';
import {Registry} from '../../src/registry/registry';
import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import {canonicalJson} from '../../src/validation/json-equality';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {checkSchemaLiteral} from '../../src/model/schema-literals';
export async function verify(includeRegistry=false){
 const corpus=await (await fetch('/cases.json')).json() as any,failures:string[]=[];let count=0;
 for(const item of corpus.cases){if(!!item.registry!==includeRegistry)continue;const registry=new Registry();if(item.registry)registry.register({id:item.registry.id,version:item.registry.version,coreVersion:CURRENT_CORE_VERSION,description:'Synthetic callback conformance',schema:true,semantics:'Trusted callback probe',scopes:['document'],capabilities:{validation:'semantic',directions:[],evidence:[]}},(payload:any,context)=>[{code:'BASELINE_CALLBACK',path:context.path,message:context.document.id+':'+context.scope+':'+payload.kind,severity:'warning'}]);const actual=validateDocument(item.document,registry),expected={valid:item.valid,complete:item.complete,diagnostics:item.diagnostics};if(canonicalJson(actual)!==canonicalJson(expected))failures.push(item.id);count++;}
 const hostile=readJsonValue('{"umf":"0.10.0","id":"hostile","vocabularies":{},"modules":[],"__proto__":{"safe":true}}','json');for(const format of ['yaml','json'] as const)if(canonicalJson(readJsonValue(writeJsonValue(hostile,format),format))!==canonicalJson(hostile))failures.push('hostile-'+format);
 const field:any={id:'uuid',kind:'field',scalarType:'uuid',extensions:{}};checkSchemaLiteral({umf:CURRENT_CORE_VERSION,id:'uuid',vocabularies:{},modules:[]},field,{uuid:'00000000-0000-0000-0000-000000000001'});
 return {count,failures};
}
