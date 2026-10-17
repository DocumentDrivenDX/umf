from typing import Awaitable, assert_type
from manifest_sales import queries as manifest
from mixed_sales import queries as mixed
from umf_access.commands import BulkTarget, AsyncBulkTarget
from umf_access.manifest_commands import ManifestBulkTarget, AsyncManifestBulkTarget
class Proof: pass

def calls(target: ManifestBulkTarget[Proof], async_target: AsyncManifestBulkTarget[Proof], raw: BulkTarget[Proof], async_raw: AsyncBulkTarget[Proof]) -> None:
    assert_type(manifest.deactivate(target, cutoff=100, active=False), Proof)
    assert_type(manifest.deactivate(async_target, cutoff=100, active=False), Awaitable[Proof])
    assert_type(manifest.deactivate_optional(target, active=True), Proof)
    assert_type(manifest.deactivate_optional(target, cutoff=101, active=True), Proof)
    assert_type(mixed.set_selected(target, wanted='id', after='value'), Proof)
    assert_type(mixed.set_selected(raw, wanted='id', after='value'), Proof)
    assert_type(mixed.set_selected(async_target, wanted='id', after='value'), Awaitable[Proof])
    assert_type(mixed.set_selected(async_raw, wanted='id', after='value'), Awaitable[Proof])
    assert_type(mixed.set_optional(raw, after='value'), Proof)

async def awaiting(target: AsyncManifestBulkTarget[Proof], raw: AsyncBulkTarget[Proof]) -> None:
    assert_type(await manifest.deactivate(target, cutoff=100, active=False), Proof)
    assert_type(await mixed.set_selected(raw, wanted='id', after='value'), Proof)
