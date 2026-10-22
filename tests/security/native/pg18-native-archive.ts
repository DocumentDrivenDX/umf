/** Existing source/catalog owners on opaque native archives; no native execution. */
import {inspectProtectionCatalog,requireProtectionInterpretation} from '../../../src/extensions/security/protection/catalog';
import {readProtectionSource,writeProtectionSource} from '../../../src/extensions/security/protection/source';
import {UmfError} from '../../../src/model/types';

export function inspectNativeArchiveRoundTrip(input:unknown){
 const inspection=inspectProtectionCatalog(input),source=inspection.source;
 const json=writeProtectionSource(source,'json'),yaml=writeProtectionSource(source,'yaml');
 let interpretation:{refused:boolean;code:string|null;path:string|null}={refused:false,code:null,path:null};
 // This invokes the original owner. It never parses or executes native text.
 try{requireProtectionInterpretation(source);}catch(error){
  if(!(error instanceof UmfError))throw error;
  interpretation={refused:true,code:error.code,path:error.path};
 }
 return {source,inspection:{valid:inspection.valid,complete:inspection.complete,diagnostics:inspection.diagnostics},
  roundTrips:{json:readProtectionSource(json,'json'),yaml:readProtectionSource(yaml,'yaml')},
  interpretation,complete:false,authority:false,
  obligations:inspection.valid&&source!==null&&typeof source==='object'&&!Array.isArray(source)&&Object.hasOwn(source,'native')?[{kind:'native-mask-archive',sourcePath:'/native',status:'unverified'}]:[]};
}
