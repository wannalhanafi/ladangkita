// Public settings. The publishable key is safe to ship in the app: row security in the database decides what each person can see.
window.LK_CONFIG = {
  supabaseUrl: 'https://qrxmeuutobncpwgdvtgo.supabase.co',
  supabaseKey: 'sb_publishable_y5HDaAXZNckU9zDa5sNueA_CQOiPfxs',
  codeLength: 8 // must match Supabase: Authentication > Sign In / Providers > Email > Email OTP Length
};
