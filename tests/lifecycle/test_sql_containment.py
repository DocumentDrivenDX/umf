# SPDX-License-Identifier: MIT OR Apache-2.0
"""Real PostgreSQL parser adversarial containment corpus; no database required."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from umf_access.lifecycle.sql_containment import (
    MAX_BYTES,
    PARSER,
    check_sql_containment,
)
from umf_access.lifecycle.sql_containment_parser import PglastParser

POLICY = {'profile': 'umf.sql-containment/0.1', 'schema': 'tenant',
          'tables': ['person', 'team', 'quoted"table'], 'indexes': ['person_name'], 'roles': ['reader']}


class ContainmentTests(unittest.TestCase):
    def check(self, sql):
        result = check_sql_containment(sql, POLICY, PglastParser())
        self.assertEqual(result['source'], sql)
        self.assertFalse(result['executionAuthorized'])
        return result

    def test_supported_statements_parse_every_reference(self):
        statements = [
            'CREATE TABLE tenant.person (id pg_catalog.uuid PRIMARY KEY, name pg_catalog.text NOT NULL, age integer CHECK (age OPERATOR(pg_catalog.>=) 0));',
            'ALTER TABLE tenant.person ADD COLUMN born pg_catalog.date;',
            'ALTER TABLE tenant.person ALTER COLUMN born SET NOT NULL;',
            'ALTER TABLE tenant.person ADD CONSTRAINT team_fk FOREIGN KEY (id) REFERENCES tenant.team(id);',
            'CREATE INDEX CONCURRENTLY person_name ON tenant.person (name);',
            "COMMENT ON TABLE tenant.person IS E'quote \\' ; DROP SCHEMA public;';",
            "COMMENT ON COLUMN tenant.person.name IS $$literal ; GRANT ALL ON foreign.data TO public$$;",
            "UPDATE tenant.person SET name = 'filled' WHERE name IS NULL;",
            "INSERT INTO tenant.person (name) VALUES ('sample');",
            'DELETE FROM tenant.person WHERE name IS NULL;',
            'WITH x AS (SELECT id FROM tenant.person) SELECT id FROM x;',
            'SELECT id FROM (SELECT id FROM tenant.person) AS x;',
            'GRANT SELECT, UPDATE ON tenant.person TO reader;',
            'REVOKE SELECT ON tenant.person FROM reader;',
            'SELECT * FROM tenant."quoted""table";',
            '/* outer /* nested */ still comment */ SELECT id FROM tenant.person; -- tail',
        ]
        for sql in statements:
            with self.subTest(sql=sql):
                result = self.check(sql)
                self.assertEqual(result['status'], 'checked', result)
                self.assertEqual(result['parser'], PARSER)
                self.assertFalse(result['nativeCatalogVerified'])

    def test_hostile_or_unresolved_sql_refuses(self):
        statements = [
            'SELECT id FROM foreign.person;',
            'SELECT id FROM person;',
            'SELECT id FROM tenant.missing;',
            'SELECT id FROM tenant.person; SELECT id FROM foreign.person;',
            'WITH x AS (SELECT id FROM foreign.person) SELECT id FROM x;',
            'WITH x AS (DELETE FROM foreign.person RETURNING id) SELECT id FROM x;',
            'SELECT id FROM (SELECT id FROM foreign.person) AS x;',
            'SELECT (SELECT id FROM foreign.person) FROM tenant.person;',
            'UPDATE tenant.person SET name = foreign.secret();',
            "SELECT pg_catalog.set_config('search_path','foreign',false);",
            "SELECT pg_catalog.nextval('foreign.sequence');",
            'SELECT pg_catalog.lower(name) FROM tenant.person;',
            'SELECT id FROM tenant.person WHERE id = 1;',
            'SELECT id FROM tenant.person WHERE id OPERATOR(foreign.=) 1;',
            'SELECT name::foreign.domain FROM tenant.person;',
            'SELECT name COLLATE foreign.secret FROM tenant.person;',
            'CREATE TABLE tenant.person (id foreign.custom);',
            'CREATE TABLE tenant.person (id pg_catalog.text) INHERITS (foreign.person);',
            'CREATE TABLE tenant.person AS SELECT * FROM foreign.person;',
            'ALTER TABLE tenant.person ADD CONSTRAINT fk FOREIGN KEY(id) REFERENCES foreign.team(id);',
            'ALTER TABLE tenant.person OWNER TO reader;',
            'ALTER TABLE tenant.person ENABLE TRIGGER ALL;',
            "CREATE FUNCTION tenant.bad() RETURNS void LANGUAGE sql AS $$SELECT foreign.secret()$$;",
            'DO $$ BEGIN PERFORM foreign.secret(); END $$;',
            'CREATE TRIGGER bad AFTER INSERT ON tenant.person EXECUTE FUNCTION foreign.bad();',
            "COPY tenant.person TO PROGRAM 'echo bad';",
            'CREATE ROLE bad;', 'CREATE SCHEMA bad;', 'SET search_path=foreign;',
            'GRANT SELECT ON tenant.person TO public;',
            'GRANT SELECT ON tenant.person TO stranger;',
            'GRANT SELECT ON foreign.person TO reader;',
            'GRANT SELECT ON tenant.person TO reader WITH GRANT OPTION;',
            'GRANT reader TO stranger;',
            'CREATE INDEX person_name ON tenant.person USING foreign_method (name);',
            'CREATE INDEX missing ON tenant.person (name);',
            'CREATE INDEX person_name ON tenant.person ((foreign.secret(name)));',
            'SELECT id FROM tenant.person UNION SELECT id FROM foreign.person;',
            '/* unterminated', "SELECT 'unterminated", 'SELECT $$unterminated',
            'SELECT id FROM tenant.person; /* trick */ SET ROLE reader;',
        ]
        for sql in statements:
            with self.subTest(sql=sql):
                result = self.check(sql)
                self.assertEqual(result['status'], 'blocked', result)
                self.assertTrue(result['diagnostics'][0]['path'])

    def test_limits_and_inventories_fail_closed(self):
        for sql in ['', 'SELECT 1;\x00', 'x' * (MAX_BYTES + 1), 'SELECT 1;' * 129, '\ud800']:
            self.assertEqual(self.check(sql)['status'], 'blocked')
        for change in [{'schema': 'public'}, {'tables': ['person', 'person']}, {'unknown': True}, {'roles': 'reader'}]:
            policy = {**POLICY, **change}
            self.assertEqual(check_sql_containment('SELECT 1;', policy, PglastParser())['status'], 'blocked')

    def test_trusted_parser_version_and_closed_ast(self):
        class Parser:
            identity = 'untrusted/other'

            def parse_json(self, source):
                raise AssertionError('wrong parser must not run')
        self.assertEqual(check_sql_containment('SELECT 1;', POLICY, Parser())['diagnostics'][0]['code'], 'SQL_PARSER_PROFILE')
        tree = json.loads(PglastParser().parse_json('SELECT 1;'))
        variants = []
        bad = copy.deepcopy(tree); bad['version'] = 180000; variants.append(bad)
        bad = copy.deepcopy(tree); bad['stmts'][0]['stmt']['SelectStmt']['future'] = {}; variants.append(bad)
        bad = copy.deepcopy(tree); bad['stmts'][0]['stmt'] = {'UnknownStmt': {}}; variants.append(bad)
        bad = copy.deepcopy(tree); bad['stmts'][0]['future'] = {}; variants.append(bad)
        for bad in variants:
            class ChangedParser:
                identity = PARSER

                def __init__(self, tree):
                    self.tree = tree

                def parse_json(self, source):
                    return json.dumps(self.tree)
            self.assertEqual(check_sql_containment('SELECT 1;', POLICY, ChangedParser(bad))['status'], 'blocked')

    def test_cli_is_offline_and_retains_source(self):
        with tempfile.TemporaryDirectory() as directory:
            sql = Path(directory, 'input.sql'); policy = Path(directory, 'policy.json')
            sql.write_text('SELECT id FROM tenant.person;', encoding='utf-8')
            policy.write_text(json.dumps(POLICY), encoding='utf-8')
            command = [sys.executable, '-m', 'umf_access.lifecycle.sql_containment_cli', '--sql', str(sql), '--policy', str(policy)]
            good = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertEqual(json.loads(good.stdout)['source'], sql.read_text())
            sql.write_text('SELECT * FROM foreign.person;', encoding='utf-8')
            bad = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(bad.returncode, 1)
            self.assertFalse(json.loads(bad.stdout)['executionAuthorized'])


if __name__ == '__main__':
    unittest.main()
