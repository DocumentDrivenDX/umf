import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {captureParquet} from '../../src/adapters/parquet/index.ts';
import {appendParquetKeyValueMetadata} from '../../src/adapters/parquet/transform.ts';
import {renameParquetField} from '../../src/adapters/parquet/rename.ts';
import {encodeParquetWire} from '../../src/adapters/parquet/encode.ts';

const root=resolve(import.meta.dirname,'../..');
const bytes=new Uint8Array(readFileSync(resolve(root,'fixtures/parquet/logical/string.parquet')));
const source=captureParquet(bytes,{id:'parquet-host-matrix'});
const outcomes:any[]=[];
function outcome(label:string,run:()=>unknown){
 try{
  const value=run();
  const result=value instanceof Uint8Array?{hex:Array.from(value,b=>b.toString(16).padStart(2,'0')).join('')}:value&&typeof value==='object'?{status:(value as any).status,diagnostic:(value as any).diagnostics?.at(-1)}:value;
  outcomes.push({label,result,prototypes:value&&typeof value==='object'?{result:Object.getPrototypeOf(value)===Object.prototype,source:Object.hasOwn(value,'source')?Object.getPrototypeOf((value as any).source)===null:null}:null});
 }catch(error:any){outcomes.push({label,error:{name:error?.name??null,code:error?.code??null,path:error?.path??'',message:error?.message??String(error)}});}
}

outcome('append-undefined',()=>appendParquetKeyValueMetadata(source,undefined as any));
outcome('append-nested-undefined',()=>appendParquetKeyValueMetadata(source,[{key:'custom',value:undefined}] as any));
outcome('append-symbol',()=>appendParquetKeyValueMetadata(source,Symbol('entries') as any));
outcome('append-function',()=>appendParquetKeyValueMetadata(source,(()=>{}) as any));
const cyclic:any[]=[];cyclic.push(cyclic);
outcome('append-cycle',()=>appendParquetKeyValueMetadata(source,cyclic as any));
const accessor:any[]=[];Object.defineProperty(accessor,'0',{enumerable:true,get(){return undefined;}});accessor.length=1;
outcome('append-accessor',()=>appendParquetKeyValueMetadata(source,accessor as any));
outcome('rename-undefined-name',()=>renameParquetField(source,1,undefined as any));
outcome('rename-symbol-name',()=>renameParquetField(source,1,Symbol('name') as any));
outcome('rename-function-name',()=>renameParquetField(source,1,(()=>{}) as any));
outcome('encode-binary-undefined-hex',()=>encodeParquetWire({kind:'binary',hex:undefined} as any));
outcome('encode-uuid-undefined-hex',()=>encodeParquetWire({kind:'uuid',hex:undefined} as any));
outcome('encode-binary-symbol-hex',()=>encodeParquetWire({kind:'binary',hex:Symbol('bad')} as any));
outcome('encode-uuid-function-hex',()=>encodeParquetWire({kind:'uuid',hex:()=> 'bad'} as any));
outcome('encode-unknown-undefined-field',()=>encodeParquetWire({kind:'binary',hex:'00',unknown:undefined} as any));

const target=resolve(root,'tests/rust-core/parquet-host-matrix-freeze.json');
if(process.argv.includes('--freeze-ts'))writeFileSync(target,JSON.stringify({source:'src/adapters/parquet/{transform,rename,encode}.ts',outcomes},null,2)+'\n');
else {
 const frozen=JSON.parse(readFileSync(target,'utf8')).outcomes;
 if(JSON.stringify(outcomes)!==JSON.stringify(frozen))throw new Error('Parquet host-matrix predecessor drift');
}
console.log(JSON.stringify({cases:outcomes.length,outcomes},null,2));
