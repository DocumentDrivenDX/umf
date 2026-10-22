// Independent portable-model oracle for the owner Rust composition tests.
// No authenticated facts or native authorization are established here.
import {securityAnd,securityOr,securityNot,composeSecurityRules,type SecurityTruth} from '../../src/extensions/security/logic';
const values:SecurityTruth[]=['T','F','U'];
const truthVectors:{args:SecurityTruth[];and:SecurityTruth;or:SecurityTruth;not:SecurityTruth[]}[]=[];
function enumerate(args:SecurityTruth[],remaining:number):void {
  if(!remaining){truthVectors.push({args,and:securityAnd(args),or:securityOr(args),not:args.map(securityNot)});return;}
  for(const value of values)enumerate([...args,value],remaining-1);
}
for(let arity=1;arity<=4;arity++)enumerate([],arity);
const decisions=[];
for(const permit of values)for(const require of values)for(const forbid of values){
  const result=composeSecurityRules([{effect:'permit',truth:permit,disclosure:{salary:{kind:'withheld'}}},{effect:'require',truth:require},{effect:'forbid',truth:forbid}],['salary']);
  decisions.push({permit,require,forbid,decision:result.decision});
}
await Bun.write('/private/tmp/umf-security-weft-composition-oracle.json',JSON.stringify({scope:'Pure truth/composition correspondence; no trusted facts or native authorization',truthVectors,decisions},null,2)+'\n');
console.log(JSON.stringify({truthVectors:truthVectors.length,decisions:decisions.length}));
