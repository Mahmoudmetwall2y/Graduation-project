-- 025_visitor_role.sql
-- Rename 'operator' role to 'visitor' and tighten the role constraint

-- Step 1: Drop existing check constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Add permissive constraint that allows old and new values
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'operator', 'visitor'));

-- Step 3: Rename all existing 'operator' rows to 'visitor'
UPDATE public.profiles
  SET role = 'visitor'
  WHERE role = 'operator';

-- Step 4: Tighten the constraint (no more 'operator')
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'visitor'));

-- Step 5: Set default for new rows
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'visitor';
