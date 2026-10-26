// SPDX-License-Identifier: MIT OR Apache-2.0
//! Host-observation primitives for Python captured graph validation.
//!
//! Rust directs live graph reads in Python expression order. The current
//! profile remains private observer infrastructure; it is not a graph
//! validator or a public capture route.

use crate::Utf16;
use std::collections::HashSet;

pub const PROFILE: &str = "umf-access-capture-graph-observation/0.5.0";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpectedOwner {
    pub module: Utf16,
    pub element: Utf16,
    pub alias: Option<Utf16>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ObservedField {
    Text(Utf16),
    None,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ObservationError {
    HostException,
    ConversionFailure,
    UnsupportedValue,
    TerminalUnsupported,
    MissingRecordIdentity,
    GroupNeedsSelection,
    ScalarTerminalDenied,
    JoinSourceAbsent,
    SearchForeignRecord,
    SearchBoundParameter,
    SearchParameterCarrier,
    ForeignField,
    Budget,
}

pub trait FieldRefObserver {
    fn read(&mut self, field: &'static str) -> Result<ObservedField, ObservationError>;
}

/// Opaque live-object operations used by the Rust-directed terminal prefix
/// walker. Every method is one host observation; implementations must not
/// cache attribute results and must retain any original host exception.
pub trait CaptureGraphHostObserver {
    type Handle: Copy;

    fn get_attr(
        &mut self,
        object: Self::Handle,
        name: &'static str,
    ) -> Result<ObservedValue<Self::Handle>, ObservationError>;
    fn truthy(&mut self, value: Self::Handle) -> Result<bool, ObservationError>;
    fn get_item(
        &mut self,
        sequence: Self::Handle,
        index: usize,
    ) -> Result<Self::Handle, ObservationError>;
    fn is_instance(
        &mut self,
        value: Self::Handle,
        kind: GraphType,
    ) -> Result<bool, ObservationError>;
    fn is_instance_structural(
        &mut self,
        _value: Self::Handle,
        _kind: StructuralType,
    ) -> Result<bool, ObservationError> {
        Err(ObservationError::UnsupportedValue)
    }
    fn is_exact_instance(
        &mut self,
        _value: Self::Handle,
        _kind: GraphType,
    ) -> Result<bool, ObservationError> {
        Err(ObservationError::UnsupportedValue)
    }
    fn is_exact_structural(
        &mut self,
        _value: Self::Handle,
        _kind: StructuralType,
    ) -> Result<bool, ObservationError> {
        Err(ObservationError::UnsupportedValue)
    }
    fn exact_text(&mut self, _value: Self::Handle) -> Result<Utf16, ObservationError> {
        Err(ObservationError::UnsupportedValue)
    }
    fn iter(&mut self, sequence: Self::Handle) -> Result<Self::Handle, ObservationError>;
    fn next(&mut self, iterator: Self::Handle) -> Result<Option<Self::Handle>, ObservationError>;
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum GraphType {
    Node,
    RecordRef,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum StructuralType {
    FieldRef,
    Join,
    SearchLeg,
    Tuple,
}

/// Execute the bounded FieldRef / Join / tuple branch of `_validate_node.visit`.
/// SearchLeg and Node remain explicitly refused because each has semantic
/// checks before recursive visitation. Other opaque leaves follow the
/// predecessor's no-op behavior.
pub fn observe_field_join_tuple_prefix<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    value: H,
    allowed: &HashSet<Owner>,
) -> Result<(), ObservationError> {
    observe_field_join_tuple_value(context, host, value, allowed, 0)
}

/// Observe the bounded SearchLeg branch for legs with no bound value and no
/// nested legs. The full branch's parameter/carrier semantics remain outside
/// this private prefix; this operation preserves the live owner and field
/// reads before refusing any nonempty continuation.
pub fn observe_empty_search_leg_prefix<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    value: H,
    root_record: H,
) -> Result<(), ObservationError> {
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::FieldRef)
    })? {
        return Err(ObservationError::UnsupportedValue);
    }
    if !budgeted(context, || {
        host.is_instance_structural(value, StructuralType::SearchLeg)
    })? {
        return Err(ObservationError::UnsupportedValue);
    }
    let first_search_record = object(attr(context, host, value, "record")?)?;
    let search_module = text(attr(context, host, first_search_record, "module")?)?;
    let second_search_record = object(attr(context, host, value, "record")?)?;
    let search_element = text(attr(context, host, second_search_record, "element")?)?;
    let root_module = text(attr(context, host, root_record, "module")?)?;
    let root_element = text(attr(context, host, root_record, "element")?)?;
    if search_module != root_module || search_element != root_element {
        return Err(ObservationError::SearchForeignRecord);
    }
    // The predecessor reads kind only on the non-None value path.
    let leg_value = attr(context, host, value, "value")?;
    if !matches!(leg_value, ObservedValue::None) {
        return Err(ObservationError::UnsupportedValue);
    }
    let legs = object(attr(context, host, value, "legs")?)?;
    let iterator = budgeted(context, || host.iter(legs))?;
    if budgeted(context, || host.next(iterator))?.is_some() {
        return Err(ObservationError::UnsupportedValue);
    }
    Ok(())
}

