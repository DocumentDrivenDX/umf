from manifest_sales import queries as manifest
from mixed_sales import queries as mixed
from umf_access.commands import BulkTarget
from umf_access.manifest_commands import ManifestBulkTarget
class Proof: pass

def misuse(target: ManifestBulkTarget[Proof], raw: BulkTarget[Proof]) -> None:
    manifest.deactivate(raw, cutoff=100, active=False)
    manifest.deactivate(target, cutoff='100', active=False)
    manifest.deactivate(target, cutoff=100, active=None)
    mixed.set_optional(target, wanted=100, after='value')
    mixed.set_selected(target, after='value')
    mixed.set_selected(raw, wanted='id', after='value', unknown=True)
