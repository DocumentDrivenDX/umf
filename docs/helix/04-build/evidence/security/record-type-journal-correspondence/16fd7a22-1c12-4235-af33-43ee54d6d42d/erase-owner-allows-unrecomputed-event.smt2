; benchmark generated from python API
(set-info :status unknown)
(declare-fun event_count () Int)
(declare-fun base_complete_model () Int)
(declare-fun event_complete_sources () (Array Int Int))
(declare-fun event_complete_targets () (Array Int Int))
(declare-fun event_exact_type_link_still_valid_in_current () (Array Int Bool))
(declare-fun event_is_type () (Array Int Bool))
(declare-fun current_complete_model () Int)
(declare-fun authenticated_issuer () Bool)
(declare-fun native_enforcement () Bool)
(declare-fun event_recomputed_with_owner () (Array Int Bool))
(assert
 (let (($x19 (<= event_count 32)))
 (let (($x17 (>= event_count 1)))
 (and $x17 $x19))))
(assert
 (= (select event_complete_sources 0) base_complete_model))
(assert
 (let ((?x25 (select event_complete_sources 1)))
 (let (($x27 (= ?x25 (select event_complete_targets 0))))
 (let (($x24 (> event_count 1)))
 (=> $x24 $x27)))))
(assert
 (let ((?x32 (select event_complete_targets 1)))
 (let ((?x31 (select event_complete_sources 2)))
 (let (($x33 (= ?x31 ?x32)))
 (let (($x30 (> event_count 2)))
 (=> $x30 $x33))))))
(assert
 (let ((?x38 (select event_complete_targets 2)))
 (let (($x39 (= (select event_complete_sources 3) ?x38)))
 (let (($x36 (> event_count 3)))
 (=> $x36 $x39)))))
(assert
 (let ((?x43 (select event_complete_sources 4)))
 (let (($x45 (= ?x43 (select event_complete_targets 3))))
 (let (($x42 (> event_count 4)))
 (=> $x42 $x45)))))
(assert
 (let ((?x50 (select event_complete_targets 4)))
 (let (($x51 (= (select event_complete_sources 5) ?x50)))
 (let (($x48 (> event_count 5)))
 (=> $x48 $x51)))))
(assert
 (let (($x57 (= (select event_complete_sources 6) (select event_complete_targets 5))))
 (let (($x54 (> event_count 6)))
 (=> $x54 $x57))))
(assert
 (let (($x63 (= (select event_complete_sources 7) (select event_complete_targets 6))))
 (let (($x60 (> event_count 7)))
 (=> $x60 $x63))))
(assert
 (let (($x69 (= (select event_complete_sources 8) (select event_complete_targets 7))))
 (let (($x66 (> event_count 8)))
 (=> $x66 $x69))))
(assert
 (let (($x75 (= (select event_complete_sources 9) (select event_complete_targets 8))))
 (let (($x72 (> event_count 9)))
 (=> $x72 $x75))))
(assert
 (let (($x81 (= (select event_complete_sources 10) (select event_complete_targets 9))))
 (let (($x78 (> event_count 10)))
 (=> $x78 $x81))))
(assert
 (let (($x87 (= (select event_complete_sources 11) (select event_complete_targets 10))))
 (let (($x84 (> event_count 11)))
 (=> $x84 $x87))))
(assert
 (let (($x93 (= (select event_complete_sources 12) (select event_complete_targets 11))))
 (let (($x90 (> event_count 12)))
 (=> $x90 $x93))))
(assert
 (let (($x99 (= (select event_complete_sources 13) (select event_complete_targets 12))))
 (let (($x96 (> event_count 13)))
 (=> $x96 $x99))))
(assert
 (let (($x105 (= (select event_complete_sources 14) (select event_complete_targets 13))))
 (let (($x102 (> event_count 14)))
 (=> $x102 $x105))))
(assert
 (let (($x111 (= (select event_complete_sources 15) (select event_complete_targets 14))))
 (let (($x108 (> event_count 15)))
 (=> $x108 $x111))))
(assert
 (let (($x117 (= (select event_complete_sources 16) (select event_complete_targets 15))))
 (let (($x114 (> event_count 16)))
 (=> $x114 $x117))))
