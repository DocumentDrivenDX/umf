// Independent native compiler inventory comparison; numeric wire semantics need codecs.
import {mkdir} from 'node:fs/promises';
const exe=process.env.UMF_FLATC_PATH??'.cache/flatc/root/usr/bin/flatc';const lib=process.env.UMF_FLATC_LIBRARY_PATH??process.cwd()+'/.cache/flatc/root/usr/lib/aarch64-linux-gnu';
const env={...process.env,LD_LIBRARY_PATH:lib};const version=Bun.spawnSync([exe,'--version'],{env});if(version.exitCode!==0)throw Error(version.stderr.toString());
if(version.stdout.toString().trim()!=='flatc version 23.5.26')throw Error('Expected pinned flatc 23.5.26');
await mkdir('.cache/flatc/generated',{recursive:true});const definitions:Record<string,any>={};
for(const file of ['Message','File']){
 const result=Bun.spawnSync([exe,'--jsonschema','-I','spec/extensions/arrow/flatbuffers','-o','.cache/flatc/generated','spec/extensions/arrow/flatbuffers/'+file+'.fbs'],{env});if(result.exitCode!==0)throw Error(result.stderr.toString());
 Object.assign(definitions,(await Bun.file('.cache/flatc/generated/'+file+'.schema.json').json()).definitions);
}
const inventory=await Bun.file('spec/extensions/arrow/flatbuffer-inventory.json').json();const unions=new Set(inventory.definitions.filter((d:any)=>d.kind==='union').map((d:any)=>d.name));let fields=0,members=0;
for(const d of inventory.definitions){const native=definitions['org_apache_arrow_flatbuf_'+d.name];if(!native)throw Error('Missing native declaration '+d.name);
 if(d.members){const expected=[...(d.kind==='union'?['NONE']:[]),...d.members.map((m:any)=>m.name)];if(JSON.stringify(native.enum)!==JSON.stringify(expected))throw Error('Member mismatch '+d.name);members+=d.members.length;}
 else {const expected=d.fields.flatMap((f:any)=>unions.has(f.type)?[f.name+'_type',f.name]:[f.name]).sort();if(JSON.stringify(Object.keys(native.properties??{}).sort())!==JSON.stringify(expected))throw Error('Field mismatch '+d.name);fields+=d.fields.length;
  if(d.kind==='table'&&JSON.stringify([...(native.required??[])].sort())!==JSON.stringify(d.fields.filter((f:any)=>f.required).map((f:any)=>f.name).sort()))throw Error('Required field mismatch '+d.name);
 }
}
if(Object.keys(definitions).length!==inventory.definitions.length)throw Error('Declaration inventory mismatch');
await Bun.write('fixtures/arrow/flatbuffer-inventory-oracle.json',JSON.stringify({compiler:version.stdout.toString().trim(),sourceCommit:inventory.source.commit,declarations:inventory.definitions.length,fields,members,scope:'Native declaration/member/field names and required table fields. Union discriminator layout differs in logical JSON; no binary codec or numeric semantic validation claim.'},null,2)+'\n');console.log({declarations:inventory.definitions.length,fields,members});
