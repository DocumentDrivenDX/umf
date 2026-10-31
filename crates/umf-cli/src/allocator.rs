// SPDX-License-Identifier: MIT OR Apache-2.0
//! Counts live requested bytes routed through Rust's global allocator.
//!
//! Accounting starts when the CLI process starts. The 512 MiB limit is enabled
//! only after `codegen` dispatch, before request parsing. It excludes Python,
//! libc allocations made outside Rust's global allocator, mapped files, stack,
//! allocator metadata and resident set size. All Rust allocations on all threads
//! share the same live-byte budget while codegen is active.

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicU64, Ordering};

const CODEGEN_LIMIT: u64 = 512 * 1024 * 1024;
const ACTIVE: u64 = 1 << 63;
const OVERFLOW: u64 = 1 << 62;
const COUNT_MASK: u64 = OVERFLOW - 1;

struct Accounting {
    /// ACTIVE, OVERFLOW and the exact live-byte count when OVERFLOW is clear.
    state: AtomicU64,
    peak: AtomicU64,
    cap: AtomicU64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReleaseFailure {
    Underflow,
    UntrackedOverflow,
}

impl Accounting {
    const fn new(cap: u64) -> Self {
        Self {
            state: AtomicU64::new(0),
            peak: AtomicU64::new(0),
            cap: AtomicU64::new(cap),
        }
    }

    /// Reserve requested bytes before asking the backing allocator. A false
    /// result means the caller must terminate or roll back without allocation.
    fn reserve(&self, bytes: u64) -> bool {
        let mut current = self.state.load(Ordering::Relaxed);
        loop {
            let active = current & ACTIVE != 0;
            if current & OVERFLOW != 0 {
                return !active;
            }
            let used = current & COUNT_MASK;
            let Some(next) = used.checked_add(bytes) else {
                if active {
                    return false;
                }
                let overflowed = current | OVERFLOW;
                match self.state.compare_exchange_weak(
                    current,
                    overflowed,
                    Ordering::AcqRel,
                    Ordering::Relaxed,
                ) {
                    Ok(_) => return true,
                    Err(observed) => current = observed,
                }
                continue;
            };
            if next > COUNT_MASK {
                if active {
                    return false;
                }
                let overflowed = current | OVERFLOW;
                match self.state.compare_exchange_weak(
                    current,
                    overflowed,
                    Ordering::AcqRel,
                    Ordering::Relaxed,
                ) {
                    Ok(_) => return true,
                    Err(observed) => current = observed,
                }
                continue;
            }
            if active && next > self.cap.load(Ordering::Relaxed) {
                return false;
            }
            let updated = (current & ACTIVE) | next;
            match self.state.compare_exchange_weak(
                current,
                updated,
                Ordering::AcqRel,
                Ordering::Relaxed,
            ) {
                Ok(_) => {
                    self.raise_peak(next);
                    return true;
                }
                Err(observed) => current = observed,
            }
        }
    }

    /// Release bytes after the backing allocator has released the block.
    fn release(&self, bytes: u64) -> Result<(), ReleaseFailure> {
        let mut current = self.state.load(Ordering::Relaxed);
        loop {
            if current & OVERFLOW != 0 {
                return if current & ACTIVE == 0 {
                    Ok(())
                } else {
                    Err(ReleaseFailure::UntrackedOverflow)
                };
            }
            let used = current & COUNT_MASK;
            let Some(next) = used.checked_sub(bytes) else {
                if current & ACTIVE != 0 {
                    return Err(ReleaseFailure::Underflow);
                }
                let overflowed = current | OVERFLOW;
                match self.state.compare_exchange_weak(
                    current,
                    overflowed,
                    Ordering::AcqRel,
                    Ordering::Relaxed,
                ) {
                    Ok(_) => return Ok(()),
                    Err(observed) => current = observed,
                }
                continue;
            };
            let updated = (current & ACTIVE) | next;
            match self.state.compare_exchange_weak(
                current,
                updated,
                Ordering::AcqRel,
                Ordering::Relaxed,
            ) {
                Ok(_) => return Ok(()),
                Err(observed) => current = observed,
            }
        }
    }

