/** Bounded reader for the analyzed PostgreSQL 17.4 node subset used by CHECKs.
 * This is not a general pg_node_tree codec. Unknown fields are retained here
 * and must be refused by the semantic interpreter. */
export interface PgFacetNode {tag:string;fields:Record<string,PgFacetValue>}
export type PgFacetValue=string|PgFacetValue[]|PgFacetNode;
export function readFacetNodeTree(text:string):PgFacetNode|undefined{
 if(text.length>1_000_000)return;
 const tokens=text.match(/[{}()[\]]|[^\s{}()[\]]+/g)??[];if(tokens.length>100_000)return;
 let at=0;
 function value(depth:number,allowBytes=false):PgFacetValue{
  if(depth>64)throw Error('depth');const token=tokens[at++];if(token===undefined)throw Error('end');
  if(token==='{'){
   const tag=tokens[at++];if(!tag||! /^[A-Z][A-Z0-9_]*$/.test(tag))throw Error('tag');
   const fields:Record<string,PgFacetValue>=Object.create(null);
   while(tokens[at]!=='}'){
    const key=tokens[at++];if(!key||!/^:[a-z][a-z0-9_]*$/.test(key)||key.slice(1) in fields)throw Error('field');
    const name=key.slice(1),v=value(depth+1);
    if(name==='constvalue'&&tag==='CONST'){if(tokens[at]!=='[')throw Error('datum');fields[name]=[v,value(depth+1,true)];}else fields[name]=v;
   }
   at++;return {tag,fields};
  }
  if(token==='['&&!allowBytes)throw Error('bytes');
  if(token==='('||token==='['){const end=token==='('?')':']',list:PgFacetValue[]=[];while(tokens[at]!==end)list.push(value(depth+1));at++;return list;}
  if(['}',')',']'].includes(token)||token.startsWith(':'))throw Error('token');return token;
 }
 try{const n=value(0);return at===tokens.length&&typeof n==='object'&&!Array.isArray(n)?n:undefined;}catch{return;}
}
/** Pinned little-endian, 64-bit Datum representation. No host-endian inference.
 * Numeric layout: PostgreSQL REL_17_4 numeric.c. Returned decimal is mathematical
 * value, with display-scale zeroes omitted; NaN/infinities remain unsupported. */
export function decodeFacetConstant(node:PgFacetNode):string|undefined{
 if(node.tag!=='CONST')return;
 const f=node.fields,keys=['consttype','consttypmod','constcollid','constlen','constbyval','constisnull','location','constvalue'];
 if(Object.keys(f).length!==keys.length||Object.keys(f).some(k=>!keys.includes(k))||f.consttypmod!=='-1'||f.constcollid!=='0'||f.constisnull!=='false'||f.location!=='-1')return;
 const d=f.constvalue;if(!Array.isArray(d)||d.length!==2||typeof d[0]!=='string'||!Array.isArray(d[1]))return;
 if(d[1].some(b=>typeof b!=='string'||!/^(0|[1-9][0-9]*)$/.test(b)||Number(b)>255))return;
 const bytes=d[1].map(b=>Number(b)),view=new DataView(Uint8Array.from(bytes).buffer);
 const lengths:Record<string,number>={'21':2,'23':4,'20':8},len=typeof f.consttype==='string'?lengths[f.consttype]:undefined;
 if(len!==undefined){
  if(f.constbyval!=='true'||f.constlen!==String(len)||d[0]!==String(len)||bytes.length!==8)return;
  return len===2?String(view.getInt16(0,true)):len===4?String(view.getInt32(0,true)):String(view.getBigInt64(0,true));
 }
 if(f.consttype!=='1700'||f.constlen!=='-1'||f.constbyval!=='false'||d[0]!==String(bytes.length)||bytes.length<6||bytes.length%2!==0||view.getUint32(0,true)!==bytes.length*4)return;
 const header=view.getUint16(4,true),flag=header&0xc000;if(flag===0xc000)return;
 const short=flag===0x8000,start=short?6:8;if(bytes.length<start)return;
 const negative=short?!!(header&0x2000):flag===0x4000;
 const weight=short?((header&0x3f)-(header&0x40?64:0)):view.getInt16(6,true);
 const scale=short?(header&0x1f80)>>7:header&0x3fff;
 const digits:number[]=[];for(let i=start;i<bytes.length;i+=2){const digit=view.getUint16(i,true);if(digit>9999)return;digits.push(digit);}
 if(!digits.length)return '0';if(digits[0]===0||digits.at(-1)===0)return;
 // Bound allocated text independently of the stored weight/scale.
 if(Math.abs(weight)>1000||digits.length>1000)return;
 const raw=digits.map(d=>String(d).padStart(4,'0')).join(''),point=(weight+1)*4;
 let rendered=point<=0?'0.'+'0'.repeat(-point)+raw:point>=raw.length?raw+'0'.repeat(point-raw.length):raw.slice(0,point)+'.'+raw.slice(point);
 rendered=rendered.replace(/^0+(?=[0-9])/,'').replace(/(\.[0-9]*?)0+$/,'$1').replace(/\.$/,'');
 const fraction=rendered.split('.')[1]?.length??0;if(fraction>scale)return;
 return (negative?'-':'')+rendered;
}
