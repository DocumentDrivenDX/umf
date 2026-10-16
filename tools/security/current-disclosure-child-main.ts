/** Private framed child. The native parent owns deadline, original caller and guarded release. */
import {CurrentDisclosureChildSession,DISCLOSURE_CHILD_LIMITS} from './current-disclosure-child';
const session=new CurrentDisclosureChildSession();let pending=Buffer.alloc(0);
try {
 for await(const chunk of Bun.stdin.stream()) {
  pending=Buffer.concat([pending,chunk]);
  while(pending.length>=4) {
   const length=pending.readUInt32BE(0);if(length<1||length>DISCLOSURE_CHILD_LIMITS.requestBytes)throw Error('frame');
   if(pending.length<4+length)break;
   const frame=pending.subarray(0,4+length);pending=pending.subarray(4+length);
   await Bun.write(Bun.stdout,session.process(frame));
  }
 }
 if(pending.length)throw Error('truncated');
} catch {await Bun.write(Bun.stderr,'UMF_DISCLOSURE_CHILD_REFUSED\n');process.exitCode=2;}
