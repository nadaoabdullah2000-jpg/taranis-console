// SCRUBBED copy of the 13 Oct real-email news-headline fixtures, safe for a public repo.
// Firms, people and article prose are replaced with made-up text of the same shape: the
// same punctuation, the same presence/absence of a known verb, the same category and
// sub-labels, asset-class lines and buttons. ai = what the model returned, renamed to match.
// Check: test/compare-scrubbed.js.
const outlookHead = (cat, sub, date) => `<td><img src="https://x"></td><td><div style="display: block; margin: 0px; font-size: 14px; font-weight: 700; line-height: 18px; color: rgb(56, 56, 68);">${cat}</div><div>${sub}<span>&nbsp;</span></div></td><td><span>${date}</span></td></tr></tbody></table></td></tr>`;
const wiHead = (cat, sub, date, extra) => `<td><img src="https://x"></td><td><p style="font-size:14px;font-weight:700;line-height:18px;color:#383844;margin:0">${cat}</p><table><tr><td style="font-size:12px;font-weight:400;line-height:16px;color:#63626a;vertical-align:middle">${sub}</td><td>${extra || ''}</td></tr></table></td><td><span>${date}</span></td></tr></table></td></tr>`;
const hfaHead = (cat, date) => `<td><p style="font-size:14px;font-weight:700;line-height:20px;color:#383844;margin:0">${cat}</p><table><tr><td><img src="https://x"></td><td style="font-size:12px;line-height:16px;color:#6c2bff;font-weight:700;padding-right:6px;white-space:nowrap">HFA</td></tr></table></td><td><span>${date}</span></td></tr></table></td></tr>`;
const hl = (t) => `<tr><td><div><a href="https://x/h">${t}</a></div></td></tr>`;
const body = (t, grey) => `<tr><td><div${grey ? ' style="font-family:Modern Era,Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;text-align:left;color:#63626a"' : ''}>${t}</div></td></tr>`;
const ac = (t) => `<tr><td><div><span>Asset class:</span><span style="font-weight:700">${t}</span></div></td></tr></tbody></table>`;
const btn = (...l) => '<div>' + l.map((x, i) => `<a href="https://x/${i}">${x}</a>`).join('') + '</div>';
module.exports = [
  { id: '1628 (email 330/2)', expect: { active: "Pharma", proposed: "ORVEX" }, want: 'not "Pharma"', ai: { investor_name: 'ORVEX' },
    block: outlookHead('People', 'Investors', '22nd September 2026') + hl('Pharma-consulting family bolsters private markets desk')
      + body('Person A joins ORVEX this month as the head of illiquid assets') + ac('Private Equity') + btn('View article', 'View investor') },
  { id: '1627 (email 330/1)', expect: { active: "Ashby CIO", proposed: "Ashby CIO" }, want: 'Ashby CIO (unchanged)', ai: { investor_name: '' },
    block: outlookHead('People', 'Investors', '22nd September 2026') + hl('Ashby CIO to depart for charitable foundation')
      + '<tr><td><div><ul><li>Person A is leaving the $8bn endowment after 13 years</li><li>Deputy Person B will become CIO on January 1</li><li>Person C is also being promoted to deputize Person B</li></ul></div></td></tr>'
      + ac('Equity +5') + btn('View article', 'View investor') },
  { id: '2018 (email 424/4)', expect: { active: "Halden Brook vet emerges as CIO", proposed: "Tessaly Capital" }, want: 'not the headline', ai: { investor_name: 'Tessaly Capital' },
    block: wiHead('People', 'Managers', '9th October 2026') + hl("Halden Brook vet emerges as CIO of Corvane alum's debut")
      + body('Halden Brook veteran linked as founder and CIO of Tessaly Capital') + ac('Hedge Funds') + btn('View article', 'View manager')
      + btn('Log in to my account', 'Update email preferences', 'Privacy Statement', 'Terms of Use') },
  { id: '2016 (email 424/2)', expect: { active: "Q3 redemptions", proposed: "Lumen Equity Partners" }, want: 'not "Q3 redemptions"', ai: { investor_name: 'Lumen Equity Partners' },
    block: '<td><p style="font-size:14px;font-weight:700;line-height:20px;color:#383844;margin:0">Hedge Fund Publication</p><table><tr><td style="font-size:12px;color:#6c2bff;font-weight:700;padding-right:6px">HFA</td><td style="font-size:12px;color:#63626a;padding-right:6px"><img src="https://x" /></td><td style="font-size:12px;color:#6c2bff;font-weight:700;padding-right:6px">Top insight</td></tr></table></td><td><span>8th October 2026</span></td></tr></table></td></tr>'
      + hl('Q3 redemptions: billion-dollar HF firms among those winding down')
      + body('Lumen Equity Partners, Fairhill Management and Ostrava Capital, each with around $1bn of assets or more, are among the hedge fund operators that started handing back outside capital in the third quarter', true)
      + ac('Hedge Funds') + btn('View article', 'View manager') },
  { id: '1990 (email 416/4)', expect: { active: "Former trader maps quant value fund", proposed: "Eastbrook Capital" }, want: 'not the headline', ai: { investor_name: 'Eastbrook Capital' },
    block: hfaHead('Hedge Fund Alert', '7th October 2026') + hl('Former trader maps quant value fund')
      + body('Eastbrook Capital planning focused portfolio of U.S. value stocks', true) + ac('Hedge Funds') + btn('View article', 'View manager') },
  { id: '2025 (email 425/3)', expect: { active: "ABL", proposed: "Varenne Bank" }, want: 'not "ABL"', ai: { investor_name: 'Varenne Bank' },
    block: wiHead('Intentions', 'Investors', '9th October 2026', '<img src="https://x"><img src="https://x">')
      + hl('ABL, distressed debt and special sits lead Varenne Bank PC interest')
      + body('Swiss private bank not favoring mezzanine funds') + ac('Private Debt') + btn('View article', 'View intention') },
  { id: '2026 NYU-shape (email 425/5), control', expect: { active: "New Yarm University (NYU)", proposed: "New Yarm University (NYU)" }, want: 'New Yarm University (NYU)', ai: { investor_name: 'New Yarm University (NYU)' },
    block: wiHead(' Intentions ', 'Investor', ' 6th October 2026 ', '<span><table><tbody><tr><td><img src="https://x"></td></tr></tbody></table></span><span> New Yarm University (NYU) </span><img src="https://x">')
      + body('<ul><li>Planning to add new hedge fund commitments over the coming 12-18 months, with a focus on relative value, macro, multi-strategy and quant strategies,&nbsp;in North America and globally.<ul><li>Single-fund position cap of 10%.</li><li>Open to emerging managers and to new strategies from established houses.</li></ul></li><li>The investor\'s primary investment themes over the next 12-18 months include clean power, machine learning, data networks, life sciences and ageing, public safety and resilience, and payments technology.</li></ul>')
      + ac('Hedge Funds') + btn('View intention', 'View investor') },
];
