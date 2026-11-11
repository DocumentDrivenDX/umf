// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runPortableExample} from './portable-example';
const result=runPortableExample();if(result.unchecked.join(',')!=='authorization')throw Error('Beginner fixture changed');
const manifest=JSON.parse(await readFile('docs/helix/05-deploy/microsite/dist/actions/manifest.json','utf8'));
for(const [file,expected]of Object.entries(manifest.outputs)){const bytes=await readFile('docs/helix/05-deploy/microsite/dist/actions/'+file);if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Stale asset '+file);}
console.log('Portable tutorial and generated assets checked');
