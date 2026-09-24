import assert from 'node:assert/strict';
import {projectRelationshipToTableSpec} from '../../src/core-ideals/relationship-tablespec-projection';
import {getTableSpecTable,exportTableSpec,exportTableSpecBundle} from '../../src/adapters/tablespec';
import {renderTree} from '../../src/model/native-json';
import {lookupCoreRelationship} from '../../src/model/relationships';
import {relationshipTableSpecProjectionCases} from './relationship-tablespec-projection-cases';
const rows=[],refusals=[];
for(const c of relationshipTableSpecProjectionCases()){
 const r=projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request);assert.equal(r.status,c.expected);
 if(c.name.startsWith('invalid-native-')&&c.request.mode==='report'){assert.equal(r.status,'blocked');refusals.push({name:c.name,native:renderTree(getTableSpecTable(c.nativeSource))});}
 if(r.target)rows.push({name:c.name,native:renderTree(getTableSpecTable(r.target)),original:renderTree(getTableSpecTable(c.nativeSource)),target:renderTree(getTableSpecTable(c.nativeTarget)),archive:(r.target.extensions!['umf.tablespec'] as any).splitFiles?exportTableSpecBundle(r.target):exportTableSpec(r.target),columns:c.request.columns,relationship:lookupCoreRelationship(c.source,c.request.relationship).relationship});
}
assert.equal(rows.length,12);
await Bun.write('fixtures/validation/relationship-tablespec-projected-schemas.json',JSON.stringify(rows,null,2)+'\n');
await Bun.write('fixtures/validation/relationship-tablespec-native-refusals.json',JSON.stringify(refusals,null,2)+'\n');
const child=Bun.spawn([process.env.UMF_TABLESPEC_PYTHON??'/home/erik/Projects/tablespec/.venv/bin/python','scripts/core-ideals/relationship-tablespec-projection-oracle.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await child.exited,0);
