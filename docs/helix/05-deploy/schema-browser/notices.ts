import {dirname,join,resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
/** Preserve license/notice texts for packages actually included in the browser bundle. */
export async function thirdPartyNotices(repo:string,inputs:string[]):Promise<string>{
 const packages=new Map<string,{path:string;data:any}>();
 for(const input of inputs){if(!input.includes('node_modules/'))continue;let path=dirname(resolve(repo,input));
  while(path!==dirname(path)){const file=Bun.file(join(path,'package.json'));if(await file.exists()){const data=await file.json();if(data.name){packages.set(data.name+'@'+data.version,{path,data});break;}}path=dirname(path);}
 }
 let text='# Bundled third party notices\n\nUMF-authored software is MIT OR Apache-2.0. The following bundled packages retain their own licenses.\n';
 for(const [id,{path,data}] of [...packages].sort(([a],[b])=>a.localeCompare(b))){text+=`\n## ${id}\n\nDeclared license: ${JSON.stringify(data.license??'not declared')}\n`;
  const files=(await readdir(path)).filter(name=>/^(licen[sc]e|copying|notice)([.-]|$)/i.test(name));
  if(!files.length){const pinned:Record<string,string>={'@bufbuild/protobuf@2.15.0':'protobuf-LICENSE','change-case@5.4.4':'change-case-LICENSE'};const name=pinned[id];if(!name)throw Error(`Missing bundled license text: ${id}`);text+='\n'+await Bun.file(join(import.meta.dir,'vendor-notices',name)).text()+'\n';}
  for(const name of files){const file=Bun.file(join(path,name));try{text+=`\n### ${name}\n\n`+await file.text()+'\n';}catch{throw Error(`Could not retain notice ${id}/${name}`);}}
 }
 const headers=new Set<string>();for(const input of inputs){if(!input.includes('node_modules/'))continue;const contents=await Bun.file(resolve(repo,input)).text();const header=contents.match(/^(?:(?:\/\/[^\n]*\n)|(?:\/\*[\s\S]*?\*\/\s*))+/)?.[0];if(header&&/copyright|license|redistribution/i.test(header))headers.add(header);}
 text+='\n## Retained bundled source notices\n\n'+[...headers].join('\n\n');
 if(!packages.size)throw Error('Bundle input list contained no dependencies.');return text;
}
