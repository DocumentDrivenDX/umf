import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {copyJson} from '../../src/model/json';
// Each accepted UTF-16 unit can require six JSON escape bytes, then base64url encoding.
const maximumCredentialLength=4*Math.ceil((3*256*6+64)/3)+44;
export interface TrustedActionSession {tenant:string;principal:string;service:string}
function session(input:unknown):TrustedActionSession {
 const value=copyJson(input) as unknown as TrustedActionSession;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['tenant','principal','service'].includes(k))||['tenant','principal','service'].some(k=>typeof (value as any)[k]!=='string'||!(value as any)[k]||(value as any)[k].length>256))throw Error('AUTHENTICATION');return value;
}
/** Qualification issuer only. Signing authority is never passed to handlers or documents. */
export class ReferenceActionIssuer {
 private readonly secret=randomBytes(32);
 issue(identity:TrustedActionSession):string {const body=Buffer.from(JSON.stringify(session(identity))).toString('base64url');return body+'.'+createHmac('sha256',this.secret).update(body).digest('base64url');}
 authenticate(credential:unknown):TrustedActionSession {
  if(typeof credential!=='string'||credential.length>maximumCredentialLength)throw Error('AUTHENTICATION');const parts=credential.split('.');if(parts.length!==2)throw Error('AUTHENTICATION');const [body,signature]=parts as [string,string];
  const expected=createHmac('sha256',this.secret).update(body).digest(),actual=Buffer.from(signature,'base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected)||actual.toString('base64url')!==signature)throw Error('AUTHENTICATION');
  try{const text=Buffer.from(body,'base64url');if(text.toString('base64url')!==body)throw Error('AUTHENTICATION');return session(JSON.parse(text.toString('utf8')));}catch{throw Error('AUTHENTICATION');}
 }
}
