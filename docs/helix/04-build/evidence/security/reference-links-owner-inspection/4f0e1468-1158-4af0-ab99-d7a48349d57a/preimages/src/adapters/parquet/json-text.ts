/** Bounded syntax-only JSON validation. Keeps duplicate keys and exact text uninterpreted. */
export function checkParquetJsonText(text:string):void {
 if(text.length>4000000)throw Error('JSON text budget exceeded');let at=0,values=0;
 const fail=():never=>{throw Error('Invalid JSON text or syntax budget exceeded');};
 const whitespace=()=>{while(at<text.length&&[32,9,10,13].includes(text.charCodeAt(at)))at++;};
 function string(){if(text[at++]!=='"')fail();while(at<text.length){const c=text.charCodeAt(at++);if(c===34)return;if(c<32)fail();if(c===92){const escape=text[at++];if(escape==='u'){if(!/^[0-9a-fA-F]{4}$/.test(text.slice(at,at+4)))fail();at+=4;}else if(!escape||!'"\\/bfnrt'.includes(escape))fail();}}fail();}
 const number=/-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
 function value(depth:number){if(depth>128||++values>100000)fail();whitespace();const c=text[at];
  if(c==='"')string();
  else if(c==='['||c==='{'){const object=c==='{',end=object?'}':']';at++;whitespace();if(text[at]===end){at++;return;}while(true){if(object){whitespace();string();whitespace();if(text[at++]!==':')fail();}value(depth+1);whitespace();if(text[at]===end){at++;return;}if(text[at++]!==',')fail();}}
  else{for(const literal of ['null','true','false'])if(text.startsWith(literal,at)){at+=literal.length;return;}number.lastIndex=at;const matched=number.exec(text);if(!matched)fail();at=number.lastIndex;}
 }
 value(0);whitespace();if(at!==text.length)fail();
}
