// SPDX-License-Identifier: MIT OR Apache-2.0
/** Platform-independent RFC1952 framing and RFC1951 stored blocks.
 * The wheel compresses the payload; storing blocks here avoids native compressor
 * differences in the checked-in universal generator asset.
 */
export function deterministicGzip(source:Uint8Array):Uint8Array {
 const blocks=Math.max(1,Math.ceil(source.length/65535));
 const output=new Uint8Array(10+5*blocks+source.length+8);
 output.set([0x1f,0x8b,8,0,0,0,0,0,0,255]);
 const view=new DataView(output.buffer);
 let input=0,position=10,crc=0xffffffff;
 do {
  const size=Math.min(65535,source.length-input),last=input+size===source.length;
  output[position++]=last?1:0;
  view.setUint16(position,size,true);view.setUint16(position+2,(~size)&65535,true);position+=4;
  output.set(source.subarray(input,input+size),position);position+=size;
  for(let end=input+size;input<end;input++){
   crc^=source[input]!;
   for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
 }while(input<source.length);
 view.setUint32(position,(crc^0xffffffff)>>>0,true);
 view.setUint32(position+4,source.length>>>0,true);
 return output;
}
