; benchmark generated from python API
(set-info :status unknown)
(declare-fun effective_mode () Int)
(declare-fun ontology_mode () Int)
(declare-fun catalog_mode () Int)
(declare-fun read_disposition () Int)
(declare-fun source_rows () Int)
(declare-fun live_domain () Int)
(declare-fun read_dto_domain () Int)
(declare-fun pre_storage_domain () Int)
(declare-fun operand_domain () Int)
(declare-fun stored () Bool)
(declare-fun live_present () Bool)
(declare-fun read_value_available () Bool)
(declare-fun emitted_directions () (Array Int Bool))
(declare-fun original_directions () (Array Int Bool))
(assert
 (>= effective_mode 0))
(assert
 (<= effective_mode 2))
(assert
 (>= ontology_mode 0))
(assert
 (<= ontology_mode 2))
(assert
 (>= catalog_mode 0))
(assert
 (<= catalog_mode 3))
(assert
 (>= read_disposition 0))
(assert
 (<= read_disposition 3))
(assert
 (>= source_rows 0))
(assert
 (>= live_domain 0))
(assert
 (>= read_dto_domain 0))
(assert
 (>= pre_storage_domain 0))
(assert
 (>= operand_domain 0))
(assert
 (let (($x50 (= read_disposition 1)))
 (let (($x51 (or stored $x50)))
 (=> $x51 (and (distinct catalog_mode 3) true)))))
(assert
 (let (($x55 (= read_value_available live_present)))
 (let (($x54 (= read_disposition 0)))
 (=> $x54 $x55))))
(assert
 (let (($x50 (= read_disposition 1)))
 (=> $x50 read_value_available)))
(assert
 (let (($x61 (not read_value_available)))
 (let (($x59 (= read_disposition 3)))
 (let (($x58 (= read_disposition 2)))
 (let (($x60 (or $x58 $x59)))
 (=> $x60 $x61))))))
(assert
 (let (($x63 (not live_present)))
 (let (($x59 (= read_disposition 3)))
 (=> $x59 $x63))))
(assert
 (forall ((order_index Int) )(let (($x150 (select emitted_directions order_index)))
 (let (($x151 (select original_directions order_index)))
 (let (($x152 (= $x151 $x150)))
 (let (($x154 (>= order_index 0)))
 (let (($x155 (and $x154 (< order_index 2))))
 (=> $x155 $x152)))))))
 )
(assert
 (exists ((order_index Int) )(let (($x150 (select emitted_directions order_index)))
(let (($x151 (select original_directions order_index)))
(let (($x154 (>= order_index 0)))
(let (($x155 (and $x154 (< order_index 2))))
(and $x155 (and (distinct $x151 $x150) true)))))))
)
(check-sat)
