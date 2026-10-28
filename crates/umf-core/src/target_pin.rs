// SPDX-License-Identifier: MIT OR Apache-2.0
//! Closed target identity matching for CONTRACT-072 pins.

use std::collections::HashSet;

/// The five exact fields used by a target pin, plus observed platform components.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TargetIdentity {
    pub kind: String,
    pub backend_id: String,
    pub backend_version: String,
    pub target_profile: String,
    pub binding_sha256: String,
    pub platform: Vec<PlatformComponent>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlatformComponent {
    pub name: String,
    pub version: String,
}

/// A qualified set of versions for each uniquely named platform component.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TargetPin {
    pub kind: String,
    pub backend_id: String,
    pub backend_version: String,
    pub target_profile: String,
    pub binding_sha256: String,
    pub platform: Vec<PlatformPin>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlatformPin {
    pub name: String,
    pub versions: Vec<String>,
}

impl TargetPin {
    /// Match exact identity fields and one-to-one platform names, allowing only
    /// versions explicitly qualified for each pinned component.
    pub fn matches(&self, identity: &TargetIdentity) -> bool {
        if self.kind != identity.kind
            || self.backend_id != identity.backend_id
            || self.backend_version != identity.backend_version
            || self.target_profile != identity.target_profile
            || self.binding_sha256 != identity.binding_sha256
            || self.platform.len() != identity.platform.len()
        {
            return false;
        }

        let mut pinned_names = HashSet::with_capacity(self.platform.len());
        let mut observed_names = HashSet::with_capacity(identity.platform.len());
        if !self
            .platform
            .iter()
            .all(|p| pinned_names.insert(p.name.as_str()))
            || !identity
                .platform
                .iter()
                .all(|p| observed_names.insert(p.name.as_str()))
        {
            return false;
        }

        identity.platform.iter().all(|observed| {
            self.platform
                .iter()
                .find(|pinned| pinned.name == observed.name)
                .is_some_and(|pinned| pinned.versions.iter().any(|v| v == &observed.version))
        })
    }
}
