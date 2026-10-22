; benchmark generated from python API
(set-info :status unknown)
(declare-sort OriginalJsonMeaning 0)
(declare-fun source_state () Int)
(declare-fun owner_state () Int)
(declare-fun source_card () Int)
(declare-fun owner_card () Int)
(declare-fun owner_context () Int)
(declare-fun source_context () Int)
(declare-fun owner_item_present () Bool)
(declare-fun item_present () Bool)
(declare-fun observed_item () OriginalJsonMeaning)
(declare-fun item () OriginalJsonMeaning)
(declare-fun observed_raw () OriginalJsonMeaning)
(declare-fun raw () OriginalJsonMeaning)
(declare-fun observed_interpreted () OriginalJsonMeaning)
(declare-fun interpreted () OriginalJsonMeaning)
(declare-fun observed_unknown_paths () OriginalJsonMeaning)
(declare-fun unknown_paths () OriginalJsonMeaning)
(assert
 (>= source_state 0))
(assert
 (<= source_state 5))
(assert
 (>= owner_state 0))
(assert
 (<= owner_state 5))
(assert
 (>= source_card 0))
(assert
 (<= source_card 5))
(assert
 (>= owner_card 0))
(assert
 (<= owner_card 5))
(assert
 (= source_state owner_state))
(assert
 (= source_context owner_context))
(assert
 (= source_card owner_card))
(assert
 (= item_present owner_item_present))
(assert
 (let (($x38 (= item observed_item)))
 (let (($x37 (and item_present owner_item_present)))
 (=> $x37 $x38))))
(assert
 (= raw observed_raw))
(assert
 (= interpreted observed_interpreted))
(assert
 (= unknown_paths observed_unknown_paths))
(assert
 (and (distinct interpreted observed_interpreted) true))
(check-sat)
