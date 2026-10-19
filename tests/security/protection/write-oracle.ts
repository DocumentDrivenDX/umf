// SPDX-License-Identifier: MIT OR Apache-2.0
import data from './write-fixtures.json';
import {compileCandidateCatalogProgram as compile} from '../../../src/extensions/security//catalog-program-candidate';
import {evaluateCandidateCatalogWrite as evaluate} from '../../../src/extensions/security//catalog-write-candidate';
function frozen(v:unknown):boolean{return v===null||typeof v!=='object'||Object.isFrozen(v)&&Object.values(v).every(frozen);}
export function runOracle(id:'S24'|'S25'){
 return (data.fixtures as any[]).filter(f=>f.case===id).map(f=>{
  const input=structuredClone(f.input),before=JSON.stringify(input);let actual='threw',error:string|null=null,sourceValid=false,passed=false;
  try{const handle=compile(input.policy,input.catalog,input.closure,input.ontology);sourceValid=true;
   const result=evaluate(handle,input.owner,input.profile,input.request);actual=result.decision;
   passed=actual===f.expected&&result.complete===false&&result.authority===false&&frozen(result)&&JSON.stringify(Object.keys(result).sort())==='["authority","complete","decision"]'&&JSON.stringify(input)===before;
  }catch(e){error=String(e);}
  return {id:f.id,expected:f.expected,actual,passed,sourceValid,error};
 });
}
