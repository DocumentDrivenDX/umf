const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const canonical=value=>JSON.stringify(stable(value));
const withoutTimings=value=>Array.isArray(value)?value.map(withoutTimings):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['defaultElapsedMs','elapsedMs'].includes(key)).map(([key,item])=>[key,withoutTimings(item)])):value;
export function assertRuntimeParity(left,right){if(canonical(withoutTimings(left))!==canonical(withoutTimings(right)))throw Error('runtime semantic/shape evidence differs');}
export function assertControlParity(id,left,right,leftTrace,rightTrace,expectedCode,expectedPath,expectedTrace){if(canonical(left)!==canonical(right)||canonical(leftTrace)!==canonical(rightTrace)||canonical(leftTrace)!==canonical(expectedTrace)||left?.error?.code!==expectedCode||left?.error?.path!==expectedPath)throw Error(`${id} host error/order mismatch: outcome=${canonical(left)} trace=${canonical(leftTrace)} expected=${expectedCode}:${expectedPath}/${canonical(expectedTrace)}`);}
export function browserMime(path){if(path==='/'||path.endsWith('.html'))return'text/html; charset=utf-8';if(path.endsWith('.js')||path.endsWith('.mjs'))return'application/javascript; charset=utf-8';if(path.endsWith('.json'))return'application/json; charset=utf-8';if(path.endsWith('.wasm'))return'application/wasm';return'application/octet-stream';}
export function isSameOriginRequest(url,origin){try{return new URL(url).origin===origin;}catch{return false;}}

export const browserLaunchOptions=Object.freeze({headless:true});
export const browserBudgetMs=600_000;
