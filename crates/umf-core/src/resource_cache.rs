// SPDX-License-Identifier: MIT OR Apache-2.0
//! Publish successfully constructed immutable resources without running caller
//! work or host callbacks under an initialization lock.
use std::sync::{Arc, OnceLock};

/// Return the published instance even when another initializer wins the race.
/// Callers retain their existing admission, controls and cache-eligibility rules
/// and construct the candidate completely before calling this function.
pub fn publish_completed<T>(cache: &OnceLock<Arc<T>>, candidate: Arc<T>) -> Arc<T> {
    let _ = cache.set(candidate);
    Arc::clone(cache.get().expect("completed resource cache initialized"))
}
