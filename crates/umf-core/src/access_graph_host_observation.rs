// SPDX-License-Identifier: MIT OR Apache-2.0
//! First host-observation primitive for Python captured graph validation.
//!
//! Rust directs the three live FieldRef reads in Python expression order. This
//! profile deliberately covers only owner membership; it is not a graph
//! validator or a public capture route.

pub const PROFILE: &str = "umf-access-field-owner-observation/0.1.0";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpectedOwner {
    pub module: String,
    pub element: String,
    pub alias: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ObservedField {
    Text(String),
    None,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ObservationError {
    HostException,
    UnsupportedValue,
}

pub trait FieldRefObserver {
    fn read(&mut self, field: &'static str) -> Result<ObservedField, ObservationError>;
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
            module: "demo".into(),
            element: "Thing".into(),
            alias: Some("root".into()),
        }
    }

    #[test]
    fn observes_all_components_in_python_tuple_read_order_before_comparison() {
        let mut fixture = Fixture {
            reads: vec![],
            values: vec![
                ObservedField::Text("foreign".into()),
                ObservedField::Text("Elsewhere".into()),
                ObservedField::Text("late".into()),
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
            values: vec![ObservedField::Text("demo".into())],
            fail_at: Some("element"),
        };
        assert_eq!(
            field_owner_matches(&mut fixture, &expected()),
            Err(ObservationError::HostException)
        );
        assert_eq!(fixture.reads, ["module", "element"]);
    }
}
