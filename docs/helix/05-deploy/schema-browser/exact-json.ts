import {LIMITS} from '../../../../src/model/json';
import type {NativeJson} from '../../../../src/model/native-json';
/** Exact JSON token parser, including duplicate-key refusal and bounded nesting. */
export function exactJson(text:string):NativeJson {
 if(text.length>LIMITS.maxTextLength)throw Error('Native JSON exceeds text limit');let i=0,count=0;const space=()=>{while(/[\x20\t\r\n]/.test(text[i]??'!'))i++;};
 const string=()=>{const start=i++;while(i<text.length){const c=text[i++];if(c==='"')return JSON.parse(text.slice(start,i)) as string;if(c==='\\')i++;}throw Error('Unterminated JSON string');};
 const value=(depth:number):NativeJson=>{space();if(depth>LIMITS.maxDepth||++count>LIMITS.maxValues)throw Error('Native JSON structural limit exceeded');const c=text[i];
 if(c==='"')return {kind:'string',value:string()};if(c==='{'){i++;space();const members:Record<string,NativeJson>=Object.create(null);if(text[i]==='}'){i++;return {kind:'object',members};}while(true){space();if(text[i]!=='"')throw Error('Expected JSON key');const key=string();if(Object.hasOwn(members,key))throw Error('Duplicate JSON key');space();if(text[i++]!==':')throw Error('Expected colon');members[key]=value(depth+1);space();const end=text[i++];if(end==='}')break;if(end!==',')throw Error('Expected comma');}return {kind:'object',members};}
 if(c==='['){i++;space();const items:NativeJson[]=[];if(text[i]===']'){i++;return {kind:'array',items};}while(true){items.push(value(depth+1));space();const end=text[i++];if(end===']')break;if(end!==',')throw Error('Expected comma');}return {kind:'array',items};}
 for(const [token,result] of [['true',{kind:'boolean',value:true}],['false',{kind:'boolean',value:false}],['null',{kind:'null'}]] as const)if(text.slice(i,i+token.length)===token){i+=token.length;return result;}
 const number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));if(number){i+=number[0].length;return {kind:'number',value:number[0]};}throw Error('Invalid JSON value');};
 JSON.parse(text);const result=value(0);space();if(i!==text.length)throw Error('Trailing JSON content');return result;
}
/** Core JSON admission mirrors serialization's interoperable number profile. */
export function exactJsonValue(text:string):import('../../../../src/model/types').Json {
 const decimal=(token:string)=>{const m=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(token)!;const digits=((m[2]||'')+(m[3]||'')).replace(/^0+/,'');if(!digits)return '0';const trimmed=digits.replace(/0+$/,'');return `${m[1]==='-'?'-':''}${trimmed}e${BigInt(m[4]||'0')-BigInt((m[3]||'').length)+BigInt(digits.length-trimmed.length)}`;};
 const convert=(n:NativeJson):any=>{switch(n.kind){case 'null':return null;case 'boolean':case 'string':return n.value;case 'number':{const v=Number(n.value);if(!Number.isFinite(v)||Object.is(v,-0)||Number.isInteger(v)&&!Number.isSafeInteger(v)||decimal(n.value)!==decimal(String(v)))throw Error('Number outside the exact interoperable profile');return v;}case 'array':return n.items.map(convert);case 'object':{const o=Object.create(null);for(const [k,v] of Object.entries(n.members))o[k]=convert(v);return o;}}};return convert(exactJson(text));
}
