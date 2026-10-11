// Public schema exports remain caller-visible; resource custody uses private
// immutable module-initialization snapshots, matching the compiled validators.
export function snapshotSchema<T>(input:T):T {const value=JSON.parse(JSON.stringify(input));const freeze=(v:any):void=>{if(v!==null&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}};freeze(value);return value;}
