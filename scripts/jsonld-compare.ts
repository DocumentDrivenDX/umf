import {parseNativeJson,type NativeJson} from '../src/model/native-json';
function decimal(s:string){const [mantissa,e='0']=s.toLowerCase().split('e'),negative=mantissa!.startsWith('-'),[whole,fraction='']=mantissa!.replace('-','').split('.');let digits=(whole!+fraction).replace(/^0+/,''),exponent=BigInt(e)-BigInt(fraction.length);while(digits.endsWith('0')){digits=digits.slice(0,-1);exponent++;}return digits?[negative,digits,exponent.toString()]:[negative,'0','0'];}
function canonical(n:NativeJson,key='',literal=false):unknown {
 if(n.kind==='number')return ['number',decimal(n.value)];if(n.kind==='null')return ['null'];if(n.kind==='boolean')return ['boolean',n.value];if(n.kind==='string')return ['string',!literal&&key==='@language'?n.value.toLowerCase():n.value];
 if(n.kind==='array'){const values=n.items.map(v=>canonical(v,'',literal));return ['array',literal||key==='@list'?values:values.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];}
 return ['object',Object.keys(n.members).sort().map(k=>[k,canonical(n.members[k]!,k,literal||(k==='@value'&&n.members['@type']?.kind==='string'&&n.members['@type'].value==='@json'))])];
}
/** JSON-LD unordered arrays, ordered lists/JSON literals, exact decimal values and scoped language equality. */
export function equalJsonLdText(a:string,b:string){return JSON.stringify(canonical(parseNativeJson(a)))===JSON.stringify(canonical(parseNativeJson(b)));}

/** Strict compact JSON comparison: aliases cannot hide ordered lists or opaque JSON arrays. */
export function equalCompactJsonLdText(a:string,b:string){return JSON.stringify(canonical(parseNativeJson(a),'',true))===JSON.stringify(canonical(parseNativeJson(b),'',true));}
