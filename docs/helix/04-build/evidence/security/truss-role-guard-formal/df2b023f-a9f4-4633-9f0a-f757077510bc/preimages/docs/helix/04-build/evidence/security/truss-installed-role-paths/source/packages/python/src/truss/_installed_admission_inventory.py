"""Private PG16.15 installed correspondence; never readiness or protected cut.

The trusted administrative port materializes before admission. Limits bound only
retained results. Exact owner SQL comes from pinned PG17 observation proposals;
the exercised PG16.15 subset excludes MAINTAIN and other PG17 privilege meaning.
"""
from dataclasses import dataclass
import hashlib
import json
from importlib.resources import files
from typing import Protocol

Cell = str | bool | int | None

@dataclass(frozen=True)
class QueryResult:
    columns: tuple[str, ...]
    rows: tuple[tuple[Cell, ...], ...]

class InventoryPort(Protocol):
    def query(self, sql: str, parameters: dict[str, object]) -> QueryResult: ...

@dataclass(frozen=True)
class Section:
    name: str
    result: QueryResult

@dataclass(frozen=True)
class Inventory:
    sections: tuple[Section, ...]
    maximum_rows: int
    maximum_text_units: int
    ordinary_role: str
    production_cut: str = 'unresolved'

@dataclass(frozen=True)
class RoutineDeclaration:
    name: str
    body_sha256: str
    owner: str
    argument_oids: str
    result_type: str
    native_definition: str
    security_definer: bool = False

@dataclass(frozen=True)
class Correspondence:
    result: str
    reasons: tuple[str, ...]
    unresolved: tuple[str, ...]

class InventoryRefusal(ValueError):
    pass

HOMES = ('schema_head', 'row_home_operation', 'source_epoch_current',
         'source_epoch_registry', 'installation_admission', 'operation_configuration')
UNRESOLVED = ('protected_cut_and_freshness', 'original_producer_and_ingress_accounting',
              'static_string_bodied_and_dynamic_dependencies', 'external_wrappers',
              'shared_dependencies_and_set_role_paths', 'triggers_defaults_rls',
              'operators_types_and_extension_routes', 'protected_capture_and_writer')

CONTEXT = """SELECT pg_catalog.current_setting('server_version_num') AS version,
 pg_catalog.current_setting('search_path') AS path, current_user::pg_catalog.text AS acting,
 session_user::pg_catalog.text AS person, pg_catalog.current_database() AS database,
 pg_catalog.pg_backend_pid()::pg_catalog.text AS backend"""
ROUTINES = """SELECT p.oid::text AS oid,n.oid::text AS namespace_oid,
 p.proowner::text AS owner_oid,r.rolname AS owner,p.proname AS name,
 p.proargtypes::text AS argument_oids,p.prosecdef AS definer,
 p.proconfig::text AS settings,p.prosrc AS body,l.oid::text AS language_oid,
 l.lanname AS language,pg_get_functiondef(p.oid) AS definition,
 p.proacl::text AS acl,pg_get_function_result(p.oid) AS result_type,
 p.provolatile::text AS volatility,p.proparallel::text AS parallel,
 p.proisstrict AS strict,p.proleakproof AS leakproof FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
 JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE n.nspname='truss' ORDER BY p.oid"""
RELATIONS = """SELECT c.oid::text AS oid,c.relname AS name,c.relnamespace::text AS namespace_oid,
 c.relowner::text AS owner_oid,c.relkind::text AS kind,c.relnatts::text AS attributes
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='truss' AND c.relname=ANY(:homes::pg_catalog.text[]) ORDER BY c.oid"""
EFFECTIVE = """SELECT 'schema'::text AS kind,n.nspname::text AS object,
 ''::text AS subobject,v.privilege,
 pg_catalog.has_schema_privilege(:role,n.oid,v.privilege) AS allowed
 FROM pg_catalog.pg_namespace n CROSS JOIN (VALUES ('USAGE'),('CREATE')) v(privilege)
 WHERE n.nspname='truss'
 UNION ALL SELECT 'routine',p.proname,p.proargtypes::text,'EXECUTE',
 pg_catalog.has_function_privilege(:role,p.oid,'EXECUTE') FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='truss'
 UNION ALL SELECT 'relation',c.relname,'',v.privilege,
 pg_catalog.has_table_privilege(:role,c.oid,v.privilege) FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
 WHERE n.nspname='truss' AND c.relname=ANY(:homes::pg_catalog.text[])
 UNION ALL SELECT 'column',c.relname,a.attname,v.privilege,
 pg_catalog.has_column_privilege(:role,c.oid,a.attnum,v.privilege)
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
 CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilege)
 WHERE n.nspname='truss' AND c.relname=ANY(:homes::pg_catalog.text[]) AND a.attnum>0 AND NOT a.attisdropped
 ORDER BY 1,2,3,4"""
