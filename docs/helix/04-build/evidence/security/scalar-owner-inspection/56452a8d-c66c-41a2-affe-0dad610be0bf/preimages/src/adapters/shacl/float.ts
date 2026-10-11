import {UmfError} from '../../model/types';
const trim=(s:string)=>s.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g,'');
const grammar=/^([+-]?)([0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE]([+-]?[0-9]+))?$(?![\s\S])/;
function rational(bits:number):[bigint,bigint]{
 const exp=(bits>>>23)&255,m=BigInt((bits&0x7fffff)+(exp?0x800000:0)),shift=exp?exp-150:-149;
 return shift>=0?[m<<BigInt(shift),1n]:[m,1n<<BigInt(-shift)];
}
const fromBits=(bits:number)=>{const view=new DataView(new ArrayBuffer(4));view.setUint32(0,bits);return view.getFloat32(0);};
/** Direct decimal -> binary32 rounding; avoids decimal -> binary64 -> binary32 double rounding. */
export function parseShaclFloat(source:string,width:32|64):{value:number}|null{
 const text=trim(source);if(['INF','+INF','-INF','NaN'].includes(text))return {value:text==='NaN'?NaN:text==='-INF'?-Infinity:Infinity};
 const match=grammar.exec(text);if(!match)return null;
 if(width===64)return {value:Number(text)};
 const sign=match[1]==='-'?-1:1,[whole,frac='']=match[2]!.split('.'),digits=(whole!+frac).replace(/^0+/,'');if(!digits)return {value:sign*0};
 const exponentText=match[3]??'0',exponentDigits=exponentText.replace(/^[+-]/,'').replace(/^0+/,'');
 // Source text is limited to 4M chars by the RDF codec. Exponents with >8 significant
 // digits dominate every possible decimal point position without allocating huge powers.
 if(exponentDigits.length>8)return {value:sign*(exponentText.startsWith('-')?0:Infinity)};
 const exponent=Number(exponentText)-frac.length,magnitude=digits.length+exponent;
 if(magnitude>50)return {value:sign*Infinity};if(magnitude< -60)return {value:sign*0};
 const significant=digits.replace(/0+$/,''),scale=exponent+digits.length-significant.length;
 if(significant.length>10000||Math.abs(scale)>10000)throw new UmfError('SHACL_FLOAT_LIMIT','Direct binary32 conversion exceeds 10,000 significant digits or decimal scale');
 let n=BigInt(significant),d=1n;if(scale>=0)n*=10n**BigInt(scale);else d=10n**BigInt(-scale);
 const max=0x7f7fffff,[maxN,maxD]=rational(max);
 if(n*maxD>maxN*d){const threshold=((1n<<25n)-1n)<<103n;return {value:sign*(n>=threshold*d?Infinity:fromBits(max))};}
 let lo=0,hi=max;while(lo<hi){const mid=Math.floor((lo+hi+1)/2),[mn,md]=rational(mid);if(mn*d<=n*md)lo=mid;else hi=mid-1;}
 const [ln,ld]=rational(lo);if(ln*d===n*ld)return {value:sign*fromBits(lo)};
 const [un,ud]=rational(lo+1),difference=2n*n*ld*ud-d*(ln*ud+un*ld),up=difference>0n||(difference===0n&&(lo&1)===1);
 return {value:sign*fromBits(lo+(up?1:0))};
}
