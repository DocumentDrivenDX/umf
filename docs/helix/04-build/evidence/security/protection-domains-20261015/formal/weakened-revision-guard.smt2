; benchmark generated from python API
(set-info :status unknown)
(declare-sort ExactIdentity 0)
(declare-datatypes ((QualifiedField 0)) (((field (document ExactIdentity) (module ExactIdentity) (element ExactIdentity)))))
(declare-sort Revision 0)
(declare-fun selected () QualifiedField)
(declare-fun requested () QualifiedField)
(declare-fun has_pin () Bool)
(declare-fun is_explicit_field () Bool)
(declare-fun known_core () Bool)
(declare-fun known_source () Bool)
(declare-fun pinned_revision () Revision)
(declare-fun actual_revision () Revision)
(assert
 (= requested selected))
(assert
 has_pin)
(assert
 is_explicit_field)
(assert
 known_core)
(assert
 known_source)
(assert
 (and (distinct actual_revision pinned_revision) true))
(check-sat)
