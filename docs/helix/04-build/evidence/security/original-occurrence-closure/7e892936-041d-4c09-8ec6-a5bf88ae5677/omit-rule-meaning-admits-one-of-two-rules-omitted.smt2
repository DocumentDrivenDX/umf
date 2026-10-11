; benchmark generated from python API
(set-info :status unknown)
(declare-sort OriginalOccurrence 0)
(declare-sort SemanticRuleIdentity 0)
(declare-fun is_original_value (OriginalOccurrence) Bool)
(declare-fun is_semantic_assertion (OriginalOccurrence) Bool)
(declare-fun owner_classification (OriginalOccurrence) Int)
(declare-fun original_semantic_rule (OriginalOccurrence SemanticRuleIdentity) Bool)
(declare-fun is_indexed_value (OriginalOccurrence) Bool)
(declare-fun inventoried_semantic_rule (OriginalOccurrence SemanticRuleIdentity) Bool)
(declare-fun reported_semantic_rule (OriginalOccurrence SemanticRuleIdentity) Bool)
(declare-fun rule_b () SemanticRuleIdentity)
(declare-fun rule_a () SemanticRuleIdentity)
(declare-fun occurrence () OriginalOccurrence)
(assert
 (forall ((occurrence OriginalOccurrence) )(let (($x12 (is_original_value occurrence)))
 (let (($x13 (is_semantic_assertion occurrence)))
 (=> $x13 $x12))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(and (>= (owner_classification occurrence) 0) (<= (owner_classification occurrence) 3)))
 )
(assert
 (forall ((occurrence OriginalOccurrence) (rule_identity SemanticRuleIdentity) )(let (($x105 (is_original_value occurrence)))
 (let (($x106 (original_semantic_rule occurrence rule_identity)))
 (=> $x106 $x105))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(let (($x12 (is_original_value occurrence)))
 (let (($x18 (is_indexed_value occurrence)))
 (= $x18 $x12))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(let ((?x19 (owner_classification occurrence)))
 (let (($x27 (and (distinct ?x19 0) true)))
 (let (($x18 (is_indexed_value occurrence)))
 (=> $x18 $x27)))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) (rule_identity SemanticRuleIdentity) )(= (reported_semantic_rule occurrence rule_identity) (and (is_indexed_value occurrence) (inventoried_semantic_rule occurrence rule_identity))))
 )
(assert
 (and (distinct rule_a rule_b) true))
(assert
 (original_semantic_rule occurrence rule_a))
(assert
 (original_semantic_rule occurrence rule_b))
(assert
 (inventoried_semantic_rule occurrence rule_a))
(assert
 (not (inventoried_semantic_rule occurrence rule_b)))
(assert
 (reported_semantic_rule occurrence rule_a))
(assert
 (not (reported_semantic_rule occurrence rule_b)))
(check-sat)
