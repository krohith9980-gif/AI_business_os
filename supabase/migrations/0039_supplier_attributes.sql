-- Migration 0039: Add JSONB attributes to Suppliers

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;
