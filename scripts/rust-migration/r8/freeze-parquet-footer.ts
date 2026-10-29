// Freeze exact TypeScript public outcomes for bounded synthetic footer captures.
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {captureParquet} from '../../../src/adapters/parquet/index';
import {decodeParquetFooter} from '../../../src/adapters/parquet/footer';

const cases:Record<string,number[]>={
 unknownWire:[31], invalidBoolean:[25,17,0], oversizedBinary:[24,127],
 oversizedLength:[24,255,255,255,255,15], unknownEmptyList:[25,15,0],
 unknownMapKey:[27,1,245], fieldIdOverflow:[5,254,255,3,0,245,0],
 truncatedDouble:[23,0], truncatedUuid:[29,0], emptyStruct:[0],
 emptyList:[25,5,0], emptyMap:[27,0,0],
 wideVarint:[21,255,255,255,255,255], zeroFooter:[],
};
const output={
 scope:'TypeScript decodeParquetFooter full enumerable envelope, source reconstructed from bytes and id; synthetic PAR1 footer captures',
 cases:Object.entries(cases).map(([id,footer])=>{
  const bytes=new Uint8Array(12+footer.length);
  bytes.set([80,65,82,49]);bytes.set(footer,4);
  new DataView(bytes.buffer).setUint32(bytes.length-8,footer.length,true);
  bytes.set([80,65,82,49],bytes.length-4);
  const source=captureParquet(bytes,{id});
  let typescript:unknown;
  try{const value=decodeParquetFooter(source);delete (value as {source?:unknown}).source;typescript={status:'returned',value};}
  catch(error){const e=error as Error&{code?:string;path?:string};typescript={status:'threw',error:{code:e.code,name:e.name,message:e.message,path:e.path}};}
  return {id,bytes:Buffer.from(bytes).toString('hex'),sha256:createHash('sha256').update(bytes).digest('hex'),typescript};
 }),
};
writeFileSync('tests/rust-core/fixtures/parquet-footer-malformed-ts-freeze.json',JSON.stringify(output,null,2)+'\n');
