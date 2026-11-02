// SPDX-License-Identifier: MIT OR Apache-2.0
/** Native geometry and data-id correspondence stay unchanged when multiple
 * responsive SVG variants share one HTML document. */
export function namespaceSvg(svg:string,prefix:string){
 const ids=new Map([...svg.matchAll(/\sid="([^"\s]+)"/g)].map(match=>[match[1]!,prefix+match[1]!]));
 const reference=(id:string)=>{const value=ids.get(id);if(!value)throw Error('Unresolved diagram fragment '+id);return value;};
 const urls=(value:string)=>value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,(_match,quote:string,id:string)=>`url(${quote}#${reference(id)}${quote})`);
 return svg.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/g,(block,css:string)=>block.replace(css,urls(css)))
  .replace(/<[^>]+>/g,tag=>urls(tag)
   .replace(/\sid="([^"\s]+)"/g,(_match,id:string)=>` id="${reference(id)}"`)
   .replace(/(\s(?:xlink:)?href=")#([^"\s]+)(")/g,(_match,start:string,id:string,end:string)=>start+'#'+reference(id)+end)
   .replace(/(\saria-(?:labelledby|describedby)=")([^"]+)(")/g,(_match,start:string,value:string,end:string)=>start+value.split(/\s+/).map(reference).join(' ')+end));
}
