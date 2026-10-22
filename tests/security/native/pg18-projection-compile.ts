/** Host-only batch adapter for independent native projection qualification. */
import {compilePg18ProtectionExpression} from '../../../tools/security/protection-pg18-expressions';
const requests:unknown=JSON.parse(await Bun.stdin.text());
if(!Array.isArray(requests)||requests.length>2048)throw new Error('Bounded request array required');
console.log(JSON.stringify(requests.map(compilePg18ProtectionExpression)));
