'use strict';

/* ------------------------------------------------------------------ */
/* Bryars A.I. 0.1 — shell                                             */
/* Contract + chat store + Core Mode + optional Connected Mode.        */
/* ------------------------------------------------------------------ */

(function () {

  const CONTRACT = globalThis.BRYARS_CONVERSATION_CONTRACT;
  const STORE    = globalThis.BRYARS_CHAT_STORE;
  const CORE     = globalThis.BRYARS_CORE_MODE;
  const CONTENT  = globalThis.BRYARS_CONTENT || { core: '' };

  const $ = function (id) { return document.getElementById(id); };

  /* ---------------- settings (with carry-over from older prototypes) ---------------- */

  const SETTINGS_KEY = 'bryars.settings';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const DEFAULTS = {
    // 2026-11-21 (0.4.3): gemini-2.5-flash is retired for new API keys —
    // Google's own 404 names gemini-3.8-flash as the replacement.
    gemini: { model: 'gemini-3.8-flash' },
    openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
  };

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (s && s.provider) {
        // 2026-11-21 (0.4.3): a stored gemini-2.5-flash can no longer
        // connect (retired for new keys), so move it to the current model.
        if (s.provider === 'gemini' && s.model === 'gemini-2.5-flash') s.model = DEFAULTS.gemini.model;
        return s;
      }
    } catch (_) {}
    try {
      const g = localStorage.getItem('brod_gemini_key_v1');
      if (g) return { provider: 'gemini', key: g, model: DEFAULTS.gemini.model };
    } catch (_) {}
    try {
      const a = JSON.parse(localStorage.getItem('aladaz.settings') || 'null');
      if (a && a.endpoint && a.apikey && a.model) {
        return { provider: 'openai', key: a.apikey, endpoint: a.endpoint, model: a.model };
      }
    } catch (_) {}
    return { provider: 'core' };
  }
  let settings = loadSettings();
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

  function connected() {
    if (settings.provider === 'gemini') return Boolean(settings.key && settings.model);
    if (settings.provider === 'openai') return Boolean(settings.key && settings.model && settings.endpoint);
    return false;
  }
  function updateModeBadge() {
    $('modeBadge').textContent = connected()
      ? ('Connected · ' + (settings.provider === 'gemini' ? 'Gemini ' : '') + settings.model)
      : 'Core Mode · offline';
  }

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function newAttachId() {
    return 'at_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- attachments (IndexedDB) ---------------- */

  const ATTACH_DB = 'bryars_attachments_v1';
  const ATTACH_STORE = 'blobs';

  function openAttachDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(ATTACH_DB, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(ATTACH_STORE)) db.createObjectStore(ATTACH_STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function putBlob(id, blob, meta) {
    const db = await openAttachDb();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(ATTACH_STORE, 'readwrite');
      tx.objectStore(ATTACH_STORE).put({ id: id, blob: blob, type: blob.type, size: blob.size, name: meta && meta.name ? meta.name : id });
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  }
  async function getBlob(id) {
    const db = await openAttachDb();
    return new Promise(function (resolve, reject) {
      const req = db.transaction(ATTACH_STORE, 'readonly').objectStore(ATTACH_STORE).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* ---------------- state ---------------- */

  const ui = {
    activeThreadId: null,
    pendingAttachment: null,
    recorder: null,
    recorderChunks: [],
    blobUrls: new Map(),
    recognition: null,
    dictating: false,
    sending: false
  };

  /* ---------------- tabs ---------------- */

  function showView(name) {
    document.querySelectorAll('#tabbar button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === name);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('on', v.id === 'view-' + name);
    });
  }
  document.getElementById('tabbar').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-view]');
    if (b) showView(b.getAttribute('data-view'));
  });

  /* ---------------- model calls ---------------- */

  function buildSystemPrompt(addressName) {
    const C = CONTRACT.CONTRACT;
    return [
      'Your name is Bryar. You are the messenger and teacher inside Bryars A.I. — a private study companion. ' +
        'Follow the core below in all things: the Floor, the sources, the teaching method, the execution rules, and the checkup posture.',
      'Role: ' + C.role,
      'Address rule: ' + C.addressRule.rule,
      addressName
        ? ('Current addressee name: ' + addressName + '. Use it naturally, not mechanically.')
        : 'Addressee name not yet established. Do not invent one.',
      'Posture: ' + C.posture.join(' '),
      'Disclosure: ' + C.disclosure.rules.join(' '),
      'Boundaries: ' + C.boundaries.join(' '),
      'Silence rule: ' + C.silenceRule,
      '=== THE CORE ===\n' + (CONTENT.core || '')
    ].join('\n\n');
  }

  /* history for the model: alternating user/assistant, starting and ending with the user */
  function buildHistory(thread) {
    const out = [];
    (thread.messages || []).forEach(function (m) {
      if (!m.content || !m.content.trim()) return;
      if (m.content.indexOf(CONTRACT.askAddress().question) === 0) return;
      const role = m.role === 'user' ? 'user' : 'assistant';
      if (out.length && out[out.length - 1].role === role) {
        out[out.length - 1].content += '\n' + m.content;
      } else {
        out.push({ role: role, content: m.content });
      }
    });
    while (out.length && out[0].role !== 'user') out.shift();
    return out.slice(-12);
  }

  function geminiModel() {
    // 2026-11-21 (0.4.3): the model field may hold "models/..." (copied
    // from an API error message) or be blank — either makes the API answer
    // 400 "unexpected model name format". Strip the prefix, fall back to
    // the current default. The setting itself is left as the user typed it.
    // 2026-11-21 (0.5.1): a stripped value of the retired gemini-2.5-flash
    // (e.g. stored as "models/gemini-2.5-flash", which loadSettings' exact
    // match does not catch) would still 404 — map it to the default too.
    var m = String(settings.model || '').trim().replace(/^models\//i, '');
    if (m === 'gemini-2.5-flash') m = '';
    return m || DEFAULTS.gemini.model;
  }

  async function callGemini(system, history) {
    const url = GEMINI_ENDPOINT + encodeURIComponent(geminiModel()) + ':generateContent?key=' + encodeURIComponent(settings.key);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: history.map(function (m) {
          return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
        }),
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });
    if (!res.ok) {
      let detail = (await res.text()).slice(0, 300);
      try { const j = JSON.parse(detail); if (j.error && j.error.message) detail = j.error.message; } catch (_) {}
      throw new Error('Gemini ' + res.status + ': ' + detail);
    }
    const data = await res.json();
    const cand = data.candidates && data.candidates[0];
    const text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
    if (!text) throw new Error('No text returned (finishReason: ' + (cand && cand.finishReason ? cand.finishReason : 'unknown') + ')');
    return text;
  }

  async function callOpenAI(system, history) {
    const res = await fetch(settings.endpoint.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.key },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'system', content: system }].concat(history)
      })
    });
    if (!res.ok) throw new Error('The connection answered ' + res.status + '.');
    const j = await res.json();
    const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!t) throw new Error('Empty reply.');
    return t;
  }

  /* ---------------- rendering ---------------- */

  function renderThreads() {
    const threads = STORE.list();
    $('threadCount').textContent = STORE.count() + ' / ' + STORE.CONFIG.maxThreads;
    $('threadList').innerHTML = threads.map(function (t) {
      const active = t.id === ui.activeThreadId ? ' active' : '';
      return '<div class="thread-item' + active + '" data-id="' + esc(t.id) + '">' +
             '<div class="t-title">' + esc(t.title) + '</div>' +
             '<div class="t-meta">' + t.messageCount + ' msg' + (t.addressedTo ? ' · ' + esc(t.addressedTo) : '') + '</div>' +
             '<button class="t-del" type="button" data-del="' + esc(t.id) + '">✕</button></div>';
    }).join('');
    $('limitNote').textContent = STORE.canCreate() ? '' : 'Thread limit reached.';
    $('newChatBtn').disabled = !STORE.canCreate();
  }

  async function attachmentHtml(att) {
    if (!att) return '';
    let url = ui.blobUrls.get(att.id);
    if (!url) {
      try {
        const stored = await getBlob(att.id);
        if (stored && stored.blob) { url = URL.createObjectURL(stored.blob); ui.blobUrls.set(att.id, url); }
      } catch (_) {}
    }
    const sizeStr = att.size ? fmtSize(att.size) : '';
    if (!url) return '<div class="attach attach-missing"><span>' + esc(att.kind) + ' · ' + sizeStr + ' (unavailable)</span></div>';
    if (att.kind === 'image') return '<div class="attach attach-image"><img src="' + url + '" alt="attachment"></div>';
    if (att.kind === 'audio') return '<div class="attach attach-audio"><audio controls src="' + url + '"></audio></div>';
    if (att.kind === 'video') return '<div class="attach attach-video"><video controls src="' + url + '"></video></div>';
    return '<div class="attach attach-file attach-missing">📎 ' + esc(att.name || att.kind) + ' · ' + sizeStr + ' (stored on this device)</div>';
  }

  async function renderChat() {
    if (!ui.activeThreadId) {
      $('chatWho').textContent = 'No chat selected';
      $('chatMessages').innerHTML = '<div class="chat-empty"><h2>Bryars A.I.</h2><p>Tap <strong>New chat</strong> to begin,<br>or pick a lesson.</p></div>';
      $('sendBtn').disabled = true;
      $('composerInput').disabled = true;
      $('deleteChatBtn').disabled = true;
      return;
    }
    const r = STORE.get(ui.activeThreadId);
    if (!r.ok) { ui.activeThreadId = null; return renderChat(); }
    const thread = r.thread;
    const addr = thread.address || CONTRACT.createAddressState();
    $('chatWho').innerHTML = addr.resolved
      ? (addr.name ? 'Speaking with <strong>' + esc(addr.name) + '</strong>' : 'Speaking plainly')
      : 'Address not yet established';

    const rendered = await Promise.all((thread.messages || []).map(async function (m) {
      const cls = m.role === 'user' ? 'user' : 'ai';
      const label = m.role === 'user' ? 'You' : 'Bryar';
      let body = '';
      if (m.attachments && m.attachments.length) {
        body += '<div class="msg-attachments">' + (await Promise.all(m.attachments.map(attachmentHtml))).join('') + '</div>';
      }
      if (m.content) body += '<div class="msg-text">' + esc(m.content) + '</div>';
      const src = m.source ? '<span class="src">Source: ' + esc(m.source) + '</span>' : '';
      return '<div class="msg ' + cls + '">' + body + src + '<span class="meta">' + label + ' · ' + fmtTime(m.at) + '</span></div>';
    }));
    $('chatMessages').innerHTML = rendered.join('');
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    $('sendBtn').disabled = false;
    $('composerInput').disabled = false;
    $('deleteChatBtn').disabled = false;
  }

  function setPendingAttachment(a) {
    ui.pendingAttachment = a || null;
    $('pendingAttach').textContent = a ? ('· ' + a.kind + ' ready') : '';
  }

  /* ---------------- sending ---------------- */

  function addAiMessage(threadId, text, source) {
    const r = STORE.appendMessage(threadId, 'ai', text, []);
    if (r.ok && source) {
      /* store the source label on the message (small direct patch of the stored thread) */
      const g = STORE.get(threadId);
      if (g.ok) {
        const all = JSON.parse(localStorage.getItem(STORE.CONFIG.storageKey) || '[]');
        const t = all.find(function (x) { return x.id === threadId; });
        if (t && t.messages.length) { t.messages[t.messages.length - 1].source = source; localStorage.setItem(STORE.CONFIG.storageKey, JSON.stringify(all)); }
      }
    }
  }

  /* ---------------- Bryar -> AEGIS ledger sync (0.4.3) ---------------- */
  // The sync: Bryar writes one block per thread into the same ledger key
  // AEGIS keeps (aegis-ledger-v1), so the ledger grows as he talks to
  // Bryar and AEGIS shows it — and Bryar already answers from that ledger.
  // One block per thread, on the first real question (not the name turn),
  // data capped at 120 chars. Block numbers run past the highest number
  // already in the ledger, so a later inventory import can never collide.
  // Seed blocks (_seed) are dropped on this first real write, same as an
  // AEGIS manual commit does — they are demo data, never answered from.
  const LEDGER_KEY = 'aegis-ledger-v1';
  const SYNCED_KEY = 'bryars-ledger-synced-v1';
  function syncThreadToLedger(threadId, question) {
    try {
      if (!question) return;
      var done = JSON.parse(localStorage.getItem(SYNCED_KEY) || '[]');
      if (!Array.isArray(done)) done = [];
      if (done.indexOf(threadId) !== -1) return;
      var ledger = [];
      try {
        var raw = JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]');
        if (Array.isArray(raw)) ledger = raw;
      } catch (_) {}
      ledger = ledger.filter(function (b) { return !b._seed; });
      var max = 35232;
      ledger.forEach(function (b) {
        var n = parseInt(String(b.block || '').replace(/^0x/i, ''), 16);
        if (!isNaN(n) && n > max) max = n;
      });
      var clean = String(question).replace(/\s+/g, ' ').slice(0, 120);
      ledger.unshift({
        block: '0x' + (max + 1).toString(16).toUpperCase(),
        time: new Date().toISOString(),
        sender: 'BRYAR',
        data: '[STANDARD] Bryar thread: ' + clean,
        status: 'VALIDATED'
      });
      if (ledger.length > 200) ledger.length = 200;
      localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
      done.push(threadId);
      localStorage.setItem(SYNCED_KEY, JSON.stringify(done));
    } catch (_) {}
  }

  async function sendText(text, pending) {
    if (!ui.activeThreadId || ui.sending) return;
    if (!text && !pending) return;

    const threadId = ui.activeThreadId;
    STORE.appendMessage(threadId, 'user', text || '[attachment]', pending ? [pending] : []);

    let r = STORE.get(threadId);
    const addr = r.thread.address || CONTRACT.createAddressState();

    if (!addr.resolved && text) {
      CONTRACT.setAddress(addr, text);
      STORE.setThreadAddress(threadId, addr);
      const token = CONTRACT.addressFor(addr).token || 'you';
      $('composerInput').value = '';
      setPendingAttachment(null);
      addAiMessage(threadId, 'Hello, ' + token + '. What would you like to talk about?');
      renderThreads(); await renderChat();
      return;
    }

    $('composerInput').value = '';
    $('composerInput').style.height = 'auto';
    setPendingAttachment(null);
    renderThreads(); await renderChat();

    // 0.4.3 sync: first real question in a thread writes one ledger block.
    if (text) syncThreadToLedger(threadId, text);

    ui.sending = true;
    $('sendBtn').disabled = true;
    $('sendBtn').textContent = '…';
    $('chatMessages').insertAdjacentHTML('beforeend', '<div class="msg ai" id="thinking"><span class="meta">Bryar is thinking…</span></div>');
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;

    r = STORE.get(threadId);
    const who = r.thread.address && r.thread.address.name;
    let replyText, source = null;

    if (connected()) {
      try {
        const system = buildSystemPrompt(who);
        const history = buildHistory(r.thread);
        replyText = settings.provider === 'gemini'
          ? await callGemini(system, history) : await callOpenAI(system, history);
        const scan = CONTRACT.scanResponse(replyText);
        if (!scan.clean) {
          replyText = '[contract flag: ' + scan.hits.map(function (h) { return h.rule; }).join(' ') + ']\n\n' + replyText;
        }
      } catch (e) {
        const fb = CORE.answer(text || '', who);
        replyText = 'I could not reach the connection just now (' + (e.message || 'network error') + '). Answering from the core instead.\n\n' + fb.text;
        source = fb.source;
      }
    } else {
      const a = CORE.answer(text || '', who);
      replyText = a.text; source = a.source;
    }

    const t = $('thinking'); if (t) t.remove();
    addAiMessage(threadId, replyText, source);
    ui.sending = false;
    $('sendBtn').disabled = false;
    $('sendBtn').textContent = 'Send';
    renderThreads(); await renderChat();
  }

  function send() { sendText($('composerInput').value.trim(), ui.pendingAttachment); }

  /* ---------------- thread actions ---------------- */

  function newChat() {
    const r = STORE.create();
    if (!r.ok) { alert('Thread limit reached. Delete one.'); return null; }
    ui.activeThreadId = r.thread.id;
    STORE.appendMessage(r.thread.id, 'ai', CONTRACT.askAddress().question, []);
    renderThreads(); renderChat();
    showView('chat');
    $('composerInput').focus();
    return r.thread.id;
  }
  function selectThread(id) { ui.activeThreadId = id; renderThreads(); renderChat(); }
  function deleteThread(id) {
    if (!confirm('Delete this thread?')) return;
    STORE.remove(id);
    if (ui.activeThreadId === id) ui.activeThreadId = null;
    setPendingAttachment(null);
    renderThreads(); renderChat();
  }

  function exportAll() {
    const r = STORE.exportAll({ redactSealed: true });
    if (!r.ok) { alert('Export failed.'); return; }
    $('exportBox').value = JSON.stringify(r, null, 2);
    $('exportModal').classList.add('on');
  }

  /* ---------------- lessons ---------------- */

  const LESSONS = [
    ['The Anchor', '607 B.C.E. to 1914 C.E. — the 2,520 years', 'Teach me the Anchor: 607 B.C.E. to 1914 C.E. = 2,520 years.'],
    ['The 5,880 Framework', 'From the Fall to the Kingdom', 'Teach me the 5,880 framework.'],
    ['The Center of the Wheel', '1,027 B.C.E. — dead center', 'Teach me about the center of the wheel, 1,027 B.C.E.'],
    ['The Four Pivots', 'Abraham 105 · 1,027 · 33 C.E. · 36 C.E.', 'Teach me the four 3.5 pivots.'],
    ['The 70th Week', '29 C.E. to 33 C.E. to 36 C.E.', 'Teach me the 70th week.'],
    ['The Two Spines', 'The 7-spine and the 12-spine', 'Teach me the two spines.'],
    ['The Sources We Use', 'Watchtower first, everything named', 'What sources do we use, and what is the rule for them?'],
    ['The Songs', 'Side of the Road · The Time Keeper', 'Tell me about the songs: Side of the Road and The Time Keeper.'],
    ['Checkup', 'How are you actually doing?', 'Checkup, please.']
  ];

  function renderLessons() {
    $('lessons').innerHTML = LESSONS.map(function (l, i) {
      return '<button class="lesson" type="button" data-i="' + i + '">' + esc(l[0]) + '<small>' + esc(l[1]) + '</small></button>';
    }).join('');
  }
  $('lessons').addEventListener('click', function (e) {
    const b = e.target.closest('.lesson');
    if (!b) return;
    const prompt = LESSONS[Number(b.getAttribute('data-i'))][2];
    const id = newChat();
    if (!id) return;
    /* a lesson skips the "who am I speaking with?" question: the address is left plain ("you") */
    const state = CONTRACT.createAddressState();
    CONTRACT.setAddress(state, '');
    STORE.setThreadAddress(id, state);
    sendText(prompt, null);
  });

  /* ---------------- guide (GitHub → APK → install) ---------------- */

  const STEPS = [
    { t: 'Open the pull request', where: 'GitHub app, or github.com in Chrome', see: 'A list of pull requests.', d: 'Tap the PR title to open it.', why: 'Nothing is built until this is merged. This is the gate.' },
    { t: 'Read the diff', where: 'Inside the PR', see: 'Two tabs: Conversation and Files changed.', d: 'Tap "Files changed". Scroll the changed files. Look for anything unexpected — a new workflow, a new dependency, a permission.', why: 'You are approving code, not vibes. If something looks wrong, close the PR instead of merging.' },
    { t: 'Merge — this is your approval', where: 'Bottom of the PR', see: 'A green "Merge pull request" button.', d: 'Tap it, then confirm the merge.', why: 'The merge is the human yes. No AI should press this for you.' },
    { t: 'Watch the build', where: 'Repo → Actions tab', see: 'A run started by your merge. A yellow dot, then a green check or red X.', d: 'Tap the run to watch it. Wait for green. If red, tap the failed step and read the last 20 lines.', why: 'Actions is the compiler. It builds the APK on GitHub\u2019s machines — you never touch a PC.' },
    { t: 'Download the APK', where: 'Actions run → Artifacts (or Releases)', see: 'A file named bryars-ai-debug-apk (a zip).', d: 'Tap it to download. Open it in your Files app and unzip to get the .apk.', why: 'This is the app itself.' },
    { t: 'Install from the file manager', where: 'Android file manager', see: 'Your downloaded .apk. Tap it.', d: 'Tap the APK. Android shows an install confirmation. You may need to allow "install unknown apps" for your file manager once.', why: 'Browsers cannot install APKs. This last tap is Android\u2019s own gate, and it should stay yours.' },
    { t: 'Test and record', where: 'Your home screen', see: 'The newly installed app.', d: 'Open it, run your test, then note one line: pass or fail, and what you saw.', why: 'Your note is the only record of what worked.' }
  ];
  let stepIdx = 0;
  function renderStep() {
    const s = STEPS[stepIdx];
    $('stepTitle').textContent = s.t;
    $('stepWhere').textContent = s.where;
    $('stepSee').textContent = s.see;
    $('stepDo').textContent = s.d;
    $('stepWhy').textContent = s.why;
    $('stepCount').textContent = 'Step ' + (stepIdx + 1) + ' of ' + STEPS.length;
    $('guideBar').style.width = ((stepIdx + 1) / STEPS.length * 100) + '%';
    $('stepBack').disabled = stepIdx === 0;
  }
  $('stepNext').addEventListener('click', function () { if (stepIdx < STEPS.length - 1) { stepIdx++; renderStep(); } });
  $('stepBack').addEventListener('click', function () { if (stepIdx > 0) { stepIdx--; renderStep(); } });

  /* ---------------- vaults (device only, never sent anywhere) ---------------- */

  function vaultGet(key, oldKey) {
    let v = localStorage.getItem(key);
    if (v === null && oldKey) {
      const o = localStorage.getItem(oldKey);
      if (o !== null) { localStorage.setItem(key, o); v = o; }
    }
    return v || '';
  }
  function wireVault(textId, btnId, stateId, key, oldKey) {
    $(textId).value = vaultGet(key, oldKey);
    $(btnId).addEventListener('click', function () {
      try {
        localStorage.setItem(key, $(textId).value);
        $(stateId).textContent = 'Saved on this device only.';
      } catch (_) { $(stateId).textContent = 'Could not save.'; }
    });
  }
  wireVault('sealedText', 'saveSealed', 'sealedState', 'bryars.sealed', 'aladaz.sealed');
  wireVault('familyText', 'saveFamily', 'familyState', 'bryars.family', 'aladaz.sandra');

  /* ---------------- settings UI ---------------- */

  function paintSettings() {
    const p = settings.provider || 'core';
    $('provider').value = p;
    $('endpointRow').classList.toggle('hidden', p !== 'openai');
    $('keyRow').classList.toggle('hidden', p === 'core');
    $('modelRow').classList.toggle('hidden', p === 'core');
    $('endpoint').value = settings.endpoint || (p === 'openai' ? DEFAULTS.openai.endpoint : '');
    $('model').value = settings.model || (DEFAULTS[p] ? DEFAULTS[p].model : '');
    $('apiKeyInput').value = '';
    $('settingsStatus').textContent = connected() ? 'Connected mode is on. A key is saved on this device.' : 'Core Mode (offline).';
    updateModeBadge();
  }
  $('provider').addEventListener('change', function () {
    const p = $('provider').value;
    settings = { provider: p, key: settings.key, endpoint: DEFAULTS.openai.endpoint, model: DEFAULTS[p] ? DEFAULTS[p].model : '' };
    if (p === 'core') settings = { provider: 'core' };
    paintSettings();
  });
  $('saveSettings').addEventListener('click', function () {
    const p = $('provider').value;
    if (p === 'core') { settings = { provider: 'core' }; saveSettings(); paintSettings(); return; }
    const key = $('apiKeyInput').value.trim() || settings.key || '';
    const model = $('model').value.trim();
    const endpoint = $('endpoint').value.trim();
    if (!key) { $('settingsStatus').textContent = 'Paste an API key first.'; return; }
    if (!model) { $('settingsStatus').textContent = 'Enter a model name.'; return; }
    if (p === 'openai' && !endpoint) { $('settingsStatus').textContent = 'Enter the endpoint URL.'; return; }
    settings = { provider: p, key: key, model: model, endpoint: p === 'openai' ? endpoint : undefined };
    saveSettings(); paintSettings();
    $('settingsStatus').textContent = 'Saved. Connected mode is on.';
  });
  $('clearSettings').addEventListener('click', function () {
    settings = { provider: 'core' }; saveSettings(); paintSettings();
    $('settingsStatus').textContent = 'Key cleared. Back to Core Mode.';
  });

  /* 2026-11-21 merge: open the AEGIS Watch screen (separate Android
     activity). Outside the app (e.g. desktop browser) the bridge is absent,
     so the page opens in place instead. */
  $('openAegisBtn').addEventListener('click', function () {
    if (window.AndroidBridge && AndroidBridge.openAegis) {
      AndroidBridge.openAegis();
    } else {
      window.location.href = 'aegis/index.html';
    }
  });

  /* 2026-11-21 merge: Video Studio + Music open on their own screens
     (separate Android activities). Outside the app the bridge is absent,
     so the pages open in place instead. */
  $('openVideoBtn').addEventListener('click', function () {
    if (window.AndroidBridge && AndroidBridge.openVideoStudio) {
      AndroidBridge.openVideoStudio();
    } else {
      window.location.href = 'video/index.html';
    }
  });
  $('openMusicBtn').addEventListener('click', function () {
    if (window.AndroidBridge && AndroidBridge.openMusic) {
      AndroidBridge.openMusic();
    } else {
      window.location.href = 'music/index.html';
    }
  });

  /* ---------------- attachment capture ---------------- */

  function showRecorder(status, show) {
    $('recorderStatus').textContent = status || 'Recording…';
    $('recorderBar').classList.toggle('hidden', !show);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) $('micDictateBtn').classList.add('hidden');

  function startDictation() {
    if (!SR || ui.dictating) return;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    let base = $('composerInput').value;
    rec.onresult = function (e) {
      let interim = '', fin = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else interim += t;
      }
      $('composerInput').value = (base + ' ' + fin + interim).trim();
      if (fin) base = $('composerInput').value;
    };
    rec.onerror = function () { stopDictation(); };
    rec.onend = function () { ui.dictating = false; $('micDictateBtn').classList.remove('active'); };
    ui.recognition = rec; ui.dictating = true;
    $('micDictateBtn').classList.add('active');
    rec.start();
  }
  function stopDictation() {
    if (ui.recognition) { try { ui.recognition.stop(); } catch (_) {} }
    ui.dictating = false; ui.recognition = null;
    $('micDictateBtn').classList.remove('active');
  }

  async function startRecording(kind) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'video' ? { audio: true, video: { facingMode: 'environment' } } : { audio: true });
      const mime = kind === 'video'
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm')
        : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');
      const rec = new MediaRecorder(stream, { mimeType: mime });
      ui.recorderChunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) ui.recorderChunks.push(e.data); };
      rec.onstop = async function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        const blob = new Blob(ui.recorderChunks, { type: mime.split(';')[0] });
        if (blob.size > 0) {
          const id = newAttachId();
          const k = kind === 'video' ? 'video' : 'audio';
          try { await putBlob(id, blob, { name: k + '-' + id }); setPendingAttachment({ id: id, kind: k, mime: blob.type, size: blob.size }); }
          catch (_) { alert('Could not store attachment.'); }
        }
        showRecorder('', false); ui.recorder = null;
      };
      rec.start(); ui.recorder = rec;
      showRecorder(kind === 'video' ? 'Recording video… tap Stop when done.' : 'Recording audio… tap Stop when done.', true);
    } catch (_) { alert('Microphone / camera permission denied.'); }
  }
  function stopRecording() { if (ui.recorder && ui.recorder.state !== 'inactive') { try { ui.recorder.stop(); } catch (_) {} } }

  async function handleFilePicked(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert('File too large (max 20 MB).'); return; }
    const id = newAttachId();
    const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file';
    try { await putBlob(id, file, { name: file.name }); setPendingAttachment({ id: id, kind: kind, mime: file.type, size: file.size, name: file.name }); }
    catch (_) { alert('Could not store attachment.'); }
  }

  /* ---------------- wiring ---------------- */

  $('newChatBtn').addEventListener('click', newChat);
  $('sendBtn').addEventListener('click', send);
  $('exportBtn').addEventListener('click', exportAll);
  $('deleteChatBtn').addEventListener('click', function () { if (ui.activeThreadId) deleteThread(ui.activeThreadId); });
  $('closeExport').addEventListener('click', function () { $('exportModal').classList.remove('on'); });
  $('copyExport').addEventListener('click', function () {
    const box = $('exportBox'); box.select();
    try { (navigator.clipboard ? navigator.clipboard.writeText(box.value) : Promise.reject()).catch(function () { document.execCommand('copy'); }); }
    catch (_) { try { document.execCommand('copy'); } catch (__) {} }
  });

  $('micDictateBtn').addEventListener('click', function () { if (ui.dictating) stopDictation(); else startDictation(); });
  $('micRecordBtn').addEventListener('click', function () { if (ui.recorder) stopRecording(); else startRecording('audio'); });
  $('photoBtn').addEventListener('click', function () { $('photoInput').click(); });
  $('videoBtn').addEventListener('click', function () { $('videoInput').click(); });
  $('fileBtn').addEventListener('click', function () { $('fileInput').click(); });
  $('stopRecordBtn').addEventListener('click', stopRecording);
  ['photoInput', 'videoInput', 'fileInput'].forEach(function (id) {
    $(id).addEventListener('change', function (e) { handleFilePicked(e.target.files[0]); e.target.value = ''; });
  });

  $('threadList').addEventListener('click', function (e) {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); deleteThread(del.getAttribute('data-del')); return; }
    const item = e.target.closest('.thread-item');
    if (item) selectThread(item.getAttribute('data-id'));
  });

  $('composerInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $('composerInput').addEventListener('input', function () {
    const el = $('composerInput');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  });

  /* ---------------- boot ---------------- */

  renderLessons();
  renderStep();
  paintSettings();
  renderThreads();
  renderChat();

})();