/// Observe the exact keyword SearchLeg leaf used by the private Python
/// capture route. `declared_name` and `string_carrier` come from the already
/// resolved signature; all graph reads remain demand driven here.
pub fn observe_keyword_search_leg<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    value: H,
    root_record: H,
    declared_name: &Utf16,
    string_carrier: bool,
    vector_carrier: bool,
) -> Result<(), ObservationError> {
    if budgeted(context, || {
        host.is_exact_structural(value, StructuralType::FieldRef)
    })? {
        return Err(ObservationError::UnsupportedValue);
    }
    if !budgeted(context, || {
        host.is_exact_structural(value, StructuralType::SearchLeg)
    })? {
        return Err(ObservationError::UnsupportedValue);
    }
    let first_record = object(attr(context, host, value, "record")?)?;
    let module = text(attr(context, host, first_record, "module")?)?;
    let second_record = object(attr(context, host, value, "record")?)?;
    let element = text(attr(context, host, second_record, "element")?)?;
    let root_module = text(attr(context, host, root_record, "module")?)?;
    let root_element = text(attr(context, host, root_record, "element")?)?;
    if module != root_module || element != root_element {
        return Err(ObservationError::SearchForeignRecord);
    }
    let first_value = attr(context, host, value, "value")?;
    if matches!(first_value, ObservedValue::None) {
        return Err(ObservationError::UnsupportedValue);
    }
    // The predecessor reads `value` again for `.op`, then again for `.args`.
    let node_for_op = object(attr(context, host, value, "value")?)?;
    let op = text(attr(context, host, node_for_op, "op")?)?;
    if op != Utf16::from("param") {
        return Err(ObservationError::SearchBoundParameter);
    }
    let node_for_args = object(attr(context, host, value, "value")?)?;
    if !budgeted(context, || {
        host.is_exact_instance(node_for_args, GraphType::Node)
    })? {
        return Err(ObservationError::SearchBoundParameter);
    }
    let args = object(attr(context, host, node_for_args, "args")?)?;
    let arg0 = budgeted(context, || host.get_item(args, 0))?;
    let argument_name = budgeted(context, || host.exact_text(arg0))?;
    let kind = text(attr(context, host, value, "kind")?)?;
    let carrier_matches_kind = match kind {
        value if value == Utf16::from("keyword") => string_carrier,
        value if value == Utf16::from("vector") => vector_carrier,
        _ => return Err(ObservationError::UnsupportedValue),
    };
    if argument_name != *declared_name || !carrier_matches_kind {
        return Err(ObservationError::SearchParameterCarrier);
    }
    let node = object(attr(context, host, value, "value")?)?;
    if !budgeted(context, || host.is_exact_instance(node, GraphType::Node))? {
        return Err(ObservationError::SearchBoundParameter);
    }
    // `_validate_node.visit` deliberately rereads `op` at each ordered branch.
    for _ in 0..3 {
        if text(attr(context, host, node, "op")?)? != Utf16::from("param") {
            return Err(ObservationError::SearchBoundParameter);
        }
    }
    let recursive_args_for_membership = object(attr(context, host, node, "args")?)?;
    let recursive_arg0 = budgeted(context, || host.get_item(recursive_args_for_membership, 0))?;
    if budgeted(context, || host.exact_text(recursive_arg0))? != *declared_name {
        return Err(ObservationError::SearchParameterCarrier);
    }
    // The key_param-specific components/identity checks are each separate
    // `op` reads even when the operation is `param`.
    for _ in 0..4 {
        if text(attr(context, host, node, "op")?)? != Utf16::from("param") {
            return Err(ObservationError::SearchBoundParameter);
        }
    }
    let recursive_args = object(attr(context, host, node, "args")?)?;
    let argument_iterator = budgeted(context, || host.iter(recursive_args))?;
    while let Some(child) = budgeted(context, || host.next(argument_iterator))? {
        let _ = budgeted(context, || host.exact_text(child))?;
    }
    let legs = object(attr(context, host, value, "legs")?)?;
    let iterator = budgeted(context, || host.iter(legs))?;
    if budgeted(context, || host.next(iterator))?.is_some() {
        return Err(ObservationError::UnsupportedValue);
    }
    Ok(())
}

