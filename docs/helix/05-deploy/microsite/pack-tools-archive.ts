// SPDX-License-Identifier: MIT OR Apache-2.0
import type {PackToolsResult} from '../../../../src/domain-packs/pack-tools-types';
const encoder=new TextEncoder();
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;})();
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const value of bytes)crc=crcTable[(crc^value)&255]!^(crc>>>8);return (crc^0xffffffff)>>>0;}
function put16(view:DataView,offset:number,value:number){view.setUint16(offset,value,true);}
function put32(view:DataView,offset:number,value:number){view.setUint32(offset,value>>>0,true);}
function concat(parts:Uint8Array[]){const size=parts.reduce((total,part)=>total+part.length,0);if(size>0xffffffff)throw Error('Generated archive exceeds the ZIP size limit.');const output=new Uint8Array(size);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.length;}return output;}
/** Build a portable UTF-8 ZIP using stored entries; no generated file content is changed. */
export function packToolsZip(result:PackToolsResult):Uint8Array<ArrayBuffer>{
 if(!result.files.length)throw Error('There are no generated files to archive.');if(result.files.length>0xffff)throw Error('Generated archive has too many files.');
 const locals:Uint8Array[]=[],centrals:Uint8Array[]=[];let localOffset=0;
 for(const file of result.files){const name=encoder.encode(file.path),data=encoder.encode(file.text);if(name.length>0xffff||data.length>0xffffffff||localOffset>0xffffffff)throw Error('Generated file exceeds the ZIP format limit.');const checksum=crc32(data);
  const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);put32(lv,0,0x04034b50);put16(lv,4,20);put16(lv,6,0x0800);put16(lv,8,0);put16(lv,10,0);put16(lv,12,0);put32(lv,14,checksum);put32(lv,18,data.length);put32(lv,22,data.length);put16(lv,26,name.length);put16(lv,28,0);local.set(name,30);locals.push(local,data);
  const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);put16(cv,8,0x0800);put16(cv,10,0);put16(cv,12,0);put16(cv,14,0);put32(cv,16,checksum);put32(cv,20,data.length);put32(cv,24,data.length);put16(cv,28,name.length);put16(cv,30,0);put16(cv,32,0);put16(cv,34,0);put16(cv,36,0);put32(cv,38,0);put32(cv,42,localOffset);central.set(name,46);centrals.push(central);localOffset+=local.length+data.length;
 }
 const centralDirectory=concat(centrals);if(localOffset+centralDirectory.length>0xffffffff)throw Error('Generated archive exceeds the ZIP offset limit.');const end=new Uint8Array(22),ev=new DataView(end.buffer);put32(ev,0,0x06054b50);put16(ev,4,0);put16(ev,6,0);put16(ev,8,result.files.length);put16(ev,10,result.files.length);put32(ev,12,centralDirectory.length);put32(ev,16,localOffset);put16(ev,20,0);return concat([...locals,centralDirectory,end]);
}
