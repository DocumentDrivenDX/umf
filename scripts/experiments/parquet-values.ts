import {parquetMetadata,parquetSchema,parquetReadObjects} from 'hyparquet';
import {captureParquet,inspectParquetContainers} from '../../src';
/** Experimental schema-driven value view. Not a bounded public decoder. */
export async function readParquetValuesTrial(file:ArrayBuffer){
 const view=inspectParquetContainers(captureParquet(new Uint8Array(file),{id:'trial'}));if(view.status!=='checked')throw Error('Unsupported schema');
 const schema=(view.metadata as any).schema,annotations=new Map(view.annotations?.map(a=>[a.index,a])),containers=new Map(view.containers?.map(c=>[c.index,c])),m=parquetMetadata(file,{geoparquet:false}),tree=parquetSchema(m),paths:string[][]=[];let index=0;
 function alias(n:typeof tree,path:string[]=[]){const i=index++,e=n.element;e.name='f'+i;delete e.converted_type;delete e.logical_type;const p=i?[...path,e.name]:[];if(!n.children.length)paths.push(p);for(const child of n.children)alias(child,p);}alias(tree);
 for(const group of m.row_groups)for(const [i,column] of group.columns.entries())column.meta_data!.path_in_schema=paths[i]!;
 if(schema.some((e:any)=>e.type==='3'))throw Error('INT96 trial semantics not established');
 const rows=await parquetReadObjects({file,metadata:m,utf8:false,geoparquet:false});
 const bytes=(v:Uint8Array)=>Array.from(v,b=>b.toString(16).padStart(2,'0')).join('');
 const nodes=new Map<number,any>();function collect(n:any){nodes.set(n.index,n);for(const c of n.children)collect(c);}collect(view.tree);
 function decode(i:number,raw:any,inRepeated=false):any{
  if(raw==null)return null;const e=schema[i],n=nodes.get(i),a=annotations.get(i),c=containers.get(i);
  if(e.repetition_type==='2'&&!inRepeated){if(!Array.isArray(raw))throw Error('Expected repeated values');return {kind:'list',items:raw.map(x=>decode(i,x,true))};}
  if(c){const repeated=raw['f'+c.repeatedIndex];if(!Array.isArray(repeated))throw Error('Expected container entries');if(c.kind==='list')return {kind:'list',items:repeated.map(v=>decode(c.elementIndex,c.layout==='two-level'?v:v['f'+c.elementIndex],true))};return {kind:'map',entries:repeated.map(v=>({key:decode(c.keyIndex,v['f'+c.keyIndex]),value:c.valueIndex===undefined?null:decode(c.valueIndex,v['f'+c.valueIndex])}))};}
  if(e.type===undefined)return {kind:'struct',fields:n.children.map((child:any)=>({name:child.name,value:decode(child.index,raw['f'+child.index])}))};
  const p=a?.parameters as any;
  if(a?.name==='DECIMAL'){let value:bigint;if(raw instanceof Uint8Array){if(!raw.length)throw Error('Empty decimal');value=0n;for(const b of raw)value=value*256n+BigInt(b);if(raw[0]!&128)value-=1n<<BigInt(raw.length*8);}else value=BigInt(raw);const scale=Number(p.scale);if(scale>1000)throw Error('Decimal trial scale bound');const neg=value<0n,digits=(neg?-value:value).toString().padStart(scale+1,'0');return {kind:'decimal',value:(neg?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits)};}
  if(a?.name==='STRING'||a?.name==='ENUM'||a?.name==='JSON')return {kind:a.name.toLowerCase(),value:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw)};
  if(a?.name==='DATE')return {kind:'date',value:String(raw)};
  if(a?.name==='TIMESTAMP'||a?.name==='TIME')return {kind:a.name.toLowerCase(),unit:Object.keys(p.unit)[0],isAdjustedToUTC:p.isAdjustedToUTC,value:String(raw)};
  if(a?.name==='INTEGER'){let v=BigInt(raw);if(!p.isSigned&&v<0n)v+=1n<<BigInt(p.bitWidth);return {kind:p.isSigned?'int':'uint',bits:Number(p.bitWidth),value:v.toString()};}
  if(a?.name==='UNKNOWN')throw Error('Non-null value contradicts UNKNOWN annotation');
  if(a)throw Error('Unsupported scalar annotation '+a.name);
  if(e.type==='0')return {kind:'bool',value:raw};
  if(e.type==='1'||e.type==='2')return {kind:'int',bits:e.type==='1'?32:64,value:String(raw)};
  if(e.type==='4'||e.type==='5'){if(!Number.isFinite(raw))throw Error('Nonfinite float payload fidelity needs separate evidence');return {kind:'float',bits:e.type==='4'?32:64,value:Object.is(raw,-0)?'-0':String(raw)};}
  if(raw instanceof Uint8Array)return {kind:'bytes',value:bytes(raw)};
  throw Error('Unsupported physical value');
 }
 return rows.map(row=>decode(0,row));
}
