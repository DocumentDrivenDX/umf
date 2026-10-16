/** Host retains this private process through native SQL and final data inspection. */
import {CurrentNativeDisclosureChildSession} from './current-native-disclosure-child';
const session=new CurrentNativeDisclosureChildSession();let pending=Buffer.alloc(0);
try {
 for await(const chunk of Bun.stdin.stream()) {
  pending=Buffer.concat([pending,chunk]);
  while(pending.length>=4) {
   const length=pending.readUInt32BE(0);if(length<1||length>session.maximumRequestBytes)throw Error('frame');
   if(pending.length<4+length)break;
   const frame=pending.subarray(0,4+length);pending=pending.subarray(4+length);
   await Bun.write(Bun.stdout,session.process(frame));
  }
 }
 if(pending.length||!session.inspectionCompleted)throw Error('incomplete');
} catch {await Bun.write(Bun.stderr,'UMF_NATIVE_DISCLOSURE_CHILD_REFUSED\n');process.exitCode=2;}
