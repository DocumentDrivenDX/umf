import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {realpath} from 'node:fs/promises';
import {readJsonValue} from '../src/model/serialization';
import {requireDomainPackProfile} from '../src/domain-packs/profile';
export async function resolveDomainFamily(input:string){
 const read=async(path:string)=>{const text=await Bun.file(path).text(),pack:any=readJsonValue(text,'json');requireDomainPackProfile(pack);return {path,text,pack};};
 const root=await read(resolve(input));
 if(!root.pack.composition)throw Error('No composition declared');
 if(!/^[a-z][a-z0-9-]*$/.test(root.pack.id))throw Error('Unsafe root pack identity');
 const familyRoot=await realpath(resolve(dirname(input),'..'));
 const members=[root];
 for(const component of root.pack.composition.components){
  const path=await realpath(resolve(familyRoot,component.id,'pack.json')),inside=relative(familyRoot,path);
  if(inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('Component symlink leaves family directory');
  const member=await read(path);
  if(member.pack.id!==component.id||member.pack.version!==component.version)throw Error('Component identity/version differs');
  if(new Bun.CryptoHasher('sha256').update(member.text).digest('hex')!==component.checksum.value)throw Error('Component manifest checksum differs');
  if(member.pack.family?.id!==root.pack.id||member.pack.family?.version!==root.pack.version)throw Error('Component family differs');
  if(member.pack.composition)throw Error('Nested composition is not supported');
  members.push(member);
 }
 return members;
}
