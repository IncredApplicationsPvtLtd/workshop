// Live connection shared by every phone in the hall.
(() => {
  const $ = id => document.getElementById(id);
  let myVersion = null;
  let deploying = false;

  const fmtMs = ms => (ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms');
  const tone = (el, cls) => { el.classList.remove('ok', 'warn', 'bad'); if (cls) el.classList.add(cls); };

  function toast(text, kind = '') {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast ' + kind;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add('hidden'), 6000);
  }

  function showVersion(v) {
    $('v-sha').textContent = v.short;
    $('v-msg').textContent = `"${v.message}" — by ${v.author}`;
  }

  function onNewVersion(v) {
    if (deploying) return;
    deploying = true;
    $('deploy-text').textContent = `Commit ${v.short} by ${v.author}: "${v.message}"`;
    $('deploy-overlay').classList.remove('hidden');
    setTimeout(() => location.reload(), 3500);
  }

  function checkVersion(v) {
    if (!v) return;
    if (!myVersion) { myVersion = v.sha; showVersion(v); return; }
    if (v.sha !== myVersion) onNewVersion(v);
  }

  function setFlash(on) { $('flash').classList.toggle('hidden', !on); }

  const PIPELINE_MSG = {
    push: '📦 New commit pushed to GitHub',
    test: '🧪 CI is testing the new code…',
    tested: '✅ Tests passed — deploying',
    failed: '❌ Tests FAILED — production is protected',
    deploy: '🚚 Deploying to AWS EC2…',
    live: '🚀 Deployed! Watch your screen…',
    launch: '🔥 Launch day traffic incoming!',
    launched: '📉 Load test finished',
  };

  function connect() {
    const es = new EventSource('/api/stream');
    es.addEventListener('open', () => $('conn-dot').classList.add('on'));
    es.addEventListener('error', () => $('conn-dot').classList.remove('on'));

    es.addEventListener('hello', e => {
      const d = JSON.parse(e.data);
      checkVersion(d.version);
      setFlash(d.flashSale);
    });

    es.addEventListener('stats', e => {
      const s = JSON.parse(e.data);
      checkVersion(s.version);
      setFlash(s.flashSale);
      $('online').textContent = s.online;
      $('rps').textContent = s.rps;
      $('cpu').textContent = s.cpu + '%';
      tone($('cpu'), s.cpu > 85 ? 'bad' : s.cpu > 60 ? 'warn' : 'ok');
      $('p95').textContent = s.p95 ? fmtMs(s.p95) : 'idle';
      tone($('p95'), s.p95 > 1500 ? 'bad' : s.p95 > 400 ? 'warn' : 'ok');
      $('overload').classList.toggle('hidden', !(s.errors > 0 || s.p95 > 1500 || s.cpu > 95));
    });

    es.addEventListener('pipeline', e => {
      const ev = JSON.parse(e.data);
      if (ev.stage === 'flashsale') {
        setFlash(ev.status === 'start');
        toast(ev.status === 'start' ? '🔥 FLASH SALE started — scroll down and TAP!' : '🛑 Flash sale over', ev.status === 'start' ? 'failure' : '');
        return;
      }
      const base = PIPELINE_MSG[ev.stage] || 'ℹ️';
      toast(ev.text ? `${base} ${ev.text}` : base, ev.status === 'failure' ? 'failure' : ev.status === 'success' ? 'success' : '');
    });
  }

  async function checkout() {
    const start = performance.now();
    try {
      const r = await fetch('/api/checkout', { method: 'POST' });
      const ms = Math.round(performance.now() - start);
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok, ms, ...d };
    } catch {
      return { ok: false, ms: Math.round(performance.now() - start), error: 'Network error — server did not answer' };
    }
  }

  $('buy-btn').addEventListener('click', async () => {
    const btn = $('buy-btn'), out = $('buy-result');
    btn.disabled = true; btn.textContent = 'Processing…';
    const r = await checkout();
    btn.disabled = false; btn.textContent = 'Buy now';
    if (r.ok) {
      out.textContent = `✅ Order #${r.orderId} confirmed in ${fmtMs(r.ms)}${r.ms > 2000 ? ' 😬 would you wait this long?' : ''}`;
      out.className = 'result ' + (r.ms > 1000 ? 'slow' : 'ok');
    } else {
      out.textContent = `❌ ${r.error || 'Checkout failed'} (${fmtMs(r.ms)}) — this customer just left for a competitor.`;
      out.className = 'result bad';
    }
  });

  let ok = 0, fail = 0;
  $('flash-btn').addEventListener('click', () => {
    if (navigator.vibrate) navigator.vibrate(15);
    for (let i = 0; i < 5; i++) {
      checkout().then(r => {
        r.ok ? ok++ : fail++;
        $('my-ok').textContent = ok;
        $('my-fail').textContent = fail;
        $('my-ms').textContent = fmtMs(r.ms);
      });
    }
  });

  connect();
})();