(assert
 (let (($x123 (= (select event_complete_sources 17) (select event_complete_targets 16))))
 (let (($x120 (> event_count 17)))
 (=> $x120 $x123))))
(assert
 (let (($x129 (= (select event_complete_sources 18) (select event_complete_targets 17))))
 (let (($x126 (> event_count 18)))
 (=> $x126 $x129))))
(assert
 (let (($x135 (= (select event_complete_sources 19) (select event_complete_targets 18))))
 (let (($x132 (> event_count 19)))
 (=> $x132 $x135))))
(assert
 (let (($x141 (= (select event_complete_sources 20) (select event_complete_targets 19))))
 (let (($x138 (> event_count 20)))
 (=> $x138 $x141))))
(assert
 (let (($x147 (= (select event_complete_sources 21) (select event_complete_targets 20))))
 (let (($x144 (> event_count 21)))
 (=> $x144 $x147))))
(assert
 (let (($x153 (= (select event_complete_sources 22) (select event_complete_targets 21))))
 (let (($x150 (> event_count 22)))
 (=> $x150 $x153))))
(assert
 (let (($x159 (= (select event_complete_sources 23) (select event_complete_targets 22))))
 (let (($x156 (> event_count 23)))
 (=> $x156 $x159))))
(assert
 (let (($x165 (= (select event_complete_sources 24) (select event_complete_targets 23))))
 (let (($x162 (> event_count 24)))
 (=> $x162 $x165))))
(assert
 (let (($x171 (= (select event_complete_sources 25) (select event_complete_targets 24))))
 (let (($x168 (> event_count 25)))
 (=> $x168 $x171))))
(assert
 (let (($x177 (= (select event_complete_sources 26) (select event_complete_targets 25))))
 (let (($x174 (> event_count 26)))
 (=> $x174 $x177))))
(assert
 (let (($x183 (= (select event_complete_sources 27) (select event_complete_targets 26))))
 (let (($x180 (> event_count 27)))
 (=> $x180 $x183))))
(assert
 (let (($x189 (= (select event_complete_sources 28) (select event_complete_targets 27))))
 (let (($x186 (> event_count 28)))
 (=> $x186 $x189))))
(assert
 (let (($x195 (= (select event_complete_sources 29) (select event_complete_targets 28))))
 (let (($x192 (> event_count 29)))
 (=> $x192 $x195))))
(assert
 (let (($x201 (= (select event_complete_sources 30) (select event_complete_targets 29))))
 (let (($x198 (> event_count 30)))
 (=> $x198 $x201))))
(assert
 (let (($x207 (= (select event_complete_sources 31) (select event_complete_targets 30))))
 (let (($x204 (> event_count 31)))
 (=> $x204 $x207))))
(assert
 (let (($x276 (select event_exact_type_link_still_valid_in_current 0)))
 (=> (and (> event_count 0) (select event_is_type 0)) $x276)))
(assert
 (let (($x280 (select event_exact_type_link_still_valid_in_current 1)))
 (=> (and (> event_count 1) (select event_is_type 1)) $x280)))
(assert
 (let (($x284 (select event_exact_type_link_still_valid_in_current 2)))
 (=> (and (> event_count 2) (select event_is_type 2)) $x284)))
(assert
 (let (($x288 (select event_exact_type_link_still_valid_in_current 3)))
 (=> (and (> event_count 3) (select event_is_type 3)) $x288)))
(assert
 (let (($x292 (select event_exact_type_link_still_valid_in_current 4)))
 (=> (and (> event_count 4) (select event_is_type 4)) $x292)))
(assert
 (let (($x296 (select event_exact_type_link_still_valid_in_current 5)))
 (=> (and (> event_count 5) (select event_is_type 5)) $x296)))
(assert
 (let (($x300 (select event_exact_type_link_still_valid_in_current 6)))
 (=> (and (> event_count 6) (select event_is_type 6)) $x300)))
(assert
 (let (($x304 (select event_exact_type_link_still_valid_in_current 7)))
 (=> (and (> event_count 7) (select event_is_type 7)) $x304)))
(assert
 (let (($x308 (select event_exact_type_link_still_valid_in_current 8)))
 (=> (and (> event_count 8) (select event_is_type 8)) $x308)))
