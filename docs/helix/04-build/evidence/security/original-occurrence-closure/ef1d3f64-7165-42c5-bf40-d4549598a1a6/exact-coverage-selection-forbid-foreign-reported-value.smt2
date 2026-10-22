; benchmark generated from python API
(set-info :status unknown)
(declare-sort OriginalOccurrence 0)
(declare-fun is_original_value (OriginalOccurrence) Bool)
(declare-fun is_semantic_assertion (OriginalOccurrence) Bool)
(declare-fun owner_classification (OriginalOccurrence) Int)
(declare-fun is_indexed_value (OriginalOccurrence) Bool)
(declare-fun is_reported_assertion (OriginalOccurrence) Bool)
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
 (forall ((occurrence OriginalOccurrence) )(let (($x12 (is_original_value occurrence)))
 (let (($x18 (is_indexed_value occurrence)))
 (= $x18 $x12))))
 )
(assert
 (forall ((occurrence OriginalOccurrence) )(let ((?x19 (owner_classification occurrence)))
 (let (($x35 (= ?x19 1)))
 (let (($x18 (is_indexed_value occurrence)))
 (let (($x33 (and $x18 $x35)))
 (let (($x34 (is_reported_assertion occurrence)))
 (= $x34 $x33)))))))
 )
(assert
 (is_reported_assertion occurrence))
(assert
 (let (($x8 (is_original_value occurrence)))
(not $x8)))
(check-sat)
