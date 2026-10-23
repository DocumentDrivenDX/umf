// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import {inspectTableLifecycle,type TableOperation,type TableOperationV1} from '../extensions/tables';
import type {FieldInfo,Ref} from './types';

interface Tools {
 field(ref:Ref):FieldInfo; name(raw:string,kind:'class'|'field',path:string):string;
 type(field:FieldInfo,missing?:boolean):string;py(value:unknown):string;
 fail(path:string,message:string):never;used:Set<string>;
}
export function tableClients(doc:Document,wanted:Set<string>|undefined,t:Tools){
 const ids=new Set<string>(),modules:any[]=[],lines:string[]=['_TABLE_OPERATIONS: dict[tuple[str, str], Any] = {}',''];
 const selected=doc.modules.filter(m=>Object.hasOwn(m.extensions??{},'umf.tables')&&m.elements.some(e=>e.kind==='record'&&(!wanted||wanted.has(m.id+'.'+e.id))));
 if(!selected.length)return {ids,modules,lines};
 const inspected=inspectTableLifecycle(doc);
 if(!inspected.valid||!inspected.complete)t.fail('/modules','Native table lifecycle client requires complete declared table/operation meaning');
 for(const m of selected){
  if(Object.keys(m.extensions??{}).some(k=>k!=='umf.tables'))t.fail(m.id,'Native table module extensions require a qualified combined interpretation');
  const payload=inspected.modules.find(x=>x.module===m.id)!.payload;
  const tables=payload.tables.filter(table=>!wanted||wanted.has(m.id+'.'+table.record.element));
  for(const table of tables)ids.add(m.id+'.'+table.record.element);
  const selectedTables=new Set(tables.map(table=>table.id));
  const columns=new Map(payload.tables.flatMap(table=>table.columns.map(column=>[JSON.stringify([column.field.module,column.field.element]),column] as const)));
  // Typed backfill operations are administrative migration inputs, never app client methods.
  const operations=(payload.commands as TableOperation[]).filter((op):op is TableOperationV1=>op.version==='umf.table-operation/0.1'&&(op.body.kind==='query'?tables.length===payload.tables.length:selectedTables.has(op.body.table)));
  if(!operations.length&&!payload.commands.some(op=>(op as any).version==='umf.table-operation/0.2'))t.fail(m.id,'Native table lifecycle client requires declared operations');
  const python=t.name(m.id,'field',m.id),prefix=t.name(m.id,'class',m.id),cls=prefix+'Module';
  const reserve=(symbol:string)=>{if(t.used.has(symbol))t.fail(m.id,'Generated native type collision');t.used.add(symbol);};
  if(modules.some(module=>module.python===python))t.fail(m.id,'Generated module attribute collision');
  reserve(cls);reserve('Sync'+cls);
  const commands:any[]=[],methods=new Set<string>();
  for(const op of operations){
   const path=m.id+'.'+op.id,method=t.name(op.id,'field',path);
   const reading=op.body.kind==='read'||op.body.kind==='query';
   const symbols=[method,...(!reading?[method+'_observe',...(op.batch?[method+'_batch',method+'_batch_observe']:[])]:[])];
   for(const symbol of symbols){if(methods.has(symbol))t.fail(path,'Generated operation method collision');methods.add(symbol);}
   const stem=prefix+t.name(op.id,'class',path),input=stem+'Input',row=stem+'Row';
   reserve(input);
   const parameters=op.parameters.map(p=>{
    const f=t.field(p.field),column=columns.get(JSON.stringify([p.field.module,p.field.element]));
    const name=t.name(p.id,'field',path+'/'+p.id);
    if(['self','items','size','cursor','idempotency_key'].includes(name))t.fail(path+'/'+p.id,'Parameter conflicts with generated signature');
    return {...f,id:p.id,python:name,missing:false,native:column?.nativeType??null};
   });
   if(new Set(parameters.map(p=>p.python)).size!==parameters.length)t.fail(path,'Generated parameter name collision');
   const projection=op.body.kind==='query'?op.body.outputs.map(o=>o.field):op.body.kind==='read'?op.body.fields:op.body.returning;
   const fields=projection.map((ref,i)=>({...t.field(ref),...(op.body.kind==='query'?{python:t.name(op.body.outputs[i]!.name,'field',path+'/outputs/'+i)}:{}),missing:false}));
   if(new Set(fields.map(f=>f.python)).size!==fields.length)t.fail(path,'Generated result name collision');
   if(fields.length)reserve(row);
   const result=op.body.kind==='query'?'many':op.body.kind==='read'?op.body.result:'mutation';
   const info={module:m.id,id:op.id,python:method,input,row:fields.length?row:null,parameters,fields,result,maxRows:op.body.maxRows,
    fixedQuery:op.body.kind==='query',replay:op.replay,batch:op.batch??null,declaration:op};
   commands.push(info);
   for(const [symbol,specs]of [[input,parameters],...(fields.length?[[row,fields]]:[])] as [string,FieldInfo[]][]){
    lines.push('@dataclass(frozen=True)',`class ${symbol}:`);
    if(!specs.length)lines.push('    pass');
    for(const f of specs)lines.push(`    ${f.python}: ${t.type(f,false)}`);
    lines.push('    def __post_init__(self) -> None:',`        validate_model(self, ${t.py(specs)})`,'');
   }
  }
  modules.push({id:m.id,python,cls,commands});
 }
 for(const module of modules)for(const op of module.commands){
  const {input:_,row:__,python:___,declaration:____,...metadata}=op;
  lines.push(`_TABLE_OPERATIONS[(${t.py(module.id)}, ${t.py(op.id)})] = ${t.py(metadata)}`);
 }
 lines.push('');
 for(const mode of [{sync:false,prefix:''},{sync:true,prefix:'Sync'}]){
  for(const module of modules){
   lines.push(`class ${mode.prefix}${module.cls}:`,'    def __init__(self, client: Any) -> None:','        self._client = client','');
   for(const op of module.commands){
    const row=op.row??'None',write=op.result==='mutation';
    const result=write?`Applied[${row}] | Recovered`:op.result==='count'?'int':op.result==='page'?`Page[${row}]`:op.result==='many'?`tuple[${row}, ...]`:row+(op.result==='optional'?' | None':'');
    const lookup=`_TABLE_OPERATIONS[(${t.py(module.id)}, ${t.py(op.id)})]`;
    if(!mode.sync)lines.push(`    # Original operation: ${JSON.stringify(op.id)}`);
    for(const batch of [false,...(op.batch?[true]:[])]){
     const base=batch?[`items: tuple[${op.input}, ...]`]:op.parameters.map((p:FieldInfo)=>p.python+': '+t.type(p,false));
     const options=write?[op.replay==='caller-key-required'?'idempotency_key: str':'idempotency_key: str | None = None']:op.result==='page'?['size: int | None = None','cursor: str | None = None']:op.result==='many'&&!op.fixedQuery?['size: int | None = None']:[];
     const args=[...base,...options],signature=args.length?', *, '+args.join(', '):'';
     const values=batch?'items':`${op.input}(${op.parameters.map((p:FieldInfo)=>p.python+'='+p.python).join(', ')})`;
     const common=`self._client, ${lookup}, ${values}, ${op.input}, ${op.row??'None'}`;
     const call=`${mode.sync?'table_call_sync':'table_call'}(${common}, key=${write?'idempotency_key':'None'}, size=${!write&&!op.fixedQuery&&['page','many'].includes(op.result)?'size':'None'}, cursor=${op.result==='page'?'cursor':'None'}, batch=${batch?'True':'False'})`;
     const method=op.python+(batch?'_batch':'');
     lines.push(`    ${mode.sync?'':'async '}def ${method}(self${signature}) -> ${result}:`,`        return cast(${t.py(result)}, ${mode.sync?'':'await '}${call})`,'');
     if(write){
      const observerArgs=[...base,'idempotency_key: str'];
      const observe=`${mode.sync?'table_call_sync':'table_call'}(${common}, key=idempotency_key, observe=True, batch=${batch?'True':'False'})`;
      lines.push(`    ${mode.sync?'':'async '}def ${method}_observe(self, *, ${observerArgs.join(', ')}) -> Recovered | NotObserved:`,`        return cast("Recovered | NotObserved", ${mode.sync?'':'await '}${observe})`,'');
     }
    }
   }
  }
  lines.push(`class ${mode.prefix}ModuleClients:`,'    def __init__(self, client: Any) -> None:');
  for(const module of modules)lines.push(`        self.${module.python}: ${mode.prefix}${module.cls} = ${mode.prefix}${module.cls}(client)`);
  lines.push('');
 }
 return {ids,modules,lines};
}
