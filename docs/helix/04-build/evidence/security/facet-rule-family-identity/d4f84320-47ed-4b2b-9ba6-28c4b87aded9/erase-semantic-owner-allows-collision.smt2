; benchmark generated from python API
(set-info :status unknown)
(declare-sort SemanticOwnerProfile 0)
(declare-sort CandidateProfile 0)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort RuleFamily 0)
(declare-datatypes ((Erased_semantic_owner 0)) (((make_Erased_semantic_owner (Erased_semantic_owner_profile CandidateProfile) (Erased_semantic_owner_occurrence ExactOriginalOccurrence) (Erased_semantic_owner_family RuleFamily)))))
(declare-fun other_owner () SemanticOwnerProfile)
(declare-fun owner () SemanticOwnerProfile)
(declare-fun precision () RuleFamily)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun profile () CandidateProfile)
(assert
 (and (distinct owner other_owner) true))
(assert
 (let ((?x39 (make_Erased_semantic_owner profile occurrence precision)))
(= ?x39 ?x39)))
(check-sat)
