import {compilePg18ProtectionCarrier} from '../../../tools/security/protection-pg18-carrier';
const requests=JSON.parse(await Bun.stdin.text());
console.log(JSON.stringify(requests.map((r:unknown)=>compilePg18ProtectionCarrier(r))));
