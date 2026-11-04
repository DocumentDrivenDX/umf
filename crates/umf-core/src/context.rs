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

// A scratch path is already admitted storage. It moves only on Context-owned
// refusal; host errors retain their own origin/path without consuming scratch.
enum WorkPath<'p> { Owned(Utf16), Scratch(&'p mut Utf16) }
impl WorkPath<'_> {
    fn take(&mut self) -> Utf16 {
        match self { Self::Owned(path)=>std::mem::take(path), Self::Scratch(path)=>std::mem::take(*path) }
    }
}

/// Per-invocation limits and explicit host capabilities. The context owns all
/// counters; no global or ambient runtime state is consulted.
pub struct Context<'a> {
    pub(crate) evaluation_paths: Option<std::rc::Rc<std::cell::RefCell<crate::schema::owned_plans::EvaluationPaths>>>,
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
    // Explicit optional owner-only observation; no ambient/thread-local state.
    pub(crate) schema_construction: Option<std::rc::Rc<std::cell::RefCell<crate::schema::ConstructionState>>>,
    work_phase_observer: Option<&'a std::cell::Cell<&'static str>>,
    constructor_root_observer: Option<&'a std::cell::Cell<&'static str>>,
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

    /// Add metered work from another transport transition to this operation.
    pub fn add_usage(&mut self, charged_work: u64, constraint_steps: usize) {
        self.charged_work = self.charged_work.saturating_add(charged_work);
        self.constraint_steps = self.constraint_steps.saturating_add(constraint_steps);
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

struct EvaluationPathScope<'ctx,'cap> {
    context: &'ctx mut Context<'cap>,
    prior: Option<std::rc::Rc<std::cell::RefCell<crate::schema::owned_plans::EvaluationPaths>>>,
}
impl Drop for EvaluationPathScope<'_, '_> {
    fn drop(&mut self) { self.context.evaluation_paths = self.prior.take(); }
}
impl<'a> Context<'a> {
    pub(crate) fn with_evaluation_paths<T>(&mut self, operation:impl FnOnce(&mut Self)->Result<T,EngineError>) -> Result<T,EngineError> {
        self.charge_work(1,Utf16::default())?;
        let prior = self.evaluation_paths.replace(std::rc::Rc::new(std::cell::RefCell::new(Default::default())));
        let scope = EvaluationPathScope { context:self, prior };
        operation(&mut *scope.context)
    }

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
            schema_construction: None,
            evaluation_paths: None,
            work_phase_observer: None,
            constructor_root_observer: None,
        })
    }

    /// Internal owner construction scope. It conveys no caller-selectable proof:
    /// only completed admissions created in this cold lifetime are eligible.
    /// State drops on return/error/unwind; counters and controls never reset.
    #[doc(hidden)]
    pub fn with_codegen_construction<T>(&mut self, operation: impl FnOnce(&mut Self) -> Result<T, EngineError>) -> Result<T, EngineError> {
        struct Scope<'c, 'a> { ctx: &'c mut Context<'a>, prior: Option<std::rc::Rc<std::cell::RefCell<crate::schema::ConstructionState>>> }
        impl Drop for Scope<'_, '_> { fn drop(&mut self) { self.ctx.schema_construction = self.prior.take(); } }
        self.charge_work(1, Utf16::default())?;
        let prior = self.schema_construction.take();
        self.schema_construction = Some(std::rc::Rc::new(std::cell::RefCell::new(crate::schema::ConstructionState::default())));
        let mut scope = Scope { ctx: self, prior };
        operation(&mut *scope.ctx)
    }

    #[doc(hidden)]
    pub fn in_codegen_construction(&self) -> bool { self.schema_construction.is_some() }

    /// Attach fixed-size phase metadata for a private owner diagnostic. This
    /// changes no work amount, callback order, capability or Context lifetime.
    pub fn with_work_phase_observer(mut self, phase: &'a std::cell::Cell<&'static str>) -> Self {
        self.work_phase_observer = Some(phase);
        self
    }

    /// Private fixed-root metadata uses the same scoped Cell/restore protocol as
    /// work phases. It is never admission authority or a notification boundary.
    #[doc(hidden)]
    pub fn with_constructor_root_observer(mut self, root: &'a std::cell::Cell<&'static str>) -> Self {
        self.constructor_root_observer = Some(root);
        self
    }

    #[doc(hidden)]
    pub fn with_constructor_root<T>(&mut self, root: &'static str, operation: impl FnOnce(&mut Self) -> T) -> T {
        struct Restore<'a> { cell: Option<&'a std::cell::Cell<&'static str>>, prior: &'static str }
        impl Drop for Restore<'_> {
            fn drop(&mut self) { if let Some(cell) = self.cell { cell.set(self.prior); } }
        }
        let prior = self.constructor_root_observer.map(|cell| cell.replace(root)).unwrap_or("");
        let _restore = Restore { cell: self.constructor_root_observer, prior };
        operation(self)
    }

    /// Constructor sites are invisible to legacy/call-attributed observers.
    /// No callback or charge is generated when entering or restoring a site.
    #[doc(hidden)]
    pub fn with_constructor_site<T>(&mut self, label: &'static str, operation: impl FnOnce(&mut Self) -> T) -> T {
        if self.constructor_root_observer.is_some() { self.with_work_phase(label, operation) }
        else { operation(self) }
    }

    /// Nested observational label, restored on return, refusal and unwinding.
    /// No notification/callback/charge occurs at a label boundary.
    pub fn with_work_phase<T>(&mut self, label: &'static str, operation: impl FnOnce(&mut Self) -> T) -> T {
        struct Restore<'a> { cell: Option<&'a std::cell::Cell<&'static str>>, prior: &'static str }
        impl Drop for Restore<'_> {
            fn drop(&mut self) { if let Some(cell) = self.cell { cell.set(self.prior); } }
        }
        let prior = self.work_phase_observer.map(|cell| cell.replace(label)).unwrap_or("");
        let _restore = Restore { cell: self.work_phase_observer, prior };
        operation(self)
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
        self.charge_work_path(amount, WorkPath::Owned(path))
    }

    /// Same work/control state machine. Success borrows the admitted buffer;
    /// Context-generated refusal moves it, host refusal never substitutes it.
    /// Fixed error code/message construction remains the existing behavior.
    pub fn charge_work_with_path(&mut self, amount: usize, path: &mut Utf16) -> Result<(), EngineError> {
        self.charge_work_path(amount as u64, WorkPath::Scratch(path))
    }

    fn charge_work_path(&mut self, amount: u64, mut path: WorkPath<'_>) -> Result<(), EngineError> {
        let Some(total) = self.charged_work.checked_add(amount) else {
            return Err(EngineError::new("LIMIT", path.take(), "Work counter overflow"));
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
            self.check_cancelled_path(&mut path)?;
            self.check_deadline_path(&mut path)?;
            remaining -= chunk as u64;
            if remaining == 0 { return Ok(()); }
        }
    }

    fn check_cancelled_path(&mut self, path: &mut WorkPath<'_>) -> Result<(), EngineError> {
        if let Some(check) = self.fallible_cancellation.as_deref_mut() {
            if check().map_err(EngineError::from_host)? {
                return Err(EngineError::new("CANCELLED", path.take(), "Operation cancelled").with_control_failure());
            }
        }
        if self.cancellation.as_deref_mut().is_some_and(|check| check()) {
            return Err(EngineError::new("CANCELLED", path.take(), "Operation cancelled").with_control_failure());
        }
        Ok(())
    }

    fn check_deadline_path(&mut self, path: &mut WorkPath<'_>) -> Result<(), EngineError> {
        let Some(deadline) = self.deadline_ms else { return Ok(()); };
        if let Some(clock) = self.fallible_clock.as_deref_mut() {
            let Some(now) = clock().map_err(EngineError::from_host)? else {
                return Err(EngineError::new("CLOCK_CAPABILITY_REQUIRED", path.take(),
                    "Host clock capability did not return a time").with_control_failure());
            };
            if now > deadline {
                return Err(EngineError::new("DEADLINE", path.take(), "Deadline elapsed").with_control_failure());
            }
        } else {
            let Some(clock) = self.clock.as_deref_mut() else {
                return Err(EngineError::new("CLOCK_CAPABILITY_REQUIRED", path.take(),
                    "Host clock capability is required for deadline requests").with_control_failure());
            };
            let Some(now) = clock() else {
                return Err(EngineError::new("CLOCK_CAPABILITY_REQUIRED", path.take(),
                    "Host clock capability did not return a time").with_control_failure());
            };
            if now > deadline {
                return Err(EngineError::new("DEADLINE", path.take(), "Deadline elapsed").with_control_failure());
            }
        }
        Ok(())
    }

    pub fn check_cancelled(&mut self, path: Utf16) -> Result<(), EngineError> {
        self.check_cancelled_path(&mut WorkPath::Owned(path))
    }

    pub fn check_deadline(&mut self, path: Utf16) -> Result<(), EngineError> {
        self.check_deadline_path(&mut WorkPath::Owned(path))
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


#[cfg(test)]
mod work_phase_observer_tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    #[test]
    fn scopes_preserve_charges_callback_order_and_prior_work() {
        let phase = Cell::new("outer");
        let rows = RefCell::new(Vec::new());
        let mut control = |n| { rows.borrow_mut().push((n, phase.get())); Ok(()) };
        let mut ctx = Context::ordinary().with_host_control(&mut control).with_work_phase_observer(&phase);
        ctx.charge_work(5, Utf16::default()).unwrap();
        ctx.with_work_phase("admission", |ctx| {
            ctx.charge_work(7, Utf16::default()).unwrap();
            ctx.with_work_phase("copy", |ctx| ctx.charge_work(11, Utf16::default())).unwrap();
            assert_eq!(phase.get(), "admission");
            ctx.charge_work(0, Utf16::default()).unwrap();
        });
        assert_eq!(ctx.charged_work(), 23);
        assert_eq!(phase.get(), "outer");
        assert_eq!(*rows.borrow(), vec![(5,"outer"),(7,"admission"),(11,"copy"),(0,"admission")]);
    }

    #[test]
    fn first_denial_stays_charged_and_stops_before_later_work() {
        let phase = Cell::new("outer");
        let rows = RefCell::new(Vec::new());
        let mut control = |n| {
            rows.borrow_mut().push((n, phase.get()));
            if n == 7 { Err(EngineError::new("RESOURCE_LIMIT", Utf16::default(), "first denial")) } else { Ok(()) }
        };
        let mut ctx = Context::ordinary().with_host_control(&mut control).with_work_phase_observer(&phase);
        let result = ctx.with_work_phase("admission", |ctx| {
            ctx.charge_work(3, Utf16::default())?;
            ctx.with_work_phase("copy", |ctx| ctx.charge_work(7, Utf16::default()))?;
            ctx.charge_work(11, Utf16::default())
        });
        assert_eq!(result.unwrap_err().code, "RESOURCE_LIMIT");
        assert_eq!(ctx.charged_work(), 10);
        assert_eq!(phase.get(), "outer");
        assert_eq!(*rows.borrow(), vec![(3,"admission"),(7,"copy")]);
    }

    #[test]
    fn metadata_restores_on_unwind_without_resetting_work() {
        let phase = Cell::new("outer");
        let mut ctx = Context::ordinary().with_work_phase_observer(&phase);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            ctx.with_work_phase("copy", |ctx| {
                ctx.charge_work(13, Utf16::default()).unwrap();
                panic!("observation scope unwind");
            });
        }));
        assert!(result.is_err());
        assert_eq!(phase.get(), "outer");
        assert_eq!(ctx.charged_work(), 13);
    }
}

