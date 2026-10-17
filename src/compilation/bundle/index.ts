import type {AccessRequest,AccessProfile,AccessResult,GeneratedFile,AccessSymbol,Disposition,Obligation,AccessDiagnostic} from '../ir/index';
import {canonical,sha256Text,hashCanonical} from './hash';
export {canonical,sha256Text,hashCanonical} from './hash';
export function packageAccessFiles(request:AccessRequest,profile:AccessProfile,texts:{path:string;text:string}[],symbols:AccessSymbol[],dispositions:Disposition[],obligations:Obligation[],diagnostics:AccessDiagnostic[]):AccessResult {
 const sourceOrder=(id:string)=>request.sources.findIndex(source=>source.id===id);
 const pointerOrder=(a:string,b:string):number=>{const x=a.split('/'),y=b.split('/');for(let i=0;i<Math.min(x.length,y.length);i++){if(x[i]===y[i])continue;if(/^\d+$/.test(x[i]!)&&/^\d+$/.test(y[i]!))return Number(x[i])-Number(y[i]);return x[i]!<y[i]!?-1:1;}return x.length-y.length;};
 const position=(a:{sourceId:string;pointer:string},b:{sourceId:string;pointer:string})=>sourceOrder(a.sourceId)-sourceOrder(b.sourceId)||pointerOrder(a.pointer,b.pointer);
 symbols=[...symbols].sort((a,b)=>position(a,b)||(a.role<b.role?-1:a.role>b.role?1:0)||(a.symbol<b.symbol?-1:a.symbol>b.symbol?1:0));
 dispositions=[...dispositions].sort((a,b)=>position(a,b)||(a.assertion<b.assertion?-1:a.assertion>b.assertion?1:0)||(a.id<b.id?-1:a.id>b.id?1:0));
 diagnostics=[...diagnostics].sort((a,b)=>position(a,b)||(a.code<b.code?-1:a.code>b.code?1:0));
 const runtime=(Array.isArray(profile?.dependencies)?profile.dependencies:[]).find(d=>d&&typeof d==='object'&&['umf_access','umf-access'].includes(d.distribution));
 const result:AccessResult={contract:'umf-access-generate/0.1',abi:'umf-python-types/0.1',runtimeAbi:{distribution:runtime?.distribution??'umf_access',version:runtime?.version??'unqualified',abi:'umf-access-runtime/0.1'},outcome:diagnostics.length?'refused':'candidate',inputDigest:hashCanonical({request,profile}),files:[],symbols:[],dispositions,diagnostics,obligations};
 if(result.outcome==='refused')return result;
 const refuseLimit=()=>{result.outcome='refused';result.diagnostics.push({code:'LIMIT',sourceId:request.logical,pointer:'',message:'Aggregate package resource bound exceeded'});return result;};
 if(dispositions.length>100000)return refuseLimit();
 if(request.sources.reduce((n,s)=>n+new TextEncoder().encode(s.text).length,0)>33554432)return refuseLimit();
 texts.push({path:request.package+'/_umf/sources.json',text:canonical(request.sources)+'\n'});
 if(texts.length+1>1000||texts.reduce((n,f)=>n+new TextEncoder().encode(f.text).length,0)>33554432)return refuseLimit();
 const files:GeneratedFile[]=texts.map(f=>({...f,sha256:sha256Text(f.text)})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const manifest={contract:result.contract,abi:result.abi,runtimeAbi:result.runtimeAbi,inputDigest:result.inputDigest,profile,symbols,dispositions,obligations,inventory:files.map(({path,sha256})=>({path,sha256}))};
 const text=canonical(manifest)+'\n';if(new TextEncoder().encode(text).length+files.reduce((n,f)=>n+new TextEncoder().encode(f.text).length,0)>33554432)return refuseLimit();files.push({path:request.package+'/_umf/manifest.json',text,sha256:sha256Text(text)});files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 if(files.length>1000||files.reduce((n,f)=>n+new TextEncoder().encode(f.text).length,0)>33554432){result.outcome='refused';result.diagnostics.push({code:'LIMIT',sourceId:request.logical,pointer:'',message:'Aggregate package resource bound exceeded'});return result;}
 result.files=files;result.symbols=symbols;return result;
}
