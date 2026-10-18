import {assertExactJsonNumber} from './json-number';
import {UmfError} from '../errors';
/** Original action-frame scanner, shared with explicitly scoped catalog reads. */
export function scanJsonFrame(text:string,maxNodes:number,maxDepth:number,onString:(value:string)=>void=()=>{}):void {
 const fail=(code:string,message:string):never=>{throw new UmfError(code,message);};

 let at=0,nodes=0;const ws=()=>{while(/[\t\n\r ]/.test(text[at]??'x'))at++;};
 const string=():string=>{const start=at++;while(at<text.length){const c=text[at++]!;if(c==='"'){let value:string;try{value=JSON.parse(text.slice(start,at));}catch{return fail('SYNTAX','Invalid JSON string');}onString(value);return value;}if(c==='\\')at++;}return fail('SYNTAX','Unterminated JSON string');};
 const visit=(depth:number):void=>{if(depth>maxDepth||++nodes>maxNodes)fail('LIMIT','JSON depth/node bound exceeded');ws();const c=text[at];if(c==='"'){string();return;}if(c==='{'||c==='['){const object=c==='{',end=object?'}':']',keys=new Set<string>();at++;ws();if(text[at]===end){at++;return;}while(at<text.length){if(object){ws();if(text[at]!=='"')fail('SYNTAX','Expected JSON member');const key=string();if(keys.has(key))fail('SYNTAX','Duplicate JSON member');keys.add(key);ws();if(text[at++]!==':')fail('SYNTAX','Expected colon');}visit(depth+1);ws();if(text[at]===end){at++;return;}if(text[at++]!==',')fail('SYNTAX','Expected comma');}fail('SYNTAX','Unterminated JSON collection');}
  const m=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at));if(!m)fail('SYNTAX','Invalid JSON value');if(/^[0-9-]/.test(m![0])){try{assertExactJsonNumber(m![0]);}catch{fail('SYNTAX','Noninteroperable JSON number');}}at+=m![0].length;
 };visit(0);ws();if(at!==text.length)fail('SYNTAX','Trailing JSON');

}
