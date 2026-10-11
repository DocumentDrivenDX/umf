import {mkdir} from 'node:fs/promises';
const output='.cache/actions-documentation-browser';await mkdir(output,{recursive:true});
const command=['docker','run','--rm',...(process.env.UMF_DOCS_BASE?[]:['--network','none']),'-v',process.cwd()+':/work:ro','-v',process.cwd()+'/'+output+':/out','-e','UMF_CHROMIUM_PATH=/ms-playwright/chromium-1243/'+(process.arch==='arm64'?'chrome-linux-arm64':'chrome-linux64')+'/chrome',...(process.env.UMF_DOCS_BASE?['-e','UMF_DOCS_BASE='+process.env.UMF_DOCS_BASE]:[]),'--entrypoint','node','mcr.microsoft.com/playwright:v1.63.0-noble','/work/scripts/actions-docs/browser-driver.cjs'];
const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error('Documentation browser gate failed');
