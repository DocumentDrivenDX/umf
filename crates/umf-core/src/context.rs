// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{error::EngineError, value::Utf16};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResourceProfile {
    Cooperative,
    HardIsolated,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Limits {
    pub max_text_units: usize,
    pub max_depth: usize,
    pub max_values: usize,
    pub max_constraint_steps: usize,
    pub max_coefficient_digits: usize,
}

impl Limits {
    pub const fn ordinary() -> Self {
        Self {
            max_text_units: 4_000_000,
            max_depth: 128,
            max_values: 100_000,
            max_constraint_steps: 5_000_000,
            max_coefficient_digits: 4_000_000,
        }
    }

    pub const fn catalog() -> Self {
        Self {
            max_values: 1_000_000,
            ..Self::ordinary()
        }
    }
}

pub type WorkMeter<'a> = dyn FnMut(usize) -> Result<(), EngineError> + 'a;
pub type CancellationCheck<'a> = dyn FnMut() -> bool + 'a;
pub type Clock<'a> = dyn FnMut() -> Option<u64> + 'a;
pub type FallibleCancellationCheck<'a> = dyn FnMut() -> Result<bool, EngineError> + 'a;
pub type FallibleClock<'a> = dyn FnMut() -> Result<Option<u64>, EngineError> + 'a;

/// Per-invocation limits and explicit host capabilities. The context owns all
/// counters; no global or ambient runtime state is consulted.
pub struct Context<'a> {
    limits: Limits,
    profile: ResourceProfile,
    charged_work: u64,
    constraint_steps: usize,
    meter: Option<&'a mut WorkMeter<'a>>,
    host_control: Option<&'a mut WorkMeter<'a>>,
    cancellation: Option<&'a mut CancellationCheck<'a>>,
    clock: Option<&'a mut Clock<'a>>,
    fallible_cancellation: Option<&'a mut FallibleCancellationCheck<'a>>,
    fallible_clock: Option<&'a mut FallibleClock<'a>>,
    deadline_ms: Option<u64>,
}

/// Work accumulated by transport decoders for one host operation.
/// Bindings reuse this value across independent response decodes, while a new
/// host operation starts with `Default` or calls `reset`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TransportUsage {
    charged_work: u64,
    constraint_steps: usize,
}

impl TransportUsage {
    pub fn seed(&self, context: &mut Context<'_>) {
        context.carry_transport_usage(self.charged_work, self.constraint_steps);
    }

    pub fn capture(&mut self, context: &Context<'_>) {
        self.charged_work = context.charged_work();
        self.constraint_steps = context.constraint_steps();
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn charged_work(&self) -> u64 {
        self.charged_work
    }

    pub fn constraint_steps(&self) -> usize {
        self.constraint_steps
    }
}

/// Restores a temporary trusted schema traversal allowance on both normal
/// return and Rust unwinding; all counters and host capabilities remain owned
/// by the original Context throughout the scope.
struct SchemaDepthScope<'ctx, 'cap> {
    context: &'ctx mut Context<'cap>,
    original: usize,
}
impl Drop for SchemaDepthScope<'_, '_> {
    fn drop(&mut self) {
        self.context.limits.max_depth = self.original;
    }
}

/// Restores the ordinary source-text bound after parsing a bounded aggregate
/// whose individually admitted documents are carried as string values.
struct AggregateTextScope<'ctx, 'cap> {
    context: &'ctx mut Context<'cap>,
    original: usize,
}

/// Restores the ordinary tree value ceiling after admitting one or more
/// trusted catalog resources. Counters and host capabilities remain attached
/// to the original operation Context.
struct CatalogValueScope<'ctx, 'cap> {
    context: &'ctx mut Context<'cap>,
    original: usize,
}
/// Temporarily admits the larger tagged-wire representation while retaining
/// this invocation's counters and host controls.
struct TaggedTransportScope<'ctx, 'cap> {
    context: &'ctx mut Context<'cap>,
    original: Limits,
}
impl Drop for TaggedTransportScope<'_, '_> {
    fn drop(&mut self) {
        self.context.limits = self.original;
    }
}
impl Drop for CatalogValueScope<'_, '_> {
    fn drop(&mut self) {
        self.context.limits.max_values = self.original;
    }
}
impl Drop for AggregateTextScope<'_, '_> {
    fn drop(&mut self) {
        self.context.limits.max_text_units = self.original;
    }
}

impl<'a> Context<'a> {
    pub fn ordinary() -> Self {
        Self::with_limits(ResourceProfile::Cooperative, Limits::ordinary())
            .expect("the cooperative profile is available")
    }

