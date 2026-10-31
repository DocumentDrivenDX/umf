import {expect,test} from 'bun:test';
import {createPythonClientRustGeneratorV3} from '../src/access/rust-runtime';
import {createPythonClientHostReadV3,PYTHON_CLIENT_HOST_ABORT_V3,PYTHON_CLIENT_HOST_READ_V3_PROFILE,type PythonClientHostReadEventV3} from '../src/access/rust-host-reads-v3';
import {UmfError} from '../src/model/errors';

const source=await Bun.file(new URL('./unified/commerce.json',import.meta.url)).text();
const result={sourceDigest:'0'.repeat(64),description:{},files:[]};

function drive(read:(event:PythonClientHostReadEventV3,argument?:string)=>unknown,native=false){
 const events:string[]=[];
 const call=(event:PythonClientHostReadEventV3,argument?:string)=>{events.push(argument===undefined?event:`${event}:${argument}`);return read(event,argument);};
 const invalid=call('InitialPackage');
 if(invalid)throw new UmfError('ACCESS_UNSUPPORTED','Ordinary non-shadowing Python package required','/package');
 const text=call('ParseText');
 const format=call('ParseFormat');
 call('DigestText');
 call('SelectRecords');
 if(native&&!call('NativeFormat'))throw new UmfError('ACCESS_UNSUPPORTED','Native operation clients currently require original JSON source','/format');
 call('SelectActions');
 const paths=[];
 for(const suffix of ['/__init__.py','/models.py','/_runtime.py',...(native?['/_table_runtime.py']:[]),'/source.json'])paths.push(call('OutputPackageSuffix',suffix));
 const outputSourceText=call('OutputSourceText');
 for(const suffix of ['/description.json','/py.typed','/_umf/manifest.json'])paths.push(call('OutputPackageSuffix',suffix));
 return {events,text,format,paths,outputSourceText};
}

test('V3 host callback is a closed versioned set and preserves legacy host expressions',()=>{
 expect(PYTHON_CLIENT_HOST_READ_V3_PROFILE).toBe('umf.python-client-host-read/3');
 const trace:string[]=[];
 const request=new Proxy({
  text:source,
  package:'shop',
  format:'json' as const,
  records:[{module:'commerce',element:'Customer'}],
  actions:[{module:'commerce',action:'shipOrder'}],
 },{get(target,key,receiver){trace.push(String(key));return Reflect.get(target,key,receiver);}});
 const read=createPythonClientHostReadV3(request as any).read;
 expect(read('InitialPackage')).toBe(false);
 expect(trace).toEqual(['text','package','package','package','package']);
 expect(read('ParseText')).toBe(source);
 expect(read('ParseFormat')).toBe('json');
 expect(read('DigestText')).toBe(source);
 expect(read('SelectRecords')).toEqual(['commerce.Customer']);
 expect(read('NativeFormat')).toBe(true);
 expect(read('SelectActions')).toEqual(['commerce.shipOrder']);
 expect(read('OutputPackageSuffix','/_table_runtime.py')).toBe('shop/_table_runtime.py');
 expect(read('OutputSourceText')).toBe(source);
 expect(trace).toEqual([
  'text','package','package','package','package',
  'text','format','text','records','records','format','actions','actions','package','text',
 ]);
 const invalidEvent=createPythonClientHostReadV3(request as any);
 expect((invalidEvent.read as any)('UnregisteredEvent')).toBe(PYTHON_CLIENT_HOST_ABORT_V3);
 expect(()=>invalidEvent.rethrowIfAborted()).toThrow('Unknown V3 host-read event');
 expect(createPythonClientHostReadV3({text:source,package:'shop',format:null} as any).read('ParseFormat')).toBe('json');
 expect(createPythonClientHostReadV3({text:source,package:'write_outcomes_unknown'} as any).read('InitialPackage')).toBe(false);
 expect(createPythonClientHostReadV3({text:source,package:'uuid'} as any).read('InitialPackage')).toBe(true);
});

