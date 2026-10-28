// SPDX-License-Identifier: MIT OR Apache-2.0
import {createReadStream,createWriteStream} from 'node:fs';
import {chmod,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';

/** Copy one immutable-snapshot input through byte streams, avoiding platform clone syscalls. */
export async function copySourceSnapshotFile(source:string,target:string):Promise<void>{
 const sourceMode=(await stat(source)).mode&0o777;
 await pipeline(createReadStream(source),createWriteStream(target,{flags:'wx',mode:sourceMode}));
 await chmod(target,sourceMode);
}
