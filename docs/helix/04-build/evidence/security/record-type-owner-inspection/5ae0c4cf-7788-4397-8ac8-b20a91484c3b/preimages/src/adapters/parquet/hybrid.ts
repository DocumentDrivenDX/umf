export interface ParquetHybridValues {values:number[];consumedBytes:number;padding:number[]}
/** Raw hybrid run stream; caller strips any length/bit-width prefixes first. */
export function decodeParquetHybrid(input:Uint8Array,width:number,count:number,maxValue=2**width-1):ParquetHybridValues {
 if(!(input instanceof Uint8Array)||input.length>8388608||!Number.isInteger(width)||width<0||width>32||!Number.isInteger(count)||count<0||count>100000||!Number.isInteger(maxValue)||maxValue<0||maxValue>2**width-1)throw Error('Hybrid decoder bounds exceeded');
 const values:number[]=[],padding:number[]=[];let at=0;
 const byte=()=>{if(at>=input.length)throw Error('Truncated hybrid stream');return input[at++]!;};
 const header=()=>{let n=0,f=1;for(let i=0;i<5;i++){const b=byte();n+=(b&127)*f;if(!(b&128)){if(n>0xffffffff)throw Error('Hybrid header exceeds uint32');return n;}f*=128;}throw Error('Hybrid header exceeds uint32');};
 while(values.length<count){const h=header(),packed=h%2===1,run=Math.floor(h/2)*(packed?8:1);if(run===0||run>2147483647)throw Error('Invalid hybrid run length');
  const remaining=count-values.length;
  if(!packed){if(run>remaining)throw Error('RLE run exceeds requested count');let v=0,f=1;for(let i=0;i<Math.ceil(width/8);i++){v+=byte()*f;f*=256;}if(v>maxValue)throw Error('RLE value exceeds allowed range');for(let i=0;i<run;i++)values.push(v);}
  else{if(run>remaining+7)throw Error('Bit-packed run exceeds requested count and final padding');const length=run*width/8;if(length>input.length-at)throw Error('Truncated bit-packed run');const start=at;at+=length;for(let i=0;i<run;i++){let v=0,f=1;for(let bit=0;bit<width;bit++){const pos=i*width+bit;v+=((input[start+Math.floor(pos/8)]!>>>(pos%8))&1)*f;f*=2;}if(i<remaining){if(v>maxValue)throw Error('Bit-packed value exceeds allowed range');values.push(v);}else padding.push(v);}}
 }
 if(at!==input.length)throw Error('Trailing hybrid stream bytes');return {values,consumedBytes:at,padding};
}
