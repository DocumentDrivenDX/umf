/** Raw Snappy block decoder. Output size is validated before allocation and every copy. */
export function decodeSnappyBounded(input:Uint8Array,expected:number):Uint8Array {
 if(!(input instanceof Uint8Array)||input.length>8388608||!Number.isInteger(expected)||expected<0||expected>8388608)throw Error('Snappy resource bound exceeded');
 let at=0;const byte=()=>{if(at>=input.length)throw Error('Truncated Snappy block');return input[at++]!;};
 let declared=0,multiplier=1,ended=false;for(let i=0;i<5;i++){const b=byte();declared+=(b&127)*multiplier;if(!(b&128)){ended=true;break;}multiplier*=128;}
 if(!ended||declared>0xffffffff||declared!==expected)throw Error('Snappy length does not match bounded expected size');
 const output=new Uint8Array(expected);let written=0;
 const little=(n:number)=>{let v=0,f=1;for(let i=0;i<n;i++){v+=byte()*f;f*=256;}return v;};
 while(at<input.length){const tag=byte(),kind=tag&3;let length=tag>>>2;
  if(kind===0){length=length<60?length+1:little(length-59)+1;if(length>input.length-at||length>expected-written)throw Error('Snappy literal exceeds source or destination');output.set(input.subarray(at,at+length),written);at+=length;written+=length;}
  else{const offset=kind===1?((tag&224)<<3)+byte():little(kind===2?2:4);length=kind===1?4+((tag>>>2)&7):1+(tag>>>2);if(offset===0||offset>written||length>expected-written)throw Error('Invalid Snappy backreference');for(let i=0;i<length;i++){output[written]=output[written-offset]!;written++;}}
 }
 if(written!==expected)throw Error('Snappy output length differs from declaration');return output;
}