fn observe_field_join_tuple_value<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    value: H,
    allowed: &HashSet<Owner>,
    depth: usize,
) -> Result<(), ObservationError> {
    if depth >= 64 {
        return Err(ObservationError::Budget);
    }
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::FieldRef)
    })? {
        return if allowed.contains(&owner(context, host, value)?) {
            Ok(())
        } else {
            Err(ObservationError::ForeignField)
        };
    }
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::SearchLeg)
    })? {
        return Err(ObservationError::UnsupportedValue);
    }
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::Join)
    })? {
        let reference = object(attr(context, host, value, "ref")?)?;
        return observe_field_join_tuple_value(context, host, reference, allowed, depth + 1);
    }
    if budgeted(context, || host.is_instance(value, GraphType::Node))? {
        return Err(ObservationError::UnsupportedValue);
    }
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::Tuple)
    })? {
        let iterator = budgeted(context, || host.iter(value))?;
        while let Some(child) = budgeted(context, || host.next(iterator))? {
            observe_field_join_tuple_value(context, host, child, allowed, depth + 1)?;
        }
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ObservedValue<H> {
    Object(H),
    Text(Utf16),
    None,
    Other,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct Owner {
    pub module: Utf16,
    pub element: Utf16,
    pub alias: Option<Utf16>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TerminalJoinObservation {
    pub terminal_op: Utf16,
    pub owners: HashSet<Owner>,
    pub steps_empty: bool,
    pub record_exact: bool,
    pub steps_exact_tuple: bool,
}

/// Observe owner references in a node's structural child graph after the
/// caller has completed that node's semantic checks. This deliberately does
/// not read `op` or admit SearchLeg: `_validate_node.visit` performs several
/// ordered, op-specific checks before child traversal, and SearchLeg has its
/// own declaration and parameter semantics. It is therefore a scheduling
/// primitive, not a standalone field validator.
pub fn observe_structural_field_owners<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    value: H,
    allowed: &HashSet<Owner>,
) -> Result<(), ObservationError> {
    observe_structural_value(context, host, value, allowed, 0)
}

fn observe_structural_value<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    value: H,
    allowed: &HashSet<Owner>,
    depth: usize,
) -> Result<(), ObservationError> {
    if depth >= 64 {
        return Err(ObservationError::Budget);
    }
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::FieldRef)
    })? {
        return if allowed.contains(&owner(context, host, value)?) {
            Ok(())
        } else {
            Err(ObservationError::ForeignField)
        };
    }
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::SearchLeg)
    })? {
        return Err(ObservationError::UnsupportedValue);
    }
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::Join)
    })? {
        let source = object(attr(context, host, value, "ref")?)?;
        return observe_structural_value(context, host, source, allowed, depth + 1);
    }
    if budgeted(context, || host.is_instance(value, GraphType::Node))? {
        let args = object(attr(context, host, value, "args")?)?;
        return observe_structural_sequence(context, host, args, allowed, depth + 1);
    }
    if budgeted(context, || {
        host.is_instance_structural(value, StructuralType::Tuple)
    })? {
        return observe_structural_sequence(context, host, value, allowed, depth + 1);
    }
    Ok(())
}

fn observe_structural_sequence<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    sequence: H,
    allowed: &HashSet<Owner>,
    depth: usize,
) -> Result<(), ObservationError> {
    let iterator = budgeted(context, || host.iter(sequence))?;
    while let Some(child) = budgeted(context, || host.next(iterator))? {
        observe_structural_value(context, host, child, allowed, depth)?;
    }
    Ok(())
}

fn budgeted<T>(
    context: &mut crate::Context<'_>,
    operation: impl FnOnce() -> Result<T, ObservationError>,
) -> Result<T, ObservationError> {
    context
        .charge_work(1, Utf16::default())
        .map_err(|_| ObservationError::Budget)?;
    operation()
}

fn attr<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    object: H,
    name: &'static str,
) -> Result<ObservedValue<H>, ObservationError> {
    budgeted(context, || host.get_attr(object, name))
}

fn object<H>(value: ObservedValue<H>) -> Result<H, ObservationError> {
    match value {
        ObservedValue::Object(value) => Ok(value),
        _ => Err(ObservationError::UnsupportedValue),
    }
}

fn text<H>(value: ObservedValue<H>) -> Result<Utf16, ObservationError> {
    match value {
        ObservedValue::Text(value) => Ok(value),
        _ => Err(ObservationError::UnsupportedValue),
    }
}

fn read_terminal_op<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    node: H,
) -> Result<Utf16, ObservationError> {
    match attr(context, host, node, "op")? {
        ObservedValue::Text(value) => Ok(value),
        _ => Err(ObservationError::TerminalUnsupported),
    }
}

