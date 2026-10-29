// SPDX-License-Identifier: MIT OR Apache-2.0
import {assertExactJsonNumber} from './json-number';
import {UmfError} from '../errors';
/** Original action-frame scanner, shared with explicitly scoped catalog reads. */
export function scanJsonFrame(text:string,maxNodes:number,maxDepth:number,onString:(value:string)=>void=()=>{}):void {
 scanJsonFrameInternal(text,maxNodes,maxDepth,onString);
}
/** R2 scanner reserves node, decoded-string and key-retention work before allocation. */
export function scanJsonFrameCharged(text:string,maxNodes:number,maxDepth:number,onNode:()=>void,beforeString:(decodedBytes:number,isKey:boolean)=>void,onStringCharged:(value:string,isKey:boolean,decodedBytes:number)=>void):void{
 scanJsonFrameInternal(text,maxNodes,maxDepth,()=>{},{onNode,beforeString,onString:onStringCharged});
}
function decodedUtf8Bytes(text:string,start:number,end:number):number{
 const hex4=(offset:number):number=>{let value=0;for(let n=0;n<4;n++){const code=text.charCodeAt(offset+n);const digit=code>=48&&code<=57?code-48:code>=65&&code<=70?code-55:code>=97&&code<=102?code-87:-1;if(digit<0)return -1;value=value*16+digit;}return value;};
 let bytes=0;for(let i=start+1;i<end-1;i++){
  const code=text.charCodeAt(i);
  if(code===0x5c){const escape=text[i+1];if(escape==='u'){
    const first=hex4(i+2);i+=5;
    if(first>=0xd800&&first<=0xdbff&&text[i+1]==='\\'&&text[i+2]==='u'){
     const second=hex4(i+3);if(second>=0xdc00&&second<=0xdfff){bytes+=4;i+=6;continue;}
    }
    // A valid non-surrogate \u escape decodes to one BMP scalar; account its
    // exact UTF-8 width without creating a substring or decoded string.
    // JSON.parse still rejects malformed escapes after this reservation.
    bytes+=first>=0&&first<0x80?1:first>=0&&first<0x800?2:3;continue;
   }
   bytes+=1;i++;continue;
  }
  if(code<0x80)bytes++;else if(code<0x800)bytes+=2;else if(code>=0xd800&&code<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}else bytes+=3;
 }
 return bytes;
}
function scanJsonFrameInternal(text:string,maxNodes:number,maxDepth:number,onString:(value:string)=>void,hooks?:{onNode:()=>void;beforeString:(decodedBytes:number,isKey:boolean)=>void;onString:(value:string,isKey:boolean,decodedBytes:number)=>void}):void{
 const fail=(code:string,message:string):never=>{throw new UmfError(code,message);};

 let at=0,nodes=0;const atom=/(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/y;const ws=()=>{while(/[\t\n\r ]/.test(text[at]??'x'))at++;};
 const string=(isKey=false):string=>{const start=at++;while(at<text.length){const c=text[at++]!;if(c==='"'){const decodedBytes=decodedUtf8Bytes(text,start,at);hooks?.beforeString(decodedBytes,isKey);let value:string;try{value=JSON.parse(text.slice(start,at));}catch{return fail('SYNTAX','Invalid JSON string');}hooks?.onString(value,isKey,decodedBytes);onString(value);return value;}if(c==='\\')at++;}return fail('SYNTAX','Unterminated JSON string');};
 const visit=(depth:number):void=>{if(depth>maxDepth||++nodes>maxNodes)fail('LIMIT','JSON depth/node bound exceeded');hooks?.onNode();ws();const c=text[at];if(c==='"'){string();return;}if(c==='{'||c==='['){const object=c==='{',end=object?'}':']',keys=new Set<string>();at++;ws();if(text[at]===end){at++;return;}while(at<text.length){if(object){ws();if(text[at]!=='"')fail('SYNTAX','Expected JSON member');const key=string(true);if(keys.has(key))fail('SYNTAX','Duplicate JSON member');keys.add(key);ws();if(text[at++]!==':')fail('SYNTAX','Expected colon');}visit(depth+1);ws();if(text[at]===end){at++;return;}if(text[at++]!==',')fail('SYNTAX','Expected comma');}fail('SYNTAX','Unterminated JSON collection');}
  atom.lastIndex=at;const m=atom.exec(text);if(!m)fail('SYNTAX','Invalid JSON value');if(/^[0-9-]/.test(m![0])){try{assertExactJsonNumber(m![0]);}catch{fail('SYNTAX','Noninteroperable JSON number');}}at=atom.lastIndex;
 };visit(0);ws();if(at!==text.length)fail('SYNTAX','Trailing JSON');

}
