"""Private authored graph fixture, not catalog admission or production authority."""
import json
def seed_graph(admin,packet):
 phase='type-property-seed'
 for name,s in packet['specs'].items():
  admin.run("INSERT INTO truss.type_def(document_id,type_id,module,element,kind,since_rev,doc_ord,lineage_profile,lineage_bytes,definition_source_kind,definition_rev,definition_doc_ord,definition_document_id) VALUES('domain',:t,'m',:e,'record',0,0,'fixture',decode('01','hex'),'accepted_document',0,0,'domain')",t=int(s['owner']),e=name)
  for field,prop,col,scalar in s['fields']:
   admin.run("INSERT INTO truss.prop_def(prop_id,type_id,element,name,scalar_type,nullability,cardinality,home,since_rev,doc_ord,declaration_module,definition_source_kind,definition_rev,definition_doc_ord,definition_document_id) VALUES(:p,:t,:e,:n,:s,'required','one','json',0,0,'m','accepted_document',0,0,'domain')",p=int(prop),t=int(s['owner']),e=field,n=col,s=scalar)
 phase='relationship-seed'
 for rel,assoc,source,target,name in [(41,4,1,2,'Assignment'),(51,5,3,2,'Ownership')]:
  admin.run("INSERT INTO truss.rel_def(document_id,rel_type_id,module,rel_id,name,source_min,target_min,lifecycle,directed,assoc_type_id,since_rev,doc_ord,definition_source_kind,definition_rev,definition_doc_ord,definition_document_id) VALUES('domain',:r,'m',:n,:n,0,0,'independent',true,:a,0,0,'accepted_document',0,0,'domain')",r=rel,n=name,a=assoc)
  admin.run('INSERT INTO truss.rel_endpoint VALUES(:r,:s,:t)',r=rel,s=source,t=target)
 phase='object-seed'
 objects=[(1,1,{'101':'Alice','102':'pc_actor'}),(2,1,{'101':'Bob','102':'pc_other'}),(1,2,{'201':'A'}),(11,2,{'201':'B'}),(12,2,{'201':'D'}),(20,3,{'301':'RA'}),(21,3,{'301':'RAB'}),(22,3,{'301':'RB'}),(23,3,{'301':'RD'}),(24,3,{'301':'RO'})]
 for oid,t,props in objects:admin.run('INSERT INTO truss.object(id,type_id,props,rev) VALUES(:i,:t,:p::jsonb,0)',i=oid,t=t,p=json.dumps(props))
 phase='edge-seed'
 edges=[(100,41,1,1,1,2,{'401':'Alice','402':'A','403':True}),(101,41,1,1,11,2,{'401':'Alice','402':'B','403':False}),(102,41,2,1,11,2,{'401':'Bob','402':'B','403':True}),(200,51,20,3,1,2,{'501':'RA','502':'A'}),(201,51,22,3,11,2,{'501':'RB','502':'B'}),(202,51,23,3,12,2,{'501':'RD','502':'D'}),(203,51,21,3,1,2,{'501':'RAB','502':'A'}),(204,51,21,3,11,2,{'501':'RAB','502':'B'})]
 for i,r,s,st,t,tt,p in edges:admin.run('INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,props,rev) VALUES(:i,:r,:s,:st,:t,:tt,:p::jsonb,0)',i=i,r=r,s=s,st=st,t=t,tt=tt,p=json.dumps(p))

def graph_preflight(packet):
 sources=packet['sources'];guard_parts=['((SELECT valid FROM ('+v['validitySql']+') q)::boolean) IS TRUE' for v in sources.values()]
 for name,columns in [('Staff',['id']),('Project',['id']),('Resource',['id']),('Assignment',['employee_id','project_id']),('Ownership',['resource_id','project_id']),('Staff',['native_login'])]:
  guard_parts.append('NOT EXISTS(SELECT 1 FROM ('+sources[name]['sql']+') q GROUP BY '+','.join('"'+c+'"' for c in columns)+' HAVING count(*)<>1)')
 for rel,source_type,target_type,source_property,target_property,source_identity,target_identity in [(41,1,2,'401','402','101','201'),(51,3,2,'501','502','301','201')]:
  guard_parts.append("NOT EXISTS(SELECT 1 FROM truss.edge e LEFT JOIN truss.object s ON s.id=e.source_id AND s.type_id=e.source_type LEFT JOIN truss.object t ON t.id=e.target_id AND t.type_id=e.target_type WHERE e.rel_type_id="+str(rel)+" AND (e.source_type<>"+str(source_type)+" OR e.target_type<>"+str(target_type)+" OR s.id IS NULL OR t.id IS NULL OR (e.props->>'"+source_property+"') IS DISTINCT FROM (s.props->>'"+source_identity+"') OR (e.props->>'"+target_property+"') IS DISTINCT FROM (t.props->>'"+target_identity+"')))")
 guard=' AND '.join('('+p+')' for p in guard_parts)
 return guard,guard_parts

GRAPH_MUTATIONS = [('missing-active', "UPDATE truss.edge SET props=props-'403' WHERE id=100"), ('wrong-active-domain', 'UPDATE truss.edge SET props=jsonb_set(props,\'{403}\',\'"true"\') WHERE id=100'), ('wrong-logical-endpoint', 'UPDATE truss.edge SET props=jsonb_set(props,\'{402}\',\'"D"\') WHERE id=100'), ('wrong-native-endpoint', 'UPDATE truss.edge SET target_id=12 WHERE id=100'), ('duplicate-staff-key', 'INSERT INTO truss.object(id,type_id,props,rev) VALUES(3,1,\'{"101":"Alice","102":"other"}\',0)'), ('duplicate-subject-login', 'INSERT INTO truss.object(id,type_id,props,rev) VALUES(3,1,\'{"101":"Carol","102":"pc_actor"}\',0)'), ('retired-resource-type', 'UPDATE truss.type_def SET retired_rev=0 WHERE type_id=3'), ('retired-assignment-relation', 'UPDATE truss.rel_def SET retired_rev=0 WHERE rel_type_id=41'), ('missing-owner-property', "UPDATE truss.edge SET props=props-'501' WHERE id=200"), ('wrong-active-metadata', "UPDATE truss.prop_def SET scalar_type='string' WHERE prop_id=403"), ('missing-resource-key', "UPDATE truss.object SET props='{}' WHERE type_id=3 AND id=24")]
