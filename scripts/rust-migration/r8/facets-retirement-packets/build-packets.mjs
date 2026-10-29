// SPDX-License-Identifier: MIT OR Apache-2.0
// Rebuild the exact four-operation Core Facets default-route packet set.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCoreFacetsRetirementPacket} from '../default-route-retirement-evidence.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const out=path.join(path.dirname(fileURLToPath(import.meta.url)));
for(const exportName of ['inspectCoreFacets','declareCoreFacets','verifyCoreFacetDeclaration','historicalCoreFacetPatch']){
 const target=path.join(out,`${exportName}.packet.json`),expected=JSON.stringify(createCoreFacetsRetirementPacket(root,exportName),null,2)+'\n';
 if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==expected)throw new Error(`${target} differs from exact R5 Core Facets predecessors`);}
 else fs.writeFileSync(target,expected);
 process.stdout.write(`${exportName}: ${JSON.stringify({sha256:(await import('node:crypto')).createHash('sha256').update(expected).digest('hex'),bytes:Buffer.byteLength(expected)})}\n`);
}
