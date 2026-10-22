// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only actual source fixture for the installed two-wheel runtime proof. */
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {request,profile,mutateSource} from '../tests/compilation/access-fixtures';
const destination=process.argv[2];if(!destination?.startsWith('/private/tmp/'))throw Error('Explicit scratch destination required');
const q=request();q.package='runtime_fix';q.projections=[];
mutateSource(q,d=>{
 const record=d.modules[0]!.elements.find(e=>e.id==='Order')!;
 record.members=(record.members as {module:string;element:string}[]).filter(f=>f.element!=='placedAt');
 const view=d.modules[0]!.extensions['umf.access'].views[0]!;
 view.fields=view.fields.filter(f=>f.field.element!=='placedAt');
});
const p=profile();p.python.version='3.14.8';p.dependencies=[{distribution:'umf_access',version:'0.1.0.dev0'},{distribution:'pydantic',version:'2.14.1'}];
await mkdir(destination,{recursive:true});await writeFile(join(destination,'request.json'),JSON.stringify(q));await writeFile(join(destination,'profile.json'),JSON.stringify(p));
