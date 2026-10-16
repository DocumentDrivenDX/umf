/** Portable module identities; host cache paths are used only to read licenses. */
export interface LicenseModule {name:string;version:string;directory:string}
export function licenseModules(inventory:string):LicenseModule[]{
 const modules:LicenseModule[]=[];const seen=new Set<string>();const filenames=new Set<string>();
 for(const line of inventory.trim().split('\n')){
  const [name,version,directory,main,replaced,...extra]=line.split('|');
  if(!name||extra.length||!['true','false'].includes(main??'')||!['true','false'].includes(replaced??''))throw Error('Malformed Go module inventory');
  if(replaced==='true')throw Error('Go module replacements are outside the pinned license profile: '+name);
  if(main==='true')continue;
  if(!version||!directory)throw Error('Go module must be downloaded before reading its license: '+name);
  if(seen.has(name))throw Error('Duplicate Go module identity: '+name);seen.add(name);
  const filename=name.replaceAll('/','-')+'-LICENSE';
  if(filenames.has(filename))throw Error('Ambiguous Go module license filename: '+name);filenames.add(filename);
  modules.push({name,version,directory});
 }
 return modules.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
export function moduleNotice(modules:readonly LicenseModule[]):string{
 return 'Optional UMF Protobuf compiler. Built with Go 1.27.1.\nPinned modules:\n'+modules.map(m=>m.name+'|'+m.version).join('\n')+'\n\nSee licenses/ for license texts.';
}
