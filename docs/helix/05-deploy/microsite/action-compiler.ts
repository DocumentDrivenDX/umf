// The browser transports requests; original Rust WASM owns SQL/model/action semantics.
const sql=document.querySelector<HTMLTextAreaElement>('#sql')!;
const status=document.querySelector<HTMLElement>('#status')!;
const output=document.querySelector<HTMLElement>('#plan')!;
const run=document.querySelector<HTMLButtonElement>('#compile')!;
try {
 const data=await fetch('./action-compiler/model.json').then(r=>{if(!r.ok)throw Error('Model unavailable');return r.json();});
 // Host-owned static module URL; metadata cannot install executable code.
 const module=await import(/* @vite-ignore */ './action-compiler/weft_wasm.js');
 await module.default();
 const compiler=new module.MutationCompiler(JSON.stringify(data.configuration));
 sql.value=data.request.sql;
 document.querySelector('#samples')!.textContent=JSON.stringify(data.samples,null,2);
 function compile(){try{const response=JSON.parse(compiler.compile_json(JSON.stringify({...data.request,sql:sql.value})));
 status.textContent=response.status==='compiled'?'Portable action plan compiled':'Statement refused';
 output.textContent=response.status==='compiled'?JSON.stringify(JSON.parse(response.plan.utf8),null,2):JSON.stringify(response.diagnostics,null,2);
 }catch(error){status.textContent='Compilation unavailable';output.textContent=error instanceof Error?error.message:String(error);}}
 run.disabled=false;run.addEventListener('click',compile);compile();
}catch(error){status.textContent='Compiler unavailable';output.textContent=error instanceof Error?error.message:String(error);}