    pub fn catalog() -> Self {
        Self::with_limits(ResourceProfile::Cooperative, Limits::catalog())
            .expect("the cooperative profile is available")
    }

    pub fn with_limits(profile: ResourceProfile, limits: Limits) -> Result<Self, EngineError> {
        if profile == ResourceProfile::HardIsolated {
            return Err(EngineError::new(
                "RESOURCE_PROFILE_UNAVAILABLE",
                Utf16::default(),
                "HardIsolated resource profile is unavailable",
            ));
        }
        Ok(Self {
            limits,
            profile,
            charged_work: 0,
            constraint_steps: 0,
            meter: None,
            host_control: None,
            cancellation: None,
            clock: None,
            fallible_cancellation: None,
            fallible_clock: None,
            deadline_ms: None,
        })
    }

    pub fn with_meter(mut self, meter: &'a mut WorkMeter<'a>) -> Self {
        self.meter = Some(meter);
        self
    }

    /// Attach an explicit host-owned cooperative control hook. Bindings use
    /// this for cancellation, deadlines, and additional work budgets. It is
    /// called during Rust work admission and never selected by document data.
    pub fn with_host_control(mut self, control: &'a mut WorkMeter<'a>) -> Self {
        self.host_control = Some(control);
        self
    }

    pub fn with_cancellation(mut self, check: &'a mut CancellationCheck<'a>) -> Self {
        self.cancellation = Some(check);
        self
    }

    pub fn with_fallible_cancellation(
        mut self,
        check: &'a mut FallibleCancellationCheck<'a>,
    ) -> Self {
        self.fallible_cancellation = Some(check);
        self
    }

    pub fn with_clock(mut self, clock: &'a mut Clock<'a>, deadline_ms: u64) -> Self {
        self.clock = Some(clock);
        self.deadline_ms = Some(deadline_ms);
        self
    }

    pub fn with_fallible_clock(
        mut self,
        clock: &'a mut FallibleClock<'a>,
        deadline_ms: u64,
    ) -> Self {
        self.fallible_clock = Some(clock);
        self.deadline_ms = Some(deadline_ms);
        self
    }

    pub fn limits(&self) -> Limits {
        self.limits
    }

