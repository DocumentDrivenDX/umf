; benchmark generated from python API
(set-info :status unknown)
(declare-sort RuleFamily 0)
(declare-sort CandidateProfile 0)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort SemanticOwnerProfile 0)
(declare-datatypes ((PositionOnly 0)) (((make_PositionOnly (PositionOnly_profile CandidateProfile) (PositionOnly_owner SemanticOwnerProfile) (PositionOnly_occurrence ExactOriginalOccurrence)))))
(declare-sort JointJsonParameters 0)
(declare-fun fixed_scale () RuleFamily)
(declare-fun precision () RuleFamily)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun owner () SemanticOwnerProfile)
(declare-fun profile () CandidateProfile)
(declare-fun other_parameters () JointJsonParameters)
(declare-fun parameters () JointJsonParameters)
(assert
 (and (distinct precision fixed_scale) true))
(assert
 (let ((?x23 (make_PositionOnly profile owner occurrence)))
 (= ?x23 ?x23)))
(assert
 (= parameters other_parameters))
(check-sat)