test('V3 mock engine requests ordinary and conditional native output reads in source order',()=>{
 const observations:string[][]=[];
 const generator=createPythonClientRustGeneratorV3({generatePythonClientWithHost(read){
  const observed=drive(read,true);
  observations.push(observed.events);
  return result;
 }});
 const packageReads:number[]=[];
 const request={text:source,get package(){packageReads.push(packageReads.length+1);return packageReads.length<=4?'shop':`package_${packageReads.length}`;}};
 expect(generator(request)).toBe(result);
 expect(observations).toEqual([[
  'InitialPackage','ParseText','ParseFormat','DigestText','SelectRecords','NativeFormat','SelectActions',
  'OutputPackageSuffix:/__init__.py','OutputPackageSuffix:/models.py','OutputPackageSuffix:/_runtime.py','OutputPackageSuffix:/_table_runtime.py','OutputPackageSuffix:/source.json','OutputSourceText',
  'OutputPackageSuffix:/description.json','OutputPackageSuffix:/py.typed','OutputPackageSuffix:/_umf/manifest.json',
 ]]);
 expect(packageReads).toHaveLength(12);
 const secondReadStart=packageReads.length;
 expect(drive(createPythonClientHostReadV3(request).read,true).paths).toEqual([
  `package_${secondReadStart+5}/__init__.py`,`package_${secondReadStart+6}/models.py`,`package_${secondReadStart+7}/_runtime.py`,`package_${secondReadStart+8}/_table_runtime.py`,
  `package_${secondReadStart+9}/source.json`,`package_${secondReadStart+10}/description.json`,`package_${secondReadStart+11}/py.typed`,`package_${secondReadStart+12}/_umf/manifest.json`,
 ]);
});

test('V3 callback preserves exact thrown value and scopes reentrant request state per invocation',()=>{
 const nestedFailure={name:'host sentinel toString failed'};
 const sentinel={toString(){throw nestedFailure;}};
 let reads=0;
 const request={package:'shop',get text(){if(++reads===1)return source;throw sentinel;}};
 const generator=createPythonClientRustGeneratorV3({generatePythonClientWithHost(read){
  const initial=read('InitialPackage');
  if(initial===PYTHON_CLIENT_HOST_ABORT_V3)return initial;
  return read('ParseText');
 }});
 let thrown:unknown;
 try{generator(request);}catch(error){thrown=error;}
 expect(thrown).toBe(sentinel);
 let stringifyFailure:unknown;
 try{String(sentinel);}catch(error){stringifyFailure=error;}
 expect(stringifyFailure).toBe(nestedFailure);
 expect(reads).toBe(2);

 const recordSentinel={toString(){throw nestedFailure;}};
 let recordGetterReads=0,actionReads=0;
 const recordRequest={text:source,package:'shop',get records(){if(++recordGetterReads===1)return [];throw recordSentinel;},get actions(){actionReads++;return [];}};
 const recordFailureGenerator=createPythonClientRustGeneratorV3({generatePythonClientWithHost(read){
  for(const event of ['InitialPackage','ParseText','ParseFormat','DigestText'] as const){
   const value=read(event);
   if(value===PYTHON_CLIENT_HOST_ABORT_V3)return value;
  }
  return read('SelectRecords');
 }});
 let recordThrown:unknown;
 try{recordFailureGenerator(recordRequest as any);}catch(error){recordThrown=error;}
 expect(recordThrown).toBe(recordSentinel);
 expect(recordGetterReads).toBe(2);
 expect(actionReads).toBe(0);

 const nestedSource='nested source';
 const seen:{request:string;path:string}[]=[];
 let nested:()=>unknown=()=>undefined;
 const reentrant=createPythonClientRustGeneratorV3({generatePythonClientWithHost(read){
  const text=String(read('ParseText'));
  const path=String(read('OutputPackageSuffix','/__init__.py'));
  seen.push({request:text,path});
  if(text===source)nested();
  return result;
 }});
 nested=()=>reentrant({text:nestedSource,package:'nested'});
 reentrant({text:source,package:'outer'});
 expect(seen).toEqual([{request:source,path:'outer/__init__.py'},{request:nestedSource,path:'nested/__init__.py'}]);
});

test('V3 initial refusal short-circuits before later properties',()=>{
 const trace:string[]=[];
 const request={text:source,package:'bad-name',get records(){trace.push('records');throw new Error('must remain untouched');}};
 const read=createPythonClientHostReadV3(request as any).read;
 expect(read('InitialPackage')).toBe(true);
 expect(trace).toEqual([]);
});
