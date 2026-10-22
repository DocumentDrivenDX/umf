; benchmark generated from python API
(set-info :status unknown)
(declare-sort CandidateProfile 0)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort RuleFamily 0)
(declare-sort SemanticOwnerProfile 0)
(declare-datatypes ((FaithfulTupleIdentity 0)) (((rule (identity_profile CandidateProfile) (identity_owner SemanticOwnerProfile) (identity_occurrence ExactOriginalOccurrence) (identity_family RuleFamily)))))
(declare-fun other_profile () CandidateProfile)
(declare-fun profile () CandidateProfile)
(declare-fun precision () RuleFamily)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun owner () SemanticOwnerProfile)
(assert
 (and (distinct profile other_profile) true))
(assert
 (let ((?x27 (rule other_profile owner occurrence precision)))
(let ((?x15 (rule profile owner occurrence precision)))
(= ?x15 ?x27))))
(check-sat)
