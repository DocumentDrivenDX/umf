import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runPortableExample} from './portable-example';
const result=runPortableExample();if(result.unchecked.join(',')!=='authorization')throw Error('Beginner fixture changed');
const manifest=JSON.parse(await readFile('docs/helix/05-deploy/microsite/dist/actions/manifest.json','utf8'));
for(const [file,expected]of Object.entries(manifest.outputs)){const bytes=await readFile('docs/helix/05-deploy/microsite/dist/actions/'+file);if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Stale asset '+file);}
const original='807a379eae15cf49998890c3ac02f16837192dfde46f1730d438fd1dda7c18da';if(createHash('sha256').update(await readFile('docs/helix/04-build/evidence/actions-certification.json')).digest('hex')!==original)throw Error('Historical certificate changed');
console.log('Portable tutorial, generated assets and unchanged historic certificate checked');
