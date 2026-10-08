import {readDocument, writeDocument} from '../../../../src/model/document';
import {validateDocument} from '../../../../src/validation/document';

const base = {umf:'0.1.0',id:'example:customer',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements:[{id:'customer',name:'Customer',scalarType:'string',extensions:{}}]}]};
const unknown = {...base,vocabularies:{'example.policy':{version:'1.0.0'}},modules:[{...base.modules[0],elements:[{...base.modules[0]!.elements[0],extensions:{'example.policy':{owner:'sales',retentionDays:30,unfamiliar:{keepMe:true}}}}]}]};
const input=document.querySelector<HTMLTextAreaElement>('#source')!;
const output=document.querySelector<HTMLElement>('#output')!;
const status=document.querySelector<HTMLElement>('#result')!;
const diagnostics=document.querySelector<HTMLElement>('#diagnostics')!;
const preset=document.querySelector<HTMLSelectElement>('#preset')!;
const format=document.querySelector<HTMLSelectElement>('#format')!;
function clear(){output.textContent='Check the document to see its output.';status.textContent='Ready to check';diagnostics.textContent='';}
function load(){input.value=JSON.stringify(preset.value==='unknown'?unknown:preset.value==='invalid'?{...base,umf:'99.0.0'}:base,null,2);clear();}
function run(){
  try {
    const doc=readDocument(input.value,'json');
    const checked=validateDocument(doc);
    const serialized=writeDocument(doc,format.value as 'json'|'yaml');
    const recovered=readDocument(serialized,format.value as 'json'|'yaml');
    const retained=JSON.stringify(doc)===JSON.stringify(recovered);
    status.textContent=`${checked.valid?'Valid document':'Invalid'} · ${checked.complete?'All content checked':'Some content not checked'} · ${retained?'Content retained':'Recovery differs'}`;
    output.textContent=serialized;
    diagnostics.textContent=checked.diagnostics.length?checked.diagnostics.map(d=>`${d.severity.toUpperCase()} ${d.code}\n${d.path || '/'}: ${d.message}`).join('\n\n'):'No validation messages.';
  } catch(error){status.textContent='Check refused';output.textContent='No output produced.';diagnostics.textContent=error instanceof Error?error.message:String(error);}
}
input.addEventListener('input',clear);format.addEventListener('change',clear);preset.addEventListener('change',load);document.querySelector('#run')!.addEventListener('click',run);document.querySelector('#reset')!.addEventListener('click',load);load();run();