    /// Allow bounded schema-only hops while interpreting a trusted fixed schema
    /// over input that has already passed this Context's ordinary JSON admission.
    /// This is not source admission: the original depth is restored afterward,
    /// including on unwind, and work/instruction counters and capabilities are
    /// never copied or reset.
    pub fn with_schema_depth_allowance<T>(
        &mut self,
        maximum: usize,
        operation: impl FnOnce(&mut Context<'a>) -> T,
    ) -> T {
        let original = self.limits.max_depth;
        self.limits.max_depth = original.max(maximum);
        let scope = SchemaDepthScope {
            context: self,
            original,
        };
        operation(&mut *scope.context)
    }

    /// Parse an internal aggregate archive with a separate bounded text budget.
    /// The requested allowance never exceeds32 Mi UTF-16 units. Individual
    /// source documents must still enforce their own original admission bound.
    /// This changes only the text ceiling: all counters and host capabilities
    /// stay in this Context, and the original ceiling is restored on unwind.
    pub fn with_aggregate_text_limit<T>(
        &mut self,
        maximum: usize,
        operation: impl FnOnce(&mut Context<'a>) -> T,
    ) -> T {
        let original = self.limits.max_text_units;
        self.limits.max_text_units = maximum.min(32 * 1024 * 1024);
        let scope = AggregateTextScope {
            context: self,
            original,
        };
        operation(&mut *scope.context)
    }

    /// Temporarily allow the independently bounded catalog value budget while
    /// admitting trusted engine resources. Ordinary input admission resumes
    /// before the caller performs its semantic operation.
    pub fn with_catalog_value_limit<T>(
        &mut self,
        operation: impl FnOnce(&mut Context<'a>) -> T,
    ) -> T {
        let original = self.limits.max_values;
        self.limits.max_values = Limits::catalog().max_values;
        let scope = CatalogValueScope {
            context: self,
            original,
        };
        operation(&mut *scope.context)
    }

    /// Temporarily apply the independent tagged-wire text, depth, and
    /// structural bounds. Work, constraint counters, and host controls remain
    /// cumulative on this Context and ordinary limits are restored on unwind.
    pub fn with_tagged_transport_limit<T>(
        &mut self,
        operation: impl FnOnce(&mut Context<'a>) -> T,
    ) -> T {
        let original = self.limits;
        self.limits.max_text_units = usize::MAX;
        self.limits.max_depth = 256;
        self.limits.max_values = usize::MAX;
        let scope = TaggedTransportScope {
            context: self,
            original,
        };
        operation(&mut *scope.context)
    }

    pub fn profile(&self) -> ResourceProfile {
        self.profile
    }

    pub fn charged_work(&self) -> u64 {
        self.charged_work
    }

    pub fn constraint_steps(&self) -> usize {
        self.constraint_steps
    }

    /// Seed an already-accounted transport decoder with counters accumulated
    /// by earlier response decodes in the same host operation. This does not
    /// charge the host meter again; subsequent work is charged normally.
    pub fn carry_transport_usage(&mut self, charged_work: u64, constraint_steps: usize) {
        self.charged_work = charged_work;
        self.constraint_steps = constraint_steps;
    }

    /// Admit UTF-16 source/output units before allocating their storage.
    /// Direct value/interpreter copies use `charge_work` without a text ceiling.
    pub fn charge_text(&mut self, units: usize, path: Utf16) -> Result<(), EngineError> {
        if units > self.limits.max_text_units {
            return Err(EngineError::new("LIMIT", path, "Text-unit limit exceeded"));
        }
        self.charge_work(units, Utf16::default())
    }

    pub fn check_tree_value_count(&self, count: usize, path: Utf16) -> Result<(), EngineError> {
        if count > self.limits.max_values {
            return Err(EngineError::new(
                "LIMIT",
                path,
                "JSON structural value limit exceeded",
            ));
        }
        Ok(())
    }

    pub fn charge_constraint_step(&mut self, path: Utf16) -> Result<(), EngineError> {
        self.constraint_steps = self.constraint_steps.saturating_add(1);
        if self.constraint_steps > self.limits.max_constraint_steps {
            return Err(EngineError::new(
                "LIMIT",
                path,
                "Constraint instruction limit exceeded",
            ));
        }
        self.charge_work(1, Utf16::default())
    }

    pub fn charge_work(&mut self, amount: usize, path: Utf16) -> Result<(), EngineError> {
        self.charge_work_u64(amount as u64, path)
    }

    /// Wide operation estimates and totals have identical representation on
    /// native and wasm32. Host notifications use the same bounded chunks on
    /// both targets, preserving the existing usize callback interface.
    pub fn charge_work_u64(&mut self, amount: u64, path: Utf16) -> Result<(), EngineError> {
        let Some(total) = self.charged_work.checked_add(amount) else {
            return Err(EngineError::new("LIMIT", path, "Work counter overflow"));
        };
        self.charged_work = total;
        if self.meter.is_none()
            && self.host_control.is_none()
            && self.cancellation.is_none()
            && self.fallible_cancellation.is_none()
            && self.deadline_ms.is_none()
        {
            return Ok(());
        }
        let mut remaining = amount;
        loop {
            let chunk = remaining.min(u64::from(u32::MAX)) as usize;
            if let Some(meter) = self.meter.as_deref_mut() {
                meter(chunk).map_err(EngineError::from_host)?;
            }
            if let Some(control) = self.host_control.as_deref_mut() {
                control(chunk).map_err(EngineError::from_host)?;
            }
            self.check_cancelled(path.clone())?;
            self.check_deadline(path.clone())?;
            remaining -= chunk as u64;
            if remaining == 0 {
                return Ok(());
            }
        }
    }

    pub fn check_cancelled(&mut self, path: Utf16) -> Result<(), EngineError> {
        if let Some(check) = self.fallible_cancellation.as_deref_mut() {
            if check().map_err(EngineError::from_host)? {
                return Err(EngineError::new("CANCELLED", path, "Operation cancelled")
                    .with_control_failure());
            }
        }
        if self
            .cancellation
            .as_deref_mut()
            .is_some_and(|check| check())
        {
            return Err(
                EngineError::new("CANCELLED", path, "Operation cancelled").with_control_failure()
            );
        }
        Ok(())
    }

    pub fn check_deadline(&mut self, path: Utf16) -> Result<(), EngineError> {
        let Some(deadline) = self.deadline_ms else {
            return Ok(());
        };
        if let Some(clock) = self.fallible_clock.as_deref_mut() {
            let Some(now) = clock().map_err(EngineError::from_host)? else {
                return Err(EngineError::new(
                    "CLOCK_CAPABILITY_REQUIRED",
                    path,
                    "Host clock capability did not return a time",
                )
                .with_control_failure());
            };
            if now > deadline {
                return Err(
                    EngineError::new("DEADLINE", path, "Deadline elapsed").with_control_failure()
                );
            }
            return Ok(());
        }
        let Some(clock) = self.clock.as_deref_mut() else {
            return Err(EngineError::new(
                "CLOCK_CAPABILITY_REQUIRED",
                path,
                "Host clock capability is required for deadline requests",
            )
            .with_control_failure());
        };
        let Some(now) = clock() else {
            return Err(EngineError::new(
                "CLOCK_CAPABILITY_REQUIRED",
                path,
                "Host clock capability did not return a time",
            )
            .with_control_failure());
        };
        if now > deadline {
            return Err(
                EngineError::new("DEADLINE", path, "Deadline elapsed").with_control_failure()
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregate_text_scope_caps_and_restores_without_resetting_controls_or_counters() {
        let mut calls = 0;
        let mut meter = |_: usize| {
            calls += 1;
            Ok(())
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        ctx.charge_constraint_step(Utf16::default()).unwrap();
        let result: Result<(), EngineError> = ctx.with_aggregate_text_limit(usize::MAX, |ctx| {
            assert_eq!(ctx.limits().max_text_units, 32 * 1024 * 1024);
            assert_eq!(ctx.limits().max_values, Limits::ordinary().max_values);
            ctx.charge_constraint_step(Utf16::default())?;
            ctx.charge_text(4_000_001, Utf16::default())?;
            Err(EngineError::new("TEST", Utf16::default(), "test"))
        });
        assert!(result.is_err());
        assert_eq!(ctx.constraint_steps(), 2);
        assert_eq!(ctx.limits().max_text_units, 4_000_000);
        assert_eq!(
            ctx.charge_text(4_000_001, Utf16::default())
                .unwrap_err()
                .code,
            "LIMIT"
        );
        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            ctx.with_aggregate_text_limit(8_000_000, |_| panic!("bounded unwind proof"))
        }));
        assert!(caught.is_err());
        assert_eq!(ctx.limits().max_text_units, 4_000_000);
        assert_eq!(ctx.constraint_steps(), 2);
        drop(ctx);
        assert!(calls >= 3);
    }

    #[test]
    fn trusted_schema_depth_scope_preserves_counters_and_restores_on_error_and_unwind() {
        let mut ctx = Context::ordinary();
        ctx.charge_constraint_step(Utf16::default()).unwrap();
        let result: Result<(), EngineError> = ctx.with_schema_depth_allowance(544, |ctx| {
            assert_eq!(ctx.limits().max_depth, 544);
            ctx.charge_constraint_step(Utf16::default())?;
            Err(EngineError::new("TEST", Utf16::default(), "test"))
        });
        assert!(result.is_err());
        assert_eq!(ctx.constraint_steps(), 2);
        assert_eq!(ctx.limits().max_depth, 128);
        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            ctx.with_schema_depth_allowance(544, |_| panic!("bounded unwind proof"))
        }));
        assert!(caught.is_err());
        assert_eq!(ctx.limits().max_depth, 128);
        assert_eq!(ctx.constraint_steps(), 2);
    }

    #[test]
    fn tagged_transport_allowance_keeps_one_meter_and_restores_ordinary_limits() {
        let budget = 20usize;
        let mut spent = 0usize;
        let mut meter = |amount: usize| {
            spent = spent.saturating_add(amount);
            if spent > budget {
                Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "budget",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut meter);
        ctx.with_tagged_transport_limit(|ctx| {
            assert_eq!(ctx.limits().max_values, usize::MAX);
            assert_eq!(ctx.limits().max_text_units, usize::MAX);
            ctx.charge_work(12, Utf16::default()).unwrap();
        });
        assert_eq!(ctx.limits().max_values, Limits::ordinary().max_values);
        assert_eq!(
            ctx.limits().max_text_units,
            Limits::ordinary().max_text_units
        );
        assert_eq!(ctx.charged_work(), 12);

        // A later operation phase crosses the same finite host budget. A
        // separately constructed transport Context would incorrectly pass.
        let error = ctx.charge_work(9, Utf16::default()).unwrap_err();
        assert_eq!(error.code, "RESOURCE_LIMIT");
        assert!(error.is_control_failure());
        assert_eq!(ctx.charged_work(), 21);
    }

    #[test]
    fn temporary_catalog_and_ordinary_phases_keep_the_same_wide_counter() {
        let mut ctx = Context::ordinary();
        // Model work already charged by tagged decode, leaving room for only
        // one phase. Separate fresh Contexts would each accept these charges.
        ctx.carry_transport_usage(u64::MAX - 10, 0);
        ctx.with_catalog_value_limit(|ctx| {
            ctx.charge_work(6, Utf16::default()).unwrap();
        });
        let error = ctx.charge_work(5, Utf16::default()).unwrap_err();
        assert_eq!(error.code, "LIMIT");
        assert_eq!(error.message, Utf16::from("Work counter overflow"));
        assert_eq!(ctx.charged_work(), u64::MAX - 4);
        assert_eq!(ctx.limits().max_values, Limits::ordinary().max_values);
    }

    #[test]
    fn catalog_value_allowance_restores_limits_after_error_and_unwind() {
        let mut ctx = Context::ordinary();
        let result: Result<(), EngineError> = ctx.with_catalog_value_limit(|ctx| {
            assert_eq!(ctx.limits().max_values, Limits::catalog().max_values);
            ctx.charge_constraint_step(Utf16::default())?;
            Err(EngineError::new("TEST", Utf16::default(), "catalog"))
        });
        assert!(result.is_err());
        assert_eq!(ctx.limits().max_values, Limits::ordinary().max_values);
        assert_eq!(ctx.constraint_steps(), 1);
        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            ctx.with_catalog_value_limit(|_| panic!("catalog unwind proof"))
        }));
        assert!(caught.is_err());
        assert_eq!(ctx.limits().max_values, Limits::ordinary().max_values);
        assert_eq!(ctx.constraint_steps(), 1);
    }

