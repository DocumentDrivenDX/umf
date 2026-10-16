import {writeFileSync} from 'node:fs';
const original=Bun.build;let calls=0;Bun.build=(async(options:any)=>{const result=await original(options);calls++;return result;}) as typeof Bun.build;
