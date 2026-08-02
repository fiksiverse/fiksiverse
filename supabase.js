import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://nqyzdbsgboeyazxkgaeu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xeXpkYnNnYm9leWF6eGtnYWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDc3MjIsImV4cCI6MjEwMDgyMzcyMn0.BBYxWckApOakeNa7E0T0oj6y7De2GHglfdqQV65h078'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
