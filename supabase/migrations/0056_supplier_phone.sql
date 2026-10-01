-- Migration 0056: Supplier Phone for WhatsApp Integration

-- Add nullable phone column to suppliers
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS phone TEXT;
