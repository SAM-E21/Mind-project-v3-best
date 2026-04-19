-- 1. Create Folders Table
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.folders(id),
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- 2. Create Files Table
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES public.folders(id),
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    type TEXT NOT NULL, -- 'image' or 'video'
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- 3. Enable RLS
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can only access their own folders" ON public.folders
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own files" ON public.files
    FOR ALL USING (auth.uid() = user_id);

-- 5. Storage (Run these in the Storage section)
-- Create a bucket named 'media'
-- Set it to Private
-- Add RLS policy: 
-- (role = authenticated) AND (bucket_id = 'media')
