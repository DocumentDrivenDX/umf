# SPDX-License-Identifier: MIT OR Apache-2.0
"""Inert, closed PostgreSQL syntax containment. This never authorizes execution.

The parser is trusted host code, not a caller-supplied AST. Native catalog,
privilege, operator/type resolution and approval remain host obligations.
"""
from __future__ import annotations

import hashlib
import json
from typing import Protocol

PROFILE = 'umf.sql-containment/0.1'
PARSER = 'pglast@7.20/postgresql17.7'
MAX_BYTES = 262144
MAX_NODES = 20000
MAX_DEPTH = 64
MAX_STATEMENTS = 128


class SqlParser(Protocol):
    identity: str

    def parse_json(self, source: str) -> str: ...


class ContainmentRefused(ValueError):
    def __init__(self, code, path, offset=None):
        self.code, self.path, self.offset = code, path, offset
        super().__init__(code)


def _fail(code, path, value=None):
    offset = value.get('location') if isinstance(value, dict) else None
    raise ContainmentRefused(code, path, offset if type(offset) is int and offset >= 0 else None)


def _object(value, keys, path):
    if not isinstance(value, dict) or set(value) - set(keys):
        _fail('SQL_UNSUPPORTED_FIELDS', path, value)
    return value


def _strings(value, path):
    if not isinstance(value, list) or not value:
        _fail('SQL_IDENTIFIER', path)
    result = []
    for item in value:
        if (not isinstance(item, dict) or set(item) != {'String'}
                or not isinstance(item['String'], dict) or set(item['String']) != {'sval'}
                or not isinstance(item['String']['sval'], str)):
            _fail('SQL_IDENTIFIER', path)
        result.append(item['String']['sval'])
    return result


def _name(value):
    return isinstance(value, str) and 0 < len(value.encode('utf-8')) <= 63 and '\x00' not in value


