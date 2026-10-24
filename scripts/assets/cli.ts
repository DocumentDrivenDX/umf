// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve} from 'node:path';
import {loadLock,select,seedAsset,resolveSelection,materialize,type Options} from './store';
import {packLockSha256} from './pack-lock-pin';

export async function assetCli(kind:'domain-packs'|'conformance',argv:string[]){
 const args:Record<string,string>=Object.create(null),flags=new Set<string>();
 const boolean=new Set(['--download','--offline','--help']);
 const valued=new Set(['--lock','--lock-sha256','--revision','--selector','--cache','--source-root','--seed-root','--output','--rights','--timeout-ms']);
 for(let i=0;i<argv.length;i++){
  const key=argv[i]!;if(Object.hasOwn(args,key)||flags.has(key))throw Error('Duplicate option '+key);
  if(boolean.has(key)){flags.add(key);continue;}
  if(!valued.has(key)||!argv[i+1]||argv[i+1]!.startsWith('--'))throw Error('Unknown or missing option '+key);
  args[key]=argv[++i]!;
 }
 if(flags.has('--help')){
  console.log(`Explicit ${kind} resolver. No network unless --download is set.
Required: --selector NAME[,NAME] and --cache DIRECTORY.
Conformance/custom locks: --lock FILE --lock-sha256 SHA256 --revision SOURCE_COMMIT.
Optional: --source-root ROOT (verified retained files); --seed-root ROOT (copy verified files into cache);
--output DIRECTORY (materialize selected files); --download --rights local-use|redistribute;
--offline; --timeout-ms N. Downloads require exact URLs, sizes, media types and hashes.
No archive extraction, test execution, source deletion or history mutation.`);return;
 }
 if(flags.has('--download')&&flags.has('--offline'))throw Error('Conflicting download/offline options');
 if(!args['--selector']||!args['--cache'])throw Error('Explicit selector and cache required');
 const custom=args['--lock'];
 if((kind==='conformance'||custom)&&(!args['--lock-sha256']||!args['--revision']))throw Error('Custom/conformance lock requires SHA-256 and exact revision');
 const lock=await loadLock(custom??resolve(import.meta.dir,'domain-packs.lock.json'),args['--lock-sha256']??packLockSha256);
 if(lock.kind!==kind)throw Error('Wrong resolver lock kind');
 const revision=args['--revision']??lock.revision,selectors=args['--selector']!.split(',');
 const assets=select(lock,selectors,revision); // Entire selector/revision preflight before I/O or network.
 if(args['--rights']&&!['local-use','redistribute'].includes(args['--rights']))throw Error('Invalid rights selection');
 if(flags.has('--download')&&!args['--rights'])throw Error('Download requires explicit rights selection');
 const options:Options={cache:resolve(args['--cache']!),download:flags.has('--download')};
 if(args['--source-root'])options.sourceRoot=resolve(args['--source-root']);
 if(args['--rights'])options.rights=args['--rights'] as 'local-use'|'redistribute';
 if(args['--timeout-ms'])options.timeoutMs=Number(args['--timeout-ms']);
 if(args['--seed-root']){
  // Resolve all originals before copying any of this cohort into the cache.
  await resolveSelection(lock,selectors,revision,{cache:options.cache,sourceRoot:resolve(args['--seed-root']),download:false});
  for(const a of assets)await seedAsset(a,resolve(args['--seed-root']),options.cache);
 }
 const result=args['--output']
  ?await materialize(lock,selectors,revision,options,resolve(args['--output']))
  :await resolveSelection(lock,selectors,revision,options);
 console.log(JSON.stringify({...result,lockSha256:args['--lock-sha256']??packLockSha256,
  selectedAssets:assets.length,selectedBytes:assets.reduce((n,a)=>n+a.bytes,0)}));
}
