import type {ParquetTypedValue} from '../parquet/values';
import type {NativeJson} from '../../model/native-json';
/** Exact JSON view for annotated checkpoint statistics; no INT96/timezone inference. */
export function deltaStatScalar(v:ParquetTypedValue):NativeJson|undefined {
 if(v===null)return undefined;
 if(v.kind==='decimal')return {kind:'number',value:v.value};
 if(v.kind==='float'){if(!Number.isFinite(Number(v.value)))throw Error('Nonfinite checkpoint statistics require a separate representation');return {kind:'number',value:v.value};}
 if(v.kind==='date')return {kind:'string',value:date(BigInt(v.value))};
 if(v.kind==='timestamp'){
  const digits={MILLIS:3,MICROS:6,NANOS:9}[v.unit],units=10n**BigInt(digits),day=86400n*units,n=BigInt(v.value);let days=n/day,remainder=n%day;if(remainder<0n){days--;remainder+=day;}
  const seconds=remainder/units,h=seconds/3600n,m=seconds/60n%60n,s=seconds%60n,f=(remainder%units).toString().padStart(digits,'0');
  return {kind:'string',value:date(days)+'T'+[h,m,s].map(x=>x.toString().padStart(2,'0')).join(':')+'.'+f+(v.isAdjustedToUTC?'Z':'')};
 }
 return undefined;
}
function date(days:bigint):string {
 // Restrict ISO years explicitly; milliseconds in this interval are exact JS integers.
 if(days< -719162n||days>2932896n)throw Error('Checkpoint date is outside supported ISO years 0001–9999');
 return new Date(Number(days)*86400000).toISOString().slice(0,10);
}
