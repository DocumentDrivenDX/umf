import * as core from '../../src/index';
import engine from '../../fixtures/access/commerce/engine-only.json';
export function probePreparedInspection(){
 const results:unknown[]=[];
 const require=(ok:boolean,message:string)=>{if(!ok)throw Error(message);};
 for(const version of ['0.8.0','0.9.0']){
  const doc=core.readDocument(JSON.stringify({...engine,umf:version}),'json');
  const record=doc.modules[0]!.elements.find(e=>e.id==='Order')!;
  (record.keys as Record<string,unknown>[])[0]!.future={retained:'opaque'};
  const field=doc.modules[0]!.elements[0]!;field.facets={length:{max:8,unit:'future-unit'},future:{nested:1}};
  doc.future={unknown:{exact:'9007199254740993'}};
  const prepared=core.prepareCoreInspection(doc),meanings:unknown[]=[];
  require(prepared.source!==doc,'snapshot aliases caller');
  require(Object.isFrozen(prepared)&&Object.isFrozen(prepared.source)&&Object.isFrozen(prepared.source.modules[0]!.elements[0]),'snapshot not recursively frozen');
  for(const module of doc.modules)for(const element of module.elements){
   const identity={module:module.id,element:element.id};
   const actual=[prepared.keys(identity),prepared.facets(identity),prepared.schemaProperties(identity)];
   const expected=[core.inspectCoreKeys(doc,identity).meaning,core.inspectCoreFacets(doc,identity).meaning,core.inspectCoreSchemaProperties(doc,{scope:'element',...identity}).properties];
   require(JSON.stringify(actual)===JSON.stringify(expected),'ordinary/prepared meaning differs');meanings.push({identity,actual});
  }
  const identity={module:'commerce',element:'Order'},before=JSON.stringify(prepared.keys(identity));
  const result=prepared.keys(identity);require(result.state==='partial','unknown Key must remain partial');
  if(result.state==='partial')result.keys[0]!.name='mutated returned copy';
  (record.keys as Record<string,unknown>[])[0]!.name='mutated caller';
  require(JSON.stringify(prepared.keys(identity))===before,'caller/result mutation changed snapshot');
  let frozen=false;try{prepared.source.modules[0]!.elements[0]!.id='mutated';}catch{frozen=true;}require(frozen,'owned source mutation succeeded');
  require(JSON.stringify(prepared.source.future)===JSON.stringify({unknown:{exact:'9007199254740993'}}),'unknown content lost');
  results.push({version,meanings,callerIsolated:true,resultIsolated:true,frozen,unknown:prepared.source.future});
 }
 return JSON.stringify(results);
}
