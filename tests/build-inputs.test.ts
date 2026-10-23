// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {requireLocalInput} from '../scripts/check-build-inputs';

async function fixture(run:(root:string)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'umf-build-input-'));
 try{await run(root);}finally{await rm(root,{recursive:true,force:true});}
}
test('build input guard rejects missing inputs and incorrect historical hashes',()=>fixture(async root=>{
 await expect(requireLocalInput(root,'missing.json')).rejects.toThrow();
 await Bun.write(join(root,'source.json'),'original\r\n');
 await expect(requireLocalInput(root,'source.json','0'.repeat(64))).rejects.toThrow('checksum');
 const hash=new Bun.CryptoHasher('sha256').update('original\r\n').digest('hex');
 expect(new TextDecoder().decode(await requireLocalInput(root,'source.json',hash))).toBe('original\r\n');
}));
test('build input guard rejects traversal and escaping symlinks',()=>fixture(async root=>{
 await expect(requireLocalInput(root,'../outside.json')).rejects.toThrow('unsafe path');
 await symlink('/etc/hosts',join(root,'outside.json'));
 await expect(requireLocalInput(root,'outside.json')).rejects.toThrow('escaping input');
}));
