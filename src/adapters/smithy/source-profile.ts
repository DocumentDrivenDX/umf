import {LIMITS} from '../../model/json';
import {pointer,type Json,type Diagnostic} from '../../model/types';
export interface SmithySourcePayload{profile:'smithy-idl-sources';files:Record<string,string>;}
export function inspectSmithySourcesPayload(value:Json):Diagnostic[]{
 const p=value as unknown as SmithySourcePayload;const out:Diagnostic[]=[];
 for(const key of Object.keys(p))if(!['profile','files'].includes(key))out.push({code:'SMITHY_REPRESENTATION',path:'/'+pointer(key),severity:'warning',message:'Unknown source representation field has no native destination'});
 let size=0;for(const [path,text]of Object.entries(p.files)){
  if(!/^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:smithy|json)$/.test(path)||path.split('/').some(x=>x==='.'||x==='..'))out.push({code:'SMITHY_SOURCE_PATH',path:'/files/'+pointer(path),severity:'error',message:'Sources require relative .smithy/.json paths without traversal'});
  size+=text.length;
 }
 if(size>LIMITS.maxTextLength)out.push({code:'LIMIT',path:'/files',severity:'error',message:'Source bundle exceeds text limit'});
 out.push({code:'SMITHY_SOURCE_UNVALIDATED',path:'/files',severity:'warning',message:'Source text is preserved without browser parsing or assembly; syntax and semantic validity require native compilation'});return out;
}
