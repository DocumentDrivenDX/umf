/** Portable source-preservation/refusal controls using the retained native catalog. */
import {inspectNativeArchiveRoundTrip} from './pg18-native-archive';
function canonical(value:any):string{return JSON.stringify(value===null||typeof value!=='object'?value:Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])));}
export function runNativeArchiveCorpus(catalog:unknown){
 const rows:{id:string;expected:unknown;observed:unknown}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>{if(canonical(expected)!==canonical(observed))throw Error('Native archive corpus failed: '+id);rows.push({id,expected,observed});};
 const original=JSON.parse(JSON.stringify(catalog));
 const variants:{id:string;source:any;valid:boolean;native:boolean}[]=[{id:'actual-native-catalog',source:original,valid:true,native:true}];
 for(const [id,native] of Object.entries({null:null,array:['opaque',null],text:'MASKED WITH FUNCTION execute_untrusted()',boolean:true,integer:0,unknown:{authority:true,enforced:true,sql:'DROP TABLE secret',future:{'é':'NFC','e\u0301':'NFD','quoted"\nkey':['\u0000','雪','\\']}}}))variants.push({id,source:{...original,native},valid:true,native:true});
 const absent={...original};delete absent.native;variants.push({id:'native-absent',source:absent,valid:true,native:false},{id:'unknown-version',source:{...original,version:'999'},valid:false,native:true},{id:'null-envelope',source:null,valid:false,native:false});
 for(const v of variants){
  const before=canonical(v.source),result=inspectNativeArchiveRoundTrip(v.source);
  check(v.id+':input-preserved',before,canonical(v.source));check(v.id+':source-preserved',before,canonical(result.source));
  for(const format of ['json','yaml'] as const)check(v.id+':'+format,before,canonical(result.roundTrips[format]));
  check(v.id+':valid',v.valid,result.inspection.valid);check(v.id+':incomplete',false,result.complete);check(v.id+':no-authority',false,result.authority);
  check(v.id+':interpretation-refuses',true,result.interpretation.refused);check(v.id+':specific-owner-error',v.valid?'PROTECTION_UNIMPLEMENTED':'PROTECTION_STRUCTURE',result.interpretation.code);
  check(v.id+':unverified-obligation',v.valid&&v.native?[{kind:'native-mask-archive',sourcePath:'/native',status:'unverified'}]:[],result.obligations);
 }
 let calls=0;const accessor={...original,get native(){calls++;return {authority:true};}};const rejected=inspectNativeArchiveRoundTrip(accessor);
 check('native-accessor-not-invoked',0,calls);check('native-accessor-refused',false,rejected.inspection.valid);check('native-accessor-never-authority',false,rejected.authority);
 return rows;
}
