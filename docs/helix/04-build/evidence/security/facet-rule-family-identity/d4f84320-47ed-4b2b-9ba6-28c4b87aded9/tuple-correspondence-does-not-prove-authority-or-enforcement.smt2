; benchmark generated from python API
(set-info :status unknown)
(declare-sort RuleFamily 0)
(declare-sort CandidateProfile 0)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort SemanticOwnerProfile 0)
(declare-datatypes ((FaithfulTupleIdentity 0)) (((rule (identity_profile CandidateProfile) (identity_owner SemanticOwnerProfile) (identity_occurrence ExactOriginalOccurrence) (identity_family RuleFamily)))))
(declare-fun fixed_scale () RuleFamily)
(declare-fun precision () RuleFamily)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun owner () SemanticOwnerProfile)
(declare-fun profile () CandidateProfile)
(declare-fun authenticated_owner () Bool)
(declare-fun installed_enforcement () Bool)
(assert
 (and (distinct precision fixed_scale) true))
(assert
 (let ((?x16 (rule profile owner occurrence fixed_scale)))
 (let ((?x15 (rule profile owner occurrence precision)))
 (and (distinct ?x15 ?x16) true))))
(assert
 (not authenticated_owner))
(assert
 (not installed_enforcement))
(check-sat)
