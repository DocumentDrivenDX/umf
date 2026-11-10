// SPDX-License-Identifier: MIT OR Apache-2.0
//! Plain resource bundles shared by the full engine and the source-bound
//! metamodel-compiler closure (which has no `engine` module).
use crate::value::Value;
#[derive(Clone, Debug)]
pub struct ResourceSet {
    pub core_schema: Value,
    pub reference_schema: Value,
    pub package_schema: Value,
    pub constraints: Value,
    pub domain_policy: Value,
}
impl ResourceSet {
    pub fn new(
        core_schema: Value,
        reference_schema: Value,
        package_schema: Value,
        constraints: Value,
        domain_policy: Value,
    ) -> Self {
        Self {
            core_schema,
            reference_schema,
            package_schema,
            constraints,
            domain_policy,
        }
    }
}
#[derive(Debug)]
/// Internal consuming input bundle; the ordinary ResourceSet is unchanged.
#[doc(hidden)]
pub struct OwnedResourceSet {
    pub core_schema:crate::value::OwnedCoreJson,
    pub reference_schema:crate::value::OwnedCoreJson,
    pub package_schema:crate::value::OwnedCoreJson,
    pub constraints:crate::value::OwnedCoreJson,
    pub domain_policy:crate::value::OwnedCoreJson,
}
impl OwnedResourceSet {
    pub(crate) fn into_raw(self)->ResourceSet {ResourceSet{core_schema:self.core_schema.into_raw(),reference_schema:self.reference_schema.into_raw(),package_schema:self.package_schema.into_raw(),constraints:self.constraints.into_raw(),domain_policy:self.domain_policy.into_raw()}}
}
