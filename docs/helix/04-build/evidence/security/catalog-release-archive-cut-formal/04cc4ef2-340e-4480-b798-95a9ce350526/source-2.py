"""Real configuration/epoch correspondence with administrative installation fixtures.

Release selection is not protected installation or accepted-report authority.
"""
import hashlib,json,unittest
from pathlib import Path
from test_native_pg8000 import NativeBoundaryFixture
ROOT=Path(__file__).resolve().parents[3]
POLICY=ROOT/'packages/python/src/truss/_profiles/catalog-report-release.json'
class CatalogReportReleaseNativeTests(NativeBoundaryFixture,unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass();c=cls.Connection(**cls.kwargs)
        try:
            c.run((ROOT/'docs/helix/04-build/evidence/source-epoch-layout-0.16.owner-export.sql').read_text())
            c.run((ROOT/'docs/helix/04-build/evidence/operation-configuration-storage.owner-export.sql').read_text())
            for name in ('source-epoch-lock','issued-operation-admission/operation-configuration-context-admission',
                         'catalog-observation-recheck','catalog-epoch-context','operation-configuration-current',
                         'catalog-admission-configuration','catalog-report/release-selection'):
                c.run((ROOT/f'packages/postgresql/native/{name}.sql').read_text())
            fixture=(ROOT/'docs/helix/04-build/evidence/design-audit/pgserver-populated-guard-fixture.sql').read_text()
            c.run(fixture.split('INSERT INTO truss.row_home_operation')[0])
            c.run("INSERT INTO truss.source_epoch_current VALUES(1,'guard-fixture','guard-fixture-epoch')")
        finally:c.close()
    def setUp(self):
        self.connection=self.Connection(**self.kwargs)
        self.policy=POLICY.read_bytes();self.digest=hashlib.sha256(self.policy).hexdigest()
        self.configuration_profile=(ROOT/'packages/python/src/truss/_profiles/catalog-report-configuration.json').read_bytes()
        self.configuration=json.dumps({'interfaceVersion':'truss-catalog-report-configuration/0.1',
            'catalogReportRelease':{'artifactIdentity':'truss.catalog-report-release/0.1.0','sha256':self.digest}}).encode()
        self.connection.run("""INSERT INTO truss.installation_admission(head_id,installation_id_utf8,
            source_epoch_utf8,configuration_generation,key_reuse,journal_mode,configuration_bytes,
            selected_binding_bytes,installed_inventory_bytes) VALUES(1,convert_to('guard-fixture','UTF8'),
            convert_to('guard-fixture-epoch','UTF8'),7,'forbid','engine',:configuration,
            convert_to('binding fixture','UTF8'),convert_to('inventory fixture','UTF8'))""",configuration=self.configuration)
        self.connection.run('BEGIN')
    def tearDown(self):
        self.connection.run('ROLLBACK');self.connection.run('DELETE FROM truss.installation_admission');self.connection.close()
    def archive(self,raw=None):
        self.connection.run("""INSERT INTO truss.installation_archive(installation_id,artifact_role,
            artifact_identity,artifact_bytes,artifact_identity_sha256) VALUES('guard-fixture','input',
            'truss.catalog-report-release/0.1.0',:raw,sha256(convert_to('truss.catalog-report-release/0.1.0','UTF8')))""",raw=self.policy if raw is None else raw)
    def admit(self):
        return self.connection.run("""SELECT * FROM truss.runtime_admit_operation_with_configuration_context(
            0,'catalog-acceptance',decode('01','hex'),decode('02','hex'),decode('03','hex'),
            decode('04','hex'),decode('05','hex'),decode('06','hex'),convert_to('{}','UTF8'),
            convert_to('original capture fixture','UTF8'),'guard-fixture','guard-fixture-epoch',
            'guard-fixture-incarnation',:configuration_profile)""",configuration_profile=self.configuration_profile)[0]
    def select(self,writer):
        return self.connection.run('SELECT * FROM truss.runtime_select_catalog_report_release(:w,\'0\',\'0\',:profile)',
            w=writer,profile=self.configuration_profile.hex())
    def test_actual_policy_selected_from_original_configuration(self):
        self.assertEqual(self.connection.run("SELECT current_setting('server_version_num')"),[['160015']])
        self.archive();writer,ordinal,context=self.admit()
        self.assertEqual(self.select(writer),[[self.policy.hex(),self.digest,'7']])
        self.assertEqual(self.connection.run('SELECT count(*) FROM truss.operation_configuration'),[[1]])
        self.assertEqual(self.connection.run('SELECT count(*) FROM truss.catalog_acceptance_report'),[[0]])
    def test_missing_duplicate_and_changed_archive_refuse(self):
        from pg8000.exceptions import DatabaseError
        for mode in ('missing','duplicate','conflicting','changed'):
            self.connection.run('SAVEPOINT selection')
            if mode=='duplicate':self.archive();self.archive()
            elif mode=='conflicting':self.archive();self.archive(self.policy+b' ')
            elif mode=='changed':self.archive(self.policy+b' ')
            writer,_,_=self.admit()
            with self.subTest(mode=mode),self.assertRaises(DatabaseError):self.select(writer)
            self.connection.run('ROLLBACK TO SAVEPOINT selection');self.connection.run('RELEASE SAVEPOINT selection')
    def test_late_configuration_change_refuses(self):
        from pg8000.exceptions import DatabaseError
        self.archive();writer,_,_=self.admit()
        self.connection.run('UPDATE truss.installation_admission SET configuration_bytes=:raw',raw=self.configuration+b' ')
        with self.assertRaises(DatabaseError) as caught:self.select(writer)
        self.assertEqual(caught.exception.args[0]['C'],'55000')
    def test_unknown_ambiguous_or_changed_selection_refuses(self):
        from pg8000.exceptions import DatabaseError
        valid=json.loads(self.configuration)
        candidates=[b'{}',b'{"interfaceVersion":"unknown","catalogReportRelease":{}}',
            b'{"interfaceVersion":"truss-catalog-report-configuration/0.1","interfaceVersion":"truss-catalog-report-configuration/0.1","catalogReportRelease":{}}']
        wrong=json.loads(self.configuration);wrong['catalogReportRelease']['sha256']='0'*64
        candidates.append(json.dumps(wrong).encode())
        wrong=json.loads(self.configuration);wrong['catalogReportRelease']['artifactIdentity']='unknown'
        candidates.append(json.dumps(wrong).encode())
        candidates.append(('{"interfaceVersion":"truss-catalog-report-configuration/0.1","catalogReportRelease":'
            '{"artifactIdentity":"truss.catalog-report-release/0.1.0","sha256":"'+self.digest+'","sha256":"'+self.digest+'"}}').encode())
        self.archive()
        for raw in candidates:
            self.connection.run('SAVEPOINT grammar')
            self.connection.run('UPDATE truss.installation_admission SET configuration_bytes=:raw',raw=raw)
            writer,_,_=self.admit()
            with self.assertRaises(DatabaseError) as caught:self.select(writer)
            self.assertEqual(caught.exception.args[0]['C'],'0A000')
            self.connection.run('ROLLBACK TO SAVEPOINT grammar');self.connection.run('RELEASE SAVEPOINT grammar')
    def test_release_resources_and_embedded_policy_are_exact(self):
        policy=json.loads(self.policy)
        for entry in policy['resources']:
            self.assertEqual(hashlib.sha256((ROOT/entry['path']).read_bytes()).hexdigest(),entry['sha256'])
        source=(ROOT/'packages/postgresql/native/catalog-report/release-selection.sql').read_text()
        self.assertEqual(source.split('$release$')[1].encode(),self.policy)

    def test_unrecognized_configuration_profile_cannot_select_release(self):
        from pg8000.exceptions import DatabaseError
        self.archive();self.configuration_profile=b'configuration admission fixture'
        writer,_,_=self.admit()
        with self.assertRaises(DatabaseError) as caught:self.select(writer)
        self.assertEqual(caught.exception.args[0]['C'],'0A000')

    def test_concurrent_archive_writes_excluded_until_transaction_end(self):
        from pg8000.exceptions import DatabaseError
        self.archive();writer,_,_=self.admit();self.select(writer)
        other=self.Connection(**self.kwargs)
        try:
            other.run("SET lock_timeout='100ms'")
            mutations=(
                "INSERT INTO truss.installation_archive(installation_id,artifact_role,artifact_identity,artifact_bytes,artifact_identity_sha256) VALUES('guard-fixture','input','truss.catalog-report-release/0.1.0',decode('01','hex'),sha256(convert_to('truss.catalog-report-release/0.1.0','UTF8')))",
                "UPDATE truss.installation_archive SET artifact_bytes=decode('01','hex') WHERE installation_id='guard-fixture'",
                "DELETE FROM truss.installation_archive WHERE installation_id='guard-fixture'",
            )
            for statement in mutations:
                with self.assertRaises(DatabaseError) as caught:
                    other.run(statement)
                self.assertEqual(caught.exception.args[0]['C'],'55P03')
            self.assertEqual(self.select(writer),[[self.policy.hex(),self.digest,'7']])
            self.connection.run('ROLLBACK')
            # Explicit transaction end releases the archive cut; synthetic archive
            # rows rolled back too. Insertion now succeeds without retry loops.
            other.run(mutations[0]);other.run("DELETE FROM truss.installation_archive WHERE installation_id='guard-fixture'")
        finally:
            self.connection.run('ROLLBACK')
            other.run("DELETE FROM truss.installation_archive WHERE installation_id='guard-fixture'")
            other.close()

    def test_rollback_across_selection_releases_archive_cut_same_xid(self):
        from pg8000.exceptions import DatabaseError
        self.archive();writer,_,_=self.admit()
        self.connection.run('SAVEPOINT before_selection')
        self.select(writer)
        other=self.Connection(**self.kwargs)
        statement="LOCK TABLE truss.installation_archive IN ROW EXCLUSIVE MODE"
        try:
            other.run('BEGIN');other.run("SET LOCAL lock_timeout='100ms'")
            with self.assertRaises(DatabaseError) as caught:other.run(statement)
            self.assertEqual(caught.exception.args[0]['C'],'55P03');other.run('ROLLBACK')
            self.connection.run('ROLLBACK TO SAVEPOINT before_selection')
            self.assertEqual(self.connection.run('SELECT pg_current_xact_id()::text'),[[writer]])
            other.run('BEGIN');other.run("SET LOCAL lock_timeout='100ms'");other.run(statement);other.run('ROLLBACK')
        finally:other.close()

    def test_later_rollback_and_savepoint_release_preserve_archive_cut(self):
        from pg8000.exceptions import DatabaseError
        self.archive();writer,_,_=self.admit()
        self.connection.run('SAVEPOINT archive_parent');self.connection.run('SAVEPOINT archive_child')
        self.select(writer);self.connection.run('RELEASE SAVEPOINT archive_child')
        self.connection.run('SAVEPOINT later');self.connection.run('ROLLBACK TO SAVEPOINT later')
        other=self.Connection(**self.kwargs)
        try:
            other.run('BEGIN');other.run("SET LOCAL lock_timeout='100ms'")
            with self.assertRaises(DatabaseError) as caught:
                other.run('LOCK TABLE truss.installation_archive IN ROW EXCLUSIVE MODE')
            self.assertEqual(caught.exception.args[0]['C'],'55P03');other.run('ROLLBACK')
            self.assertEqual(self.select(writer),[[self.policy.hex(),self.digest,'7']])
            self.connection.run('ROLLBACK TO SAVEPOINT archive_parent')
            other.run('BEGIN');other.run("SET LOCAL lock_timeout='100ms'")
            other.run('LOCK TABLE truss.installation_archive IN ROW EXCLUSIVE MODE');other.run('ROLLBACK')
        finally:other.close()

    def test_preexisting_archive_writer_refuses_without_waiting(self):
        from pg8000.exceptions import DatabaseError
        self.archive();writer,_,_=self.admit()
        other=self.Connection(**self.kwargs)
        try:
            other.run('BEGIN');other.run('LOCK TABLE truss.installation_archive IN ROW EXCLUSIVE MODE')
            # No lock_timeout is set on selector: native NOWAIT must refuse.
            with self.assertRaises(DatabaseError) as caught:self.select(writer)
            self.assertEqual(caught.exception.args[0]['C'],'55P03')
        finally:other.run('ROLLBACK');other.close()

    def test_old_snapshot_and_readonly_release_selection_refuse(self):
        from pg8000.exceptions import DatabaseError
        self.connection.run('ROLLBACK')
        self.archive()
        for isolation in ('REPEATABLE READ','SERIALIZABLE'):
            self.connection.run('BEGIN ISOLATION LEVEL '+isolation)
            writer,_,_=self.admit()  # Establish original snapshot and operation.
            other=self.Connection(**self.kwargs)
            try:
                other.run("INSERT INTO truss.installation_archive(installation_id,artifact_role,artifact_identity,artifact_bytes,artifact_identity_sha256) VALUES('guard-fixture','input','truss.catalog-report-release/0.1.0',decode('01','hex'),sha256(convert_to('truss.catalog-report-release/0.1.0','UTF8')))")
                self.assertEqual(self.connection.run("SELECT count(*) FROM truss.installation_archive WHERE installation_id='guard-fixture'"),[[1]])
                self.assertEqual(other.run("SELECT count(*) FROM truss.installation_archive WHERE installation_id='guard-fixture'"),[[2]])
                with self.assertRaises(DatabaseError) as caught:self.select(writer)
                self.assertEqual(caught.exception.args[0]['C'],'55000')
                self.assertEqual(caught.exception.args[0]['M'],'fresh read committed read-write release selection required')
            finally:
                self.connection.run('ROLLBACK')
                other.run("DELETE FROM truss.installation_archive WHERE artifact_bytes=decode('01','hex')")
                other.close()
        self.connection.run('BEGIN READ ONLY')
        with self.assertRaises(DatabaseError) as caught:self.select('1')
        self.assertEqual(caught.exception.args[0]['C'],'55000')
        self.assertEqual(caught.exception.args[0]['M'],'fresh read committed read-write release selection required')
        self.connection.run('ROLLBACK')
        self.connection.run("DELETE FROM truss.installation_archive WHERE installation_id='guard-fixture'")

    def test_preexisting_archive_row_locker_refuses_without_waiting(self):
        from pg8000.exceptions import DatabaseError
        self.connection.run('ROLLBACK');self.archive();self.connection.run('BEGIN')
        writer,_,_=self.admit();other=self.Connection(**self.kwargs)
        try:
            other.run('BEGIN')
            other.run("SELECT archive_row_id FROM truss.installation_archive WHERE installation_id='guard-fixture' FOR UPDATE")
            with self.assertRaises(DatabaseError) as caught:self.select(writer)
            self.assertEqual(caught.exception.args[0]['C'],'55P03')
        finally:
            self.connection.run('ROLLBACK');other.run('ROLLBACK')
            other.run("DELETE FROM truss.installation_archive WHERE installation_id='guard-fixture'");other.close()
