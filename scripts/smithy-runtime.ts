import {mkdir} from 'node:fs/promises';
export async function ensureSmithyRuntime(){
const jars=[['jsonschema','47584feccfe5879ba438d6ab11a646f890bd606ff39c82849c75be1f642fb493'],['model','816e2cbbf8a62895d484e481e1d7beb1e4e929dec0cfbdda8c160d69402f750b'],['utils','1d89fa0624ebf8e0f3032cc6b8283ee58335d3ee43e1826b24b1e951b3bdf8d2']];
await mkdir('.cache/smithy',{recursive:true});
for(const[name,hash]of jars){
 const path='.cache/smithy/'+name+'.jar';
 if(!await Bun.file(path).exists()){const response=await fetch(`https://repo.maven.apache.org/maven2/software/amazon/smithy/smithy-${name}/1.73.0/smithy-${name}-1.73.0.jar`);if(!response.ok)throw new Error('Cannot fetch pinned Smithy oracle');await Bun.write(path,await response.arrayBuffer());}
 if(new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex')!==hash)throw new Error('Smithy jar checksum mismatch');
}
return Object.fromEntries(jars);
}