class _Check:
    def __init__(self, policy):
        _object(policy, {'profile', 'schema', 'tables', 'indexes', 'roles'}, '/policy')
        if policy.get('profile') != PROFILE or not _name(policy.get('schema')):
            _fail('SQL_POLICY', '/policy')
        if policy['schema'].startswith('pg_') or policy['schema'] in {'public', 'information_schema'}:
            _fail('SQL_POLICY', '/policy/schema')
        self.schema = policy['schema']
        for kind in ('tables', 'indexes', 'roles'):
            items = policy.get(kind)
            if (not isinstance(items, list) or len(items) > 1000
                    or any(not _name(x) for x in items) or len(set(items)) != len(items)):
                _fail('SQL_POLICY', '/policy/' + kind)
            setattr(self, kind, set(items))
        self.references = set()
        self.nodes = 0

    def relation(self, value, path, ctes=frozenset(), *, target=False):
        _object(value, {'catalogname', 'schemaname', 'relname', 'inh', 'relpersistence', 'alias', 'location'}, path)
        if value.get('catalogname') or value.get('relpersistence', 'p') != 'p':
            _fail('SQL_RELATION', path, value)
        schema, table = value.get('schemaname'), value.get('relname')
        if schema is None and not target and table in ctes:
            pass
        elif schema != self.schema or table not in self.tables:
            _fail('SQL_OBJECT_OUTSIDE_INVENTORY', path, value)
        else:
            self.references.add((schema, table))
        if 'alias' in value:
            alias = _object(value['alias'], {'aliasname', 'colnames'}, path + '/alias')
            if not _name(alias.get('aliasname')) or alias.get('colnames'):
                _fail('SQL_ALIAS', path + '/alias')

    def type_name(self, value, path):
        _object(value, {'names', 'typemod', 'typmods', 'location'}, path)
        names = _strings(value.get('names'), path + '/names')
        if len(names) != 2 or names[0] != 'pg_catalog' or names[1] not in {
                'bool', 'int2', 'int4', 'int8', 'numeric', 'float4', 'float8', 'text', 'varchar',
                'bpchar', 'uuid', 'date', 'timestamp', 'timestamptz', 'time', 'timetz', 'bytea'}:
            _fail('SQL_TYPE_OUTSIDE_INVENTORY', path, value)
        if value.get('typemod', -1) != -1:
            _fail('SQL_TYPE_MODIFIER', path, value)
        for i, item in enumerate(value.get('typmods', [])):
            self.node(item, path + '/typmods/' + str(i), 1, frozenset())

    def node(self, node, path, depth=0, ctes=frozenset()):
        self.nodes += 1
        if self.nodes > MAX_NODES or depth > MAX_DEPTH:
            _fail('SQL_AST_LIMIT', path)
        if not isinstance(node, dict) or len(node) != 1:
            _fail('SQL_AST_NODE', path)
        tag, value = next(iter(node.items()))
        if not isinstance(value, dict):
            _fail('SQL_AST_NODE', path)
        p = path + '/' + tag

        def fields(*keys):
            return _object(value, keys, p)

        def child(key, scope=ctes):
            if key in value:
                self.node(value[key], p + '/' + key, depth + 1, scope)

        def children(key, scope=ctes):
            if key not in value:
                return
            if not isinstance(value[key], list):
                _fail('SQL_AST_NODE', p + '/' + key)
            for i, item in enumerate(value[key]):
                self.node(item, p + '/' + key + '/' + str(i), depth + 1, scope)

        if tag in {'SelectStmt', 'UpdateStmt', 'DeleteStmt', 'InsertStmt'}:
            keys = {
                'SelectStmt': ('targetList', 'fromClause', 'whereClause', 'groupClause', 'havingClause', 'sortClause', 'limitOffset', 'limitCount', 'limitOption', 'op', 'all', 'withClause', 'valuesLists'),
                'UpdateStmt': ('relation', 'targetList', 'whereClause', 'fromClause', 'returningList', 'withClause'),
                'DeleteStmt': ('relation', 'whereClause', 'usingClause', 'returningList', 'withClause'),
                'InsertStmt': ('relation', 'cols', 'selectStmt', 'returningList', 'override', 'withClause'),
            }[tag]
            fields(*keys)
            if value.get('op', 'SETOP_NONE') != 'SETOP_NONE' or value.get('all', False):
                _fail('SQL_UNSUPPORTED_SET_OPERATION', p)
            if value.get('limitOption', 'LIMIT_OPTION_DEFAULT') not in {'LIMIT_OPTION_DEFAULT', 'LIMIT_OPTION_COUNT'}:
                _fail('SQL_UNSUPPORTED_LIMIT', p)
            if value.get('override', 'OVERRIDING_NOT_SET') != 'OVERRIDING_NOT_SET':
                _fail('SQL_UNSUPPORTED_OVERRIDE', p)
            scope = set(ctes)
            if 'withClause' in value:
                clause = _object(value['withClause'], {'ctes', 'location', 'recursive'}, p + '/withClause')
                if clause.get('recursive') or not isinstance(clause.get('ctes'), list):
                    _fail('SQL_UNSUPPORTED_CTE', p + '/withClause')
                for i, item in enumerate(clause['ctes']):
                    q = p + '/withClause/ctes/' + str(i)
                    if not isinstance(item, dict) or set(item) != {'CommonTableExpr'}:
                        _fail('SQL_UNSUPPORTED_CTE', q)
                    cte = _object(item['CommonTableExpr'], {'ctename', 'ctematerialized', 'ctequery', 'location'}, q)
                    name = cte.get('ctename')
                    if not _name(name) or name in scope or name in self.tables or set(cte.get('ctequery', {})) != {'SelectStmt'}:
                        _fail('SQL_UNSUPPORTED_CTE', q)
                    if cte.get('ctematerialized', 'CTEMaterializeDefault') not in {'CTEMaterializeDefault', 'CTEMaterializeAlways', 'CTEMaterializeNever'}:
                        _fail('SQL_UNSUPPORTED_CTE', q)
                    self.node(cte['ctequery'], q + '/ctequery', depth + 1, frozenset(scope))
                    scope.add(name)
            scope = frozenset(scope)
            if 'relation' in value:
                self.relation(value['relation'], p + '/relation', target=True)
            for key in ('targetList', 'fromClause', 'groupClause', 'sortClause', 'returningList', 'usingClause', 'cols'):
                children(key, scope)
            for key in ('whereClause', 'havingClause', 'limitOffset', 'limitCount', 'selectStmt'):
                child(key, scope)
            for i, row in enumerate(value.get('valuesLists', [])):
                if not isinstance(row, dict) or set(row) != {'List'}:
                    _fail('SQL_AST_NODE', p + '/valuesLists')
                items = _object(row['List'], {'items'}, p + '/valuesLists/' + str(i)).get('items')
                if not isinstance(items, list):
                    _fail('SQL_AST_NODE', p + '/valuesLists')
                for j, item in enumerate(items):
                    self.node(item, p + '/valuesLists/' + str(i) + '/' + str(j), depth + 1, scope)
        elif tag == 'RangeVar':
            self.relation(value, p, ctes)
        elif tag == 'RangeSubselect':
            fields('subquery', 'alias', 'lateral')
            if value.get('lateral'):
                _fail('SQL_UNSUPPORTED_LATERAL', p)
            if set(value.get('subquery', {})) != {'SelectStmt'}:
                _fail('SQL_UNSUPPORTED_SUBQUERY', p)
            child('subquery')
            alias = _object(value.get('alias'), {'aliasname'}, p + '/alias')
            if not _name(alias.get('aliasname')):
                _fail('SQL_ALIAS', p)
        elif tag == 'ResTarget':
            fields('name', 'val', 'location')
            if 'name' in value and not _name(value['name']):
                _fail('SQL_IDENTIFIER', p)
            child('val')
        elif tag == 'ColumnRef':
            fields('fields', 'location')
            names = value.get('fields')
            if names == [{'A_Star': {}}]:
                return
            names = _strings(names, p + '/fields')
            if len(names) > 3 or len(names) == 3 and names[0] != self.schema:
                _fail('SQL_COLUMN_REFERENCE', p, value)
        elif tag == 'A_Const':
            fields('ival', 'fval', 'sval', 'boolval', 'isnull', 'location')
            if len(set(value) - {'location'}) != 1:
                _fail('SQL_CONSTANT', p)
            for key, scalar_key, scalar_type in [('ival', 'ival', int), ('fval', 'fval', str), ('sval', 'sval', str), ('boolval', 'boolval', bool)]:
                if key in value:
                    _object(value[key], {scalar_key}, p + '/' + key)
                    if scalar_key in value[key] and type(value[key][scalar_key]) is not scalar_type:
                        _fail('SQL_CONSTANT', p)
            if 'isnull' in value and value['isnull'] is not True:
                _fail('SQL_CONSTANT', p)
        elif tag == 'NullTest':
            fields('arg', 'nulltesttype', 'argisrow', 'location')
            if value.get('nulltesttype') not in {'IS_NULL', 'IS_NOT_NULL'} or value.get('argisrow'):
                _fail('SQL_EXPRESSION', p)
            child('arg')
        elif tag == 'BoolExpr':
            fields('boolop', 'args', 'location')
            if value.get('boolop') not in {'AND_EXPR', 'OR_EXPR', 'NOT_EXPR'}:
                _fail('SQL_EXPRESSION', p)
            children('args')
        elif tag == 'A_Expr':
            fields('kind', 'name', 'lexpr', 'rexpr', 'location')
            names = _strings(value.get('name'), p + '/name')
            # No search-path-dependent operator lookup in this first profile.
            if (value.get('kind') != 'AEXPR_OP' or len(names) != 2 or names[0] != 'pg_catalog'
                    or names[1] not in {'=', '<>', '<', '<=', '>', '>='}):
                _fail('SQL_OPERATOR_OUTSIDE_INVENTORY', p, value)
            child('lexpr'); child('rexpr')
        elif tag == 'TypeCast':
            fields('arg', 'typeName', 'location')
            child('arg'); self.type_name(value.get('typeName'), p + '/typeName')
        elif tag == 'FuncCall':
            # Raw syntax cannot establish argument type, overload or volatility.
            _fail('SQL_CALLABLE_UNRESOLVED', p, value)
        elif tag == 'SortBy':
            fields('node', 'sortby_dir', 'sortby_nulls', 'location')
            if value.get('sortby_dir') not in {'SORTBY_DEFAULT', 'SORTBY_ASC', 'SORTBY_DESC'} or value.get('sortby_nulls') not in {'SORTBY_NULLS_DEFAULT', 'SORTBY_NULLS_FIRST', 'SORTBY_NULLS_LAST'}:
                _fail('SQL_SORT', p)
            child('node')
        elif tag == 'CreateStmt':
            fields('relation', 'tableElts', 'constraints', 'oncommit', 'if_not_exists')
            self.relation(value.get('relation'), p + '/relation', target=True)
            if value.get('oncommit', 'ONCOMMIT_NOOP') != 'ONCOMMIT_NOOP':
                _fail('SQL_TABLE_OPTIONS', p)
            children('tableElts'); children('constraints')
        elif tag == 'ColumnDef':
            fields('colname', 'typeName', 'is_local', 'constraints', 'location')
            if not _name(value.get('colname')):
                _fail('SQL_IDENTIFIER', p)
            self.type_name(value.get('typeName'), p + '/typeName'); children('constraints')
        elif tag == 'Constraint':
            fields('contype', 'conname', 'location', 'raw_expr', 'initially_valid', 'skip_validation', 'keys', 'pktable', 'fk_attrs', 'pk_attrs', 'fk_matchtype', 'fk_upd_action', 'fk_del_action', 'deferrable', 'initdeferred')
            if value.get('contype') not in {'CONSTR_NOTNULL', 'CONSTR_NULL', 'CONSTR_DEFAULT', 'CONSTR_CHECK', 'CONSTR_PRIMARY', 'CONSTR_UNIQUE', 'CONSTR_FOREIGN'}:
                _fail('SQL_CONSTRAINT', p, value)
            if value.get('deferrable') or value.get('initdeferred'):
                _fail('SQL_CONSTRAINT', p)
            if 'conname' in value and not _name(value['conname']):
                _fail('SQL_IDENTIFIER', p)
            for key in ('keys', 'fk_attrs', 'pk_attrs'):
                if key in value:
                    _strings(value[key], p + '/' + key)
            if 'pktable' in value:
                self.relation(value['pktable'], p + '/pktable', target=True)
            child('raw_expr')
        elif tag == 'AlterTableStmt':
            fields('relation', 'cmds', 'objtype', 'missing_ok')
            if value.get('objtype') != 'OBJECT_TABLE':
                _fail('SQL_ALTER_OBJECT', p)
            self.relation(value.get('relation'), p + '/relation', target=True); children('cmds')
        elif tag == 'AlterTableCmd':
            fields('subtype', 'name', 'def', 'behavior', 'missing_ok')
            if value.get('subtype') not in {'AT_AddColumn', 'AT_AddConstraint', 'AT_ValidateConstraint', 'AT_SetNotNull', 'AT_DropNotNull', 'AT_DropColumn', 'AT_DropConstraint', 'AT_ColumnDefault'} or value.get('behavior', 'DROP_RESTRICT') != 'DROP_RESTRICT':
                _fail('SQL_ALTER_OPERATION', p, value)
            child('def')
        elif tag == 'IndexStmt':
            fields('idxname', 'relation', 'accessMethod', 'indexParams', 'indexIncludingParams', 'whereClause', 'unique', 'concurrent', 'if_not_exists', 'nulls_not_distinct')
            if value.get('idxname') not in self.indexes or value.get('accessMethod', 'btree') != 'btree':
                _fail('SQL_INDEX_OUTSIDE_INVENTORY', p)
            self.relation(value.get('relation'), p + '/relation', target=True)
            children('indexParams'); children('indexIncludingParams'); child('whereClause')
        elif tag == 'IndexElem':
            fields('name', 'ordering', 'nulls_ordering')
            if not _name(value.get('name')) or value.get('ordering') not in {'SORTBY_DEFAULT', 'SORTBY_ASC', 'SORTBY_DESC'} or value.get('nulls_ordering') not in {'SORTBY_NULLS_DEFAULT', 'SORTBY_NULLS_FIRST', 'SORTBY_NULLS_LAST'}:
                _fail('SQL_INDEX_EXPRESSION', p)
        elif tag == 'CommentStmt':
            fields('objtype', 'object', 'comment')
            if value.get('objtype') not in {'OBJECT_TABLE', 'OBJECT_COLUMN'} or set(value.get('object', {})) != {'List'}:
                _fail('SQL_COMMENT_OBJECT', p)
            obj = _object(value['object']['List'], {'items'}, p + '/object/List')
            parts = _strings(obj.get('items'), p + '/object')
            if len(parts) != (3 if value['objtype'] == 'OBJECT_COLUMN' else 2) or parts[0] != self.schema or parts[1] not in self.tables:
                _fail('SQL_OBJECT_OUTSIDE_INVENTORY', p)
        elif tag == 'GrantStmt':
            fields('is_grant', 'targtype', 'objtype', 'objects', 'privileges', 'grantees', 'behavior', 'grant_option')
            if value.get('targtype') != 'ACL_TARGET_OBJECT' or value.get('objtype') != 'OBJECT_TABLE' or value.get('grant_option') or value.get('behavior', 'DROP_RESTRICT') != 'DROP_RESTRICT':
                _fail('SQL_GRANT', p)
            children('objects'); children('privileges'); children('grantees')
            if not value.get('privileges') or not value.get('grantees'):
                _fail('SQL_GRANT', p)
        elif tag == 'AccessPriv':
            fields('priv_name')
            if value.get('priv_name') not in {'select', 'insert', 'update', 'delete'}:
                _fail('SQL_GRANT', p)
        elif tag == 'RoleSpec':
            fields('roletype', 'rolename', 'location')
            if value.get('roletype') != 'ROLESPEC_CSTRING' or value.get('rolename') not in self.roles:
                _fail('SQL_ROLE_OUTSIDE_INVENTORY', p, value)
        else:
            _fail('SQL_UNSUPPORTED_NODE', p, value)


