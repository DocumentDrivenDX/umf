// SPDX-License-Identifier: MIT OR Apache-2.0
//! Publish successfully constructed immutable resources without running caller
//! work or host callbacks under an initialization lock.

/// Return the published instance even when another initializer wins the race.
/// Callers retain their existing admission, controls and cache-eligibility rules
/// and construct the candidate completely before calling this function.
pub fn publish_completed<T>(cache: &OnceLock<Arc<T>>, candidate: Arc<T>) -> Arc<T> {
    let _ = cache.set(candidate);
    Arc::clone(cache.get().expect("completed resource cache initialized"))
}

use crate::{Context, EngineError, Utf16};
use std::{
    ops::Deref,
    sync::{Arc, OnceLock},
};
#[doc(hidden)]
#[derive(Debug)]
pub struct Fixed<T> {
    value: Arc<T>,
    work: u64,
}
#[doc(hidden)]
pub enum Prepared<T> {
    Shared(Arc<T>),
    Owned(T),
}
impl<T> Deref for Prepared<T> {
    type Target = T;
    fn deref(&self) -> &T {
        match self {
            Self::Shared(value) => value,
            Self::Owned(value) => value,
        }
    }
}
// Every cell belongs to one constructor over compile-time built-in sources.
// No source text, caller key, hash, Context, or callback is retained. Inputs
// and result verification remain per-call. Nondefault/controlled calls run the
// original constructor; only unobserved ordinary fixed-resource work reuses.
#[doc(hidden)]
pub fn prepare<T>(
    cell: &OnceLock<Fixed<T>>,
    ctx: &mut Context<'_>,
    build: impl FnOnce(&mut Context<'_>) -> Result<T, EngineError>,
) -> Result<Prepared<T>, EngineError> {
    prepare_profile(cell, ctx, crate::context::Limits::ordinary(), build)
}

// Each cell must belong to exactly one immutable constructor and exact limit
// profile. Live controls, observers and every other limit shape stay cold.
#[doc(hidden)]
pub fn prepare_profile<T>(
    cell: &OnceLock<Fixed<T>>, ctx: &mut Context<'_>, limits: crate::context::Limits,
    build: impl FnOnce(&mut Context<'_>) -> Result<T, EngineError>,
) -> Result<Prepared<T>, EngineError> {
    if !ctx.can_reuse_fixed_resource_profile(limits) {
        return build(ctx).map(Prepared::Owned);
    }
    if let Some(fixed) = cell.get() {
        if ctx.charged_work().checked_add(fixed.work).is_none() {
            return build(ctx).map(Prepared::Owned);
        }
        ctx.charge_work_u64(fixed.work, Utf16::default())?;
        return Ok(Prepared::Shared(Arc::clone(&fixed.value)));
    }
    let before = ctx.charged_work();
    let steps = ctx.constraint_steps();
    let value = build(ctx)?;
    // Never omit semantic instructions or reset the invocation's counters.
    if ctx.constraint_steps() != steps {
        return Ok(Prepared::Owned(value));
    }
    ctx.charge_work(1, Utf16::default())?;
    let value = Arc::new(value);
    let work = ctx.charged_work() - before;
    let _ = cell.set(Fixed {
        value: Arc::clone(&value),
        work,
    });
    Ok(Prepared::Shared(value))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    #[test]
    fn exact_receipt_profile_reuses_without_accepting_other_limits_or_controls() {
        let cell = OnceLock::new();
        let limits = crate::context::Limits { max_text_units: 32 * 1024 * 1024, ..crate::context::Limits::ordinary() };
        let builds = Cell::new(0);
        let build = |ctx: &mut Context<'_>| { builds.set(builds.get() + 1); ctx.charge_work(42, Utf16::default())?; Ok(7) };
        let mut cold = Context::ordinary_construction();
        assert!(matches!(cold.with_aggregate_text_limit(limits.max_text_units, |ctx| prepare_profile(&cell, ctx, limits, build)).unwrap(), Prepared::Shared(_)));
        let mut warm = Context::ordinary_construction();
        assert!(matches!(warm.with_aggregate_text_limit(limits.max_text_units, |ctx| prepare_profile(&cell, ctx, limits, build)).unwrap(), Prepared::Shared(_)));
        assert_eq!(cold.charged_work(), warm.charged_work());
        assert_eq!(builds.get(), 1);
        let mut ordinary = Context::ordinary_construction();
        assert!(matches!(prepare_profile(&cell, &mut ordinary, limits, build).unwrap(), Prepared::Owned(_)));
        let mut meter_calls = 0;
        let mut hook = |_: usize| { meter_calls += 1; Ok(()) };
        let mut controlled = Context::ordinary().with_host_control(&mut hook);
        assert!(matches!(controlled.with_aggregate_text_limit(limits.max_text_units, |ctx| prepare_profile(&cell, ctx, limits, build)).unwrap(), Prepared::Owned(_)));
        drop(controlled);
        assert!(meter_calls > 0);
        let mut other = Context::with_limits(crate::ResourceProfile::Cooperative, crate::context::Limits { max_depth: 127, ..limits }).unwrap();
        assert!(matches!(other.with_codegen_construction(|ctx| prepare_profile(&cell, ctx, limits, build)).unwrap(), Prepared::Owned(_)));
        assert_eq!(builds.get(), 4);
    }

    #[test]
    fn only_uncontrolled_ordinary_preparation_reuses_and_work_stays_cumulative() {
        let cell = OnceLock::new();
        let builds = Cell::new(0);
        let build = |ctx: &mut Context<'_>| {
            builds.set(builds.get() + 1);
            ctx.charge_work(42, Utf16::default())?;
            Ok(7)
        };
        let mut a = Context::ordinary();
        let first = a
            .with_codegen_construction(|ctx| prepare(&cell, ctx, build))
            .unwrap();
        let mut b = Context::ordinary();
        let second = b
            .with_codegen_construction(|ctx| prepare(&cell, ctx, build))
            .unwrap();
        assert_eq!(*first, 7);
        assert_eq!(*second, 7);
        assert_eq!(builds.get(), 1);
        assert_eq!(a.charged_work(), b.charged_work());
        let mut events = Vec::new();
        let mut control = |n: usize| {
            events.push(n);
            Ok(())
        };
        let mut c = Context::ordinary().with_host_control(&mut control);
        assert_eq!(
            *c.with_codegen_construction(|ctx| prepare(&cell, ctx, build))
                .unwrap(),
            7
        );
        drop(c);
        assert_eq!(builds.get(), 2);
        assert_eq!(events, vec![1, 42]);
        let mut limits = crate::Limits::ordinary();
        limits.max_values = 1;
        let mut d = Context::with_limits(crate::ResourceProfile::Cooperative, limits).unwrap();
        d.with_codegen_construction(|ctx| prepare(&cell, ctx, build))
            .unwrap();
        assert_eq!(builds.get(), 3);
    }
    #[test]
    fn warm_counter_overflow_retains_constructor_error_origin_and_prefix() {
        let cell = OnceLock::new();
        let build = |ctx: &mut Context<'_>| {
            ctx.charge_work(3, Utf16::from("/first"))?;
            ctx.charge_work(42, Utf16::from("/source"))?;
            Ok(7)
        };
        Context::ordinary().with_codegen_construction(|ctx| prepare(&cell, ctx, build)).unwrap();
        let mut cached = Context::ordinary();
        let mut fresh = Context::ordinary();
        cached.carry_transport_usage(u64::MAX - 10, 0);
        fresh.carry_transport_usage(u64::MAX - 10, 0);
        let actual = cached.with_codegen_construction(|ctx| prepare(&cell, ctx, build)).err().unwrap();
        let expected = fresh.with_codegen_construction(build).err().unwrap();
        assert_eq!((actual.code, actual.path, actual.message), (expected.code, expected.path, expected.message));
        assert_eq!(cached.charged_work(), fresh.charged_work());
    }
    #[test]
    fn instruction_consuming_or_failed_construction_is_never_published() {
        let cell = OnceLock::new();
        let mut a = Context::ordinary();
        a.with_codegen_construction(|ctx| {
            prepare(&cell, ctx, |ctx| {
                ctx.charge_constraint_step(Utf16::default())?;
                Ok(7)
            })
        })
        .unwrap();
        assert!(cell.get().is_none());
        let mut b = Context::ordinary();
        let result = b.with_codegen_construction(|ctx| {
            prepare::<i32>(&cell, ctx, |_| {
                Err(EngineError::new("LIMIT", Utf16::from("/source"), "stop"))
            })
        });
        assert!(result.is_err());
        assert!(cell.get().is_none());
    }
}
