; benchmark generated from python API
(set-info :status unknown)
(declare-sort Definition 0)
(declare-fun inventory_before (Definition) Bool)
(declare-fun fault_definition () Definition)
(declare-fun inventory_after (Definition) Bool)
(declare-fun physical_value_after (Definition) Int)
(declare-fun physical_value_before (Definition) Int)
(assert
 (inventory_before fault_definition))
(assert
 (inventory_after fault_definition))
(assert
 (let ((?x36 (physical_value_after fault_definition)))
(let ((?x35 (physical_value_before fault_definition)))
(and (distinct ?x35 ?x36) true))))
(check-sat)
