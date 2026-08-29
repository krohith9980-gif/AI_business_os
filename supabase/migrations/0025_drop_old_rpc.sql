-- 0025_drop_old_rpc.sql
DROP FUNCTION IF EXISTS public.test_inject_historical_movement(UUID, UUID, TEXT, NUMERIC, TIMESTAMPTZ);
