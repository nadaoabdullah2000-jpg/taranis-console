const m = $json;

// Nothing without a record_key or an investor name may reach the database.
// The hallucination guard clears investor_name on fragments the model invented
// against; if such an item somehow reaches this node, emit a query that matches
// nothing rather than a broken INSERT.
const nm = String(m.investor_name || '').trim();
if (!nm || !m.record_key) {
  return { json: { ...m, _query: 'SELECT NULL::bigint AS id WHERE false;', _skipped: true } };
}

const e = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
};
const n = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL';
  return String(v);
};
const b = (v) => {
  if (v === null || v === undefined) return 'NULL';
  return String(v);
};
const j = (v) => {
  if (v === null || v === undefined || v === '' || v === '[]' || v === '{}') {
    if (v === '{}') return "'{}'::jsonb";
    return "'[]'::jsonb";
  }
  return "'" + String(v).replace(/'/g, "''") + "'::jsonb";
};

// ---------- THE RE-SCORE VERDICT ----------
// new_qualification / new_fit_score are what the console reads. The Taranis
// score (6 Nov 2026), the same rule as the console (taranisScore in app.js):
// L = long/short or quant, T = technology, S = space (explicit wording),
// E = invests in emerging managers (true; unknown counts as no).
//   L+T+E 1.00 - the only way to 100%
//   L+T   0.90            L+S+E 0.80   L+E 0.80   L+S 0.78   L 0.75
//   T+E   0.65   T 0.60   S+E 0.55     S 0.50     (review: no L)
// GB / CH / US +0.05 (not for an investor that refuses emerging managers),
// never past the cap: 0.95 without all three, 0.80 with L but no T, 0.70 with
// no L. hire 0.60, low 0.20, needs_data no score.
const BAND_Q = { strong: 'matched', strong_tech: 'matched', tech: 'uncertain', hire: 'uncertain', low: 'low', needs_data: 'needs_data' };
function taranisScore(band, L, T, S, E, bonusOk) {
  if (band === 'low') return 0.20;
  if (band === 'hire') return 0.60;
  if (band === 'needs_data') return null;
  let s, cap;
  if (L && T)  { s = E ? 1.00 : 0.90; cap = E ? 1.00 : 0.95; }
  else if (L)  { s = S ? (E ? 0.80 : 0.78) : (E ? 0.80 : 0.75); cap = 0.80; }
  else if (T)  { s = E ? 0.65 : 0.60; cap = 0.70; }
  else if (S)  { s = E ? 0.55 : 0.50; cap = 0.70; }
  else return null;
  if (bonusOk && s < cap) s = Math.min(cap, s + 0.05);
  return Math.round(s * 100) / 100;
}
let newQ, newS;
if (String(m.hard_status || '').toLowerCase() === 'fail' || m.qualification === 'rejected') {
  newQ = 'rejected'; newS = 0;
} else {
  const band = BAND_Q[m.score_band] ? m.score_band : 'needs_data';
  newQ = BAND_Q[band];
  newS = taranisScore(band, m.sig_strong === true, m.sig_tech === true, m.sig_space === true,
    m.open_to_emerging_managers === true, m.in_market === true && m.open_to_emerging_managers !== false);
}

const q = 'INSERT INTO wi_mandates (record_key,raw_email_id,block_index,investor_name,organization_name,contact_name,investor_country,investor_city,investor_type,investor_tag,asset_classes,strategies,ticket_min_usd,ticket_max_usd,aum_usd,aum_band,open_to_emerging_managers,open_to_new_relationships,open_to_emerging_markets,alert_type,alert_date,allocation_timing,intention_summary,requirements_raw,appetite_raw,evidence,qualification,fit_score,fit_reason,hard_fail_reasons,missing_hard_fields,positive_signals,risks,missing_information,view_article_url,view_intention_url,view_investor_url,source_links,linkedin_url,source_message_id,source_email_date,new_qualification,new_fit_score,is_space,space_signal) VALUES ('
  + [e(m.record_key), n(m.raw_email_id), n(m.block_index),
     e(m.investor_name), e(m.organization_name), e(m.contact_name),
     e(m.investor_country), e(m.investor_city), e(m.investor_type), e(m.investor_tag),
     j(m.asset_classes), j(m.strategies),
     n(m.ticket_min_usd), n(m.ticket_max_usd), n(m.aum_usd), e(m.aum_band),
     b(m.open_to_emerging_managers), b(m.open_to_new_relationships), b(m.open_to_emerging_markets),
     e(m.alert_type), m.alert_date ? e(m.alert_date) : 'NULL', e(m.allocation_timing),
     e(m.intention_summary), e(m.requirements_raw), e(m.appetite_raw),
     j(m.evidence), e(m.qualification), n(m.fit_score), e(m.fit_reason),
     j(m.hard_fail_reasons), j(m.missing_hard_fields), j(m.positive_signals), j(m.risks), j(m.missing_information),
     e(m.view_article_url), e(m.view_intention_url), e(m.view_investor_url), j(m.source_links), e(m.linkedin_url),
     e(m.source_message_id), m.source_email_date ? e(m.source_email_date) : 'NULL',
     e(newQ), n(newS), b(m.is_space), e(m.space_signal)
  ].join(',')
  // Reprocessing must refresh the VERDICT AND THE REASONS FOR IT. Updating the
  // qualification while leaving hard_fail_reasons untouched left records showing
  // why an older rule rejected them, so a corrected run still reported the old
  // grounds in the weekly summary.
  + ') ON CONFLICT (record_key) DO UPDATE SET '
  + 'qualification=EXCLUDED.qualification,'
  + 'fit_score=EXCLUDED.fit_score,'
  + 'new_qualification=EXCLUDED.new_qualification,'
  + 'new_fit_score=EXCLUDED.new_fit_score,'
  + 'fit_reason=EXCLUDED.fit_reason,'
  + 'hard_fail_reasons=EXCLUDED.hard_fail_reasons,'
  + 'missing_hard_fields=EXCLUDED.missing_hard_fields,'
  + 'positive_signals=EXCLUDED.positive_signals,'
  + 'risks=EXCLUDED.risks,'
  + 'missing_information=EXCLUDED.missing_information,'
  // Extraction improves too, so the facts the verdict rests on are refreshed -
  // but never overwritten with nothing, since a later run reading less than an
  // earlier one should not erase what is already known.
  + 'investor_type=COALESCE(EXCLUDED.investor_type,wi_mandates.investor_type),'
  + 'investor_country=COALESCE(EXCLUDED.investor_country,wi_mandates.investor_country),'
  // Without this line a replay could never backfill the WI category onto rows
  // that already exist: the INSERT carries investor_tag, but a conflicting row
  // keeps whatever it had, which for everything written before today is null.
  + 'investor_tag=COALESCE(EXCLUDED.investor_tag,wi_mandates.investor_tag),'
  + 'investor_city=COALESCE(EXCLUDED.investor_city,wi_mandates.investor_city),'
  + 'asset_classes=CASE WHEN EXCLUDED.asset_classes = \'[]\'::jsonb THEN wi_mandates.asset_classes ELSE EXCLUDED.asset_classes END,'
  + 'strategies=CASE WHEN EXCLUDED.strategies = \'[]\'::jsonb THEN wi_mandates.strategies ELSE EXCLUDED.strategies END,'
  + 'ticket_min_usd=COALESCE(EXCLUDED.ticket_min_usd,wi_mandates.ticket_min_usd),'
  + 'ticket_max_usd=COALESCE(EXCLUDED.ticket_max_usd,wi_mandates.ticket_max_usd),'
  + 'aum_usd=COALESCE(EXCLUDED.aum_usd,wi_mandates.aum_usd),'
  + 'aum_band=COALESCE(EXCLUDED.aum_band,wi_mandates.aum_band),'
  + 'open_to_emerging_managers=COALESCE(EXCLUDED.open_to_emerging_managers,wi_mandates.open_to_emerging_managers),'
  // Space: a "yes" from the alert wins; otherwise keep what the With
  // Intelligence profile check set (its Aerospace industry), if anything.
  + 'is_space=CASE WHEN EXCLUDED.is_space THEN true ELSE COALESCE(wi_mandates.is_space,EXCLUDED.is_space) END,'
  + 'space_signal=CASE WHEN EXCLUDED.is_space THEN EXCLUDED.space_signal ELSE COALESCE(wi_mandates.space_signal,EXCLUDED.space_signal) END,'
  + 'allocation_timing=COALESCE(EXCLUDED.allocation_timing,wi_mandates.allocation_timing),'
  + 'intention_summary=COALESCE(EXCLUDED.intention_summary,wi_mandates.intention_summary),'
  + 'linkedin_url=COALESCE(EXCLUDED.linkedin_url,wi_mandates.linkedin_url),'
  + 'view_article_url=COALESCE(EXCLUDED.view_article_url,wi_mandates.view_article_url),'
  + 'view_investor_url=COALESCE(EXCLUDED.view_investor_url,wi_mandates.view_investor_url),'
  + 'view_intention_url=COALESCE(EXCLUDED.view_intention_url,wi_mandates.view_intention_url),'
  + 'source_links=COALESCE(EXCLUDED.source_links,wi_mandates.source_links),'
  + 'updated_at=NOW()'
  + ' RETURNING id,record_key,qualification,new_qualification,new_fit_score,investor_name,organization_name,contact_name,investor_country,investor_city,investor_type,investor_tag,strategies,ticket_min_usd,ticket_max_usd,aum_usd,aum_band,allocation_timing,fit_score,fit_reason,intention_summary,view_article_url,view_intention_url,view_investor_url,linkedin_url;';

return { json: { ...m, _query: q, _skipped: false } };
