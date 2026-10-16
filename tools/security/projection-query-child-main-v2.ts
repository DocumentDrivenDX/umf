/** One private framed stdin/stdout child. The native parent owns the deadline/lifetime. */
import {ProjectionQueryChildSession,PROJECTION_QUERY_LIMITS} from './projection-query-child-v2';
const session=new ProjectionQueryChildSession();let pending=Buffer.alloc(0);
try{
 for await(const chunk of Bun.stdin.stream()){
  pending=Buffer.concat([pending,chunk]);
  while(pending.length>=4){const length=pending.readUInt32BE(0);if(length<1||length>PROJECTION_QUERY_LIMITS.requestBytes)throw Error('frame');if(pending.length<4+length)break;
   const frame=pending.subarray(0,4+length);pending=pending.subarray(4+length);const result=session.process(frame);await Bun.write(Bun.stdout,result);
  }
 }
 if(pending.length)throw Error('truncated');
}catch{await Bun.write(Bun.stderr,'UMF_QUERY_CHILD_V2_REFUSED\n');process.exitCode=2;}
