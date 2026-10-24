import {readFileSync,writeFileSync} from 'node:fs';
import '../../../../../../../../scripts/codegen/entry.ts';
const root='.';
const base=JSON.parse(readFileSync(root+'/docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json','utf8')).cases.find((x:any)=>x.id==='row-scope/supplied-owner-via-group-batch').request;
const cases=[];
for(const [name,value]of [['object',{}],['string','public'],['number',1],['false',false]] as any[]){const request=structuredClone(base);request.input={commands:['select'],batch:[],open_reference_read:true};request.context.openReferenceRead=value;cases.push({id:'sol7_open_binding_'+name,operation:'normalizeRowScope',request,expected:JSON.parse((globalThis as any).__umf_row_scope(JSON.stringify(request)))});}
writeFileSync('/private/tmp/sol-row-truthiness.json',JSON.stringify({cases},null,2)+'\n');
