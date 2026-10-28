/**
 * subfinder.js — passive subdomain finder (client-side).
 * Sources: Certificate Transparency (crt.sh, CertSpotter) + DNS-over-HTTPS
 * probing of a small common-names wordlist. No requests go to the target.
 */
(function () {
  'use strict';

  const form = document.getElementById('sfForm');
  if (!form) return;

  const input = document.getElementById('sfInput');
  const btn = document.getElementById('sfBtn');
  const statusEl = document.getElementById('sfStatus');
  const bar = document.getElementById('sfBar');
  const tbody = document.getElementById('sfRows');
  const wrap = document.getElementById('sfResults');
  const countEl = document.getElementById('sfCount');
  const copyBtn = document.getElementById('sfCopy');
  const csvBtn = document.getElementById('sfCsv');
  const filterEl = document.getElementById('sfFilter');

  const WORDLIST = ('www mail remote blog webmail server ns1 ns2 smtp secure vpn m shop ftp mail2 test portal ns dev ' +
    'admin api cdn static assets app apps staging stage beta demo git gitlab jenkins ci docs help support status ' +
    'login auth sso id accounts dashboard panel cpanel mx imap pop pop3 autodiscover owa intranet internal old new ' +
    'img images media files download uploads store payments pay billing crm erp hr wiki jira confluence grafana ' +
    'kibana monitor prometheus db mysql sql redis s3 backup dev2 uat qa prod preview sandbox mobile web web1 web2').split(' ');

  /** Hosts found so far: name -> { sources:Set, ips:Array|null } */
  let found = new Map();
  let running = false;

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.dataset.kind = kind || '';
  }

  function normalizeDomain(raw) {
    let v = String(raw || '').trim().toLowerCase();
    if (!v) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(v)) v = 'http://' + v;
    let host;
    try { host = new URL(v).hostname; } catch (e) { return null; }
    host = host.replace(/\.$/, '').replace(/^www\./, '');
    if (!/^(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(host)) return null;
    return host;
  }

  function addHost(name, source, domain) {
    name = name.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (!name || name === domain || !name.endsWith('.' + domain)) return;
    if (!/^[a-z0-9._-]+$/.test(name)) return;
    if (!found.has(name)) found.set(name, { sources: new Set(), ips: null });
    found.get(name).sources.add(source);
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 25000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fromCrtSh(domain) {
    const data = await fetchJson('https://crt.sh/?q=' + encodeURIComponent('%.' + domain) + '&output=json');
    data.forEach(function (row) {
      String(row.name_value || '').split('\n').forEach(function (n) { addHost(n, 'crt.sh', domain); });
    });
  }

  async function fromCertSpotter(domain) {
    const data = await fetchJson('https://api.certspotter.com/v1/issuances?domain=' + encodeURIComponent(domain) +
      '&include_subdomains=true&expand=dns_names');
    data.forEach(function (row) {
      (row.dns_names || []).forEach(function (n) { addHost(n, 'certspotter', domain); });
    });
  }

  async function resolveA(name) {
    const data = await fetchJson('https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=A', 8000);
    return (data.Answer || []).filter(function (a) { return a.type === 1; }).map(function (a) { return a.data; });
  }

  /** Run async fn over items with limited concurrency */
  async function pool(items, limit, fn, onDone) {
    let i = 0;
    const workers = Array.from({ length: limit }, async function () {
      while (i < items.length) {
        const item = items[i++];
        try { await fn(item); } catch (e) { /* ignore single failures */ }
        onDone();
      }
    });
    await Promise.all(workers);
  }

  function render() {
    const q = filterEl.value.trim().toLowerCase();
    const names = Array.from(found.keys()).sort();
    const shown = names.filter(function (n) { return !q || n.includes(q); });
    countEl.textContent = names.length + ' found';
    tbody.textContent = '';
    shown.forEach(function (name) {
      const info = found.get(name);
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      const a = document.createElement('a');
      a.href = 'https://' + name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = name;
      tdName.appendChild(a);

      const tdIp = document.createElement('td');
      if (info.ips === null) tdIp.textContent = '…';
      else tdIp.textContent = info.ips.length ? info.ips.join(', ') : 'no A record';
      if (info.ips && !info.ips.length) tdIp.className = 'sf-dim';

      const tdSrc = document.createElement('td');
      info.sources.forEach(function (s) {
        const tag = document.createElement('span');
        tag.className = 'sf-tag';
        tag.textContent = s;
        tdSrc.appendChild(tag);
      });

      tr.append(tdName, tdIp, tdSrc);
      tbody.appendChild(tr);
    });
  }

  async function run(domain) {
    running = true;
    found = new Map();
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    wrap.hidden = false;
    bar.style.width = '4%';
    render();

    // Phase 1: certificate transparency logs
    setStatus('Querying certificate transparency logs for ' + domain + '…');
    const ct = await Promise.allSettled([fromCrtSh(domain), fromCertSpotter(domain)]);
    const ctFailed = ct.filter(function (r) { return r.status === 'rejected'; }).length;
    render();
    bar.style.width = '25%';

    // Phase 2: DNS probing of common names
    const guesses = WORDLIST.map(function (w) { return w + '.' + domain; });
    let done = 0;
    const total = guesses.length;
    setStatus('Probing ' + total + ' common names over DNS…');
    await pool(guesses, 8, async function (name) {
      const ips = await resolveA(name);
      if (ips.length) {
        addHost(name, 'dns', domain);
        found.get(name).ips = ips;
      }
    }, function () {
      done++;
      bar.style.width = (25 + (done / total) * 55) + '%';
    });
    render();

    // Phase 3: resolve everything still unresolved (capped)
    const pending = Array.from(found.keys()).filter(function (n) { return found.get(n).ips === null; });
    const batch = pending.slice(0, 250);
    let rdone = 0;
    if (batch.length) setStatus('Resolving ' + batch.length + ' hosts…');
    await pool(batch, 8, async function (name) {
      found.get(name).ips = await resolveA(name);
    }, function () {
      rdone++;
      bar.style.width = (80 + (rdone / batch.length) * 20) + '%';
      if (rdone % 10 === 0) render();
    });
    pending.forEach(function (n) { if (found.get(n).ips === null) found.get(n).ips = []; });
    render();

    bar.style.width = '100%';
    if (!found.size) {
      setStatus(ctFailed === 2
        ? 'Could not reach the lookup services. Try again in a moment.'
        : 'No subdomains found for ' + domain + '.', ctFailed === 2 ? 'error' : '');
    } else {
      setStatus('Done: ' + found.size + ' subdomains for ' + domain + (ctFailed ? ' (one source was unavailable)' : '') + '.', 'ok');
    }
    btn.disabled = false;
    btn.textContent = 'Find subdomains';
    running = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (running) return;
    const domain = normalizeDomain(input.value);
    if (!domain) {
      setStatus('Enter a valid URL or domain, e.g. example.com', 'error');
      input.focus();
      return;
    }
    input.value = domain;
    run(domain);
  });

  filterEl.addEventListener('input', render);

  function names() { return Array.from(found.keys()).sort(); }

  copyBtn.addEventListener('click', function () {
    const text = names().join('\n');
    if (!text) return;
    const p = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    p.then(function () { copyBtn.textContent = 'Copied ✓'; },
           function () { copyBtn.textContent = 'Copy failed'; })
     .then(function () { setTimeout(function () { copyBtn.textContent = 'Copy list'; }, 1600); });
  });

  csvBtn.addEventListener('click', function () {
    if (!found.size) return;
    const rows = ['subdomain,ip,sources'].concat(names().map(function (n) {
      const i = found.get(n);
      return [n, (i.ips || []).join(' '), Array.from(i.sources).join(' ')].join(',');
    }));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subdomains.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
})();
