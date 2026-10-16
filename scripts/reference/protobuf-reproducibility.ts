/** Exercise the real compiler build against dirty metadata, not a mock renderer. */
import {join} from 'node:path';
const output='dist/protobuf';
async function build(){const child=Bun.spawn(['bun','scripts/build-protobuf.ts'],{stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error('Compiler build failed');}
async function snapshot(){const files=(await Array.fromAsync(new Bun.Glob('**/*').scan({cwd:output,onlyFiles:true}))).sort();return Promise.all(files.map(async path=>[path,new Bun.CryptoHasher('sha256').update(await Bun.file(join(output,path)).bytes()).digest('hex')]));}
await build();const expected=JSON.stringify(await snapshot());
await Bun.write(join(output,'licenses/stale-cache-control-LICENSE'),'Stale dependency cache must not survive');
await Bun.write(join(output,'NOTICE.txt'),'Host path contamination control: /Users/example/go/pkg/mod /home/runner/go/pkg/mod');
await build();if(JSON.stringify(await snapshot())!==expected)throw Error('Compiler build retained stale licenses or host metadata');
const notice=await Bun.file(join(output,'NOTICE.txt')).text();if(/(?:\/Users\/|\/home\/|\/pkg\/mod\/)/.test(notice))throw Error('Compiler notice contains machine-specific paths');
console.log('Pinned compiler bytes and exact license inventory reproduce after stale-license and host-path injections.');
