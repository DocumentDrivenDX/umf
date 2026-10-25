// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare the opt-in Node/Rust model operation with the frozen TypeScript packet.
import assert from 'node:assert/strict';
import {createCoreModelEngine} from '../../../bindings/core/node/index.js';
import frozen from '../../../docs/helix/04-build/evidence/rust-migration/r5-scalar-type-inspection/frozen-typescript.json' with {type:'json'};
import coreSchema from '../../../spec/core/schema.json' with {type:'json'};
import referenceSchema from '../../../spec/core/semantic-type-reference.schema.json' with {type:'json'};
import packageSchema from '../../../spec/core/extension-package.schema.json' with {type:'json'};
import constraints from '../../../spec/metamodel/generated/core-constraints.json' with {type:'json'};
import domainPolicy from '../../../spec/metamodel/generated/domain-policy.json' with {type:'json'};

const engine=createCoreModelEngine({coreSchema,referenceSchema,packageSchema,constraints,domainPolicy});
for(const [name,{source,identity}] of Object.entries(frozen.cases)){
  let actual;
  try{actual={ok:true,value:engine.inspectCoreScalarType(source,identity)};}
  catch(error){actual={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}};}
  assert.equal(JSON.stringify(actual),JSON.stringify(frozen.outcomes[name]),name);
  console.log(`${name}: exact match`);
}
