; benchmark generated from python API
(set-info :status unknown)
(declare-sort SemanticOwnerProfile 0)
(declare-sort CandidateProfile 0)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort RuleFamily 0)
(declare-datatypes ((FaithfulTupleIdentity 0)) (((rule (identity_profile CandidateProfile) (identity_owner SemanticOwnerProfile) (identity_occurrence ExactOriginalOccurrence) (identity_family RuleFamily)))))
(declare-fun other_owner () SemanticOwnerProfile)
(declare-fun owner () SemanticOwnerProfile)
(declare-fun precision () RuleFamily)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun profile () CandidateProfile)
(assert
 (and (distinct owner other_owner) true))
(assert
 (let ((?x29 (rule profile other_owner occurrence precision)))
(let ((?x15 (rule profile owner occurrence precision)))
(= ?x15 ?x29))))
(check-sat)
