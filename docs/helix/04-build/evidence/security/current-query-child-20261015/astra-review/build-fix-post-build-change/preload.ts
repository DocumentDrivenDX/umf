import {writeFileSync} from 'node:fs';
const original=Bun.build;let calls=0;Bun.build=(async(options:any)=>{const result=await original(options);calls++;if(calls===2)writeFileSync('tools/security/current-query-child-main.ts',"console.log('NEW_PINNED_BYTES');\n");return result;}) as typeof Bun.build;
