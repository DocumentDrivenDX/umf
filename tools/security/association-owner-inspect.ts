import {loadUmfProducer} from './truss/packages/umf-bun/src/index';
const packet=JSON.parse(await Bun.stdin.text());
const owner=await loadUmfProducer(packet.ownerDirectory);
try{
 const result=owner.inspect(packet.originalText);
 console.log(JSON.stringify({valid:result.sourceValidation.valid,targetValid:result.targetValidation?.valid??null,originalUnchanged:result.originalText===packet.originalText,sourceRevision:owner.sourceRevision,bundleSha256:owner.bundleSha256}));
}catch(error){console.log(JSON.stringify({valid:false,diagnostic:String(error)}));}
