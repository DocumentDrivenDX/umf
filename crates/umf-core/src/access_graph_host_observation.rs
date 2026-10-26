// SPDX-License-Identifier: MIT OR Apache-2.0
//! First host-observation primitive for Python captured graph validation.
//!
//! Rust directs live graph reads in Python expression order. The current
//! profile remains limited to FieldRef owner membership; it is not a graph
//! validator or a public capture route.

use crate::Utf16;
use std::collections::HashSet;

pub const PROFILE: &str = "umf-access-capture-graph-observation/0.1.0";

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
    fn iter(&mut self, sequence: Self::Handle) -> Result<Self::Handle, ObservationError>;
    fn next(&mut self, iterator: Self::Handle) -> Result<Option<Self::Handle>, ObservationError>;
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum GraphType {
    Node,
    RecordRef,
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
    let record = budgeted(context, || host.get_item(root_args, 0))?;
    if !budgeted(context, || host.is_instance(record, GraphType::RecordRef))? {
        return Err(ObservationError::MissingRecordIdentity);
    }
    let steps_args = object(attr(context, host, node, "args")?)?;
    let steps = budgeted(context, || host.get_item(steps_args, 1))?;

    // `selections = [...]` consumes every selected argument before the later
    // `any(isinstance(..., Node))` short-circuit begins.
    let mut selections = Vec::new();
    let selection_iter = budgeted(context, || host.iter(steps))?;
    while let Some(step) = budgeted(context, || host.next(selection_iter))? {
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
        assert_eq!(node_args, 3);
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
}
