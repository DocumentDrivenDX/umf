// Trusted optional runtime; all compiler state is confined to a disposable worker.
import {assemble,select} from './smithy.js';
const protocol='umf.smithy.worker.v1';
self.onmessage=({data})=>{
 try{
  if(!data||data.protocol!==protocol)throw new Error('Invalid worker protocol');
  let report;
  if(data.operation==='select'){
   if(Object.keys(data).some(k=>!['protocol','operation','modelJson','selector'].includes(k))||typeof data.modelJson!=='string'||data.modelJson.length>4000000||typeof data.selector!=='string'||!data.selector.trim()||data.selector.length>4000000)throw new Error('Invalid selection request');
   report=select(data.modelJson,data.selector);
  }else{
   if(!data.files||typeof data.files!=='object'||Array.isArray(data.files)||Object.keys(data).some(k=>!['protocol','files'].includes(k)))throw new Error('Invalid assembly request');
   if(!Object.keys(data.files).length||Object.values(data.files).some(value=>typeof value!=='string'))throw new Error('Source files must be nonempty named text');
   const text=JSON.stringify(data.files);if(text.length>4000000)throw new Error('Source request exceeds worker text limit');
   report=assemble(text);
  }
  if(typeof report!=='string'||report.length>4000000)throw new Error('Native response exceeds worker text limit');
  self.postMessage({protocol,ok:true,report});
 }catch(error){self.postMessage({protocol,ok:false,error:String(error)});}
};