    /// Atomically activate enforcement with the process-start live tally intact.
    fn activate(&self) -> bool {
        let mut current = self.state.load(Ordering::Relaxed);
        loop {
            let updated = current | ACTIVE;
            match self.state.compare_exchange_weak(
                current,
                updated,
                Ordering::AcqRel,
                Ordering::Relaxed,
            ) {
                Ok(_) => {
                    return current & OVERFLOW == 0
                        && current & COUNT_MASK <= self.cap.load(Ordering::Relaxed);
                }
                Err(observed) => current = observed,
            }
        }
    }

    #[cfg(feature = "allocator-test")]
    fn set_cap_before_activation(&self, cap: u64) -> bool {
        if self.state.load(Ordering::Acquire) & ACTIVE != 0 {
            return false;
        }
        self.cap.store(cap, Ordering::Release);
        self.state.load(Ordering::Acquire) & ACTIVE == 0
    }

    #[cfg(test)]
    fn live(&self) -> Option<u64> {
        let state = self.state.load(Ordering::Acquire);
        (state & OVERFLOW == 0).then_some(state & COUNT_MASK)
    }

    #[cfg(test)]
    fn peak(&self) -> u64 {
        self.peak.load(Ordering::Acquire)
    }

    fn raise_peak(&self, value: u64) {
        let mut peak = self.peak.load(Ordering::Relaxed);
        while value > peak {
            match self
                .peak
                .compare_exchange_weak(peak, value, Ordering::Relaxed, Ordering::Relaxed)
            {
                Ok(_) => break,
                Err(observed) => peak = observed,
            }
        }
    }
}

static ACCOUNTING: Accounting = Accounting::new(CODEGEN_LIMIT);

struct CountingAllocator;

#[global_allocator]
static GLOBAL: CountingAllocator = CountingAllocator;

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if !ACCOUNTING.reserve(layout.size() as u64) {
            terminate_capacity();
        }
        // SAFETY: forwarded unchanged to the system allocator.
        let result = unsafe { System.alloc(layout) };
        if result.is_null() {
            release_or_terminate(layout.size() as u64);
        }
        result
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        if !ACCOUNTING.reserve(layout.size() as u64) {
            terminate_capacity();
        }
        // SAFETY: forwarded unchanged to the system allocator.
        let result = unsafe { System.alloc_zeroed(layout) };
        if result.is_null() {
            release_or_terminate(layout.size() as u64);
        }
        result
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: forwarded unchanged; caller supplies the original layout.
        unsafe { System.dealloc(ptr, layout) };
        release_or_terminate(layout.size() as u64);
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let old_size = layout.size() as u64;
        let new_size_u64 = new_size as u64;
        if new_size > layout.size() {
            // Reserve only growth before realloc. The live requested-byte tally
            // therefore reflects the replacement block before the operation's
            // peak, and rollback leaves the old block charged on failure.
            if !ACCOUNTING.reserve(new_size_u64 - old_size) {
                terminate_capacity();
            }
        }
        // SAFETY: forwarded unchanged; caller guarantees pointer/layout validity.
        let result = unsafe { System.realloc(ptr, layout, new_size) };
        if result.is_null() {
            if new_size > layout.size() {
                release_or_terminate(new_size_u64 - old_size);
            }
            return result;
        }
        if new_size < layout.size() {
            release_or_terminate(old_size - new_size_u64);
        }
        result
    }
}

/// Enable the hard limit after `codegen` dispatch and before reading a request.
pub(crate) fn activate_codegen() {
    if !ACCOUNTING.activate() {
        terminate_capacity();
    }
}

fn release_or_terminate(bytes: u64) {
    if let Err(failure) = ACCOUNTING.release(bytes) {
        match failure {
            ReleaseFailure::UntrackedOverflow => terminate_capacity(),
            ReleaseFailure::Underflow => terminate_accounting(),
        }
    }
}

#[cfg(feature = "allocator-test")]
pub(crate) fn configure_test_cap_from_env() {
    const VAR: &str = "UMF_TEST_RUST_ALLOC_CAP";
    if let Ok(raw) = std::env::var(VAR) {
        if let Ok(cap) = raw.parse::<u64>() {
            let _ = ACCOUNTING.set_cap_before_activation(cap);
        }
    }
}

