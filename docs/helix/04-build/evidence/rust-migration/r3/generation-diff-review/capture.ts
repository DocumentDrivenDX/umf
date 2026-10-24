// SPDX-License-Identifier: MIT OR Apache-2.0
import {generateAccessPackage} from '../../../../../../../src/compilation';
import {diffAccessPackages} from '../../../../../../../src/compilation/admission';
import {request,profile} from '../../../../../../../tests/compilation/access-fixtures';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=import.meta.dir+'/frozen.json';if(await Bun.file(out).exists())throw Error('Refusing to refresh frozen expectations');
const original=generateAccessPackage(request(),profile());const cases:any[]=[];
function add(id:string,change:(v:any)=>void){const before=structuredClone(original),after=structuredClone(original);change(after);cases.push({id,operation:'diffAccessPackages',request:{before,after},expected:{ok:true,result:diffAccessPackages(before,after)}})}
add('duplicate-symbol-last-value',v=>{const x=structuredClone(v.symbols[0]);x.path='changed/path.py';v.symbols.push(x)});
add('abi-change',v=>v.runtimeAbi.version='2.0.0');
add('public-path-change',v=>{v.symbols[0].path='changed/path.py'});
add('retained-annotation',v=>{const file=v.files.find((f:any)=>f.path.endsWith('/_umf/sources.json'));const sources=JSON.parse(file.text);const doc=JSON.parse(sources[0].text);doc.title='retained title';sources[0].text=JSON.stringify(doc);file.text=JSON.stringify(sources);file.sha256='0'.repeat(64)});
const frozen=JSON.stringify({format:'umf-r3-generation-diff-review/1',cases},null,2)+'\n';await writeFile(out,frozen);await writeFile(import.meta.dir+'/receipt.json',JSON.stringify({frozenSha256:createHash('sha256').update(frozen).digest('hex'),scope:'Original source comparator controls; no regenerated baseline expectations'},null,2)+'\n');console.log(cases.length);
