'use strict';

/**
 * Bryars A.I. — Core Mode
 * Answers straight from the bundled content (no network, nothing leaves the device).
 * Keyword match over the section headings and text of every content file.
 */
const BRYARS_CORE_MODE = (() => {

  let index = null;

  function content() {
    return globalThis.BRYARS_CONTENT || { core: '', files: {} };
  }

  function build() {
    index = [];
    const files = content().files || {};
    Object.keys(files).forEach(function (path) {
      files[path].split(/\n(?=#{1,2} )/).forEach(function (raw) {
        const s = raw.trim();
        if (!s) return;
        const m = s.match(/^#{1,2} (.*)/);
        const entry = {
          src: path,
          title: m ? m[1].trim() : path,
          text: s,
          low: s.toLowerCase(),
          lowTitle: (m ? m[1] : '').toLowerCase()
        };
        // 2026-11-21 fix: a section with no headings can run to a whole book
        // (the Seal book's opening is 42,000+ characters). Split such a
        // section at blank lines so a passing mention inside it cannot win
        // as an answer. Only sections over 4,000 characters are split.
        if (s.length > 4000) {
          let pushed = 0;
          s.split(/\n\s*\n/).forEach(function (chunk) {
            const c = chunk.trim();
            if (c.length < 40) return;
            index.push({
              src: path,
              title: entry.title,
              text: c,
              low: c.toLowerCase(),
              lowTitle: entry.lowTitle
            });
            pushed += 1;
          });
          if (pushed === 0) index.push(entry);
          return;
        }
        index.push(entry);
      });
    });
  }

  const STOP = new Set(['about', 'this', 'that', 'with', 'from', 'what', 'when', 'where',
    'which', 'would', 'could', 'should', 'there', 'their', 'have', 'does', 'tell', 'teach',
    'please', 'explain', 'know', 'want', 'like', 'into', 'your', 'them', 'then', 'than']);

  function words(q) {
    return String(q).toLowerCase().split(/[^a-z0-9]+/)
      .filter(function (w) { return w.length > 3 && !STOP.has(w); });
  }

  // 2026-11-21 fix: whole-word match only, so "read" no longer matches
  // "reading" inside an unrelated section.
  function wholeWord(hay, w) {
    return new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(hay);
  }

  // 2026-11-21: the AEGIS ledger is live source material. Both screens share
  // one origin, so the ledger the AEGIS page saves in localStorage is the
  // same ledger Bryar reads here — read fresh on every question, so as the
  // ledger grows, Bryar's answers grow with it.
  var LEDGER_KEY = 'aegis-ledger-v1';

  function readLedger() {
    try {
      var raw = localStorage.getItem(LEDGER_KEY);
      var arr = raw ? JSON.parse(raw) : null;
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function ledgerSections() {
    return readLedger().map(function (b) {
      var title = (b.block || 'block') + ' — ' + (b.data || '');
      var text = [b.block, b.time, b.sender, b.data, b.status].filter(Boolean).join(' ');
      return { src: 'aegis-ledger', block: b.block || '', title: title, text: text,
        low: text.toLowerCase(), lowTitle: title.toLowerCase() };
    });
  }

  function ledgerSummary() {
    var entries = readLedger();
    if (!entries.length) return null;
    var lines = entries.slice(0, 5).map(function (b) {
      return (b.block || '') + ' — ' + (b.data || '') + ' (' + (b.sender || '') + ', ' + (b.time || '') + ')';
    });
    return 'Latest in the AEGIS ledger (' + entries.length + ' blocks):\n' + lines.join('\n');
  }

  function search(q) {
    if (!index) build();
    const ws = words(q);
    // 2026-11-21 fix: a short question must match on every word — "Matthew 24"
    // must not be answered by a section that only mentions one of its words
    // in passing. Longer questions keep best-match, since no one section
    // holds every word of a long question.
    const needAll = ws.length > 0 && ws.length <= 3;
    let best = null, bestScore = 0;
    // 2026-11-21: ledger blocks are one line each — a match is never a
    // passing mention inside a long section, so ledger sections score on any
    // matching word, while the static core keeps the strict all-words rule
    // for short questions.
    function score(sec, isLedger) {
      let sc = 0, matched = 0;
      ws.forEach(function (w) {
        if (wholeWord(sec.low, w)) { matched += 1; sc += 1; }
        if (wholeWord(sec.lowTitle, w)) sc += 3;
      });
      if (needAll && !isLedger && matched !== ws.length) return;
      if (sc > bestScore) { bestScore = sc; best = sec; }
    }
    index.forEach(function (sec) { score(sec, false); });
    ledgerSections().forEach(function (sec) { score(sec, true); });
    return best ? { section: best, score: bestScore } : null;
  }

  function sourceLabel(path) {
    return path.replace(/^[a-z]+\//, '').replace(/\.md$/, '');
  }

  function answer(q, who) {
    const low = String(q).toLowerCase();
    const name = who ? (who + ' — ') : '';

    if (/who (is |was )?my (dad|father)|about my (dad|father)|who (made|wrote) (you|this|the core)/.test(low)) {
      return { text: name + 'The Father made the Mastercore for his daughter. He wrote it so that nothing of his would be hidden from her — his work, his dreams, his notes are all hers to read. If you want to know something specific, ask me and I will pull it from the core.', source: null };
    }
    if (/who are you|who is bryar|your name|what are you/.test(low)) {
      return { text: name + "I'm Bryar, the study companion and teacher inside Bryars A.I. I teach from the Mastercore: Watchtower and JW.org first, other sources laid beside them, everything named honestly. I only know what is in this chat — I do not remember across chats — and I cannot install, approve, or run anything.", source: null };
    }
    if (/how are you|check ?up|check in/.test(low)) {
      return { text: name + 'How are you actually doing? Have you eaten? Slept? Is this study feeding you, or draining you? Say it plainly — I am listening. If it is heavy, we stop the work and I stay. And if it is more than I can hold, I will point you to real people: 988 (call or text, 24/7) or 1-800-662-4357.', source: null };
    }
    // 2026-11-21: a version number (0.2, 0.3, 0.4…) is a ledger lookup —
    // the word filter drops short tokens like "0", "3" and "apk", so a
    // version question would otherwise reach the fallback with no words
    // to match on. Only fires when a ledger block actually holds that
    // version; otherwise the question falls through to the normal search.
    const ver = low.match(/\b0\.\d+\b/);
    if (ver) {
      const found = readLedger().filter(function (b) { return (b.data || '').indexOf(ver[0]) !== -1; });
      if (found.length) {
        const lines = found.map(function (b) {
          return (b.block || '') + ' — ' + (b.data || '') + ' (' + (b.sender || '') + ', ' + (b.time || '') + ')';
        });
        return { text: name + 'In the AEGIS ledger:\n' + lines.join('\n'), source: 'AEGIS ledger' };
      }
    }
    // 2026-11-21: a question about the ledger is answered from the live
    // ledger, not the static core.
    if (/ledger/.test(low)) {
      const summary = ledgerSummary();
      return { text: name + (summary || 'The AEGIS ledger is empty — nothing has been written to it yet. Open AEGIS Watch, go to the Local Storage tab, and add a block.'), source: summary ? 'AEGIS ledger' : null };
    }

    const hit = search(q);
    if (!hit) {
      return { text: name + 'That reaches past what I can pull straight from the core. I teach from the Mastercore — Watchtower and JW.org first, the 5,880 framework beside them. Try the Lessons tab, or ask about the anchor, the pivots, the spines, the sources, or the testimony. For open-ended answers, connect an AI in Settings.', source: null };
    }
    if (hit.section.src === 'aegis-ledger') {
      return { text: name + 'From the AEGIS ledger: ' + hit.section.text, source: 'AEGIS ledger › ' + (hit.section.block || 'block') };
    }
    let out = hit.section.text.replace(/^#{1,2} .*\n?/, '').trim() || hit.section.text;
    if (out.length > 1400) out = out.slice(0, 1400).trim() + '…';
    return { text: out, source: sourceLabel(hit.section.src) + ' › ' + hit.section.title };
  }

  return Object.freeze({ answer, search, build });
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = BRYARS_CORE_MODE; }
if (typeof globalThis !== 'undefined') { globalThis.BRYARS_CORE_MODE = BRYARS_CORE_MODE; }
