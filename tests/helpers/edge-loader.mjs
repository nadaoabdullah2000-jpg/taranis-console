// Points the Edge Function's remote imports at edge-stubs.mjs.
const STUBS = new URL('./edge-stubs.mjs', import.meta.url).href;
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('jsr:@supabase/supabase-js') || spec.startsWith('https://deno.land/x/denomailer')) {
    return { url: STUBS, shortCircuit: true };
  }
  return next(spec, ctx);
}
