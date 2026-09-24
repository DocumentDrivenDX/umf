import {chromium} from 'playwright';
const built=await Bun.build({entrypoints:['scripts/examples/orders-consumers.ts'],target:'browser',format:'esm',outdir:'.cache/orders-consumers-browser',naming:'demo.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/demo.js'?new Response(Bun.file('.cache/orders-consumers-browser/demo.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Orders consumers</title><main></main>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async()=>{
  const path='/demo.js',demo=await import(path),source=demo.ordersModel(true),{bundle,run}=demo.compileOrdersTransform(source),main=document.querySelector('main')!;
  const graph=new DOMParser().parseFromString(bundle.visualization.svg,'image/svg+xml');if(graph.querySelector('parsererror'))throw Error('Invalid SVG');main.append(document.importNode(graph.documentElement,true));
  const form=document.createElement('form');for(const field of bundle.form.fields){const label=document.createElement('label'),control=document.createElement('input');control.name=field.source;control.type=field.control;label.textContent=field.description;label.append(control);form.append(label);}main.append(form);
  (form.elements.namedItem('order_id') as HTMLInputElement).value='browser-01';(form.elements.namedItem('quantity') as HTMLInputElement).value='4';(form.elements.namedItem('active') as HTMLInputElement).checked=false;
  const row={order_id:(form.elements.namedItem('order_id') as HTMLInputElement).value,quantity:(form.elements.namedItem('quantity') as HTMLInputElement).valueAsNumber,active:(form.elements.namedItem('active') as HTMLInputElement).checked};
  const accepted=run(row),rejected=run({...row,quantity:2147483648});if(accepted.status!=='accepted'||accepted.output.isActive!==false||accepted.output.quantity!==4||rejected.status!=='rejected')throw Error('Browser transform/validation differs');
  const text=document.createElement('pre');text.textContent=bundle.humanDocumentation;main.append(text);
  if(!bundle.context.source.extensions['example.future']||bundle.agentContext.aggregate.kind!=='entity')throw Error('Context missing');
  return {svgNodes:main.querySelectorAll('svg text').length,svgEdges:main.querySelectorAll('svg path').length,formControls:form.elements.length,accepted:accepted.output,rejected:rejected.status,unknownPreserved:true,documentationRendered:text.textContent!.includes('order_id -> orderId'),nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 });
 if(externalRequests||!result.nodeGlobalsAbsent||result.svgNodes!==6||result.svgEdges!==4||result.formControls!==3||!result.documentationRendered)throw Error('Browser evidence mismatch');await Bun.write('fixtures/validation/orders-consumers-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version(),scope:'Authored form/SVG rendering and local DTO transform; no domain or service execution'},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