(assert
 (let (($x312 (select event_exact_type_link_still_valid_in_current 9)))
 (=> (and (> event_count 9) (select event_is_type 9)) $x312)))
(assert
 (let (($x316 (select event_exact_type_link_still_valid_in_current 10)))
 (=> (and (> event_count 10) (select event_is_type 10)) $x316)))
(assert
 (let (($x320 (select event_exact_type_link_still_valid_in_current 11)))
 (=> (and (> event_count 11) (select event_is_type 11)) $x320)))
(assert
 (let (($x324 (select event_exact_type_link_still_valid_in_current 12)))
 (=> (and (> event_count 12) (select event_is_type 12)) $x324)))
(assert
 (let (($x328 (select event_exact_type_link_still_valid_in_current 13)))
 (=> (and (> event_count 13) (select event_is_type 13)) $x328)))
(assert
 (let (($x332 (select event_exact_type_link_still_valid_in_current 14)))
 (=> (and (> event_count 14) (select event_is_type 14)) $x332)))
(assert
 (let (($x336 (select event_exact_type_link_still_valid_in_current 15)))
 (=> (and (> event_count 15) (select event_is_type 15)) $x336)))
(assert
 (let (($x340 (select event_exact_type_link_still_valid_in_current 16)))
 (=> (and (> event_count 16) (select event_is_type 16)) $x340)))
(assert
 (let (($x344 (select event_exact_type_link_still_valid_in_current 17)))
 (=> (and (> event_count 17) (select event_is_type 17)) $x344)))
(assert
 (let (($x348 (select event_exact_type_link_still_valid_in_current 18)))
 (=> (and (> event_count 18) (select event_is_type 18)) $x348)))
(assert
 (let (($x352 (select event_exact_type_link_still_valid_in_current 19)))
 (=> (and (> event_count 19) (select event_is_type 19)) $x352)))
(assert
 (let (($x356 (select event_exact_type_link_still_valid_in_current 20)))
 (=> (and (> event_count 20) (select event_is_type 20)) $x356)))
(assert
 (let (($x360 (select event_exact_type_link_still_valid_in_current 21)))
 (=> (and (> event_count 21) (select event_is_type 21)) $x360)))
(assert
 (let (($x364 (select event_exact_type_link_still_valid_in_current 22)))
 (=> (and (> event_count 22) (select event_is_type 22)) $x364)))
(assert
 (let (($x368 (select event_exact_type_link_still_valid_in_current 23)))
 (=> (and (> event_count 23) (select event_is_type 23)) $x368)))
(assert
 (let (($x372 (select event_exact_type_link_still_valid_in_current 24)))
 (=> (and (> event_count 24) (select event_is_type 24)) $x372)))
(assert
 (let (($x376 (select event_exact_type_link_still_valid_in_current 25)))
 (=> (and (> event_count 25) (select event_is_type 25)) $x376)))
(assert
 (let (($x380 (select event_exact_type_link_still_valid_in_current 26)))
 (=> (and (> event_count 26) (select event_is_type 26)) $x380)))
(assert
 (let (($x384 (select event_exact_type_link_still_valid_in_current 27)))
 (=> (and (> event_count 27) (select event_is_type 27)) $x384)))
(assert
 (let (($x388 (select event_exact_type_link_still_valid_in_current 28)))
 (=> (and (> event_count 28) (select event_is_type 28)) $x388)))
(assert
 (let (($x392 (select event_exact_type_link_still_valid_in_current 29)))
 (=> (and (> event_count 29) (select event_is_type 29)) $x392)))
(assert
 (let (($x396 (select event_exact_type_link_still_valid_in_current 30)))
 (=> (and (> event_count 30) (select event_is_type 30)) $x396)))
(assert
 (let (($x400 (select event_exact_type_link_still_valid_in_current 31)))
 (=> (and (> event_count 31) (select event_is_type 31)) $x400)))
(assert
 (let ((?x402 (- event_count 1)))
 (let ((?x403 (select event_complete_targets ?x402)))
 (= ?x403 current_complete_model))))
(assert
 (not authenticated_issuer))
(assert
 (not native_enforcement))
(assert
 (not (select event_recomputed_with_owner (- event_count 1))))
(check-sat)
