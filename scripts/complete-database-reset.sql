-- Complete database reset and setup
-- Drop all existing tables and policies to start completely fresh

DROP TABLE IF EXISTS expense_splits CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS group_invitations CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create groups table
CREATE TABLE groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create group_members table
CREATE TABLE group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- Create expenses table
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  paid_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  split_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create expense_splits table
CREATE TABLE expense_splits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(expense_id, user_id)
);

-- Create group_invitations table
CREATE TABLE group_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  invited_by TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;

-- Simple, non-recursive RLS policies

-- Profiles: Allow users to see all profiles (needed for group member names)
CREATE POLICY "Allow read access to all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Allow users to insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow users to update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Groups: Allow users to see groups they created or are members of
CREATE POLICY "Allow users to see their groups" ON groups FOR SELECT USING (
  created_by = auth.uid() OR 
  EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
);
CREATE POLICY "Allow users to create groups" ON groups FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Allow group creators to update groups" ON groups FOR UPDATE USING (created_by = auth.uid());

-- Group members: Simple policies without recursion
CREATE POLICY "Allow users to see group members" ON group_members FOR SELECT USING (
  user_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid())
);
CREATE POLICY "Allow users to join groups" ON group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to leave groups" ON group_members FOR DELETE USING (user_id = auth.uid());

-- Expenses: Allow group members to see and create expenses
CREATE POLICY "Allow group members to see expenses" ON expenses FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members WHERE group_id = expenses.group_id AND user_id = auth.uid())
);
CREATE POLICY "Allow group members to create expenses" ON expenses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM group_members WHERE group_id = expenses.group_id AND user_id = auth.uid())
);

-- Expense splits: Allow users to see splits for expenses in their groups
CREATE POLICY "Allow users to see expense splits" ON expense_splits FOR SELECT USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM expenses e 
    JOIN group_members gm ON e.group_id = gm.group_id 
    WHERE e.id = expense_splits.expense_id AND gm.user_id = auth.uid()
  )
);
CREATE POLICY "Allow group members to create expense splits" ON expense_splits FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM expenses e 
    JOIN group_members gm ON e.group_id = gm.group_id 
    WHERE e.id = expense_splits.expense_id AND gm.user_id = auth.uid()
  )
);

-- Group invitations: Allow public read for token-based access
CREATE POLICY "Allow public read of invitations" ON group_invitations FOR SELECT USING (true);
CREATE POLICY "Allow group members to create invitations" ON group_invitations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM group_members WHERE group_id = group_invitations.group_id AND user_id = auth.uid())
);
CREATE POLICY "Allow public update of invitations" ON group_invitations FOR UPDATE USING (true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON group_invitations, groups, profiles TO anon;