fn owner<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    record: H,
) -> Result<Owner, ObservationError> {
    let module = text(attr(context, host, record, "module")?)?;
    let element = text(attr(context, host, record, "element")?)?;
    let alias = match attr(context, host, record, "alias")? {
        ObservedValue::Text(value) => Some(value),
        ObservedValue::None => None,
        _ => return Err(ObservationError::UnsupportedValue),
    };
    Ok(Owner {
        module,
        element,
        alias,
    })
}

fn owner_through_relation<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    relation: H,
    side: &'static str,
) -> Result<Owner, ObservationError> {
    // Python spells each tuple component as `relation.ref.<field>` (or
    // `.target.<field>`), so the intermediate property is read three times.
    let module_record = object(attr(context, host, relation, side)?)?;
    let module = text(attr(context, host, module_record, "module")?)?;
    let element_record = object(attr(context, host, relation, side)?)?;
    let element = text(attr(context, host, element_record, "element")?)?;
    let alias_record = object(attr(context, host, relation, side)?)?;
    let alias = match attr(context, host, alias_record, "alias")? {
        ObservedValue::Text(value) => Some(value),
        ObservedValue::None => None,
        _ => return Err(ObservationError::UnsupportedValue),
    };
    Ok(Owner {
        module,
        element,
        alias,
    })
}

/// Observe the terminal header, preserve the predecessor's structural pass
/// order, then collect root and sequential Join owners. This intentionally
/// does not claim the remaining expression-graph validation semantics.
pub fn observe_terminal_join_owners<H: Copy>(
    context: &mut crate::Context<'_>,
    host: &mut impl CaptureGraphHostObserver<Handle = H>,
    node: H,
) -> Result<TerminalJoinObservation, ObservationError> {
    let terminal_op = read_terminal_op(context, host, node)?;
    let allowed = [
        "all",
        "first",
        "one",
        "count",
        "exists",
        "get",
        "page",
        "group_count",
        "update",
        "search_top",
    ];
    if !allowed
        .iter()
        .any(|candidate| terminal_op == Utf16::from(*candidate))
    {
        return Err(ObservationError::TerminalUnsupported);
    }

    // Keep each `node.args` access distinct, as in `_validate_node`.
    let truth_args = object(attr(context, host, node, "args")?)?;
    if !budgeted(context, || host.truthy(truth_args))? {
        return Err(ObservationError::MissingRecordIdentity);
    }
    let root_args = object(attr(context, host, node, "args")?)?;
    let type_probe = budgeted(context, || host.get_item(root_args, 0))?;
    if !budgeted(context, || {
        host.is_instance(type_probe, GraphType::RecordRef)
    })? {
        return Err(ObservationError::MissingRecordIdentity);
    }
    // Python reads `node.args[0]` again when assigning `record`, after its
    // isinstance probe. Keep that live access distinct before the steps read.
    let record_args = object(attr(context, host, node, "args")?)?;
    let record = budgeted(context, || host.get_item(record_args, 0))?;
    let record_exact = budgeted(context, || {
        host.is_exact_instance(record, GraphType::RecordRef)
    })?;
    let steps_args = object(attr(context, host, node, "args")?)?;
    let steps = budgeted(context, || host.get_item(steps_args, 1))?;
    let steps_exact_tuple = budgeted(context, || {
        host.is_exact_structural(steps, StructuralType::Tuple)
    })?;

    // `selections = [...]` consumes every selected argument before the later
    // `any(isinstance(..., Node))` short-circuit begins.
    let mut selections = Vec::new();
    let mut steps_empty = true;
    let selection_iter = budgeted(context, || host.iter(steps))?;
    while let Some(step) = budgeted(context, || host.next(selection_iter))? {
        steps_empty = false;
        if text(attr(context, host, step, "op")?)? == Utf16::from("select") {
            let args = object(attr(context, host, step, "args")?)?;
            let args_iter = budgeted(context, || host.iter(args))?;
            while let Some(selection) = budgeted(context, || host.next(args_iter))? {
                selections.push(selection);
            }
        }
    }
    let mut scalar_selection = false;
    for selection in selections.iter().copied() {
        if budgeted(context, || host.is_instance(selection, GraphType::Node))? {
            scalar_selection = true;
            break;
        }
    }

    let group_iter = budgeted(context, || host.iter(steps))?;
    let mut has_group = false;
    while let Some(step) = budgeted(context, || host.next(group_iter))? {
        if text(attr(context, host, step, "op")?)? == Utf16::from("group") {
            has_group = true;
            break;
        }
    }
    if has_group && selections.is_empty() {
        let into_iter = budgeted(context, || host.iter(steps))?;
        let mut has_into = false;
        while let Some(step) = budgeted(context, || host.next(into_iter))? {
            if text(attr(context, host, step, "op")?)? == Utf16::from("into") {
                has_into = true;
                break;
            }
        }
        if !has_into && read_terminal_op(context, host, node)? != Utf16::from("group_count") {
            return Err(ObservationError::GroupNeedsSelection);
        }
    }
    if scalar_selection {
        let scalar_terminal_op = read_terminal_op(context, host, node)?;
        if !["all", "first", "one"]
            .iter()
            .any(|candidate| scalar_terminal_op == Utf16::from(*candidate))
        {
            return Err(ObservationError::ScalarTerminalDenied);
        }
    }

    let mut owners = HashSet::new();
    owners.insert(owner(context, host, record)?);
    let join_iter = budgeted(context, || host.iter(steps))?;
    while let Some(step) = budgeted(context, || host.next(join_iter))? {
        if text(attr(context, host, step, "op")?)? != Utf16::from("join") {
            continue;
        }
        let step_args = object(attr(context, host, step, "args")?)?;
        let relation = budgeted(context, || host.get_item(step_args, 0))?;
        let source = owner_through_relation(context, host, relation, "ref")?;
        if !owners.contains(&source) {
            return Err(ObservationError::JoinSourceAbsent);
        }
        owners.insert(owner_through_relation(context, host, relation, "target")?);
    }
    Ok(TerminalJoinObservation {
        terminal_op,
        owners,
        steps_empty,
        record_exact,
        steps_exact_tuple,
    })
}

