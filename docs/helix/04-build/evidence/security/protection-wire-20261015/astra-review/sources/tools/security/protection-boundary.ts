/** Conservative source guard; not JavaScript noninterference or a browser proof. */
import {posix} from 'node:path';

export function protectionBoundary(source:string,file='src/extensions/security/protection/source.ts'):string[] {
 const result:string[]=[];
 const dependency=(value:string)=>{
  if(!value.startsWith('.')) {result.push('host-or-package-import:'+value);return;}
  const resolved=posix.normalize(posix.join(posix.dirname(file),value));
  if(!resolved.startsWith('src/')&&!resolved.startsWith('spec/'))result.push('non-library-import:'+value);
 };
 try {for(const entry of new Bun.Transpiler({loader:'ts'}).scanImports(source))dependency(entry.path);}
 catch {result.push('unparsed-source');}
 // Intentionally conservative even in comments/strings. New semantic modules
 // use no ambient host or dynamic-code API; reflection still needs review.
 for(const name of ['Bun','process','Buffer','Deno','require','__dirname','__filename','eval','Function','globalThis']){
  if(new RegExp('\\b'+name+'\\b').test(source))result.push('host-or-dynamic-code-name:'+name);
 }
 if(/\bimport\s*\(\s*[^'"\s]/.test(source))result.push('dynamic-import');
 return [...new Set(result)];
}
