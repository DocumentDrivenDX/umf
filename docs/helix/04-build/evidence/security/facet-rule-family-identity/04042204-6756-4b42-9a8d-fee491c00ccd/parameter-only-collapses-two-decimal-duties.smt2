; benchmark generated from python API
(set-info :status unknown)
(declare-sort RuleFamily 0)
(declare-sort JointJsonParameters 0)
(declare-fun fixed_scale () RuleFamily)
(declare-fun precision () RuleFamily)
(declare-fun other_parameters () JointJsonParameters)
(declare-fun parameters () JointJsonParameters)
(assert
 (and (distinct precision fixed_scale) true))
(assert
 (= parameters other_parameters))
(check-sat)
