/** Reviewed physical SQL probe bridge; no compiler/installation authority. */
import {lowerSecuritySourceCompleteness} from '/Users/erik/Projects/truss/packages/postgresql/src/security-source-completeness';
console.log(JSON.stringify({sql:lowerSecuritySourceCompleteness(JSON.parse(await Bun.stdin.text()))}));
