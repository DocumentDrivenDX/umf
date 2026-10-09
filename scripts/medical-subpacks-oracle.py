"""Independent TableSpec ingestion/archive and DICOM metadata verification.

Run with TableSpec's Python environment for tabular checks, or pydicom's isolated
Python environment with --dicom-only. Writes distributables only with --output.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
from importlib.metadata import version
from pathlib import Path
import tempfile
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
PACKS = ['medical', 'medical-carrier', 'medical-epidemiology', 'medical-imaging', 'medical-terminology']


def dicom_check():
    # @covers US-055-AC4
    import pydicom

    root = ROOT / 'spec/domain-packs/medical-imaging/sources'
    obj = pydicom.dcmread(root / 'synthetic.dcm')
    assert str(obj.file_meta.TransferSyntaxUID) == '1.2.840.10008.1.2.1'
    assert str(obj.StudyInstanceUID) == '2.25.555010'
    assert str(obj.SeriesInstanceUID) == '2.25.555020'
    assert str(obj.SOPInstanceUID) == '2.25.555001'
    assert str(obj.PatientName) == 'SYNTHETIC^UMF'
    assert obj.PixelData == bytes(range(16))
    assert (obj.Rows, obj.Columns) == (4, 4)
    assert obj[0x00111001].VR == 'LO'
    assert obj[0x00111010].VR == 'SQ'
    decimal = obj[0x00111010].value[0][0x00111002]
    assert decimal.VR == 'DS'
    assert [str(v) for v in decimal.value] == ['1.2500', '2.5000']
    projected = json.loads((root / 'synthetic-dicom.json').read_text())
    assert obj.to_json_dict() == projected
    assert projected['00111010']['Value'][0]['00111002']['Value'] == [1.25, 2.5]
    pack = json.loads((root.parent / 'pack.json').read_text())
    assert '1.2500 to 1.25' in pack['qualification']['projection_losses'][0]
    public = pydicom.dcmread(root / 'tcia-lidc-0001-ct.dcm')
    selection = json.loads((root / 'tcia-selection.json').read_text())
    assert str(public.SOPInstanceUID) == selection['sop_instance_uid']
    assert str(public.SeriesInstanceUID) == selection['series_uid']
    assert str(public.StudyInstanceUID) == selection['study_uid']
    assert str(public.PatientID) == 'LIDC-IDRI-0001'
    assert str(public.file_meta.TransferSyntaxUID) == selection['transfer_syntax']
    assert hashlib.sha256((root / 'tcia-lidc-0001-ct.dcm').read_bytes()).hexdigest() == selection['member_sha256']
    expected = public.to_json_dict(bulk_data_threshold=1024, bulk_data_element_handler=lambda e: 'sources/tcia-lidc-0001-ct.dcm#tag-' + f'{int(e.tag):08X}')
    assert expected == json.loads((root / 'tcia-lidc-0001-ct.json').read_text())
    assert len([e for e in public.iterall() if e.tag.is_private]) == 3
    assert expected['7FE00010']['BulkDataURI'] == 'sources/tcia-lidc-0001-ct.dcm#tag-7FE00010'
    assert (public.Rows, public.Columns) == (512, 512)
    return {'oracle': 'pydicom', 'version': pydicom.__version__, 'python': platform.python_version(), 'checks': 24,
            'public_binary_sha256': selection['member_sha256'],
            'binary_sha256': hashlib.sha256((root / 'synthetic.dcm').read_bytes()).hexdigest()}


def tabular_check(output):
    # @covers US-055-AC6
    from tablespec.sample_data.ingest import ImportedDataset
    from tablespec.sample_data.archive import export_csv_zip, read_csv_rows

    results = []
    with tempfile.TemporaryDirectory(prefix='umf-medical-oracle-') as temporary:
        temp = Path(temporary)
        for name in PACKS:
            root = ROOT / 'spec/domain-packs' / name
            pack = json.loads((root / 'pack.json').read_text())
            data = ImportedDataset(temp / (name + '.sqlite'), root / 'pack.json')
            try:
                assert data.verified
                assert data.counts == pack['fixture_counts']
                try:
                    data.generate()
                except ValueError as error:
                    assert 'synthetically' in str(error)
                else:
                    raise AssertionError('External rows must not execute a generator')
                archives = [temp / (name + '-a.zip'), temp / (name + '-b.zip')]
                for path in archives:
                    export_csv_zip(data, path)
                assert archives[0].read_bytes() == archives[1].read_bytes()
                with ZipFile(archives[0]) as archive:
                    manifest = json.loads(archive.read('manifest.json'))
                    assert manifest['origin'] == 'external'
                    for reference, member in manifest['source_artifacts'].items():
                        assert archive.read(member) == (root / reference).read_bytes()
                    for schema in pack['schemas']:
                        assert archive.read(manifest['schema_artifacts'][schema['reference']]) == (root / schema['reference']).read_bytes()
                        if schema['format'] != 'tablespec':
                            continue
                        native = json.loads((root / schema['reference']).read_text())
                        bindings = [b for b in pack['source_bindings'] if b['schema_id'] == schema['id'] and b['role'] == 'rows']
                        assert len(bindings) == 1
                        source = pack['sources'][bindings[0]['source_id']]
                        expected = list(read_csv_rows(root / source['reference'], native))
                        actual = [row for batch in data.batches(schema['id']) for row in batch]
                        assert actual == expected
                        if schema['id'].startswith('cms_'):
                            kind = {'cms_beneficiaries': 'beneficiaries', 'cms_inpatient_claims': 'inpatient', 'cms_carrier_claims': 'carrier'}[schema['id']]
                            with (root / ('sources/cms-' + kind + '.csv')).open(newline='') as original:
                                native_rows = list(csv.DictReader(original))
                            assert len(native_rows) == len(actual)
                            for native_row, projected in zip(native_rows, actual):
                                assert all(projected[column] == value for column, value in native_row.items())
                                if kind == 'carrier':
                                    assert all(not value or (value[0].isalpha() and len(value) == 5) for column, value in native_row.items() if column.startswith('HCPCS_CD_'))
                        recovered = temp / 'recovered.csv'
                        recovered.write_bytes(archive.read('data/' + schema['id'] + '.csv'))
                        assert list(read_csv_rows(recovered, native)) == expected
                if output:
                    target = Path(output) / (name + '-' + pack['version'] + '.zip')
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archives[0].read_bytes())
                results.append({'pack': name, 'tables': len(data.specs), 'rows': sum(data.counts.values()),
                                'archive_sha256': hashlib.sha256(archives[0].read_bytes()).hexdigest(),
                                'originals': len(data.source_artifacts)})
            finally:
                data.close()
    return {'oracle': 'TableSpec local ingestion/archive', 'version': version('tablespec'), 'python': platform.python_version(), 'packs': results}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dicom-only', action='store_true')
    parser.add_argument('--output')
    args = parser.parse_args()
    print(json.dumps(dicom_check() if args.dicom_only else tabular_check(args.output), indent=2))
