// SPDX-License-Identifier: MIT OR Apache-2.0
/** Measure source checkout bytes, excluding Git history and untracked/ignored assets. */
import {lstat} from 'node:fs/promises';
import {checkDomainPackCheckout} from './check-domain-pack-checkout';
import {checkBuildInputs} from './check-build-inputs';
const command=Bun.spawn(['git','ls-files','-z','--cached','--others','--exclude-standard'],{stdout:'pipe',stderr:'inherit'});
const names=[...new Set((await new Response(command.stdout).text()).split('\0').filter(Boolean))];
if(await command.exited)throw Error('Cannot enumerate checkout');
let bytes=0,files=0;
for(const path of names){
 try{const info=await lstat(path);if(info.isFile()||info.isSymbolicLink()){bytes+=info.size;files++;}}
 catch(error:any){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}
}
// Keep working packs, canonical test corpora and build/acceptance inputs. A byte
// target must not turn required fixture data into an optional historical download.
const limitBytes=500_000_000;
console.log(JSON.stringify({files,bytes,limitBytes,scope:'Source, complete domain packs and verification source; excludes .git and optional restored output after deletion is committed'}));
if(bytes>=limitBytes)throw Error('Source checkout exceeds the 500 MB budget; inspect generated output before cutting functional inputs');
console.log(JSON.stringify(await checkDomainPackCheckout()));
console.log(JSON.stringify(await checkBuildInputs()));