def check_sql_containment(source: str, policy: dict, parser: SqlParser) -> dict:
    """Check every statement; retain exact SQL, return no executable plan.

    Only trusted host-supplied parser implementations are admitted. This syntax
    profile requires explicit schema/type/operator resolution, refuses all
    function calls and unknown syntax, and cannot prove native catalog safety.
    """
    result = {'profile': PROFILE, 'status': 'blocked', 'source': source, 'executionAuthorized': False}
    try:
        if not isinstance(source, str):
            _fail('SQL_SOURCE', '/source')
        raw = source.encode('utf-8')
        if not raw or len(raw) > MAX_BYTES or b'\x00' in raw:
            _fail('SQL_SOURCE_LIMIT', '/source')
        result['sourceSha256'] = hashlib.sha256(raw).hexdigest()
        checker = _Check(policy)
        if getattr(parser, 'identity', None) != PARSER:
            _fail('SQL_PARSER_PROFILE', '/parser')
        try:
            parsed = parser.parse_json(source)
            if not isinstance(parsed, str) or len(parsed.encode('utf-8')) > MAX_BYTES * 32:
                _fail('SQL_AST_LIMIT', '/ast')
            tree = json.loads(parsed)
        except ContainmentRefused:
            raise
        except Exception:  # noqa: BLE001 -- optional parser boundary; no native exception text escapes
            _fail('SQL_PARSE_FAILED', '/source')
        _object(tree, {'version', 'stmts'}, '/ast')
        if tree.get('version') != 170007 or not isinstance(tree.get('stmts'), list):
            _fail('SQL_PARSER_PROFILE', '/ast')
        if not 1 <= len(tree['stmts']) <= MAX_STATEMENTS:
            _fail('SQL_STATEMENT_LIMIT', '/ast/stmts')
        for i, stmt in enumerate(tree['stmts']):
            path = '/ast/stmts/' + str(i)
            _object(stmt, {'stmt', 'stmt_location', 'stmt_len'}, path)
            checker.node(stmt.get('stmt'), path + '/stmt')
        result.update(status='checked', parser=PARSER, statements=len(tree['stmts']),
                      references=[{'schema': s, 'table': t} for s, t in sorted(checker.references)],
                      nativeCatalogVerified=False)
    except ContainmentRefused as error:
        result['diagnostics'] = [{'code': error.code, 'path': error.path, 'offset': error.offset}]
    except (ValueError, TypeError, UnicodeError, RecursionError):
        result['diagnostics'] = [{'code': 'SQL_INPUT_INVALID', 'path': '/source', 'offset': None}]
    return result
