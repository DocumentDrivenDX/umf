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
