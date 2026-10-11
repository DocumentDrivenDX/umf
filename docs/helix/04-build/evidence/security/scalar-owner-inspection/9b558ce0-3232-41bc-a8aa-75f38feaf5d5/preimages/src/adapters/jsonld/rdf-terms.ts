// RFC 3987 section 2.2 component grammar. Validation never normalizes an IRI.
const ucs='\\u00a0-\\ud7ff\\uf900-\\ufdcf\\ufdf0-\\uffef'+Array.from({length:13},(_,i)=>`\\u{${((i+1)*0x10000).toString(16)}}-\\u{${((i+1)*0x10000+0xfffd).toString(16)}}`).join('')+'\\u{e1000}-\\u{efffd}';
const unreserved=`A-Za-z0-9._~${ucs}\\-`,sub="!$&'()*+,;=",atom=`(?:[${unreserved}${sub}]|%[0-9A-Fa-f]{2})`;
const part=(extra:string)=>new RegExp(`^(?:${atom}|[${extra}])*$`,'u');
const path=part(':@/'),query=part(':@/?\\ue000-\\uf8ff\\u{f0000}-\\u{ffffd}\\u{100000}-\\u{10fffd}'),fragment=part(':@/?'),userinfo=part(':'),host=new RegExp(`^${atom}*$`,'u');
function ipv6(value:string):boolean {
 if(value.includes('.')){const colon=value.lastIndexOf(':'),tail=value.slice(colon+1).split('.');if(tail.length!==4||tail.some(s=>! /^(0|[1-9][0-9]{0,2})$/.test(s)||Number(s)>255))return false;value=value.slice(0,colon+1)+'0:0';}
 const halves=value.split('::');if(halves.length>2)return false;
 const groups=halves.flatMap(h=>h?h.split(':'):[]);return groups.every(g=>/^[0-9a-f]{1,4}$/i.test(g))&&(halves.length===2?groups.length<8:groups.length===8);
}
export function wellFormedIri(value:string):boolean {
 if(/[\u0000-\u0020\u007f]/.test(value))return false;
 const match=/^[A-Za-z][A-Za-z0-9+.-]*:([\s\S]*)$/.exec(value);if(!match)return false;let rest=match[1]!;
 const hash=rest.indexOf('#');if(hash>=0){if(!fragment.test(rest.slice(hash+1)))return false;rest=rest.slice(0,hash);}
 const question=rest.indexOf('?');if(question>=0){if(!query.test(rest.slice(question+1)))return false;rest=rest.slice(0,question);}
 if(rest.startsWith('//')){
  const slash=rest.indexOf('/',2);let authority=slash<0?rest.slice(2):rest.slice(2,slash);rest=slash<0?'':rest.slice(slash);
  const at=authority.lastIndexOf('@');if(at>=0){if(!userinfo.test(authority.slice(0,at)))return false;authority=authority.slice(at+1);}
  if(authority.startsWith('[')){const close=authority.indexOf(']');if(close<0)return false;const address=authority.slice(1,close),port=authority.slice(close+1);if(port&&!/^:[0-9]*$/.test(port))return false;if(!ipv6(address)&&!/^v[0-9a-f]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/i.test(address))return false;}
  else{const colon=authority.lastIndexOf(':');if(colon>=0){if(!/^[0-9]*$/.test(authority.slice(colon+1)))return false;authority=authority.slice(0,colon);}if(!host.test(authority))return false;}
 }
 return path.test(rest);
}
const grandfathered=new Set('en-gb-oed i-ami i-bnn i-default i-enochian i-hak i-klingon i-lux i-mingo i-navajo i-pwn i-tao i-tay i-tsu sgn-be-fr sgn-be-nl sgn-ch-de art-lojban cel-gaulish no-bok no-nyn zh-guoyu zh-hakka zh-min zh-min-nan zh-xiang'.split(' '));
export function wellFormedLanguage(value:string):boolean {
 if(/[^A-Za-z0-9-]/.test(value))return false;
 const tag=value.toLowerCase();if(grandfathered.has(tag)||/^x(?:-[a-z0-9]{1,8})+$/.test(tag))return true;
 const match=/^(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?((?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*)((?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*)(?:-x(?:-[a-z0-9]{1,8})+)?$/.exec(tag);if(!match)return false;
 const variants=match[1]!.split('-').filter(Boolean),singletons=match[2]!.split('-').filter(s=>s.length===1);return new Set(variants).size===variants.length&&new Set(singletons).size===singletons.length;
}
