; benchmark generated from python API
(set-info :status unknown)
(declare-sort SemanticOwnerProfile 0)
(declare-fun other_owner () SemanticOwnerProfile)
(declare-fun owner () SemanticOwnerProfile)
(assert
 (and (distinct owner other_owner) true))
(check-sat)
