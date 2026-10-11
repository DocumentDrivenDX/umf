; benchmark generated from python API
(set-info :status unknown)
(declare-sort Definition 0)
(declare-fun stage () Int)
(declare-fun report () Int)
(declare-fun registered_interpretation () Bool)
(declare-fun authenticated_operation () Bool)
(declare-fun original_source_exact () Bool)
(declare-fun complete_final_closure () Bool)
(declare-fun physical_value_after (Definition) Int)
(declare-fun physical_value_before (Definition) Int)
(declare-fun inventory_before (Definition) Bool)
(declare-fun inventory_after (Definition) Bool)
(assert
 (>= stage 0))
(assert
 (>= report 0))
(assert
 registered_interpretation)
(assert
 authenticated_operation)
(assert
 original_source_exact)
(assert
 complete_final_closure)
(assert
 (forall ((definition Definition) )(let (($x42 (= (physical_value_before definition) (physical_value_after definition))))
 (let (($x43 (inventory_before definition)))
 (let (($x46 (= $x43 (inventory_after definition))))
 (and $x46 (=> $x43 $x42))))))
 )
(assert
 (< report stage))
(check-sat)
