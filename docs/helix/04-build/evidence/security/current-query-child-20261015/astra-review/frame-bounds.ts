import {encodeCurrentQueryFrame} from '/Users/erik/.codex/worktrees/security-main-integration/umf/tools/security/current-query-child';
const max=16*1024*1024,rows:any[]=[];
for(const [name,value,expected] of [['ascii-boundary','a'.repeat(max-2),true],['ascii-overflow','a'.repeat(max-1),false],['utf8-boundary','é'.repeat((max-2)/2),true],['utf8-overflow','é'.repeat((max-2)/2)+'x',false]] as const){let frame:Uint8Array|undefined;try{frame=encodeCurrentQueryFrame(value);}catch{}const passed=(!!frame===expected)&&(!frame||(frame.byteLength===max+4&&new DataView(frame.buffer,frame.byteOffset,4).getUint32(0)===max));rows.push({name,passed,admitted:!!frame,bytes:frame?.length});if(!passed)throw Error(name);}
console.log(JSON.stringify({controls:rows}));
