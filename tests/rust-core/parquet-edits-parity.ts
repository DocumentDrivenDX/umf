import {appendParquetKeyValueMetadata} from '../../src/adapters/parquet/transform.ts';
import {renameParquetField} from '../../src/adapters/parquet/rename.ts';
import {captureParquet,encodeParquetWire} from '../../src/adapters/parquet/index.ts';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {encodeWire,fromWire} from '../../bindings/core/node/src/wire.js';

const root=resolve(import.meta.dirname,'../..');
const cli=process.env.UMF_PARQUET_EDITS_CLI??resolve(root,'target/debug/umf');
const records:any[]=[];const failures:any[]=[];
function compare(op:string,fields:any,reference:()=>any,label:string){
  const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);
  if(only&&!label.includes(only))return;
  const ts=reference();
  const input={op:`parquet.${op}`,...fields};
  const inputSha256=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  records.push({op,label,inputSha256,ts});
  if(process.argv.includes('--freeze-ts'))return;
  const wire=encodeWire(input);
  const child=spawnSync(cli,['parquet-capture','--stdin-wire'],{input:wire,encoding:'utf8',env:{PATH:''},maxBuffer:64*1024*1024});
  if(child.status!==0){failures.push({label,exitStatus:child.status,signal:child.signal,error:child.error?.message,stdout:child.stdout,stderr:child.stderr});return}
  const envelope=JSON.parse(child.stdout);const rust=envelope.status==='ok'?fromWire(JSON.parse(envelope.wire)):{status:'error',code:envelope.code,message:String.fromCharCode(...envelope.messageUnits),path:String.fromCharCode(...envelope.pathUnits)};
  if(JSON.stringify(ts)!==JSON.stringify(rust))failures.push({label,ts,rust});
}
const transforms=JSON.parse(readFileSync(resolve(root,'fixtures/parquet/transforms/results.json'),'utf8'));
for(const c of transforms.results){const bytes=new Uint8Array(readFileSync(resolve(root,c.path)));const source=captureParquet(bytes,{id:c.id});compare('appendKeyValueMetadata',{document:source,entries:transforms.additions},()=>appendParquetKeyValueMetadata(source,transforms.additions),`append/${c.id}`)}
const baseBytes=new Uint8Array(readFileSync(resolve(root,'fixtures/parquet/logical/string.parquet')));const base=captureParquet(baseBytes,{id:'base'});
for(const [label,entries] of [['entry-member-order',[{value:'retained value',key:'value-first'}]],['empty-key',[{key:'',value:''}]],['empty',[]],['duplicate',[{key:'a'},{key:'a'}]],['surrogate',[{key:'bad',value:'\ud800'}]],['unknown',[{key:'unknown',extra:true}]],['oversized',[{key:'large',value:'x'.repeat(1_000_000)}]]] as any){compare('appendKeyValueMetadata',{document:base,entries},()=>appendParquetKeyValueMetadata(base,entries),`append/error/${label}`)}
const rename=JSON.parse(readFileSync(resolve(root,'fixtures/parquet/rename/results.json'),'utf8'));
for(const c of rename.results){const bytes=new Uint8Array(readFileSync(resolve(root,c.path)));const source=captureParquet(bytes,{id:c.id});compare('renameField',{document:source,index:c.index,name:c.name},()=>renameParquetField(source,c.index,c.name),`rename/${c.id}/${c.index}`)}
for(const [index,name] of [[2**32,''],[2**32,'missing'],[Number.MAX_SAFE_INTEGER,''],[Number.MAX_SAFE_INTEGER,'missing'],['\ud800','bad'],[['\ud800',null],'bad'],[0,'root'],[-1,'bad'],[1000,'bad'],[1,'detail'],[1,'order'],[1,''],[1,'\ud800'],[1,'x'.repeat(100001)]] as any){compare('renameField',{document:base,index,name},()=>renameParquetField(base,index,name),`rename/error/${index}/${name.length}`)}
if(process.argv.includes('--freeze-ts'))writeFileSync(resolve(root,'tests/rust-core/fixtures/parquet-edits-ts-freeze.json'),JSON.stringify({operations:records.map(({op,label,inputSha256,ts})=>({op,label,inputSha256,ts}))},null,2)+'\n');
console.log(JSON.stringify({cases:records.length,failures},null,2));if(failures.length)process.exit(1);
