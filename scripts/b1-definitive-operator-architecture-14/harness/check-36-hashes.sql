-- Verification script for the 36 canonical functions in TARGET-MANIFEST.json
WITH pinned(signature, expected_hash) AS (
  VALUES
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', '07d793b4bb4831dc3187c05b3971c2ab683637d0d2afefc57be4f5a40beaab9b'),
    ('public.apply_b1_academic_effect_for_request(uuid)', 'f65778ae23d6b8114cb6a5be09b97773bd033151c1948d0bb3204abc7135a8ac'),
    ('public.apply_b1_department_transfer_effect(uuid)', 'c7025773b88fce8ee6e7547cd8d3b06d378908a9bd054f8da7f8222f7ccfaaa5'),
    ('public.apply_b1_enrollment_suspension_effect(uuid)', 'ac25732184d6d4ce7c7804dbc3823b53b213b635b99512b8d4fb09887901c6b9'),
    ('public.apply_b1_excused_absence_effect(uuid)', 'f280ca0c08530409ce949d9bfa33faeb1aac7f2eee8fcb7ce9ee6332e96e8826'),
    ('public.apply_b1_file_withdrawal_effect(uuid)', '9e489e9668783f022b60e6c2410262e6d29bd20eea26a47f54964f8133fa8c9d'),
    ('public.apply_b1_final_chance_effect(uuid)', 'bd6b16adcfab57dc9be06cb8a0e29f9c3f36b3c5f3f36b38a6175035f9a5fe74'),
    ('public.assert_b1_runtime_step_assignee_effective(uuid)', 'cd37c05339c5e7d4142e109ee1ab30352aeaf1bfa3ee49cc43ef5f8e6b30c90e'),
    ('public.assert_b1_runtime_step_row_assignee_effective(student_request_workflow_steps)', '4ed1775bd7598a049ca3f9b5937f11b1ee4725899a81f8ac4a71df7af5634362'),
    ('public.b1_assignment_identity_lock_key()', '69dbed6746cd420b0094eb783e37a8a0d674ce7f836aa93044856ccf0b1d43ec'),
    ('public.b1_e2e_88_correlations_aligned(uuid,uuid,uuid)', 'ba1e4c18a0ff6c9f0674f667379480dab6c7dc1e02929336eb4402bf7795101c'),
    ('public.b1_e2e_88_is_five_service(text)', '6084ac4b93385526e2772aef10a724cbea5c28a1cf79c1f5c013f80f837c53f6'),
    ('public.b1_e2e_88_marker()', 'a2c383b1ea1e86d2a1521f66e6cd8edd5bb26a119a144a508bb9ebcfa867eb83'),
    ('public.b1_e2e_88_parse_correlation(text)', 'bf383657c5c1ca85c7af59fec8cf8dfa70f4c36bb8ddf3b23c10cbd9357ebea5'),
    ('public.b1_e2e_88_request_correlation(uuid)', '08ed13174099047de0564e157511dd4a74aecec2ac62127b9aadf02b05e1e649'),
    ('public.b1_e2e_88_request_is_marked(uuid)', '8ad8fb19d22cbe38489e98ace7344398324591741c5182f1836c9ef411b4f1a0'),
    ('public.b1_lock_assignment_identity_boundary()', '30ceca8e2a60845093cbaa06b4c011ac4920a80a1874e377f58173c4170b6e30'),
    ('public.b1_lock_assignment_identity_stmt()', '4e63de611e3c0a0ae07574c13be2c6722d697355b806ba4563c50ed513362e48'),
    ('public.b1_map_ui_staff_action(text)', '5361cc1543d2329aa3196dda96c6fb9fabf5db75a9b4acef05c257b581305d3f'),
    ('public.can_current_user_act_on_step(uuid,text)', '5d2b46d7f5bc7434dacc9a89377e839539223498edfa53afc5dda466be766e22'),
    ('public.current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text)', '6600873a57eb3754f48e3c83489b153b7850a6a85e21d980d38bebd245b0d606'),
    ('public.current_user_has_b1_e2e_88_department_binding(uuid,text)', 'a021efa5277f944856becdda38b7e9c43947dac1e1e8c65e6599edc1f0925466'),
    ('public.current_user_has_exact_processing_binding(uuid,uuid)', 'd07510198cf7c89a8f574cc39687bcd82825dd16cdc45991d43a64ea929285e9'),
    ('public.current_user_matches_transfer_department_scope(uuid,text)', 'a307d0859bf34e1115624fae3aaa82ac11f931f11b65a3c2335958d9f17acbbd'),
    ('public.guard_b1_runtime_step_activation()', 'cb798f54e981e552a78300cb27550357fb8e0b1668686742f9cc660fd9fac2a1'),
    ('public.has_any_role(uuid,text[])', '2673511089eb62974801e0d1d35c1b8568f69071874c537353abd129236f785a'),
    ('public.is_b1_stored_request_type(text)', '5bc14b53c66c89fb74aaa631c106089dfaf11febb9533a042a8c0c136db6c55c'),
    ('public.is_owner_of_request(uuid,uuid)', '3af5fce62271fb2c998b8066d2185553d7f7bd5cae5fad704fde761ecb263234'),
    ('public.is_valid_actor_request_action(text)', '1a261965401a0978ee6130a92d9170f99a10f17fff9dcae351bc67bd1f2f80b6'),
    ('public.is_valid_b1_runtime_step_contract(text,text,text,text,text)', '3e02f7d89ae45fc2896908f2409f6a96008e8893ef6f0f4d77546a8497650720'),
    ('public.protect_student_sensitive_fields()', '0aa3efc8e2dce49b7f0aa92a591da44ed7e8aec8b27967f59ee922fa7ecc6583'),
    ('public.record_external_university_payment_confirmation(uuid,text)', 'edbae98c6e95d8d4f14a5a9a675c8bbb3abb0235a2343c24202358161ee983ca'),
    ('public.update_updated_at_column()', '4b210dde823c21c4e1aa07135b278271f7f527add2a6f1c015aed9595f58a565'),
    ('public.user_matches_workflow_runtime_step(uuid)', '2ecf741a3e8da340da2c55b95714b9518e5e4e0858119e60a46e742b34ebfced'),
    ('public.workflow_action_result_matches(text,text)', 'ad701791847740302d60eabc84c533cb35dcb1f5f880b0643fdcc0b164d83e16'),
    ('public.workflow_runtime_predecessors_satisfied(uuid)', 'a47e0c17f91af232335eef086a3aaa5590865ee9506e85f039e4ed1bca1064b1')
),
calc AS (
  SELECT p.signature,
         p.expected_hash,
         to_regprocedure(p.signature) IS NOT NULL AS exists,
         encode(sha256(convert_to(btrim(regexp_replace(pg_get_functiondef(to_regprocedure(p.signature)::oid), '\s+', ' ', 'g')), 'UTF8')), 'hex') AS actual_hash
    FROM pinned p
)
SELECT signature,
       expected_hash,
       coalesce(actual_hash, 'MISSING') AS actual_hash,
       CASE
         WHEN NOT exists THEN 'MISSING'
         WHEN actual_hash = expected_hash THEN 'MATCH'
         ELSE 'MISMATCH'
       END AS verdict
  FROM calc;
