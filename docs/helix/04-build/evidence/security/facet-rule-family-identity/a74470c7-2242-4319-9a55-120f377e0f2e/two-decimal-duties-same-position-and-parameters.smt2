; benchmark generated from python API
(set-info :status unknown)
(declare-sort RuleFamily 0)
(declare-sort JointJsonParameters 0)
(declare-sort CandidateProfile 0)
(declare-sort ExactOriginalOccurrence 0)
(declare-sort SemanticOwnerProfile 0)
(declare-datatypes ((FaithfulTupleIdentity 0)) (((rule (profile CandidateProfile) (owner SemanticOwnerProfile) (occurrence ExactOriginalOccurrence) (family RuleFamily)))))
(declare-fun fixed_scale () RuleFamily)
(declare-fun precision () RuleFamily)
(declare-fun other_parameters () JointJsonParameters)
(declare-fun parameters () JointJsonParameters)
(declare-fun occurrence () ExactOriginalOccurrence)
(declare-fun owner () SemanticOwnerProfile)
(declare-fun profile () CandidateProfile)
(assert
 (and (distinct precision fixed_scale) true))
(assert
 (= parameters other_parameters))
(assert
 (let ((?x16 (rule profile owner occurrence fixed_scale)))
(let ((?x15 (rule profile owner occurrence precision)))
(and (distinct ?x15 ?x16) true))))
(check-sat)
