import {type Json,UmfError} from '../types';
/** Exact JSON.stringify UTF-8 byte length for safely copied JSON, with early refusal.
 * String accounting matches the reviewed compact-dataset preflight, including
 * JSON escapes and lone-surrogate spelling, without serializing whole values.
 */
export function boundedJsonBytes(value:Json,maximum=4_000_000):number {
 let bytes=0;
 const add=(n:number)=>{bytes+=n;if(bytes>maximum)throw new UmfError('LIMIT','Boolean lexical serialized JSON exceeds byte limit');};
 const string=(s:string)=>{
  add(2);
  for(let i=0;i<s.length;i++){
   const c=s.charCodeAt(i);
   if(c===34||c===92)add(2);
   else if(c<32)add([8,9,10,12,13].includes(c)?2:6);
   else if(c>=0xd800&&c<=0xdbff){const next=s.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){add(4);i++;}else add(6);}
   else if(c>=0xdc00&&c<=0xdfff)add(6);
   else add(c<128?1:c<2048?2:3);
  }
 };
 const visit=(v:Json):void=>{
  if(typeof v==='string'){string(v);return;}
  if(v===null){add(4);return;}
  if(typeof v==='boolean'){add(v?4:5);return;}
  if(typeof v==='number'){add(JSON.stringify(v).length);return;}
  if(Array.isArray(v)){add(2+Math.max(0,v.length-1));for(const child of v)visit(child);return;}
  const keys=Object.keys(v);add(2+Math.max(0,keys.length-1));
  for(const key of keys){string(key);add(1);visit(v[key]!);}
 };
 visit(value);return bytes;
}