/// Ask the host for all owner components before comparing, matching Python's
/// tuple construction `(field.module, field.element, field.alias)`.
pub fn field_owner_matches(
    observer: &mut impl FieldRefObserver,
    expected: &ExpectedOwner,
) -> Result<bool, ObservationError> {
    let module = observer.read("module")?;
    let element = observer.read("element")?;
    let alias = observer.read("alias")?;
    let (ObservedField::Text(module), ObservedField::Text(element)) = (module, element) else {
        return Err(ObservationError::UnsupportedValue);
    };
    let alias = match alias {
        ObservedField::Text(alias) => Some(alias),
        ObservedField::None => None,
    };
    Ok(module == expected.module && element == expected.element && alias == expected.alias)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct Fixture {
        reads: Vec<&'static str>,
        values: Vec<ObservedField>,
        fail_at: Option<&'static str>,
    }

    impl FieldRefObserver for Fixture {
        fn read(&mut self, field: &'static str) -> Result<ObservedField, ObservationError> {
            self.reads.push(field);
            if self.fail_at == Some(field) {
                return Err(ObservationError::HostException);
            }
            let index = self.reads.len() - 1;
            Ok(self.values[index].clone())
        }
    }

    fn expected() -> ExpectedOwner {
        ExpectedOwner {
            module: Utf16::from("demo"),
            element: Utf16::from("Thing"),
            alias: Some(Utf16::from("root")),
        }
    }

    #[test]
    fn observes_all_components_in_python_tuple_read_order_before_comparison() {
        let mut fixture = Fixture {
            reads: vec![],
            values: vec![
                ObservedField::Text(Utf16::from("foreign")),
                ObservedField::Text(Utf16::from("Elsewhere")),
                ObservedField::Text(Utf16::from("late")),
            ],
            fail_at: None,
        };
        assert_eq!(field_owner_matches(&mut fixture, &expected()), Ok(false));
        assert_eq!(fixture.reads, ["module", "element", "alias"]);
    }

    #[test]
    fn stops_at_the_exact_accessor_that_throws() {
        let mut fixture = Fixture {
            reads: vec![],
            values: vec![ObservedField::Text(Utf16::from("demo"))],
            fail_at: Some("element"),
        };
        assert_eq!(
            field_owner_matches(&mut fixture, &expected()),
            Err(ObservationError::HostException)
        );
        assert_eq!(fixture.reads, ["module", "element"]);
    }

    #[derive(Clone)]
    enum MockValue {
        Object(u32),
        Text(&'static str),
        None,
        Other,
    }

    struct GraphFixture {
        attrs: HashMap<(u32, &'static str), MockValue>,
        sequences: HashMap<u32, Vec<u32>>,
        iterators: HashMap<u32, (Vec<u32>, usize)>,
        kinds: HashSet<(u32, GraphType)>,
        structural_kinds: HashSet<(u32, StructuralType)>,
        exact_kinds: HashSet<(u32, GraphType)>,
        exact_structural_kinds: HashSet<(u32, StructuralType)>,
        next_handle: u32,
        events: Vec<String>,
    }

    impl CaptureGraphHostObserver for GraphFixture {
        type Handle = u32;

        fn get_attr(
            &mut self,
            object: u32,
            name: &'static str,
        ) -> Result<ObservedValue<u32>, ObservationError> {
            self.events.push(format!("get:{object}.{name}"));
            Ok(
                match self
                    .attrs
                    .get(&(object, name))
                    .cloned()
                    .ok_or(ObservationError::UnsupportedValue)?
                {
                    MockValue::Object(value) => ObservedValue::Object(value),
                    MockValue::Text(value) => ObservedValue::Text(Utf16::from(value)),
                    MockValue::None => ObservedValue::None,
                    MockValue::Other => ObservedValue::Other,
                },
            )
        }

        fn truthy(&mut self, value: u32) -> Result<bool, ObservationError> {
            self.events.push(format!("truthy:{value}"));
            Ok(self
                .sequences
                .get(&value)
                .is_some_and(|items| !items.is_empty()))
        }

        fn get_item(&mut self, sequence: u32, index: usize) -> Result<u32, ObservationError> {
            self.events.push(format!("item:{sequence}[{index}]"));
            self.sequences
                .get(&sequence)
                .and_then(|items| items.get(index))
                .copied()
                .ok_or(ObservationError::UnsupportedValue)
        }

        fn is_instance(&mut self, value: u32, kind: GraphType) -> Result<bool, ObservationError> {
            self.events.push(format!("is:{value}:{kind:?}"));
            Ok(self.kinds.contains(&(value, kind)))
        }

        fn is_instance_structural(
            &mut self,
            value: u32,
            kind: StructuralType,
        ) -> Result<bool, ObservationError> {
            self.events.push(format!("is:{value}:{kind:?}"));
            Ok(self.structural_kinds.contains(&(value, kind)))
        }

        fn is_exact_instance(
            &mut self,
            value: u32,
            kind: GraphType,
        ) -> Result<bool, ObservationError> {
            self.events.push(format!("exact:{value}:{kind:?}"));
            Ok(self.exact_kinds.contains(&(value, kind)))
        }

        fn is_exact_structural(
            &mut self,
            value: u32,
            kind: StructuralType,
        ) -> Result<bool, ObservationError> {
            self.events.push(format!("exact:{value}:{kind:?}"));
            Ok(self.exact_structural_kinds.contains(&(value, kind)))
        }

        fn exact_text(&mut self, value: u32) -> Result<Utf16, ObservationError> {
            self.events.push(format!("text:{value}"));
            match self.attrs.get(&(value, "__text")).cloned() {
                Some(MockValue::Text(value)) => Ok(Utf16::from(value)),
                _ => Err(ObservationError::UnsupportedValue),
            }
        }

        fn iter(&mut self, sequence: u32) -> Result<u32, ObservationError> {
            self.events.push(format!("iter:{sequence}"));
            let items = self
                .sequences
                .get(&sequence)
                .cloned()
                .ok_or(ObservationError::UnsupportedValue)?;
            let handle = self.next_handle;
            self.next_handle += 1;
            self.iterators.insert(handle, (items, 0));
            Ok(handle)
        }

        fn next(&mut self, iterator: u32) -> Result<Option<u32>, ObservationError> {
            self.events.push(format!("next:{iterator}"));
            let (items, index) = self
                .iterators
                .get_mut(&iterator)
                .ok_or(ObservationError::UnsupportedValue)?;
            let item = items.get(*index).copied();
            *index += usize::from(item.is_some());
            Ok(item)
        }
    }

    fn graph_fixture() -> GraphFixture {
        let mut attrs = HashMap::new();
        let mut set_attr = |object, name, value| {
            attrs.insert((object, name), value);
        };
        set_attr(1, "op", MockValue::Text("all"));
        set_attr(1, "args", MockValue::Object(2));
        set_attr(5, "op", MockValue::Text("join"));
        set_attr(5, "args", MockValue::Object(6));
        for (object, module, element, alias) in [
            (3, "root", "Record", None),
            (8, "root", "Record", None),
            (9, "other", "Record", Some("right")),
        ] {
            set_attr(object, "module", MockValue::Text(module));
            set_attr(object, "element", MockValue::Text(element));
            set_attr(
                object,
                "alias",
                alias.map_or(MockValue::None, MockValue::Text),
            );
        }
        set_attr(7, "ref", MockValue::Object(8));
        set_attr(7, "target", MockValue::Object(9));
        drop(set_attr);
        GraphFixture {
            attrs,
            sequences: HashMap::from([(2, vec![3, 4]), (4, vec![5]), (6, vec![7])]),
            iterators: HashMap::new(),
            kinds: HashSet::from([(3, GraphType::RecordRef)]),
            structural_kinds: HashSet::new(),
            exact_kinds: HashSet::new(),
            exact_structural_kinds: HashSet::new(),
            next_handle: 100,
            events: Vec::new(),
        }
    }

    #[test]
    fn terminal_owner_walk_restarts_step_passes_and_reloads_join_properties() {
        let mut host = graph_fixture();
        let mut context = crate::Context::ordinary();
        let observed = observe_terminal_join_owners(&mut context, &mut host, 1).unwrap();
        assert_eq!(observed.terminal_op, Utf16::from("all"));
        assert_eq!(observed.owners.len(), 2);
        assert!(!observed.steps_empty);
        assert!(!observed.record_exact);
        assert!(!observed.steps_exact_tuple);
        let ref_reads = host
            .events
            .iter()
            .filter(|event| event.as_str() == "get:7.ref")
            .count();
        let target_reads = host
            .events
            .iter()
            .filter(|event| event.as_str() == "get:7.target")
            .count();
        assert_eq!(ref_reads, 3);
        assert_eq!(target_reads, 3);
        let node_args = host
            .events
            .iter()
            .filter(|event| event.as_str() == "get:1.args")
            .count();
        assert_eq!(node_args, 4);
        assert!(
            host.events
                .iter()
                .position(|event| event == "get:5.op")
                .unwrap()
                < host
                    .events
                    .iter()
                    .rposition(|event| event == "get:5.op")
                    .unwrap()
        );
    }

    #[test]
    fn invalid_join_source_refuses_before_reading_target() {
        let mut host = graph_fixture();
        host.attrs.insert((8, "module"), MockValue::Text("absent"));
        let mut context = crate::Context::ordinary();
        assert_eq!(
            observe_terminal_join_owners(&mut context, &mut host, 1),
            Err(ObservationError::JoinSourceAbsent)
        );
        assert!(!host.events.iter().any(|event| event == "get:7.target"));
    }

    #[test]
    fn structural_field_observer_follows_node_tuple_and_join_ref_order() {
        let mut host = graph_fixture();
        host.attrs.insert((20, "args"), MockValue::Object(21));
        host.attrs.insert((25, "args"), MockValue::Object(26));
        for (object, module, element) in [(22, "root", "Record"), (27, "root", "Record")] {
            host.attrs
                .insert((object, "module"), MockValue::Text(module));
            host.attrs
                .insert((object, "element"), MockValue::Text(element));
            host.attrs.insert((object, "alias"), MockValue::None);
        }
        host.attrs.insert((28, "ref"), MockValue::Object(22));
        host.sequences.insert(21, vec![22, 23, 28]);
        host.sequences.insert(23, vec![25]);
        host.sequences.insert(26, vec![27]);
        host.kinds
            .extend([(20, GraphType::Node), (25, GraphType::Node)]);
        host.structural_kinds.extend([
            (22, StructuralType::FieldRef),
            (23, StructuralType::Tuple),
            (27, StructuralType::FieldRef),
            (28, StructuralType::Join),
        ]);
        let allowed = HashSet::from([Owner {
            module: Utf16::from("root"),
            element: Utf16::from("Record"),
            alias: None,
        }]);
        let mut context = crate::Context::ordinary();

        assert_eq!(
            observe_structural_field_owners(&mut context, &mut host, 20, &allowed),
            Ok(())
        );
        let module_reads: Vec<_> = host
            .events
            .iter()
            .filter(|event| event.ends_with(".module"))
            .cloned()
            .collect();
        assert_eq!(
            module_reads,
            ["get:22.module", "get:27.module", "get:22.module"]
        );
    }

    #[test]
    fn structural_field_observer_fails_closed_for_foreign_field() {
        let mut host = graph_fixture();
        host.structural_kinds.insert((22, StructuralType::FieldRef));
        for (name, value) in [
            ("module", MockValue::Text("foreign")),
            ("element", MockValue::Text("Record")),
            ("alias", MockValue::None),
        ] {
            host.attrs.insert((22, name), value);
        }
        let allowed = HashSet::from([Owner {
            module: Utf16::from("root"),
            element: Utf16::from("Record"),
            alias: None,
        }]);
        let mut context = crate::Context::ordinary();
        assert_eq!(
            observe_structural_field_owners(&mut context, &mut host, 22, &allowed),
            Err(ObservationError::ForeignField)
        );
    }

    #[test]
    fn missing_structural_probe_capability_fails_closed() {
        struct MissingStructuralProbe;
        impl CaptureGraphHostObserver for MissingStructuralProbe {
            type Handle = u32;

            fn get_attr(
                &mut self,
                _: u32,
                _: &'static str,
            ) -> Result<ObservedValue<u32>, ObservationError> {
                unreachable!()
            }
            fn truthy(&mut self, _: u32) -> Result<bool, ObservationError> {
                unreachable!()
            }
            fn get_item(&mut self, _: u32, _: usize) -> Result<u32, ObservationError> {
                unreachable!()
            }
            fn is_instance(&mut self, _: u32, _: GraphType) -> Result<bool, ObservationError> {
                unreachable!()
            }
            fn iter(&mut self, _: u32) -> Result<u32, ObservationError> {
                unreachable!()
            }
            fn next(&mut self, _: u32) -> Result<Option<u32>, ObservationError> {
                unreachable!()
            }
        }

        let mut host = MissingStructuralProbe;
        assert_eq!(
            host.is_instance_structural(1, StructuralType::FieldRef),
            Err(ObservationError::UnsupportedValue)
        );
    }

    #[test]
    fn empty_search_leg_observes_repeated_record_then_value_and_legs_in_order() {
        let mut host = graph_fixture();
        host.structural_kinds.insert((2, StructuralType::SearchLeg));
        for (object, module, element) in [(3, "root", "Record"), (1, "root", "Record")] {
            host.attrs
                .insert((object, "module"), MockValue::Text(module));
            host.attrs
                .insert((object, "element"), MockValue::Text(element));
        }
        host.attrs.insert((2, "record"), MockValue::Object(3));
        host.attrs.insert((2, "value"), MockValue::None);
        host.attrs.insert((2, "legs"), MockValue::Object(4));
        host.sequences.insert(4, vec![]);
        let mut context = crate::Context::ordinary();

        assert_eq!(
            observe_empty_search_leg_prefix(&mut context, &mut host, 2, 1),
            Ok(())
        );
        assert!(host.events.iter().any(|event| event == "get:3.module"));
        let tail = &host.events[host
            .events
            .iter()
            .position(|event| event == "is:2:FieldRef")
            .unwrap()..];
        assert_eq!(
            tail,
            [
                "is:2:FieldRef",
                "is:2:SearchLeg",
                "get:2.record",
                "get:3.module",
                "get:2.record",
                "get:3.element",
                "get:1.module",
                "get:1.element",
                "get:2.value",
                "get:2.legs",
                "iter:4",
                "next:100",
            ]
        );
    }

    #[test]
    fn vector_search_leg_accepts_only_the_resolved_vector_carrier() {
        let mut host = graph_fixture();
        host.exact_structural_kinds
            .insert((2, StructuralType::SearchLeg));
        host.exact_kinds.insert((4, GraphType::Node));
        for (object, field, value) in [
            (1, "module", MockValue::Text("demo")),
            (1, "element", MockValue::Text("Thing")),
            (3, "module", MockValue::Text("demo")),
            (3, "element", MockValue::Text("Thing")),
            (4, "op", MockValue::Text("param")),
        ] {
            host.attrs.insert((object, field), value);
        }
        host.attrs.insert((2, "record"), MockValue::Object(3));
        host.attrs.insert((2, "value"), MockValue::Object(4));
        host.attrs.insert((2, "kind"), MockValue::Text("vector"));
        host.attrs.insert((2, "legs"), MockValue::Object(7));
        host.attrs.insert((4, "args"), MockValue::Object(5));
        host.attrs
            .insert((6, "__text"), MockValue::Text("embedding"));
        host.sequences.insert(5, vec![6]);
        host.sequences.insert(7, vec![]);
        let mut context = crate::Context::ordinary();

        assert_eq!(
            observe_keyword_search_leg(
                &mut context,
                &mut host,
                2,
                1,
                &Utf16::from("embedding"),
                false,
                true,
            ),
            Ok(())
        );
        let kinds = host
            .events
            .iter()
            .filter(|event| event.as_str() == "get:2.kind")
            .count();
        assert_eq!(kinds, 1);
        let value_reads = host
            .events
            .iter()
            .enumerate()
            .filter_map(|(index, event)| (event == "get:2.value").then_some(index))
            .collect::<Vec<_>>();
        assert_eq!(value_reads.len(), 4);
        let kind_read = host
            .events
            .iter()
            .position(|event| event == "get:2.kind")
            .unwrap();
        assert!(value_reads[2] < kind_read && kind_read < value_reads[3]);
    }

    #[test]
    fn foreign_search_record_refuses_before_kind_and_value() {
        let mut host = graph_fixture();
        host.structural_kinds.insert((2, StructuralType::SearchLeg));
        for (object, module, element) in [(3, "foreign", "Record"), (1, "root", "Record")] {
            host.attrs
                .insert((object, "module"), MockValue::Text(module));
            host.attrs
                .insert((object, "element"), MockValue::Text(element));
        }
        host.attrs.insert((2, "record"), MockValue::Object(3));
        let mut context = crate::Context::ordinary();

        assert_eq!(
            observe_empty_search_leg_prefix(&mut context, &mut host, 2, 1),
            Err(ObservationError::SearchForeignRecord)
        );
        assert!(!host.events.iter().any(|event| event == "get:2.kind"));
        assert!(!host.events.iter().any(|event| event == "get:2.value"));
    }
}
