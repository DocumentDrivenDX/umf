// SPDX-License-Identifier: MIT OR Apache-2.0
/** Build-host prerequisite for the public shared-runtime composition tests. */
import {copyFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const root=resolve(import.meta.dir,'..');
const cargo=Bun.which('cargo')??(existsSync('/opt/homebrew/opt/rustup/bin/cargo')?'/opt/homebrew/opt/rustup/bin/cargo':'cargo');
const env:Record<string,string|undefined>={...process.env,PATH:dirname(cargo)+':'+(process.env.PATH??'')};
if(process.platform==='darwin'){
  env.CARGO_PROFILE_RELEASE_STRIP='none';
  env.RUSTFLAGS=[env.RUSTFLAGS??'','-C debuginfo=2','-C strip=none'].join(' ').trim();
}
const child=Bun.spawn([cargo,'build','--locked','--offline','--release','-p','umf-core-node'],{
  cwd:root,env,
  stdout:'inherit',stderr:'inherit',
});
if(await child.exited)throw Error('Cannot build extension-kind native test prerequisite');
const target=resolve(root,process.env.CARGO_TARGET_DIR??'target','release');
const library=process.platform==='darwin'?'libumf_core_node.dylib':process.platform==='win32'?'umf_core_node.dll':'libumf_core_node.so';
const destination=resolve(root,'bindings/core/node/umf_core_node.node');
await mkdir(dirname(destination),{recursive:true});
await copyFile(resolve(target,library),destination);
