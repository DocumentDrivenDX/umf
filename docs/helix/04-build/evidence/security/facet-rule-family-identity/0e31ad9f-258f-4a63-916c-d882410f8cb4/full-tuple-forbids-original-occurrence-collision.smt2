; benchmark generated from python API
(set-info :status unknown)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort CandidateProfile 0)
(declare-sort RuleFamily 0)
(declare-sort SemanticOwnerProfile 0)
(declare-datatypes ((FaithfulTupleIdentity 0)) (((rule (identity_profile CandidateProfile) (identity_owner SemanticOwnerProfile) (identity_occurrence ExactOriginalOccurrence) (identity_family RuleFamily)))))
(declare-fun other_occurrence () ExactOriginalOccurrence)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun precision () RuleFamily)
(declare-fun owner () SemanticOwnerProfile)
(declare-fun profile () CandidateProfile)
(assert
 (and (distinct occurrence other_occurrence) true))
(assert
 (let ((?x35 (rule profile owner other_occurrence precision)))
(let ((?x15 (rule profile owner occurrence precision)))
(= ?x15 ?x35))))
(check-sat)