ROLES = """SELECT oid::text AS oid,rolname AS name,rolsuper AS superuser,
 rolinherit AS inherit,rolcreaterole AS create_role,rolcreatedb AS create_db,
 rolcanlogin AS login,rolreplication AS replication,rolbypassrls AS bypass_rls
 FROM pg_catalog.pg_roles WHERE rolname=ANY(:roles::pg_catalog.text[]) ORDER BY oid"""


ROLE_REACHABILITY = """SELECT r.oid::text AS oid,r.rolname::text AS name,
 pg_catalog.pg_has_role(:role,r.oid,'MEMBER') AS member,
 pg_catalog.pg_has_role(:role,r.oid,'USAGE') AS immediate,
 pg_catalog.pg_has_role(:role,r.oid,'SET') AS settable,
 pg_catalog.pg_has_role(:role,r.oid,'MEMBER WITH ADMIN OPTION') AS admin_option
 FROM pg_catalog.pg_roles r
 WHERE pg_catalog.pg_has_role(:role,r.oid,'MEMBER') ORDER BY r.oid"""


def collect_inventory(port: InventoryPort, *, ordinary_role: str,
                      maximum_rows: int = 1024, maximum_text_units: int = 1_048_576) -> Inventory:
    if (type(ordinary_role) is not str or not ordinary_role or len(ordinary_role)>128
        or type(maximum_rows) is not int or not 1<=maximum_rows<=4096
        or type(maximum_text_units) is not int or not 1<=maximum_text_units<=4_194_304):
        raise InventoryRefusal('shape')
    retained: list[Section] = []
    budget = maximum_text_units
    row_budget = maximum_rows
    def read(name: str, sql: str, parameters: dict[str, object]) -> QueryResult:
        nonlocal budget,row_budget
        # Overflow row is retained only as a refusal, never a complete prefix.
        result=port.query('SELECT * FROM ('+sql+') AS inventory_read LIMIT :row_ceiling',
                          dict(parameters,row_ceiling=row_budget+1))
        if type(result) is not QueryResult or type(result.columns) is not tuple or type(result.rows) is not tuple:
            raise InventoryRefusal('shape')
        if len(result.rows)>row_budget: raise InventoryRefusal('resource')
        row_budget-=len(result.rows)
        if len(result.columns)>32: raise InventoryRefusal('resource')
        for column in result.columns:
            if type(column) is not str: raise InventoryRefusal('shape')
            budget-=len(column)
        for row in result.rows:
            if type(row) is not tuple or len(row)!=len(result.columns): raise InventoryRefusal('shape')
            for cell in row:
                if type(cell) not in (str,bool,int,type(None)): raise InventoryRefusal('shape')
                if type(cell) is str: budget-=len(cell)
                if type(cell) is int and not -(2**63)<=cell<2**63: raise InventoryRefusal('shape')
        if budget<0: raise InventoryRefusal('resource')
        retained.append(Section(name,result))
        return result
    context=read('context',CONTEXT,{})
    if len(context.rows)!=1 or context.rows[0][:2]!=('160015','pg_catalog, pg_temp'):
        raise InventoryRefusal('context')
    routines=read('routines',ROUTINES,{})
    relations=read('relations',RELATIONS,{'homes':list(HOMES)})
    def oids(rows: QueryResult, column: int) -> list[int]:
        values=[]
        for row in rows.rows:
            value=row[column]
            if type(value) is not str or not value.isascii() or not value.isdecimal() or not 1<=len(value)<=10 or value[0]=='0':
                raise InventoryRefusal('shape')
            number=int(value)
            if number>4_294_967_295: raise InventoryRefusal('shape')
            values.append(number)
        return values
    routine_oids=oids(routines,0);relation_oids=oids(relations,0)
    if len(routine_oids)+len(relation_oids)>256 or len(set(routine_oids))!=len(routine_oids) or len(set(relation_oids))!=len(relation_oids):
        raise InventoryRefusal('resource')
    namespaces=list(dict.fromkeys(oids(routines,1)+oids(relations,2)))
    assets=files('truss').joinpath('_inventory_sql')
    manifest_bytes=assets.joinpath('manifest.json').read_bytes()
    if hashlib.sha256(manifest_bytes).hexdigest()!=ASSET_MANIFEST_SHA256: raise InventoryRefusal('asset')
    manifest=json.loads(manifest_bytes)
    def owner_read(name: str, arguments: list[object]) -> None:
        original=assets.joinpath(name+'.sql').read_bytes()
        if hashlib.sha256(original).hexdigest()!=manifest[name]['sha256']: raise InventoryRefusal('asset')
        sql=original.decode()
        params={}
        for i,arg in enumerate(arguments,1):
            sql=sql.replace('$'+str(i),':p'+str(i));params['p'+str(i)]=arg
        read(name,sql,params)
    owner_read('routine-acl',[routine_oids]);owner_read('relation-acl',[relation_oids])
    owner_read('column-acl',[relation_oids]);owner_read('namespace-acl',[namespaces])
    frontier=[1255]*len(routine_oids)+[1259]*len(relation_oids)
    owner_read('dependency',[frontier,routine_oids+relation_oids,[0]*len(frontier)])
    read('effective',EFFECTIVE,{'role':ordinary_role,'homes':list(HOMES)})
    owners=[row[3] for row in routines.rows]
    read('roles',ROLES,{'roles':list(dict.fromkeys([ordinary_role]+owners))})
    read('role-reachability',ROLE_REACHABILITY,{'role':ordinary_role})
    return Inventory(tuple(retained),maximum_rows,maximum_text_units,ordinary_role)


