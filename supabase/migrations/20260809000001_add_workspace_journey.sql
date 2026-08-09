-- Migration: Add Workspace Journey configurations to public.profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS work_start_time TEXT DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS work_end_time TEXT DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS lunch_duration_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS work_days INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5];