    #[test]
    fn tagged_transport_scope_preserves_cancellation_and_deadline_hooks() {
        let mut cancelled = || Ok(true);
        let mut ctx = Context::ordinary().with_fallible_cancellation(&mut cancelled);
        let error = ctx
            .with_tagged_transport_limit(|ctx| ctx.charge_work(1, Utf16::default()))
            .unwrap_err();
        assert_eq!(error.code, "CANCELLED");
        assert!(error.is_control_failure());
        assert_eq!(ctx.limits(), Limits::ordinary());
        drop(ctx);

        let mut clock = || Ok(Some(2));
        let mut ctx = Context::ordinary().with_fallible_clock(&mut clock, 1);
        let error = ctx
            .with_tagged_transport_limit(|ctx| ctx.charge_work(1, Utf16::default()))
            .unwrap_err();
        assert_eq!(error.code, "DEADLINE");
        assert!(error.is_control_failure());
        assert_eq!(ctx.limits(), Limits::ordinary());
    }

    #[test]
    fn tagged_transport_scope_restores_all_limits_after_error_and_unwind() {
        let mut ctx = Context::ordinary();
        let result: Result<(), EngineError> = ctx.with_tagged_transport_limit(|ctx| {
            assert_eq!(ctx.limits().max_values, usize::MAX);
            assert_eq!(ctx.limits().max_text_units, usize::MAX);
            assert_eq!(ctx.limits().max_depth, 256);
            Err(EngineError::new("TEST", Utf16::default(), "transport"))
        });
        assert!(result.is_err());
        assert_eq!(ctx.limits(), Limits::ordinary());
        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            ctx.with_tagged_transport_limit(|_| panic!("transport unwind proof"))
        }));
        assert!(caught.is_err());
        assert_eq!(ctx.limits(), Limits::ordinary());
    }

    #[test]
    fn cooperative_failure_origin_survives_semantic_error_lookalikes() {
        for code in [
            "JSON_PARSE",
            "TABLE_DEPLOYMENT_UNSUPPORTED",
            "INPUT",
            "LIMIT",
        ] {
            let ordinary = EngineError::new(code, Utf16::default(), "lookalike");
            assert!(!ordinary.is_control_failure());
            let mut meter = |_amount| Err(ordinary.clone());
            let mut ctx = Context::ordinary().with_meter(&mut meter);
            let observed = ctx.charge_work(1, Utf16::default()).unwrap_err();
            assert_eq!(observed.code, code);
            assert_eq!(observed.message, Utf16::from("lookalike"));
            assert!(observed.is_control_failure());
        }
    }

    #[test]
    fn transport_usage_can_continue_across_response_contexts() {
        let mut usage = TransportUsage::default();
        let mut first = Context::ordinary();
        first.charge_work(17, Utf16::default()).unwrap();
        first.charge_constraint_step(Utf16::default()).unwrap();
        usage.capture(&first);

        let mut second = Context::ordinary();
        usage.seed(&mut second);
        second.charge_work(23, Utf16::default()).unwrap();
        second.charge_constraint_step(Utf16::default()).unwrap();
        usage.capture(&second);

        assert_eq!(second.charged_work(), 42);
        assert_eq!(second.constraint_steps(), 2);
        assert_eq!(usage.charged_work(), 42);
        assert_eq!(usage.constraint_steps(), 2);

        usage.reset();
        let mut next_call = Context::ordinary();
        usage.seed(&mut next_call);
        assert_eq!(next_call.charged_work(), 0);
        assert_eq!(next_call.constraint_steps(), 0);
    }

    #[test]
    fn transport_responses_share_one_work_budget_but_new_calls_reset_it() {
        let budget = 10usize;
        let mut usage = TransportUsage::default();
        let mut spent = 0usize;
        let mut meter = |amount: usize| {
            spent = spent.saturating_add(amount);
            if spent > budget {
                Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "Host work budget exceeded",
                ))
            } else {
                Ok(())
            }
        };

        let mut first = Context::ordinary().with_meter(&mut meter);
        usage.seed(&mut first);
        first.charge_work(6, Utf16::default()).unwrap();
        usage.capture(&first);
        drop(first);

        let mut second = Context::ordinary().with_meter(&mut meter);
        usage.seed(&mut second);
        let failure = second.charge_work(6, Utf16::default()).unwrap_err();
        usage.capture(&second);
        assert_eq!(failure.code, "RESOURCE_LIMIT");
        assert!(failure.is_control_failure());
        assert_eq!(second.charged_work(), 12);
        assert_eq!(usage.charged_work(), 12);
        drop(second);
        drop(meter);

        usage.reset();
        let mut next_call_spent = 0usize;
        let mut next_call_meter = |amount: usize| {
            next_call_spent += amount;
            if next_call_spent > budget {
                Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "Host work budget exceeded",
                ))
            } else {
                Ok(())
            }
        };
        let mut next_call = Context::ordinary().with_meter(&mut next_call_meter);
        usage.seed(&mut next_call);
        next_call.charge_work(6, Utf16::default()).unwrap();
        usage.capture(&next_call);
        assert_eq!(next_call.charged_work(), 6);
        assert_eq!(usage.charged_work(), 6);
    }

    #[test]
    fn native_cancellation_and_deadline_have_control_origin() {
        let mut cancel = || true;
        let mut ctx = Context::ordinary().with_cancellation(&mut cancel);
        assert!(
            ctx.check_cancelled(Utf16::default())
                .unwrap_err()
                .is_control_failure()
        );
        let mut clock = || Some(2);
        let mut ctx = Context::ordinary().with_clock(&mut clock, 1);
        assert!(
            ctx.check_deadline(Utf16::default())
                .unwrap_err()
                .is_control_failure()
        );
        let mut no_time = || None;
        let mut ctx = Context::ordinary().with_clock(&mut no_time, 1);
        assert!(
            ctx.check_deadline(Utf16::default())
                .unwrap_err()
                .is_control_failure()
        );
    }

    #[test]
    fn work_accumulator_crosses_u32_without_a_platform_limit() {
        let mut ctx = Context::ordinary();
        ctx.charge_work(u32::MAX as usize, Utf16::default())
            .unwrap();
        ctx.charge_work(1, Utf16::default()).unwrap();
        assert_eq!(ctx.charged_work(), u64::from(u32::MAX) + 1);
    }

    #[test]
    fn work_meter_still_observes_each_charge_above_u32_total() {
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Ok(())
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        ctx.charge_work(u32::MAX as usize, Utf16::default())
            .unwrap();
        ctx.charge_work(7, Utf16::default()).unwrap();
        assert_eq!(ctx.charged_work(), u64::from(u32::MAX) + 7);
        drop(ctx);
        assert_eq!(observed, vec![u32::MAX as usize, 7]);
    }

    #[test]
    fn wide_work_notifications_have_portable_chunks() {
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Ok(())
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        ctx.charge_work_u64(u64::from(u32::MAX) * 2 + 19, Utf16::default())
            .unwrap();
        assert_eq!(ctx.charged_work(), u64::from(u32::MAX) * 2 + 19);
        drop(ctx);
        assert_eq!(observed, vec![u32::MAX as usize, u32::MAX as usize, 19]);
    }

    #[test]
    fn wide_work_stops_on_a_meter_refusal_before_later_chunks() {
        let mut calls = 0;
        let mut meter = |_| {
            calls += 1;
            Err(EngineError::new("WIDE_DENIED", Utf16::default(), "denied"))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = ctx
            .charge_work_u64(u64::from(u32::MAX) + 1, Utf16::default())
            .unwrap_err();
        assert_eq!(error.code, "WIDE_DENIED");
        drop(ctx);
        assert_eq!(calls, 1);
    }

    #[test]
    fn unobserved_wide_charge_needs_no_callback_loop_and_overflow_refuses() {
        let mut ctx = Context::ordinary();
        ctx.charge_work_u64(u64::MAX, Utf16::default()).unwrap();
        assert_eq!(ctx.charged_work(), u64::MAX);
        assert_eq!(
            ctx.charge_work_u64(1, Utf16::default()).unwrap_err().code,
            "LIMIT"
        );
    }
}