#[cfg(feature = "allocator-test")]
pub(crate) fn test_probe_from_env() {
    const VAR: &str = "UMF_TEST_RUST_ALLOC_PROBE";
    if let Ok(raw) = std::env::var(VAR) {
        if let Ok(size) = raw.parse::<usize>() {
            let buffer = Vec::<u8>::with_capacity(size);
            std::hint::black_box(buffer);
        }
    }
}

#[cfg(unix)]
fn terminate_capacity() -> ! {
    unsafe extern "C" {
        fn _exit(status: i32) -> !;
    }
    // SAFETY: `_exit` is async-signal-safe, does not allocate, and terminates
    // this disposable worker without running destructors or allocator hooks.
    unsafe { _exit(73) }
}

#[cfg(unix)]
fn terminate_accounting() -> ! {
    unsafe extern "C" {
        fn _exit(status: i32) -> !;
    }
    // Exit 74 is reserved for an internal accounting invariant failure.
    unsafe { _exit(74) }
}

#[cfg(windows)]
fn terminate_capacity() -> ! {
    unsafe extern "system" {
        fn ExitProcess(exit_code: u32) -> !;
    }
    // SAFETY: `ExitProcess` terminates this disposable worker without cleanup.
    unsafe { ExitProcess(73) }
}

#[cfg(windows)]
fn terminate_accounting() -> ! {
    unsafe extern "system" {
        fn ExitProcess(exit_code: u32) -> !;
    }
    unsafe { ExitProcess(74) }
}

#[cfg(not(any(unix, windows)))]
fn terminate_capacity() -> ! {
    std::process::abort()
}

#[cfg(not(any(unix, windows)))]
fn terminate_accounting() -> ! {
    std::process::abort()
}

#[cfg(test)]
mod tests {
    use super::Accounting;

    #[test]
    fn tracks_allocation_release_reallocation_and_peak() {
        let accounting = Accounting::new(16);
        assert!(accounting.reserve(8));
        assert_eq!(accounting.live(), Some(8));
        assert!(accounting.reserve(4));
        assert_eq!(accounting.live(), Some(12));
        assert_eq!(accounting.peak(), 12);
        assert!(accounting.release(5).is_ok());
        assert_eq!(accounting.live(), Some(7));
        assert_eq!(accounting.peak(), 12);
    }

    #[test]
    fn realloc_growth_and_shrink_update_live_bytes_and_peak() {
        let accounting = Accounting::new(16);
        assert!(accounting.reserve(8));
        // Growth reserves only the replacement's additional requested bytes.
        assert!(accounting.reserve(8));
        assert_eq!(accounting.live(), Some(16));
        assert_eq!(accounting.peak(), 16);
        // Shrink releases the difference after the backing realloc succeeds.
        assert!(accounting.release(12).is_ok());
        assert_eq!(accounting.live(), Some(4));
        assert_eq!(accounting.peak(), 16);
        // A failed growth rolls its reservation back while retaining the old block.
        assert!(accounting.reserve(12));
        assert!(accounting.release(12).is_ok());
        assert_eq!(accounting.live(), Some(4));
    }

    #[test]
    fn activation_preserves_startup_allocations_and_enforces_growth() {
        let accounting = Accounting::new(10);
        assert!(accounting.reserve(7));
        assert!(accounting.activate());
        assert!(!accounting.reserve(4));
        assert!(accounting.reserve(3));
        assert_eq!(accounting.live(), Some(10));
    }

    #[test]
    fn activation_refuses_existing_live_bytes_over_cap() {
        let accounting = Accounting::new(9);
        assert!(accounting.reserve(10));
        assert!(!accounting.activate());
    }

    #[test]
    fn checked_overflow_is_sticky_and_cannot_weaken_active_limit() {
        let accounting = Accounting::new(16);
        assert!(accounting.reserve(u64::MAX));
        assert_eq!(accounting.live(), None);
        assert!(!accounting.activate());
    }

    #[test]
    fn concurrent_reservations_and_releases_remain_exact() {
        let accounting = std::sync::Arc::new(Accounting::new(1024));
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        let threads = (0..8)
            .map(|_| {
                let accounting = accounting.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    assert!(accounting.reserve(8));
                    barrier.wait();
                    assert!(accounting.release(8).is_ok());
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(accounting.live(), Some(0));
        assert_eq!(accounting.peak(), 64);
    }
}
