"""Real generated public-CLI bounded Spark list predicates against an independent S8 oracle.

Run with an owned generated fixture directory and the repository fixture source.
The caller supplies fresh installed SDK/compiler wheels and pinned Delta jars.
"""
from __future__ import annotations

import hashlib
import json
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
    schema = 'sdk_list_' + root.name.replace('-', '_')
    logical = (source / 'logical.json').read_text()
    physical = (source / 'physical.json').read_text()
    sha = lambda text: hashlib.sha256(text.encode()).hexdigest()
    binding = {
        'version': 'umf.raw-read-binding/0.1', 'schema': schema,
        'modelJson': logical, 'modelSha256': sha(logical),
        'tables': [{'logical': ['numeric', 'Metric'], 'native': 'metrics', 'key': ['id'],
                    'columns': [{'logical': name, 'native': name, 'carrier': carrier,
                                 'nullable': name in ('amount', 'label', 'active')}
                                for name, carrier in [('id', 'string'), ('big', 'integer'), ('amount', 'decimal'), ('label', 'string'), ('active', 'boolean')]]}],
        'relationships': [],
        'nativeColumns': {'target': {'platform': 'spark-delta', 'majorVersion': 'spark4-delta4'},
                          'sets': [{'columnSet': {'documentId': 'sdk-spark-list', 'coreVersion': '0.10.0',
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
        spark.sql(f'CREATE TABLE `{schema}`.metrics (id STRING NOT NULL,big BIGINT NOT NULL,amount DECIMAL(38,9),label STRING,active BOOLEAN) USING DELTA LOCATION ' + repr(str(root / 'metrics')))
        labels = [None, '', 'plain', 'quote"slash\\雪', 'é', 'e\u0301', '%_', 'plain']
        amounts = [None, '-12.000000000', '0.000000000', '1.000000001', '12.120000000',
                   '99999999999999999999999999999.999999999', '-0.000000001', '1.000000001']
        integers = [-(2**63), 2**63-1, -100, -1, 0, 1, 100, 17]
        rows = [(f'{i:02}', integers[i], None if amount is None else Decimal(amount), labels[i], [None,False,True][i%3])
                for i, amount in enumerate(amounts)]
        from pyspark.sql.types import (
            BooleanType,
            DecimalType,
            LongType,
            StringType,
            StructField,
            StructType,
        )
        row_schema=StructType([StructField('id',StringType(),False),StructField('big',LongType(),False),
            StructField('amount',DecimalType(38,9),True),StructField('label',StringType(),True),StructField('active',BooleanType(),True)])
        spark.createDataFrame(rows,row_schema).write.format('delta').mode('append').saveAsTable(f'{schema}.metrics')
        version = spark.sql(f'DESCRIBE HISTORY `{schema}`.metrics').first()['version']
        uuid = spark.sql(f'DESCRIBE DETAIL `{schema}`.metrics').first()['id']
        (root / 'raw-binding.json').write_text(json.dumps(binding))
        (root / 'logical.json').write_text(logical)
        (root / 'physical.json').write_text(physical)
        declarations = ['from decimal import Decimal', 'from umf_access import Param, query',
                        'from spark_list_fixture.models import Metric',
                        'from spark_list_fixture.keys import MetricKey']
        annotations={'big':'int | None','amount':'Decimal | None','label':'str | None','active':'bool | None'}
        for field, annotation in annotations.items():
            for negative in (False,True):
                name=field+('_not_in' if negative else '_in')
                predicate=('~' if negative else '')+f'Metric.c.{field}.is_in(values)'
                declarations.append(f'@query\ndef {name}(values: Param[list[{annotation}]]):\n    return Metric.objects.filter({predicate}).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()')
        declarations.append('@query\ndef mixed_numeric(values: Param[list[int | None]], threshold: Param[Decimal | None]):\n    return Metric.objects.filter(Metric.c.big.is_in(values) & (Metric.c.amount < threshold)).select(Metric.c.id).order_by(Metric.c.id.asc()).limit(50).all()')
        declarations.append('@query\ndef label_page(values: Param[list[str | None]], after: Param[MetricKey | None]):\n    return Metric.objects.filter(~Metric.c.label.is_in(values)).select(Metric.c.id).order_by(Metric.c.id.asc()).page(size=3, after=after, snapshot=True)')
        (root / 'declarations.py').write_text('\n'.join(declarations) + '\n')
        pin = lambda name: {'path': name, 'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()}
        config = {'package': 'spark_list_fixture', 'modules': ['declarations'],
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
        from spark_list_fixture import queries
        from spark_list_fixture.models import Metric
        check('generated nullable exact instance creation', Metric(id='x', big=2**63-1, amount=Decimal('1.000000001'), label=None, active=False).amount == Decimal('1.000000001'))
        target = SparkDeltaTarget(spark, SparkConfiguration(schema, binding_digest(binding),
                                  (DeltaSnapshot('metrics', uuid, version),), timedelta(seconds=30), True))
        vectors={
          'big':[[],[None],[-(2**63),None,2**63-1],[2**80,10**5000+17,None],[17,17]],
          'amount':[[],[None],[Decimal('1.000000001'),None],[Decimal('1.000000000000000000000000000000000001'),Decimal('1E+100')],[Decimal('-0E-50')]],
          'label':[[],[None],['quote"slash\\雪',None],['é','e\u0301','%_'],['plain','plain']],
          'active':[[],[None],[False,None],[True,False],[False,False]]}
        def expected(field, values, negative):
            index={'big':1,'amount':2,'label':3,'active':4}[field]
            return [(row[0],) for row in rows if (negative if not values else
                row[index] is not None and ((row[index] in [v for v in values if v is not None]) != negative))]
        for field, cases in vectors.items():
            for index, values in enumerate(cases):
                for negative in (False,True):
                    wanted=expected(field,values,negative)
                    actual=getattr(queries,field+('_not_in' if negative else '_in'))(target,values=values)
                    check(f'exact {field} case{index} negated{negative}',actual==wanted)
                    observations.append({'field':field,'case':index,'negative':negative,'expected':wanted,'actual':actual})
        for values,threshold in [([None,-100,17],Decimal('1E+100')),([],Decimal(1)),([-(2**63),2**63-1],None),([17],Decimal('1.000000000000000000000000000000000001'))]:
            wanted=[(identifier,) for identifier,big,amount,_,_ in rows if big in values and amount is not None and threshold is not None and amount<threshold]
            check('separate exact scalar and list native transports',queries.mixed_numeric(target,values=values,threshold=threshold)==wanted)
        for values in ([],[None],['plain',None]):
            wanted=expected('label',values,True)
            page=queries.label_page(target,values=values,after=None)
            actual=list(page.items)
            while page.next_after is not None:
                page=queries.label_page(target,values=values,after=page.next_after)
                actual.extend(page.items)
            check(f'original list page case{values}',actual==wanted)
            check(f'original list stream case{values}',list(queries.label_page_stream(target,values=values,after=None,max_rows=100,page_size=2))==wanted)
        from umf_access.targets import TargetMismatch
        for values in (['x'*10001],['x']*1001,['\x00']):
            try:queries.label_in(target,values=values)
            except (ValueError,TargetMismatch):pass
            else:raise AssertionError('invalid list input admitted')
        check('original list facets reject oversize and NUL',True)
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
