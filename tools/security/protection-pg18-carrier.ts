/** Private carrier admission. No installer, policy permission or native authority. */
import {copyJson} from '../../src/model/json';
import {compilePg18ProtectionCatalog} from './protection-pg18-catalog';
export function compilePg18ProtectionCarrier(input:unknown):any {
 let request:any=null;
 try {
  request=copyJson(input);
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).length!==4||!['carrier','catalog','closure','profile'].every(k=>Object.hasOwn(request,k)))throw Error('Closed original carrier request required');
  if(request.carrier!=='barrier-view')throw Error(request.carrier==='virtual-generated'?'Virtual generated mask/withhold carriers are not admitted: privilege separation does not establish leakproof expression/planner closure':'Unknown carrier is not admitted');
  const projection=compilePg18ProtectionCatalog(request.catalog,request.closure,request.profile);
  if(projection.status!=='compiled')throw Error(projection.reason??'Original catalog refused');
  return freeze({version:'umf.security.pg18-carrier-admission/0.1',status:'compiled',complete:false,authority:false,request,carrier:'barrier-view',projection,statements:[projection.sourceDDL,projection.viewSQL],reason:null});
 }catch(e){return freeze({version:'umf.security.pg18-carrier-admission/0.1',status:'refused',complete:false,authority:false,request,carrier:null,projection:null,statements:[],reason:e instanceof Error?e.message:String(e)});}
}
function freeze(v:any):any{if(v!==null&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
