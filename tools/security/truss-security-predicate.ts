/** Host inspection bridge to the actual Truss portable PostgreSQL lowerer. */
import { lowerSecurityRowPredicate, type SecurityPhysicalType } from '/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts';
const input = await Bun.stdin.text();
if (input.length > 16000000) throw new Error('Input bound');
const { artifact, homes, columns } = JSON.parse(input);
const ontology = JSON.parse(artifact.request.ontologyJson), document = JSON.parse(artifact.request.modules[0].documentJson);
const elements = new Map<string, any>(document.modules[0].elements.map((e: any) => [e.id, e]));
const native = new Map<string, string>(columns.map(([target, field, column]: string[]) => [JSON.stringify([target, field]), column]));
const qualified = (id: string) => ({ documentId: 'domain', moduleId: 'm', elementId: id });
const types: SecurityPhysicalType[] = [...ontology.entities, ...ontology.associations].map((t: any) => {
  const name = t.type.elementId, record = elements.get(name), key = record.keys.find((k: any) => k.id === t.keyId);
  const field = (id: string) => {
    const column = native.get(JSON.stringify([name, id])); if (!column) throw new Error('Missing native field');
    return { ref: qualified(id), column };
  };
  return { type: t.type, keyId: t.keyId, keyFields: key.fields.map((f: any) => field(f.element)),
    fields: t.fields.filter((f: any) => native.has(JSON.stringify([name, f.ref.elementId]))).map((f: any) => field(f.ref.elementId)),
    home: { schema: homes[name][1], table: homes[name][2] }, endpoints: t.endpoints };
});
const sql = lowerSecurityRowPredicate({ logicalPlan: artifact.handoff.securityLogicalPlan, action: 'read', target: qualified('Resource'),
  subject: ontology.subject, subjectLoginColumn: 'native_login', types });
process.stdout.write(JSON.stringify({ version: 'truss.security.row-predicate/0.1.0', sql }) + '\n');
