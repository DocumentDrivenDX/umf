; benchmark generated from python API
(set-info :status unknown)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort CandidateProfile 0)
(declare-sort RuleFamily 0)
(declare-sort SemanticOwnerProfile 0)
(declare-datatypes ((Erased_original_occurrence 0)) (((make_Erased_original_occurrence (Erased_original_occurrence_profile CandidateProfile) (Erased_original_occurrence_owner SemanticOwnerProfile) (Erased_original_occurrence_family RuleFamily)))))
(declare-fun other_occurrence () ExactOriginalOccurrence)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun precision () RuleFamily)
(declare-fun owner () SemanticOwnerProfile)
(declare-fun profile () CandidateProfile)
(assert
 (and (distinct occurrence other_occurrence) true))
(assert
 (let ((?x42 (make_Erased_original_occurrence profile owner precision)))
(= ?x42 ?x42)))
(check-sat)
