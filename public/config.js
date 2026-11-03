// Paste your Supabase details here (see README.md, step 4).
// The "anon public" key is safe to put in a website. NEVER put the "service_role" key here.
window.HIVE_CONFIG = {
  supabaseUrl: 'https://tjyqihjrxongfephscut.supabase.co',
  supabaseAnonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqeXFpaGpyeG9uZ2ZlcGhzY3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2Mzc1NzEsImV4cCI6MjEwOTIxMzU3MX0._V20VdQY5pPsqL5S70g9wyrOX2QuAnFrP1S1Htl8boU',

  // Supabase sign-in needs an email, so usernames are turned into hidden
  // emails like "bob@players.example.com". No emails are ever sent.
  emailDomain: 'players.example.com',
};
