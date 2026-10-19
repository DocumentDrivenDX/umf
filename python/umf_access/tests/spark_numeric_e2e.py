# SPDX-License-Identifier: MIT OR Apache-2.0
"""Real generated public-CLI Spark numeric predicates against an exact Python oracle.

Run with an owned generated fixture directory and the repository fixture source.
The caller supplies fresh installed SDK/compiler wheels and pinned Delta jars.
"""
from __future__ import annotations

import hashlib
import json
import operator
import os
import subprocess
import sys
import time
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from pyspark.sql import SparkSession
from umf_access.delta_read import DeltaSnapshot, SparkConfiguration, SparkDeltaTarget
from umf_access.targets import binding_digest


def main():
    root = Path(sys.argv[1]).resolve()
    source = Path(sys.argv[2]).resolve()
    schema = 'sdk_numeric_' + root.name.replace('-', '_')
    logical = (source / 'logical.json').read_text()
    physical = (source / 'physical.json').read_text()
    sha = lambda text: hashlib.sha256(text.encode()).hexdigest()
    binding = {
        'version': 'umf.raw-read-binding/0.1', 'schema': schema,
        'modelJson': logical, 'modelSha256': sha(logical),
        'tables': [{'logical': ['numeric', 'Metric'], 'native': 'metrics', 'key': ['id'],
                    'columns': [{'logical': name, 'native': name, 'carrier': carrier,
                                 'nullable': name == 'amount'}
                                for name, carrier in [('id', 'string'), ('big', 'integer'), ('amount', 'decimal')]]}],
        'relationships': [],
        'nativeColumns': {'target': {'platform': 'spark-delta', 'majorVersion': 'spark4-delta4'},
                          'sets': [{'columnSet': {'documentId': 'sdk-spark-numeric', 'coreVersion': '0.10.0',
                                                 'documentSha256': sha(logical), 'module': 'numeric',
                                                 'pointer': '/modules/0/extensions/umf.access/columns/0'},
                                    'binding': {'sourceId': 'physical', 'documentJson': physical,
                                                'documentSha256': sha(physical)}}]},
    }
    checks = []
    observations = []
    spark = None
    failure = None
    started = time.monotonic()

    def check(label, condition):
        if not condition:
            raise AssertionError(label)
        checks.append(label)

    try:
        jars = Path(os.environ['UMF_DELTA_JARS'])
        names = ['delta-spark_2.13-4.0.0.jar', 'delta-storage-4.0.0.jar']
        hashes = ['538511702aae0ef6973a6a70af3d4543c9009f8edbed786a00737e2d3cd7f04e',
                  '9bdb9fb450f1e119eba53feb427f331b0d09072d26485b8273883ad72c9a2e1d']
        assert all(hashlib.sha256((jars / name).read_bytes()).hexdigest() == digest
                   for name, digest in zip(names, hashes, strict=True))
        spark = (SparkSession.builder.master('local[1]').appName('owned SDK exact numeric predicates')
                 .config('spark.ui.enabled', 'false').config('spark.sql.shuffle.partitions', '1')
                 .config('spark.databricks.delta.snapshotPartitions', '1').config('spark.driver.memory', '512m')
                 .config('spark.sql.ansi.enabled', 'true').config('spark.sql.parser.escapedStringLiterals', 'false')
                 .config('spark.jars', ','.join(str(jars / name) for name in names))
                 .config('spark.sql.extensions', 'io.delta.sql.DeltaSparkSessionExtension')
                 .config('spark.sql.catalog.spark_catalog', 'org.apache.spark.sql.delta.catalog.DeltaCatalog')
                 .config('spark.sql.warehouse.dir', str(root / 'warehouse')).getOrCreate())
        spark.sparkContext.setLogLevel('ERROR')
        spark.sql(f'CREATE DATABASE `{schema}` LOCATION ' + repr(str(root / 'database')))
        spark.sql(f'CREATE TABLE `{schema}`.metrics (id STRING NOT NULL,big BIGINT NOT NULL,amount DECIMAL(38,9)) USING DELTA LOCATION ' + repr(str(root / 'metrics')))
        amounts = [None, '-99999999999999999999999999999.999999999', '-12.120000000',
                   '-12.000000001', '-12.000000000', '-0.000000001', '-0.000000000',
                   '0.000000000', '0.000000001', '1.000000000', '1.000000001',
                   '12.120000000', '99999999999999999999999999999.999999999']
        integers = [-(2**63), 2**63-1, -100, -1, 0, 1, 100]
        rows = [(f'{index:02}', integers[index % len(integers)], None if value is None else Decimal(value))
                for index, value in enumerate(amounts)]
        tuples = [f"('{identifier}',CAST('{big}' AS BIGINT)," + ('NULL' if amount is None else f"CAST('{amount}' AS DECIMAL(38,9))") + ')'
                  for identifier, big, amount in rows]
        spark.sql(f'INSERT INTO `{schema}`.metrics VALUES ' + ','.join(tuples))
        version = spark.sql(f'DESCRIBE HISTORY `{schema}`.metrics').first()['version']
        uuid = spark.sql(f'DESCRIBE DETAIL `{schema}`.metrics').first()['id']
        (root / 'raw-binding.json').write_text(json.dumps(binding))
        (root / 'logical.json').write_text(logical)
        (root / 'physical.json').write_text(physical)
        declarations = ['from decimal import Decimal', 'from umf_access import Param, query',
                        'from spark_numeric_fixture.models import Metric',
                        'from spark_numeric_fixture.keys import MetricKey']
        operations = [('eq', '=='), ('ne', '!='), ('lt', '<'), ('le', '<='), ('gt', '>'), ('ge', '>=')]
        for field, annotation in [('amount', 'Decimal | None'), ('big', 'int')]:
            for name, symbol in operations:
                declarations.append(f'@query\ndef {field}_{name}(value: Param[{annotation}]):\n    return Metric.objects.filter(Metric.c.{field} {symbol} value).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()')
        declarations.extend([
            '@query\ndef amount_page(value: Param[Decimal | None], after: Param[MetricKey | None]):\n    return Metric.objects.filter(Metric.c.amount >= value).select(Metric.c.id).order_by(Metric.c.id.asc()).page(size=7, after=after, snapshot=True)',
            '@query\ndef amount_in():\n    return Metric.objects.filter(Metric.c.amount.is_in((None, Decimal("-12.000000000"), Decimal("1.000000001")))).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()',
            '@query\ndef amount_not_in():\n    return Metric.objects.filter(~Metric.c.amount.is_in((None, Decimal("-12.000000000"), Decimal("1.000000001")))).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()',
            '@query\ndef amount_empty():\n    return Metric.objects.filter(Metric.c.amount.is_in(())).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()',
            '@query\ndef amount_not_empty():\n    return Metric.objects.filter(~Metric.c.amount.is_in(())).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()',
        ])
        (root / 'declarations.py').write_text('\n'.join(declarations) + '\n')
        pin = lambda name: {'path': name, 'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()}
        config = {'package': 'spark_numeric_fixture', 'modules': ['declarations'],
                  'targets': [{'id': 'owned', 'kind': 'spark-delta', 'backendId': 'weft-databricks',
                               'backendVersion': 'raw-read/0.1', 'targetProfile': 'weft.raw-read/0.1',
                               'bindingSource': pin('raw-binding.json'), 'snapshots': {'metrics': version},
                               'platform': [{'name': 'spark', 'versions': ['4.0.1']}, {'name': 'delta', 'versions': ['4.0.0']}]}],
                  'weft': {'distribution': 'weft-sql', 'version': '0.4.42.dev0'},
                  'umf': {'documents': [pin('logical.json'), pin('physical.json')]}}
        (root / 'config.json').write_text(json.dumps(config))
        for extra in ([], ['--check']):
            with (root / ('catalog-check.log' if extra else 'catalog-build.log')).open('w') as log:
                subprocess.run([sys.executable, '-I', '-B', '-m', 'umf_access.build.catalog', 'catalog',
                                '--root', str(root), '--config', str(root / 'config.json'), *extra],
                               stdout=log, stderr=subprocess.STDOUT, check=True)
        check('actual generated public catalog build and check', True)
        sys.path.insert(0, str(root))
        from spark_numeric_fixture import queries
        from spark_numeric_fixture.models import Metric
        check('generated nullable exact instance creation', Metric(id='x', big=2**63-1, amount=Decimal('1.000000001')).amount == Decimal('1.000000001'))
        target = SparkDeltaTarget(spark, SparkConfiguration(schema, binding_digest(binding),
                                  (DeltaSnapshot('metrics', uuid, version),), timedelta(seconds=30), True))
        operators = dict(zip([name for name, _ in operations],
                             [operator.eq, operator.ne, operator.lt, operator.le, operator.gt, operator.ge], strict=True))
        thresholds = {'amount': [None, Decimal('-12.00000000000000000000000000000000001'),
                                  Decimal('-0E-50'), Decimal('1.00000000000000000000000000000000001'), Decimal('1E+100')],
                      'big': [-(2**63), 2**63-1, 10**5000+17]}
        for field in ('amount', 'big'):
            for name, _ in operations:
                for value in thresholds[field]:
                    expected = [(identifier,) for identifier, big, amount in rows
                                if value is not None and (amount if field == 'amount' else big) is not None
                                and operators[name](amount if field == 'amount' else big, value)]
                    actual = getattr(queries, f'{field}_{name}')(target, value=value)
                    check(f'exact {field} {name} case {thresholds[field].index(value)}', actual == expected)
                    observations.append({'field': field, 'operation': name,
                        'threshold': None if value is None else format(Decimal(value), 'f'),
                        'expected': expected, 'actual': actual})
        selected = {Decimal('-12.000000000'), Decimal('1.000000001')}
        check('S8 literal nullable membership', queries.amount_in(target) == [(identifier,) for identifier, _, amount in rows if amount is not None and amount in selected])
        check('S8 literal nullable NOT membership', queries.amount_not_in(target) == [(identifier,) for identifier, _, amount in rows if amount is not None and amount not in selected])
        check('S8 empty literal ignores nullable LHS', queries.amount_empty(target) == [])
        check('S8 NOT empty includes nullable LHS', queries.amount_not_empty(target) == [(identifier,) for identifier, _, _ in rows])
        threshold = Decimal('-12.00000000000000000000000000000000001')
        expected = [(identifier,) for identifier, _, amount in rows if amount is not None and amount >= threshold]
        page = queries.amount_page(target, value=threshold, after=None)
        check('filtered fixture really requires another native page', page.next_after is not None)
        actual = list(page.items)
        while page.next_after is not None:
            page = queries.amount_page(target, value=threshold, after=page.next_after)
            actual.extend(page.items)
        check('exact numeric filtered original keyset continuation', actual == expected)
        check('exact numeric filtered snapshot stream', list(queries.amount_page_stream(target, value=threshold, after=None, max_rows=100, page_size=3)) == expected)
    except BaseException as error:
        failure = {'type': type(error).__name__, 'message': str(error)}
        raise
    finally:
        stopped = False
        if spark is not None:
            spark.stop()
            stopped = True
        (root / 'verification.json').write_text(json.dumps({'checks': checks, 'observations': observations, 'failure': failure,
            'sparkStopped': stopped, 'elapsedSeconds': time.monotonic()-started, 'temporalQualification': 'held'}, indent=2) + '\n')


if __name__ == '__main__':
    main()
