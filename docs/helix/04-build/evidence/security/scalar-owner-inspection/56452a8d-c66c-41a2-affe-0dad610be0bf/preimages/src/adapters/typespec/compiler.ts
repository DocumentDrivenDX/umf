import * as jsonSchemaEmitter from '../../../node_modules/@typespec/json-schema/dist/src/index.js';
import {LIMITS} from '../../model/json';
import type {JsonObject} from '../../model/types';
import {typeSpecLibraries,typeSpecLibraryModules} from './libraries';
import {UmfError} from '../../model/types';
import {compile,createSourceFile,getSourceFileKindFromExt,getSourceLocation,type CompilerHost,type Program} from '@typespec/compiler';
import * as standardJs from '../../../node_modules/@typespec/compiler/dist/src/lib/tsp-index.js';
import * as intrinsicJs from '../../../node_modules/@typespec/compiler/dist/src/lib/intrinsic/tsp-index.js';
const trustedJs:Record<string,Record<string,any>>={'/compiler/dist/src/lib/tsp-index.js':standardJs,'/compiler/dist/src/lib/intrinsic/tsp-index.js':intrinsicJs};
import standard from '../../../spec/extensions/typespec/standard-library.json';
export async function compileTypeSpecProgram(files:Record<string,string>,entrypoint:string,libraries:Record<string,string>={},emission?:{options:JsonObject;outputs:Record<string,string>}){
 const texts=new Map(Object.entries(standard));
 const modules={...trustedJs};
 if(emission)modules['/project/node_modules/@typespec/json-schema/dist/src/index.js']=jsonSchemaEmitter;
 for(const [name,version]of Object.entries(libraries)){
  const library=Object.hasOwn(typeSpecLibraries,name)?typeSpecLibraries[name]:undefined;
  if(!library||library.version!==version)throw new UmfError('TYPESPEC_LIBRARY_UNAVAILABLE','No registered library '+name+'@'+version);
  for(const [path,text]of Object.entries(library.files))texts.set('/project/node_modules/'+name+'/'+path,text);
  for(const [path,module]of Object.entries(typeSpecLibraryModules))if(path.startsWith(name+'/'))modules['/project/node_modules/'+path]=module;
 }

 for(const [path,text]of Object.entries(files)){if(texts.has('/project/'+path))throw new UmfError('TYPESPEC_LIBRARY_COLLISION','Supplied source conflicts with registered library: '+path);texts.set('/project/'+path,text);}
 const missing=(path:string)=>Object.assign(new Error('No supplied file: '+path),{code:'ENOENT'});
 const host:CompilerHost={
  async readFile(path){const text=texts.get(path);if(text===undefined)throw missing(path);return createSourceFile(text,path);},
  async readUrl(url){throw missing(url);},
  async writeFile(path,content){
   if(!emission)throw new Error('Emission is not enabled');
   if(!path.startsWith('/output/')||path.split('/').includes('..'))throw new UmfError('TYPESPEC_OUTPUT_PATH','Emitter output escaped its memory root');
   const name=path.slice('/output/'.length);if(Object.hasOwn(emission.outputs,name))throw new UmfError('TYPESPEC_OUTPUT_COLLISION','Duplicate emitter output: '+name);
   if(content.length+Object.values(emission.outputs).reduce((n,s)=>n+s.length,0)>LIMITS.maxTextLength)throw new UmfError('LIMIT','Emitter output exceeds text limit');
   emission.outputs[name]=content;
  },
  async readDir(path){const prefix=path.replace(/\/$/,'')+'/';return [...new Set([...texts.keys()].filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length).split('/')[0]!))];},
  async rm(){throw new Error('Removal is not enabled');},async mkdirp(){return undefined;},
  async stat(path){const file=texts.has(path);const directory=[...texts.keys()].some(k=>k.startsWith(path.replace(/\/$/,'')+'/'));if(!file&&!directory&&!Object.hasOwn(modules,path))throw missing(path);return {isFile:()=>file||Object.hasOwn(modules,path),isDirectory:()=>directory};},
  async realpath(path){return path;},getExecutionRoot:()=>'/compiler',getLibDirs:()=>['/compiler/lib/std'],
  async getJsImport(path){if(Object.hasOwn(modules,path))return modules[path]!;throw missing(path);},
  getSourceFileKind:getSourceFileKindFromExt,fileURLToPath:url=>decodeURIComponent(new URL(url).pathname),pathToFileURL:path=>'file://'+path,
  logSink:{log(){}},
 };
 const program=await compile(host,'/project/'+entrypoint,emission?{noEmit:false,outputDir:'/output',emit:['@typespec/json-schema'],options:{'@typespec/json-schema':emission.options}}:{noEmit:true});
 return program;
}
export function typeSpecCompilerReport(program:Program,libraries:Record<string,string>={}){
 const diagnostics=program.diagnostics.map(d=>{const at=getSourceLocation(d.target);return {code:d.code,severity:d.severity,message:d.message,...(at?{file:at.file.path,start:at.pos,end:at.end}:{})};});
 return {compiler:'@typespec/compiler@1.16.0',libraries:{...libraries},valid:!program.hasError(),complete:false as const,diagnostics,limitations:['Compiler checks supplied TypeSpec and the pinned standard library; only explicitly selected registered libraries are available; arbitrary JavaScript and emitters are not loaded','Compiler validity does not establish cross-system projection equivalence']};
}

export async function checkTypeSpecSources(files:Record<string,string>,entrypoint:string,libraries:Record<string,string>={}){return typeSpecCompilerReport(await compileTypeSpecProgram(files,entrypoint,libraries),libraries);}
