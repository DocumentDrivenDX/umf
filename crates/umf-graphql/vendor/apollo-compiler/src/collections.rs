//! Type aliases for hashing-based collections configured with a specific hasher,
//! as used in various places thorough the API

use std::collections::hash_map::DefaultHasher;
use std::hash::BuildHasherDefault;

/// Deterministic standard-library hasher used by the vendored offline runtime.
pub type DeterministicState = BuildHasherDefault<DefaultHasher>;

/// [`indexmap::IndexMap`] configured with a specific hasher
pub type IndexMap<K, V> = indexmap::IndexMap<K, V, DeterministicState>;

/// [`indexmap::IndexSet`] configured with a specific hasher
pub type IndexSet<T> = indexmap::IndexSet<T, DeterministicState>;

/// [`std::collections::HashMap`] configured with a specific hasher
pub type HashMap<K, V> = std::collections::HashMap<K, V, DeterministicState>;

/// [`std::collections::HashSet`] configured with a specific hasher
pub type HashSet<T> = std::collections::HashSet<T, DeterministicState>;
