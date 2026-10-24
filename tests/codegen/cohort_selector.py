# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure selector/inventory checks for the immutable embedder cohort."""
from __future__ import annotations

import re
import urllib.parse


def normalized_name(value: str) -> str:
    return re.sub(r'[-_.]+', '-', value).lower()


def validate_exact_wheel_inventory(packages: list[dict], wheels: list[dict]) -> None:
    """Require one selected wheel for each template distribution, no extras."""
    expected = [normalized_name(item['distribution']) for item in packages]
    actual = [normalized_name(item['distribution']) for item in wheels]
    if (not expected or len(set(expected)) != len(expected)
            or len(actual) != len(expected) or len(set(actual)) != len(actual)
            or set(actual) != set(expected)):
        raise ValueError('Wheel inventory must contain exactly one wheel for every declared distribution')


def validate_release_asset_urls(repository_url: str, release_tag: str,
                                wheel_url: str, wheel_filename: str,
                                sdist_url: str, sdist_filename: str) -> None:
    """Require both selected files to be assets of this exact repository release."""
    repository = urllib.parse.urlparse(repository_url)
    wheel = urllib.parse.urlparse(wheel_url)
    sdist = urllib.parse.urlparse(sdist_url)
    if any(url.scheme != 'https' or not url.netloc or url.query or url.fragment
           for url in (repository, wheel, sdist)):
        raise ValueError('Release and asset URLs must be HTTPS URLs without query or fragment')
    repo_parts = [part for part in repository.path.removesuffix('.git').split('/') if part]
    wheel_parts = [part for part in wheel.path.split('/') if part]
    sdist_parts = [part for part in sdist.path.split('/') if part]
    if not repo_parts or wheel.netloc != repository.netloc or sdist.netloc != repository.netloc:
        raise ValueError('Selected assets must use the repository host and a nonempty repository path')
    if (wheel_parts[:len(repo_parts)] != repo_parts
            or wheel_parts[len(repo_parts):] != ['releases', 'download', release_tag, wheel_filename]):
        raise ValueError('Core wheel URL must be the selected immutable asset under this repository release tag')
    if (sdist_parts[:len(repo_parts)] != repo_parts
            or sdist_parts[len(repo_parts):] != ['releases', 'download', release_tag, sdist_filename]):
        raise ValueError('Core sdist URL must be the selected built source asset under this repository release tag')


def dependency_closure(root_distributions: list[str], package_catalog: list[dict],
                       metadata_by_distribution: dict[str, dict], marker_environment: dict) -> list[str]:
    """Resolve exact pinned wheel rows using active Requires-Dist markers/specifiers.

    `metadata_by_distribution` must be read from the exact candidate wheel files,
    including roots and every catalog row. Roots are explicitly supplied by the
    profile; only their transitive active Requires-Dist closure is added.
    """
    return resolve_dependency_closure(root_distributions, package_catalog,
                                      metadata_by_distribution, marker_environment)['selectedNormalizedDistributions']


def resolve_dependency_closure(root_distributions: list[str], package_catalog: list[dict],
                               metadata_by_distribution: dict[str, dict], marker_environment: dict) -> dict:
    """Resolve closure and retain each checked edge for lock auditability."""
    try:
        from packaging.requirements import Requirement
        from packaging.utils import canonicalize_name
        from packaging.version import Version
    except ImportError:
        from pip._vendor.packaging.requirements import Requirement
        from pip._vendor.packaging.utils import canonicalize_name
        from pip._vendor.packaging.version import Version

    catalog = {canonicalize_name(row['distribution']): row for row in package_catalog}
    if len(catalog) != len(package_catalog):
        raise ValueError('Pinned package catalog contains duplicate normalized distributions')
    selected = set()
    pending = [canonicalize_name(name) for name in root_distributions]
    checked_requirements = []
    while pending:
        name = pending.pop()
        if name in selected:
            continue
        row = catalog.get(name)
        metadata = metadata_by_distribution.get(name)
        if row is None or metadata is None:
            raise ValueError(f'Exact pinned metadata is missing for required distribution {name}')
        if canonicalize_name(metadata['distribution']) != name:
            raise ValueError(f'Wheel METADATA identity differs from its selected catalog row: {name}')
        if Version(metadata['version']) != Version(row['version']):
            raise ValueError(f'Wheel METADATA version differs from pinned catalog row: {name}')
        selected.add(name)
        for raw_requirement in metadata.get('requiresDist', []):
            requirement = Requirement(raw_requirement)
            active = requirement.marker is None or requirement.marker.evaluate(marker_environment)
            checked_requirements.append({'from': name, 'requirement': raw_requirement, 'active': active})
            if not active:
                continue
            if requirement.extras:
                raise ValueError(f'Active requirement extras are outside the closed pinned profile: {raw_requirement!r}')
            if requirement.url:
                raise ValueError(f'Active direct-URL requirement is outside the closed pinned profile: {raw_requirement!r}')
            dependency = canonicalize_name(requirement.name)
            dependency_row = catalog.get(dependency)
            if dependency_row is None:
                raise ValueError(f'Active requirement {raw_requirement!r} has no pinned catalog row')
            if requirement.specifier and not requirement.specifier.contains(dependency_row['version'], prereleases=True):
                raise ValueError(f'Pinned version for {dependency} does not satisfy {raw_requirement!r}')
            pending.append(dependency)
    return {'selectedNormalizedDistributions': sorted(selected),
            'checkedRequirements': sorted(checked_requirements,
                                         key=lambda edge: (edge['from'], edge['requirement']))}
