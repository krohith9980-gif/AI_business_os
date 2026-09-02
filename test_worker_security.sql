-- Worker Security Tests

BEGIN;

DO $$
DECLARE
    v_owner_id UUID;
    v_manager_id UUID;
    v_cashier_id UUID;
    v_stranger_id UUID;
    v_org_id UUID;
    v_store_id UUID;
    v_test_phone TEXT := '+918888888888';
    v_test_phone_2 TEXT := '+917777777777';
    v_invite_id UUID;
    v_claims INTEGER;
BEGIN
    -- 1. Setup Test Identities
    SELECT id INTO v_owner_id FROM auth.users WHERE email = 'krohith9980@gmail.com' LIMIT 1;

    -- Find their org
    SELECT organization_id INTO v_org_id FROM public.organization_members WHERE profile_id = v_owner_id AND role = 'OWNER' LIMIT 1;
    SELECT id INTO v_store_id FROM public.stores WHERE organization_id = v_org_id LIMIT 1;

    -- Create test manager, cashier, stranger
    v_manager_id := gen_random_uuid();
    v_cashier_id := gen_random_uuid();
    v_stranger_id := gen_random_uuid();

    INSERT INTO auth.users (id, email, phone) VALUES
        (v_manager_id, 'mgr@test.com', '+911111111111'),
        (v_cashier_id, 'csh@test.com', '+912222222222'),
        (v_stranger_id, 'str@test.com', '+913333333333');

    -- Helper to simulate auth
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', v_owner_id), true);

    INSERT INTO public.organization_members (organization_id, profile_id, role, is_active) VALUES
        (v_org_id, v_manager_id, 'MANAGER', true),
        (v_org_id, v_cashier_id, 'CASHIER', true);

    RAISE NOTICE 'Test 1: Owner can invite CASHIER';
    v_invite_id := public.invite_worker(v_test_phone, 'Test Cashier', 'CASHIER', v_store_id);
    IF v_invite_id IS NULL THEN RAISE EXCEPTION 'Failed to invite cashier'; END IF;

    RAISE NOTICE 'Test 2: Owner can invite MANAGER';
    v_invite_id := public.invite_worker(v_test_phone_2, 'Test Manager', 'MANAGER', v_store_id);
    IF v_invite_id IS NULL THEN RAISE EXCEPTION 'Failed to invite manager'; END IF;

    RAISE NOTICE 'Test 3: Manager cannot invite worker';
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', v_manager_id), true);
    BEGIN
        PERFORM public.invite_worker('+914444444444', 'Should Fail', 'CASHIER', v_store_id);
        RAISE EXCEPTION 'Manager was able to invite a worker!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM != 'Only an OWNER can invite workers' THEN RAISE EXCEPTION 'Unexpected error: %', SQLERRM; END IF;
    END;

    RAISE NOTICE 'Test 4: Cashier cannot invite worker';
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', v_cashier_id), true);
    BEGIN
        PERFORM public.invite_worker('+914444444444', 'Should Fail', 'CASHIER', v_store_id);
        RAISE EXCEPTION 'Cashier was able to invite a worker!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM != 'Only an OWNER can invite workers' THEN RAISE EXCEPTION 'Unexpected error: %', SQLERRM; END IF;
    END;

    RAISE NOTICE 'Test 5: Unknown phone cannot claim';
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', v_stranger_id), true);
    v_claims := public.claim_worker_invitations();
    IF v_claims > 0 THEN RAISE EXCEPTION 'Stranger claimed an invitation!'; END IF;

    RAISE NOTICE 'Test 6: Correct phone can claim';
    -- Create the user for v_test_phone
    INSERT INTO auth.users (id, phone) VALUES (gen_random_uuid(), v_test_phone);
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', (SELECT id FROM auth.users WHERE phone = v_test_phone)), true);
    v_claims := public.claim_worker_invitations();
    IF v_claims != 1 THEN RAISE EXCEPTION 'Failed to claim invitation! Claims: %', v_claims; END IF;

    -- Verify membership created
    IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE profile_id = (SELECT id FROM auth.users WHERE phone = v_test_phone) AND role = 'CASHIER') THEN
        RAISE EXCEPTION 'Membership was not created correctly';
    END IF;

    RAISE NOTICE 'Test 17: Disabled worker loses access';
    -- Revoke as owner
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', v_owner_id), true);
    PERFORM public.revoke_worker((SELECT id FROM auth.users WHERE phone = v_test_phone), v_org_id);

    -- Check is_active
    IF (SELECT is_active FROM public.organization_members WHERE profile_id = (SELECT id FROM auth.users WHERE phone = v_test_phone)) = true THEN
        RAISE EXCEPTION 'Revoke failed to disable member';
    END IF;

    RAISE NOTICE 'Test 18: Disabled worker logging in again does not bypass';
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', (SELECT id FROM auth.users WHERE phone = v_test_phone)), true);
    v_claims := public.claim_worker_invitations();
    IF v_claims > 0 THEN RAISE EXCEPTION 'Disabled worker bypassed block by claiming again!'; END IF;

    RAISE NOTICE 'Test 19: Phone canonicalization formats';
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', v_owner_id), true);
    IF public.canonicalize_phone('9999999999') != '+919999999999' THEN RAISE EXCEPTION 'Failed to canonicalize 10 digits'; END IF;
    IF public.canonicalize_phone('+91 99999-99999') != '+919999999999' THEN RAISE EXCEPTION 'Failed to canonicalize spaces/hyphens'; END IF;

    RAISE NOTICE 'ALL TESTS PASSED SUCCESSFULLY';
END $$;

ROLLBACK;
