// SPDX-License-Identifier: MIT OR Apache-2.0
import {checkCore} from '../../src/generated/core-validators';
import {runAccountedCore} from '../../src/generated/core-validators-accounted';
import currentConformance from '../../fixtures/metamodel/current-conformance.json';

const CURRENT_CONFORMANCE_CASES=139;

declare global {
 interface Window {__umfR2MeteringResult?:{count:number;failures:string[];work:number}}
}

class BrowserAccountingContext {
 work=0;subjects=0;bytes=0;
 visit(_category:string,_path:string,count=1):void{this.work+=count;}
 retainSubject(_identity:unknown,_path:string):void{this.subjects++;this.work++;}
 retainBytes(_domain:string,count:number,_path:string):void{this.bytes+=count;this.work+=Math.ceil(count/4096);}
 scanUtf8(text:string,path:string):number{const bytes=new TextEncoder().encode(text).byteLength;this.retainBytes('browser-test',bytes,path);return bytes;}
 appendCanonicalChunk(text:string,path:string):void{this.scanUtf8(text,path);}
}

function assertParity(id:string,document:unknown):number{
 const valid=checkCore(structuredClone(document));
 const errors=structuredClone(checkCore.errors??[]);
 const accounting=new BrowserAccountingContext();
 const actual=runAccountedCore(structuredClone(document),accounting);
 const actualErrors=structuredClone(actual.errors);
 const equal=JSON.stringify({valid:actual.valid,errors:actualErrors})===JSON.stringify({valid,errors});
 if(!equal)throw new Error(`R2_BROWSER_PARITY:${id}`);
 return accounting.work;
}

const failures:string[]=[];let count=0,totalWork=0;
if(currentConformance.cases.length!==CURRENT_CONFORMANCE_CASES)throw new Error('R2_BROWSER_CORPUS_COUNT');
for(const item of currentConformance.cases){
 try{totalWork+=assertParity(item.id,item.document);count++;}
 catch{failures.push(item.id);}
}
for(const item of [
 {id:'focused-valid',document:{umf:'0.10.0',id:'r2-focused',vocabularies:{},modules:[]}},
 {id:'focused-refusal',document:{umf:'0.10.0',id:'',vocabularies:{},modules:[]}},
]){
 try{totalWork+=assertParity(item.id,item.document);count++;}
 catch{failures.push(item.id);}
}
window.__umfR2MeteringResult={count,failures,work:totalWork};
