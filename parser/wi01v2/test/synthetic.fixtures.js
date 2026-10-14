// Made-up blocks in WI's markup, no email content: news, an announcement and a
// people move. Used on 12-13 Oct to check that a change only moves what it means to.
const news = (cat, sub, hl) => `<p style="font-size:14px;font-weight:700;line-height:18px;color:#383844;margin:0"> ${cat} </p><table><tr><td style="font-size:12px;font-weight:400;line-height:16px;color:#63626a;vertical-align:middle">${sub}</td></tr></table><span> 8th October 2026 </span><a href="https://x/a">${hl}</a><p>Some body text about the story that runs on for a while.</p><div>Asset class: Hedge Funds</div><a href="https://x/r">View article</a>`;
module.exports = [
  { id: 'news, verb-anchored', block: news('Market trend', 'Investors', 'Al Rajhi family starts direct lending search'),
    ai: { investor_name: 'Al Rajhi family' },
    expect: { previous: 'Al Rajhi family', active: 'Al Rajhi family', proposed: 'Al Rajhi family' } },
  { id: 'news, no verb', block: news('Top story', 'Investors', 'Gains keep coming for stock pickers in September'),
    ai: { investor_name: 'Apis Global Deep Value' },
    expect: { previous: 'Gains keep coming for stock pickers', active: 'Gains keep coming for stock pickers', proposed: 'Apis Global Deep Value' } },
  { id: 'mandate announcement', block: news('Mandate', 'Investor', "Mandate has been added - Houston Police Officers' Pension System (HPOPS) The pension system is considering a full redemption"),
    ai: { investor_name: 'Houston Police Officers Pension System' },
    expect: { previous: '8th October 2026', active: "Houston Police Officers' Pension System (HPOPS)", proposed: "Houston Police Officers' Pension System (HPOPS)" } },
  { id: 'people move, no verb', block: news('People moves', 'Investors', 'Neuberger Berman vet emerges as CIO'),
    ai: { investor_name: 'Aurveil Capital' },
    expect: { previous: 'Neuberger Berman vet emerges as CIO', active: 'Neuberger Berman vet emerges as CIO', proposed: 'Aurveil Capital' } },
];
