/** Native host adapter. No policy permission or native admission is returned. */
import {compilePg18ProtectionCatalog} from '../../../tools/security/protection-pg18-catalog';
const input=JSON.parse(await Bun.stdin.text());
console.log(JSON.stringify(compilePg18ProtectionCatalog(input.catalog,input.closure,input.profile)));
