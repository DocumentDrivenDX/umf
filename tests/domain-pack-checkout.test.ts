// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkDomainPackCheckout} from '../scripts/check-domain-pack-checkout';

async function fixture(run:(root:string,pack:any,directory:string)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'umf-pack-checkout-')),directory=join(root,'spec/domain-packs/example');
 await mkdir(directory,{recursive:true});
 const source='original\r\nbytes\n',checksum=new Bun.CryptoHasher('sha256').update(source).digest('hex');
 const pack={id:'example',schemas:[{reference:'schema.json'}],sources:{original:{reference:'source.txt',checksum:{algorithm:'sha256',value:checksum}},remote:{reference:'https://example.test/not-fetched'}}};
 await Bun.write(join(directory,'schema.json'),'{}');await Bun.write(join(directory,'source.txt'),source);
 await Bun.write(join(directory,'pack.json'),JSON.stringify(pack));
 try{await run(root,pack,directory);}finally{await rm(root,{recursive:true,force:true});}
}
test('checkout guard checks original bytes and leaves external references inert',()=>fixture(async(root)=>{
 expect(await checkDomainPackCheckout(root,['example'])).toEqual({domainPacks:1,localAssets:3});
}));
test('checkout guard refuses a removed required manifest',()=>fixture(async(root)=>{
 await expect(checkDomainPackCheckout(root,['missing'])).rejects.toThrow();
}));
test('checkout guard refuses tampered source bytes',()=>fixture(async(root,_pack,directory)=>{
 await Bun.write(join(directory,'source.txt'),'changed');
 await expect(checkDomainPackCheckout(root,['example'])).rejects.toThrow('checksum');
}));
test('checkout guard refuses a schema reference outside its pack',()=>fixture(async(root,pack,directory)=>{
 await Bun.write(join(root,'outside.json'),'{}');pack.schemas=[{reference:'../../../outside.json'}];
 await Bun.write(join(directory,'pack.json'),JSON.stringify(pack));
 await expect(checkDomainPackCheckout(root,['example'])).rejects.toThrow('escaping');
}));
