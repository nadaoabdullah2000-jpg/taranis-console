const items = $input.all();
const results = [];

for (const item of items) {
  let html = item.json.body_html || '';
  const text = item.json.body_text || '';
  const msgId = item.json.message_id || '';
  const rawEmailId = item.json.id || null;
  const subject = item.json.subject || '';
  const receivedAt = item.json.received_at || '';

  html = html.replace(/<img[^>]*(?:track|pixel|beacon|open\/1)[^>]*>/gi, '');
  // A forwarded copy carries a 'Begin forwarded message' header whose mailto:
  // links compete with the real headline in the longest-label heuristic further
  // down. WI's own 'Contact us' link is the only other mailto, so dropping all
  // of them is safe - article, investor and LinkedIn links are all http.
  html = html.replace(/<a\b[^>]*href=["']mailto:[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, ' ');
  html = html.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

  const plainOf = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  // Every item in a With Intelligence digest ends with its own row of buttons
  // ("View mandate", "View investor", "View intention", "View article" ...).
  // Cut the document right after each button row, so each block keeps its own
  // headline, bullets and buttons. The old cut (halfway between two
  // "Asset class:" lines) put an item without an Asset class line - e.g.
  // "Mandate has been updated" - in one block with the next item, and the
  // two then shared that item's intention and article links.
  const BTN = /<a\b[^>]*>\s*(?:<[^>]*>\s*)*View\s+(?:mandate|investor|intention|article|profile|consultant|manager|fund|report|insight|more)\b[\s\S]*?<\/a>/gi;
  const ends = [];
  let b, lastEnd = -1;
  while ((b = BTN.exec(html)) !== null) {
    const end = b.index + b[0].length;
    // Buttons of one item sit next to each other; a gap with real text between
    // two buttons means a new item started.
    if (lastEnd >= 0 && plainOf(html.slice(lastEnd, b.index)).length < 40) ends[ends.length - 1] = end;
    else ends.push(end);
    lastEnd = end;
  }

  let blocks = [];

  // Only digests (emails with at least one "Asset class:" line) are split, as before.
  if (ends.length > 0 && /Asset\s*class\s*[:.]/i.test(html)) {
    let start = 0;
    for (const end of ends) {
      const seg = html.slice(start, end);
      start = end;
      // A real block has a headline, bullets and buttons. Anything short is a
      // fragment, and a fragment is what makes the model invent.
      if (plainOf(seg).length >= 150 && /Asset\s*class\s*[:.]|has\s+been\s+(?:updated|added)|View\s+investor/i.test(seg)) blocks.push(seg);
    }
  }

  // No button rows (older template): the halfway cut between "Asset class:" lines.
  if (blocks.length === 0) {
    const positions = [];
    const acRe = /Asset\s*class\s*[:.]/gi;
    let hit;
    while ((hit = acRe.exec(html)) !== null) positions.push(hit.index);
    if (positions.length > 0) {
      const bounds = [0];
      for (let i = 1; i < positions.length; i++) bounds.push(Math.floor((positions[i - 1] + positions[i]) / 2));
      bounds.push(html.length);
      for (let i = 0; i < positions.length; i++) {
        const seg = html.slice(bounds[i], bounds[i + 1]);
        if (plainOf(seg).length >= 150) blocks.push(seg);
      }
    }
  }

  // Nothing matched in the HTML - try the plain-text part before giving up.
  if (blocks.length === 0 && /Asset\s*class/i.test(text) && text.length >= 150) {
    blocks = [text];
  }

  for (let i = 0; i < blocks.length; i++) {
    results.push({ json: {
      raw_block: blocks[i],
      block_chars: plainOf(blocks[i]).length,
      source_message_id: msgId,
      raw_email_id: rawEmailId,
      block_index: i,
      source_subject: subject,
      source_email_date: receivedAt,
      mandate_count: blocks.length
    }});
  }
}

return results;
