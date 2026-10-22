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
(declare-fun retained_properties () Bool)
(declare-fun current_action_permission () Bool)
(declare-fun read_row_eligible () Bool)
(declare-fun original_action_purpose () Bool)
(declare-fun distinct_action () Bool)
(declare-fun exact_designation () Bool)
(declare-fun live_nullable () Bool)
(declare-fun dto_nullable () Bool)
(declare-fun operand_nullable () Bool)
(declare-fun paired_operation () Bool)
(declare-fun random_token () Bool)
(declare-fun same_native_scope () Bool)
(declare-fun no_selected_gaps () Bool)
(declare-fun complete_compiler () Bool)
(declare-fun verified_sources () Bool)
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
 (let (($x71 (= effective_mode 2)))
 (let (($x93 (ite $x71 (and live_present current_action_permission) (and read_value_available retained_properties))))
 (let (($x94 (and read_row_eligible $x93)))
 (let (($x88 (and exact_designation distinct_action original_action_purpose)))
 (let (($x89 (or (and (distinct effective_mode 2) true) $x88)))
 (let (($x75 (ite $x71 live_nullable (ite (= read_disposition 1) dto_nullable live_nullable))))
 (let (($x50 (= read_disposition 1)))
 (let ((?x72 (ite $x50 read_dto_domain live_domain)))
 (let ((?x73 (ite $x71 live_domain ?x72)))
 (let (($x86 (and (= operand_domain ?x73) (= operand_nullable $x75))))
 (let (($x82 (not (and (= effective_mode 1) random_token paired_operation))))
 (let (($x66 (= catalog_mode 3)))
 (let (($x68 (or $x66 (= effective_mode catalog_mode))))
 (let (($x65 (= effective_mode ontology_mode)))
 (let (($x70 (and $x65 $x68 (and (distinct effective_mode 0) true))))
 (let (($x83 (and verified_sources complete_compiler no_selected_gaps $x70 (or (not paired_operation) same_native_scope) $x82)))
 (let (($x90 (and $x83 $x86 $x89)))
 (and $x90 $x94)))))))))))))))))))
(assert
 (= effective_mode 1))
(assert
 (= read_disposition 1))
(assert
 (not live_nullable))
(assert
 dto_nullable)
(assert
 (not operand_nullable))
(check-sat)
