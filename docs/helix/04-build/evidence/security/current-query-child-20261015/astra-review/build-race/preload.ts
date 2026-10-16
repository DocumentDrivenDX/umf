import {writeFileSync} from 'node:fs';
const original=Bun.build;
Bun.build=(async (options:any)=>{const result=await original(options);writeFileSync('tools/security/current-query-child-main.ts',"console.log('NEW_PINNED_BYTES');\n");return result;}) as typeof Bun.build;
