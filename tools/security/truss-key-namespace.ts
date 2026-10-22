import {createSecurityKeyNamespaceVerifier} from '/Users/erik/Projects/truss/packages/postgresql/src/security-key-namespace.ts';
const {cases}=JSON.parse(await Bun.stdin.text());
const outputs=new Map<string,string>(cases.filter((c:any)=>c.canonicalValues).map((c:any)=>[JSON.stringify(c.canonicalValues),c.canonicalHex]));
const observed=[];
for(const test of cases){
 const selection=structuredClone(test.selection);
 const verifier=createSecurityKeyNamespaceVerifier(selection,(values)=>{const original=outputs.get(JSON.stringify(values));if(!original)throw Error('Unobserved native namespace producer input');return original;});
 selection.sourceEpoch='changed-after-registration';selection.encoding.sha256='0'.repeat(64);
 const accepted=await verifier.matches(test.stored);
 if(accepted!==test.expected)throw Error('Namespace correspondence mismatch: '+test.id);
 observed.push({id:test.id,expected:test.expected,observed:accepted});
}
process.stdout.write(JSON.stringify({observations:observed})+'\n');
