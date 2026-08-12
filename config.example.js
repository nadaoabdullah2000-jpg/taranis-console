/* Copy to config.js for local work. config.js is gitignored and is
   generated at deploy time from GitHub secrets — never commit it.
   Nothing secret belongs here: the anon key is public by design,
   the gateway URL is protected by the JWT check inside n8n. */
window.TARANIS_CONFIG = {
  gatewayUrl:      "https://quantcairo.app.n8n.cloud/webhook/console",
  supabaseUrl:     "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
  pollSeconds:     45
};