#[cfg(test)]
#[path = "context_construction_tests.rs"]
mod construction_independent_tests;

#[cfg(test)]
mod constructor_observation_tests {
    use super::*;
    use std::{cell::Cell, panic::{catch_unwind, AssertUnwindSafe}};

    #[test]
    fn constructor_metadata_restores_error_unwind_and_nested_context() {
        let root = Cell::new("unassigned");
        let phase = Cell::new("coarse");
        let mut amounts = Vec::new();
        let mut meter = |amount| { amounts.push(amount); Err(EngineError::new("CANCELLED", Utf16::default(), "first")) };
        let mut ctx = Context::ordinary().with_host_control(&mut meter)
            .with_work_phase_observer(&phase).with_constructor_root_observer(&root);
        let result: Result<(), EngineError> = ctx.with_constructor_root("core", |ctx| {
            ctx.with_constructor_site("ctor.preflight-root", |ctx| {
                assert_eq!(root.get(), "core"); assert_eq!(phase.get(), "ctor.preflight-root");
                let nested_root = Cell::new("unassigned");
                let mut nested = Context::ordinary().with_constructor_root_observer(&nested_root);
                nested.with_constructor_root("reference", |_| assert_eq!(root.get(), "core"));
                assert_eq!(nested_root.get(), "unassigned");
                ctx.charge_work(7, Utf16::default())
            })
        });
        assert_eq!(result.unwrap_err().code, "CANCELLED");
        assert_eq!(root.get(), "unassigned"); assert_eq!(phase.get(), "coarse");
        let panic = catch_unwind(AssertUnwindSafe(|| ctx.with_constructor_root("package", |ctx| {
            ctx.with_constructor_site("ctor.reference", |_| panic!("observation unwind"))
        })));
        assert!(panic.is_err()); assert_eq!(root.get(), "unassigned"); assert_eq!(phase.get(), "coarse");
        ctx.with_constructor_root("actions", |_| assert_eq!(root.get(), "actions"));
        assert_eq!(root.get(), "unassigned");
        assert_eq!(ctx.charged_work(), 7);
        drop(ctx); assert_eq!(amounts, vec![7]);
    }

    #[test]
    fn constructor_sites_are_invisible_without_constructor_observer() {
        let phase = Cell::new("existing-attributed-call");
        let mut ctx = Context::ordinary().with_work_phase_observer(&phase);
        ctx.with_constructor_site("ctor.preflight-root", |ctx| {
            assert_eq!(phase.get(), "existing-attributed-call");
            ctx.with_constructor_root("core", |_| assert_eq!(phase.get(), "existing-attributed-call"));
        });
        assert_eq!(ctx.charged_work(), 0);
    }
}

#[cfg(test)]
#[path = "context_path_tests.rs"]
mod context_path_tests;