def _reconcile_inventory(inventory: Inventory, declarations: tuple[RoutineDeclaration,...], *,
                        ordinary_execute: tuple[str,...], expected: Inventory) -> Correspondence:
    """Scoped source and deny-policy match; never complete access closure."""
    reasons=[]
    sections={section.name:section.result for section in inventory.sections}
    if set(sections)!=set(('context','routines','relations','routine-acl','relation-acl','column-acl','namespace-acl','dependency','effective','roles','role-reachability')):
        return Correspondence('scoped_mismatch',('missing_inventory',),UNRESOLVED)
    baseline={section.name:section.result for section in expected.sections}
    if sections['context'].rows[0][:5]!=baseline['context'].rows[0][:5]: reasons.append('context_correspondence')
    for name in ('routine-acl','relation-acl','column-acl','namespace-acl','roles','dependency','relations','routines','role-reachability'):
        if sections[name]!=baseline[name]: reasons.append(name+'_drift')
    expected={entry.name:entry for entry in declarations}
    rows=sections['routines'].rows
    names=[row[4] for row in rows]
    if len(expected)!=len(declarations) or len(names)!=len(set(names)) or set(names)!=set(expected):
        reasons.append('routine_membership')
    for row in rows:
        entry=expected.get(row[4])
        if entry is None: continue
        if (hashlib.sha256(row[8].encode()).hexdigest()!=entry.body_sha256 or row[3]!=entry.owner
            or row[6] is not entry.security_definer or row[7]!='{"search_path=pg_catalog, pg_temp"}' or row[10]!='plpgsql'
            or row[5]!=entry.argument_oids or row[13]!=entry.result_type or row[11]!=entry.native_definition
            or row[14:18]!=('v','u',False,False)):
            reasons.append('routine_correspondence')
    if {row[1] for row in sections['relations'].rows}!=set(HOMES): reasons.append('relation_membership')
    for relation in sections['relations'].rows:
        if relation[4]!='r': reasons.append('relation_kind')
        if type(relation[5]) is not str or len(relation[5])>4 or not relation[5].isascii() or not relation[5].isdecimal():
            reasons.append('column_coverage');continue
        count=int(relation[5])
        if count>1600: reasons.append('column_coverage');continue
        ordinals={row[1] for row in sections['column-acl'].rows if row[0]==relation[0]}
        if not {str(i) for i in range(1,count+1)}<=ordinals: reasons.append('column_coverage')
    keys={('schema','truss','',privilege) for privilege in ('USAGE','CREATE')}
    keys.update(('routine',row[4],row[5],'EXECUTE') for row in rows)
    keys.update(('relation',row[1],'',privilege) for row in sections['relations'].rows
                for privilege in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
    relation_names={row[0]:row[1] for row in sections['relations'].rows}
    for row in sections['column-acl'].rows:
        if type(row[1]) is not str or len(row[1])>6 or not row[1].lstrip('-').isascii() or not row[1].lstrip('-').isdecimal():
            reasons.append('column_shape');continue
        if int(row[1])>0 and row[3] is False:
            keys.update(('column',relation_names[row[0]],row[2],privilege)
                        for privilege in ('SELECT','INSERT','UPDATE','REFERENCES'))
    observed=[row[:4] for row in sections['effective'].rows]
    if len(observed)!=len(set(observed)) or set(observed)!=keys: reasons.append('effective_coverage')
    required_roles={inventory.ordinary_role}|{row[3] for row in rows}
    if {row[1] for row in sections['roles'].rows}!=required_roles: reasons.append('role_membership')
    for kind,obj,subobject,privilege,allowed in sections['effective'].rows:
        expected_allowed=(kind=='schema' and privilege=='USAGE' or kind=='routine' and obj in ordinary_execute)
        if type(allowed) is not bool or allowed!=expected_allowed: reasons.append('effective_privilege')
    if not sections['effective'].rows: reasons.append('missing_effective_privileges')
    # This fixed invoker profile selects no distinct SET/ADMIN role route.
    # Compare policy as well as baseline: matching unsafe snapshots cannot pass.
    if any(row[1]!=inventory.ordinary_role and (row[4] or row[5])
           for row in sections['role-reachability'].rows):
        reasons.append('role_transition_privilege')
    return Correspondence('scoped_mismatch' if reasons else 'scoped_match',tuple(dict.fromkeys(reasons)),UNRESOLVED)

ASSET_MANIFEST_SHA256 = '3544d094ff90df4b6966414cfd203db607ae347dd2a4923dc72c92758188f890'


def reconcile_inventory(inventory: Inventory, declarations: tuple[RoutineDeclaration,...], *,
                        ordinary_execute: tuple[str,...], expected: Inventory) -> Correspondence:
    try:
        for packet in (inventory,expected):
            _admit_packet(packet)
        if type(declarations) is not tuple or type(ordinary_execute) is not tuple:
            raise InventoryRefusal('shape')
        if len(declarations)>16 or len(ordinary_execute)>16:
            raise InventoryRefusal('resource')
        budget=expected.maximum_text_units
        for entry in declarations:
            if type(entry) is not RoutineDeclaration or type(entry.security_definer) is not bool:
                raise InventoryRefusal('shape')
            for value in (entry.name,entry.body_sha256,entry.owner,entry.argument_oids,entry.result_type,entry.native_definition):
                if type(value) is not str: raise InventoryRefusal('shape')
                budget-=len(value)
                if budget<0: raise InventoryRefusal('resource')
        if any(type(name) is not str or len(name)>128 for name in ordinary_execute):
            raise InventoryRefusal('shape')
        if inventory.ordinary_role!=expected.ordinary_role: raise InventoryRefusal('shape')
        return _reconcile_inventory(inventory,declarations,ordinary_execute=ordinary_execute,expected=expected)
    except InventoryRefusal as error:
        return Correspondence('scoped_mismatch',(str(error),),UNRESOLVED)
    except (IndexError,KeyError,ValueError,TypeError,AttributeError):
        return Correspondence('scoped_mismatch',('shape',),UNRESOLVED)


def _admit_packet(packet: Inventory) -> None:
    if type(packet) is not Inventory or type(packet.sections) is not tuple or type(packet.production_cut) is not str or packet.production_cut!='unresolved':
        raise InventoryRefusal('shape')
    if (type(packet.maximum_rows) is not int or not 1<=packet.maximum_rows<=4096
        or type(packet.maximum_text_units) is not int or not 1<=packet.maximum_text_units<=4_194_304
        or type(packet.ordinary_role) is not str or not 1<=len(packet.ordinary_role)<=128):
        raise InventoryRefusal('shape')
    if len(packet.sections)!=11: raise InventoryRefusal('shape')
    names=set(); rows=packet.maximum_rows; text=packet.maximum_text_units
    for section in packet.sections:
        if type(section) is not Section or type(section.name) is not str or section.name in names:
            raise InventoryRefusal('shape')
        names.add(section.name)
        result=section.result
        if type(result) is not QueryResult or type(result.rows) is not tuple or type(result.columns) is not tuple:
            raise InventoryRefusal('shape')
        if any(type(column) is not str for column in result.columns): raise InventoryRefusal('shape')
        if section.name not in GRAMMARS or result.columns!=GRAMMARS[section.name]: raise InventoryRefusal('shape')
        rows-=len(result.rows)
        if rows<0: raise InventoryRefusal('resource')
        text-=sum(len(c) for c in result.columns)
        for row in result.rows:
            if type(row) is not tuple or len(row)!=len(result.columns): raise InventoryRefusal('shape')
            for cell in row:
                if type(cell) not in (str,bool,int,type(None)): raise InventoryRefusal('shape')
                if type(cell) is str: text-=len(cell)
                if type(cell) is int and not -(2**63)<=cell<2**63: raise InventoryRefusal('shape')
                if text<0: raise InventoryRefusal('resource')
    context=next(s.result for s in packet.sections if s.name=='context')
    if len(context.rows)!=1 or context.rows[0][:2]!=('160015','pg_catalog, pg_temp'): raise InventoryRefusal('context')
    sections={s.name:s.result for s in packet.sections}
    for section in packet.sections:
        for row in section.result.rows:
            for column,cell in zip(section.result.columns,row):
                if column in BOOL_FIELDS:
                    if cell is None and column=='is_grantable' and row[section.result.columns.index('has_expanded_grant')] is False: continue
                    if type(cell) is not bool: raise InventoryRefusal('shape')
                elif column.endswith('_oid') or column=='oid':
                    if cell is None and column in ('grantor_oid','grantee_oid'): continue
                    _oid(cell)
                elif column=='assumed_acl_item_count':
                    if type(cell) is not int or not 0<=cell<=4096: raise InventoryRefusal('shape')
                elif cell is None:
                    if column not in NULLABLE_TEXT: raise InventoryRefusal('shape')
                elif type(cell) is not str: raise InventoryRefusal('shape')
        if section.name in ('routine-acl','relation-acl','column-acl','namespace-acl','roles','role-reachability') and not section.result.rows:
            raise InventoryRefusal('shape')
    roles=next(s.result.rows for s in packet.sections if s.name=='roles')
    reach=sections['role-reachability'].rows
    if len({r[0] for r in reach})!=len(reach) or len({r[1] for r in reach})!=len(reach):
        raise InventoryRefusal('role_reachability_shape')
    self_rows=[r for r in reach if r[1]==packet.ordinary_role]
    ordinary_rows=[r for r in roles if r[1]==packet.ordinary_role]
    if (len(self_rows)!=1 or len(ordinary_rows)!=1
        or self_rows[0][0]!=ordinary_rows[0][0]
        or self_rows[0][2:5]!=(True,True,True) or any(r[2] is not True for r in reach)):
        raise InventoryRefusal('role_reachability_shape')
    ordinary=[r for r in roles if r[1]==packet.ordinary_role]
    if len(ordinary)!=1 or ordinary[0][2:]!=(False,True,False,False,True,False,False):
        raise InventoryRefusal('role_profile')

    for value in context.rows[0]:
        if type(value) is not str or not value: raise InventoryRefusal('context')
    routines=sections['routines'].rows; relations=sections['relations'].rows; roles=sections['roles'].rows
    for rows,index in ((routines,0),(relations,0),(roles,0)):
        if len({r[index] for r in rows})!=len(rows): raise InventoryRefusal('shape')
    role_names={r[0]:r[1] for r in roles}
    for r in routines:
        if role_names.get(r[2])!=r[3]: raise InventoryRefusal('identity_join')
        acl=[a for a in sections['routine-acl'].rows if a[1]==r[0]]
        if not acl or any(a[:4]!=('1255',r[0],r[1],r[2]) for a in acl): raise InventoryRefusal('identity_join')
    for r in relations:
        if r[3] not in role_names: raise InventoryRefusal('identity_join')
        acl=[a for a in sections['relation-acl'].rows if a[1]==r[0]]
        if not acl or any(a[:5]!=('1259',r[0],r[2],r[3],r[4]) for a in acl): raise InventoryRefusal('identity_join')
    if {a[1] for a in sections['routine-acl'].rows}!={r[0] for r in routines}: raise InventoryRefusal('identity_join')
    if {a[1] for a in sections['relation-acl'].rows}!={r[0] for r in relations}: raise InventoryRefusal('identity_join')
    namespace_owners={a[1]:a[2] for a in sections['namespace-acl'].rows}
    if set(namespace_owners)!={r[1] for r in routines}|{r[2] for r in relations}: raise InventoryRefusal('identity_join')
    if any(owner not in role_names for owner in namespace_owners.values()): raise InventoryRefusal('identity_join')
    if any(a[0] not in {r[0] for r in relations} for a in sections['column-acl'].rows): raise InventoryRefusal('identity_join')

NULLABLE_TEXT={'settings','acl','original_acl_native_text','original_acl_native_dimensions','privilege_type'}
BOOL_FIELDS={'member','immediate','settable','admin_option','definer','strict','leakproof','allowed','superuser','inherit','create_role','create_db','login','replication','bypass_rls','original_acl_is_null','has_expanded_grant','is_grantable','is_dropped','supported_acl_kind'}

def _oid(value: Cell) -> None:
    if type(value) is not str or not value.isascii() or not value.isdecimal() or len(value)>10 or (len(value)>1 and value[0]=='0') or int(value)>4294967295:
        raise InventoryRefusal('shape')

GRAMMARS = {
 'context': ('version','path','acting','person','database','backend'),
 'routines': ('oid','namespace_oid','owner_oid','owner','name','argument_oids','definer','settings','body','language_oid','language','definition','acl','result_type','volatility','parallel','strict','leakproof'),
 'relations': ('oid','name','namespace_oid','owner_oid','kind','attributes'),
 'effective': ('kind','object','subobject','privilege','allowed'),
 'role-reachability': ('oid','name','member','immediate','settable','admin_option'),
 'roles': ('oid','name','superuser','inherit','create_role','create_db','login','replication','bypass_rls'),
 'routine-acl': ('catalog_class_oid','object_oid','namespace_oid','owner_oid','original_acl_is_null','original_acl_native_text','original_acl_native_dimensions','assumed_acl_item_count','has_expanded_grant','grantor_oid','grantee_oid','privilege_type','is_grantable'),
 'relation-acl': ('catalog_class_oid','object_oid','namespace_oid','owner_oid','relation_kind','supported_acl_kind','original_acl_is_null','original_acl_native_text','original_acl_native_dimensions','has_expanded_grant','grantor_oid','grantee_oid','privilege_type','is_grantable'),
 'column-acl': ('relation_oid','attribute_number','original_attribute_name','is_dropped','original_acl_is_null','original_acl_native_text','original_acl_native_dimensions','has_expanded_grant','grantor_oid','grantee_oid','privilege_type','is_grantable'),
 'namespace-acl': ('catalog_class_oid','object_oid','owner_oid','original_acl_is_null','original_acl_native_text','original_acl_native_dimensions','assumed_acl_item_count','has_expanded_grant','grantor_oid','grantee_oid','privilege_type','is_grantable'),
 'dependency': ('dependent_class_oid','dependent_object_oid','dependent_subobject','referenced_class_oid','referenced_object_oid','referenced_subobject','dependency_kind','original_catalog_row_json'),
}
