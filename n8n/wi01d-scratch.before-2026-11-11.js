// WI 01d (umIcE6l9pLFuC5JH) scratch branch before the themes read, 11 Nov 2026 (version 4eb6d666).
// Node "Load iConn Batch" query:
// SELECT '-911531396'::text AS wi_id WHERE NOT EXISTS (SELECT 1 FROM hf_probe WHERE msg LIKE 'NPS industries%' AND msg NOT LIKE '%expired%');
// Node "Search WI (iConn)" code:
// Read-only: the raw industries / sectors With Intelligence returns for one investor, primary and secondary kept apart.
const H = this.helpers;
const GQL = 'https://platform-data.withintelligence.com/graphql';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36';
const token = (($('Load Token (iConn)').first() || { json: {} }).json || {}).access_token;
if (!token) throw new Error('No With Intelligence token.');
const head = (site) => ({ 'content-type': 'application/json', 'authorization': 'Bearer ' + token, 'website': site, 'user-website': site,
  'origin': 'https://platform.withintelligence.com', 'referer': 'https://platform.withintelligence.com/', 'user-agent': UA });
const Q = 'query P($id:String){ searchInvestor(id:$id){ id name investment_industries { primary_industry { name } secondary_industries { name } } investment_sectors { primary_sector { name } secondary_sectors { name } } } }';
const id = String($input.first().json.wi_id);
const out = [];
for (const site of ['with', 'with_sfo']) {
  let r; try { r = await H.httpRequest({ method: 'POST', url: GQL, json: true, ignoreHttpStatusErrors: true, timeout: 20000, headers: head(site), body: { query: Q, variables: { id } } }); if (typeof r === 'string') r = JSON.parse(r); } catch (e) { r = { err: String(e && e.message || e) }; }
  out.push('NPS industries [' + site + '] ' + JSON.stringify(r).slice(0, 6000));
}
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
return out.map(m => ({ json: { sql: 'INSERT INTO hf_probe (msg) VALUES (' + q(m) + ');' } }));
