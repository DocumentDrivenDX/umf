/** Real-browser replay of actual portable backend predicate source. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
const nativePath = 'docs/helix/04-build/evidence/security/truss-policy-lowering.json';
const native = await Bun.file(nativePath).json();
const typedPath = 'docs/helix/04-build/evidence/security/truss-type-selection.json';
const typedNative = await Bun.file(typedPath).json();
const transportPath = 'docs/helix/04-build/evidence/security/weft-handoff.json';
const transport = await Bun.file(transportPath).json();
const source = '/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts';
const paths = ['/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts',source, 'tools/security/truss-predicate-browser.ts', nativePath, transportPath, typedPath];
const digest = async (p: string) => createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
for (const [p, value] of Object.entries(native.sourceDigests)) if (await digest(p) !== value) throw new Error('Stale original native predicate source');
const before = Object.fromEntries(await Promise.all(paths.map(async p => [p, await digest(p)])));
const homes: Record<string, string> = { Staff: 'employee', Project: 'project', Resource: 'resource', Assignment: 'm2m_employee_project', Ownership: 'm2m_resource_project' };
const columns: Record<string, Record<string, string>> = { Staff: { staffId: 'id' }, Project: { projectId: 'id' }, Resource: { resourceId: 'id' }, Assignment: { assignmentStaff: 'employee_id', assignmentProject: 'project_id', active: 'active' }, Ownership: { ownerResource: 'resource_id', ownerProject: 'project_id' } };
function input(artifact: any) {
  const ontology = JSON.parse(artifact.request.ontologyJson), document = JSON.parse(artifact.request.modules[0].documentJson);
  const elements = new Map<string, any>(document.modules[0].elements.map((e: any) => [e.id, e]));
  const qualified = (elementId: string) => ({ documentId: 'domain', moduleId: 'm', elementId });
  return { logicalPlan: artifact.handoff.securityLogicalPlan, action: 'read', target: qualified('Resource'), subject: ontology.subject, subjectLoginColumn: 'native_login',
    types: [...ontology.entities, ...ontology.associations].map((t: any) => {
      const name = t.type.elementId, key = elements.get(name).keys.find((k: any) => k.id === t.keyId);
      return { type: t.type, keyId: t.keyId, keyFields: key.fields.map((f: any) => ({ ref: qualified(f.element), column: columns[name]![f.element] })),
        fields: t.fields.filter((f: any) => columns[name]![f.ref.elementId]).map((f: any) => ({ ref: f.ref, column: columns[name]![f.ref.elementId] })),
        home: { schema: 'security_raw', table: homes[name] }, endpoints: t.endpoints };
    }) };
}
const original = input(transport.artifacts.find((a: any) => a.id === 'natural-count-self-join'));
const selected: any = structuredClone(original); selected.resourceDiscriminatorParameter = 2;
const typeIds: Record<string,string> = {Staff:'1',Project:'2',Resource:'3',Assignment:'11',Ownership:'12'};
for (const type of selected.types) {
  const name = type.type.elementId; type.home = {schema:'shared_component',table:['Staff','Project','Resource'].includes(name)?'entity':'association'};
  type.discriminator = {column:'type_id',carrier:'int4',value:typeIds[name]};
  for (const field of [...type.fields,...type.keyFields]) if (['assignmentStaff','ownerResource'].includes(field.ref.elementId)) field.column='source_key'; else if (['assignmentProject','ownerProject'].includes(field.ref.elementId)) field.column='target_key';
}
const weakened = input({ request: native.loweredPolicy.weakened.request, handoff: native.loweredPolicy.weakened.handoff });
const build = await Bun.build({ entrypoints: [source], target: 'browser', format: 'esm' });
if (!build.success) throw new Error('Portable predicate build failed');
const js = await build.outputs[0]!.text();
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
  return new URL(req.url).pathname === '/predicate.js' ? new Response(js, { headers: { 'content-type': 'text/javascript' } }) : new Response('<!doctype html><title>Truss predicate</title>');
} });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: Bun.env.UMF_CHROMIUM_PATH });
  const page = await browser.newPage(); let external = 0;
  await page.route('**/*', route => { if (new URL(route.request().url()).hostname !== '127.0.0.1') { external++; return route.abort(); } return route.continue(); });
  await page.goto(`http://127.0.0.1:${server.port}`);
  const observed = await page.evaluate(async ({ original, weakened, selected }) => {
    const url = '/predicate.js'; const m = await import(url);
    const shared = structuredClone(original);
    const project = shared.types.find((t: any) => t.type.elementId === 'Project'), staff = shared.types.find((t: any) => t.type.elementId === 'Staff');
    if (!project || !staff) throw new Error('Missing authored fixture types');
    project.home = staff.home;
    let sharedHomeRefused = false; try { m.lowerSecurityRowPredicate(shared); } catch (error) { sharedHomeRefused = error instanceof Error && error.message === 'TRUSS_SECURITY_PREDICATE_UNSUPPORTED'; }
    const absentRoot = structuredClone(selected); delete absentRoot.resourceDiscriminatorParameter;
    const overlap = structuredClone(selected); overlap.types.find((t:any)=>t.type.elementId==='Project').discriminator.value='1';
    const typedRefusals=[absentRoot,overlap].map(value=>{try{m.lowerSecurityRowPredicate(value);return false;}catch(error){return error instanceof Error && error.message==='TRUSS_SECURITY_PREDICATE_UNSUPPORTED';}});
    return { selected: m.lowerSecurityRowPredicate(selected), typedRefusals, original: m.lowerSecurityRowPredicate(original), weakened: m.lowerSecurityRowPredicate(weakened), sharedHomeRefused, hostGlobals: ['Bun', 'process', 'Buffer'].filter(k => k in globalThis) };
  }, { original, weakened, selected });
  if (observed.selected !== typedNative.predicate || observed.typedRefusals.some(value=>!value) || observed.original !== native.loweredPolicy.original.predicate || observed.weakened !== native.loweredPolicy.weakened.predicate || !observed.sharedHomeRefused || observed.hostGlobals.length || external) throw new Error('Browser/native predicate correspondence failed');
  for (const p of paths) if (before[p] !== await digest(p)) throw new Error('Predicate source changed during browser run');
  await Bun.write('docs/helix/04-build/evidence/security/truss-predicate-browser.json', JSON.stringify({ status: 'passed', sourceDigests: before, browser: await browser.version(), originalSqlMatches: true, weakenedSqlMatches: true, typedSqlMatches: true, typedRefusals:observed.typedRefusals, sharedHomeRefused: observed.sharedHomeRefused, externalRequests: external, hostGlobals: observed.hostGlobals, scope: 'Actual portable Truss row-predicate lowerer in real Chromium emits exact original and weakened SQL retained from native fixture execution. No complete browser security admission, host issuer, graph/native release or production profile qualification.' }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'passed', predicates: 3, browser: await browser.version() }));
} finally { if (browser) await browser.close(); server.stop(true); }
