import {parquetMetadata,parquetReadObjects,parquetSchema} from 'hyparquet';
/** Decoder experiment, not the UMF public API. Original bytes remain authoritative. */
export async function readCheckpointParquetTrial(file:ArrayBuffer){
 const metadata=parquetMetadata(file,{geoparquet:false}),decimals:{path:string[];scale:number}[]=[];
 function visit(n:ReturnType<typeof parquetSchema>,container=false){
  const e=n.element,inContainer=container||e.repetition_type==='REPEATED'||e.converted_type==='LIST'||e.converted_type==='MAP';
  if(e.converted_type==='DECIMAL'||e.logical_type?.type==='DECIMAL'){
   if(inContainer)throw Error('Decimal inside repeated/list/map structures needs separate assembly evidence');
   const scale=e.scale??(e.logical_type?.type==='DECIMAL'?e.logical_type.scale:0);if(!Number.isInteger(scale)||scale<0||scale>1000)throw Error('Decimal scale outside trial bounds');
   decimals.push({path:n.path,scale});delete e.converted_type;delete e.logical_type;
  }
  for(const child of n.children)visit(child,inContainer);
 }
 visit(parquetSchema(metadata));
 const rows=await parquetReadObjects({file,metadata,utf8:false,geoparquet:false,parsers:{timestampFromMilliseconds:v=>({$timestamp:{unit:'ms',value:v.toString()}}),timestampFromMicroseconds:v=>({$timestamp:{unit:'us',value:v.toString()}}),timestampFromNanoseconds:v=>({$timestamp:{unit:'ns',value:v.toString()}}),dateFromDays:v=>({$dateDays:v})}});
 for(const row of rows)for(const d of decimals){let owner:any=row;for(const key of d.path.slice(0,-1)){owner=owner?.[key];if(owner==null)break;}if(owner==null)continue;const key=d.path.at(-1)!,value=owner[key];if(value==null)continue;let unscaled:bigint;
  if(value instanceof Uint8Array){if(!value.length)throw Error('Empty decimal bytes');unscaled=0n;for(const b of value)unscaled=(unscaled<<8n)+BigInt(b);if(value[0]!&128)unscaled-=1n<<BigInt(value.length*8);}
  else if(typeof value==='bigint')unscaled=value;else if(typeof value==='number'&&Number.isSafeInteger(value))unscaled=BigInt(value);else throw Error('Unsafe decimal storage value');
  const negative=unscaled<0n,digits=(negative?-unscaled:unscaled).toString().padStart(d.scale+1,'0'),text=(negative?'-':'')+(d.scale?digits.slice(0,-d.scale)+'.'+digits.slice(-d.scale):digits);owner[key]={$decimal:text};
 }
 return rows;
}
export function normalizeCheckpointTrial(v:any):any{return v==null?null:typeof v==='bigint'?{$int64:v.toString()}:v instanceof Uint8Array?{$bytes:Array.from(v,b=>b.toString(16).padStart(2,'0')).join('')}:Array.isArray(v)?v.map(normalizeCheckpointTrial):typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalizeCheckpointTrial(v)])):v;}
