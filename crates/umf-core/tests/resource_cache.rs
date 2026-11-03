// SPDX-License-Identifier: MIT OR Apache-2.0
use std::sync::{Arc, Barrier, OnceLock};
use umf_core::resource_cache::publish_completed;

#[test]
fn racing_completed_initializers_return_one_published_instance() {
    let cache = Arc::new(OnceLock::new());
    let ready = Arc::new(Barrier::new(8));
    let workers: Vec<_> = (0..8)
        .map(|value| {
            let cache = Arc::clone(&cache);
            let ready = Arc::clone(&ready);
            std::thread::spawn(move || {
                let candidate = Arc::new(value);
                ready.wait();
                publish_completed(&cache, candidate)
            })
        })
        .collect();
    let results: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    let published = cache.get().unwrap();
    assert!(results.iter().all(|result| Arc::ptr_eq(result, published)));
    assert!(Arc::ptr_eq(
        &publish_completed(&cache, Arc::new(99)),
        published
    ));
}

// This is the pre-fix algorithm, retained only as a deterministic negative control.
fn old_publish_completed<T>(cache: &OnceLock<Arc<T>>, candidate: Arc<T>) -> Arc<T> {
    let _ = cache.set(Arc::clone(&candidate));
    candidate
}

#[test]
fn old_algorithm_control_returns_an_unpublished_loser() {
    let cache = OnceLock::new();
    let published = Arc::new("winner");
    assert!(cache.set(Arc::clone(&published)).is_ok());
    let loser = old_publish_completed(&cache, Arc::new("loser"));
    assert_eq!(*loser, "loser");
    assert!(!Arc::ptr_eq(&loser, cache.get().unwrap()));
    assert!(Arc::ptr_eq(
        &publish_completed(&cache, Arc::new("candidate")),
        cache.get().unwrap()
    ));
}
