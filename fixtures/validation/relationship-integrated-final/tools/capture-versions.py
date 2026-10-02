import hashlib,json
from pathlib import Path
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def entry(file,pointers,scope):
 p='fixtures/validation/'+file;r=json.loads(Path(p).read_text());versions={};checks=[]
 for label,pointer in pointers.items():
  v=r
  for k in pointer.split('/')[1:]:v=v[k]
  versions[label]=v;checks.append({'path':p,'pointer':pointer,'expected':v})
 return {'versions':versions,'scope':scope,'evidence':{p:sha(p)},'checks':checks}
systems={
 'tablespec':entry('relationship-tablespec-projection-native.json',{'commit':'/nativeVersion','pydantic':'/versions/pydantic','jsonschema':'/versions/jsonschema'},'Outgoing metadata and explicit column pairs; no referential enforcement or join execution'),
 'postgresql':entry('relationship-postgresql-native.json',{'server':'/serverVersion'},'Qualified authored FK/junction mappings with insertion/rejection controls; broader multiplicity, ownership and inverse intent remain residuals'),
 'sqlserver':entry('relationship-sqlserver-native.json',{'server':'/serverVersion'},'Qualified FK/junction layouts and catalog observations; domain lifecycle and participation remain explicit residuals'),
 'avro':entry('relationship-avro-projection-native.json',{'apache':'/versions/apache','fastavro':'/versions/fastavro'},'Target-key-record schema carriers with native codec controls; no referential enforcement'),
 'parquet':entry('relationship-parquet-native.json',{'pyarrow':'/version'},'Target-key file-schema carriers and retained bytes; no reference enforcement'),
 'graphql':entry('relationship-extras/oracle.json',{'graphqlJs':'/versions/graphqlJs','graphqlCore':'/versions/graphqlCore'},'Generic Record relationship SDL; no resolver or instance referential validation'),
 'rdf':entry('relationship-extras/oracle.json',{'rdflib':'/versions/rdflib'},'RDF declaration graph acceptance; no closed-world relationship enforcement'),
 'linkml':entry('relationship-extras/oracle.json',{'metamodel':'/versions/linkmlMetamodel','runtime':'/versions/linkmlRuntime'},'Native metamodel/schema acceptance; no instance relationship enforcement'),
}
b=entry('relationship-conformance-browser.json',{'browser':'/browser'},'Canonical relationship authoring, migration, retained recovery and refusal corpus');b['version']=b.pop('versions')['browser']
Path('fixtures/validation/relationship-integrated-versions.json').write_text(json.dumps({'systems':systems,'browser':b},indent=2)+'\n')
