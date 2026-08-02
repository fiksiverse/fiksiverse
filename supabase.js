import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm[span_0](start_span)'[span_0](end_span)

const SUPABASE_URL = 'https://nqyzdbsgboeyazxkgaeu.supabase.co[span_1](start_span)'[span_1](end_span)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xeXpkYnNnYm9leWF6eGtnYWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDc3MjIsImV4cCI6MjEwMDgyMzcyMn0.BBYxWckApOakeNa7E0T0oj6y7De2GHglfdqQV65h078[span_2](start_span)'[span_2](end_span)

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)[span_3](start_span)[span_3](end_span)
