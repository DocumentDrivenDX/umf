// SPDX-License-Identifier: MIT OR Apache-2.0
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdir,mkdtemp} from 'node:fs/promises';

/** Build beside the destination for atomic replacement; check mode never renames. */
export async function referenceBuildStage(output:string,check:boolean):Promise<string>{
 const parent=dirname(resolve(output));
 if(check)return mkdtemp(join(tmpdir(),'umf-reference-'));
 await mkdir(parent,{recursive:true});
 return mkdtemp(join(parent,'.umf-reference-'));
}
