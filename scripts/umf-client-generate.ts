// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host boundary; generator and generated clients contain no filesystem access. */
import {readFile} from 'node:fs/promises';
import {generatePythonClient} from '../src/access';
import {checkAccessPackage,writeAccessPackage,type WriterOptions} from './umf-access-generate';

export async function runClientCli(args:readonly string[],writer:WriterOptions={}):Promise<number> {
 try {
  const command=args[0];if(command!=='generate'&&command!=='check')throw new Error('Use generate or check');
  const options=new Map<string,string>();
  for(let i=1;i<args.length;i+=2){const flag=args[i],value=args[i+1];if(!flag||!value||!['--schema','--package','--output'].includes(flag)||options.has(flag))throw new Error('Use --schema, --package and --output once');options.set(flag,value);}
  const schema=options.get('--schema'),pkg=options.get('--package'),destination=options.get('--output');
  if(!schema||!pkg||!destination)throw new Error('Required: --schema PATH --package NAME --output DIRECTORY');
  const result=generatePythonClient({text:await readFile(schema,'utf8'),format:/\.ya?ml$/i.test(schema)?'yaml':'json',package:pkg});
  const candidate={outcome:'candidate' as const,files:result.files};
  if(command==='check'){
   const differences=await checkAccessPackage(destination,candidate);
   for(const path of differences)console.error(path);
   return differences.length?1:0;
  }
  await writeAccessPackage(destination,candidate,writer);
  console.log(JSON.stringify({package:pkg,sourceDigest:result.sourceDigest,files:result.files.length}));return 0;
 }catch(error){const e=error as {code?:string;message?:string;path?:string};console.error(JSON.stringify({code:e.code??'GENERATION_FAILED',message:e.message,path:e.path}));return 1;}
}
if(import.meta.main)process.exitCode=await runClientCli(process.argv.slice(2));
