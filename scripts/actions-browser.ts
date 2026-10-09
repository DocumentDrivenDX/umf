// @covers US-078-AC9
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as api from '../src/index';
import {runActionsCorpus} from '../tests/actions/browser-corpus';
import approve from '../fixtures/actions/approve.json';
import create from '../fixtures/actions/create-link.json';
import ddd from '../fixtures/actions/ddd-binding.json';
import type {Document} from '../src/model/types';
const directory=await mkdtemp(join(tmpdir(),'umf-actions-browser-'));
try{
 const fixtures=[approve,create,ddd] as unknown as Document[],expected=runActionsCorpus(api,fixtures);
 await Bun.write(join(directory,'expected.json'),JSON.stringify(expected));await Bun.write(join(directory,'fixtures.json'),JSON.stringify(fixtures));
 const probe=await Bun.build({entrypoints:['tests/actions/browser-corpus.ts'],outdir:directory,naming:'probe.js',target:'browser',format:'esm'});if(!probe.success)throw Error(probe.logs.join('\n'));
 const image='mcr.microsoft.com/playwright:v1.63.0-noble';
 const child=Bun.spawn(['docker','run','--rm','--network','none','-v',process.cwd()+':/work:ro','-v',directory+':/out','-e','UMF_CHROMIUM_PATH=/ms-playwright/chromium-1243/chrome-linux-arm64/chrome','--entrypoint','node',image,'/work/scripts/actions-browser-driver.cjs','/out'],{stdout:'inherit',stderr:'inherit'});
 if(await child.exited)throw Error('Public action Chromium qualification failed');
 const report=JSON.parse(await Bun.file(join(directory,'browser.json')).text());
 const actionPaths:string[]=[];for await(const path of new Bun.Glob('*.ts').scan({cwd:'src/extensions/actions'}))actionPaths.push('src/extensions/actions/'+path);
 const inputs=['src/index.ts','spec/extensions/actions/package.json','spec/extensions/actions/schema.json','dist/umf.js','fixtures/actions/approve.json','fixtures/actions/create-link.json','fixtures/actions/ddd-binding.json','fixtures/actions/composite-key.json','fixtures/actions/association-record.json','fixtures/actions/cases.json','tests/actions/case-corpus.ts','tests/actions/browser-corpus.ts','scripts/actions-browser.ts','scripts/actions-browser-driver.cjs',...actionPaths];
 report.bun=Bun.version;report.playwright='1.63.0';report.image=image;report.sha256={};
 for(const path of inputs)report.sha256[path]=createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
 await Bun.write('fixtures/actions/browser.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({browser:report.browser,bun:Bun.version,fixtures:fixtures.length,bunParity:true,externalRequests:report.externalRequests}));
}finally{await rm(directory,{recursive:true,force:true});}
