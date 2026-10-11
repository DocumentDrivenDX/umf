; benchmark generated from python API
(set-info :status unknown)
(declare-sort CandidateProfile 0)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort RuleFamily 0)
(declare-sort SemanticOwnerProfile 0)
(declare-datatypes ((Erased_candidate_profile 0)) (((make_Erased_candidate_profile (Erased_candidate_profile_owner SemanticOwnerProfile) (Erased_candidate_profile_occurrence ExactOriginalOccurrence) (Erased_candidate_profile_family RuleFamily)))))
(declare-fun other_profile () CandidateProfile)
(declare-fun profile () CandidateProfile)
(declare-fun precision () RuleFamily)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun owner () SemanticOwnerProfile)
(assert
 (and (distinct profile other_profile) true))
(assert
 (let ((?x36 (make_Erased_candidate_profile owner occurrence precision)))
(= ?x36 ?x36)))
(check-sat)
