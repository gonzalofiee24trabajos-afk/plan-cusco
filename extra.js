/* Plan Cusco - ampliacion v2.
   Usa el mismo almacenamiento de la version original (localStorage, prefijo pc_).
   Claves nuevas: pc_v, pc_log, pc_pesos, pc_hab, pc_metas, pc_acl, pc_gen, pc_cfg, pc_sub_*. */

// ---------- utilidades ----------
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const pd = s => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
const hoyISO = () => iso(new Date());
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dayN = s => { const d = pd(s); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5; };
const fmtN = n => new Date(n * 864e5).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const r1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
const weekOf = d => Math.min(6, Math.max(1, Math.floor((d - START) / 864e5 / 7) + 1));
const lunesDe = s => { const d = pd(s); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return iso(d); };
const nDias = n => n + (n === 1 ? ' día' : ' días');
const DN = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const CFG0 = { viaje: '2026-12-22', regreso: '2027-01-08', desc: 90, claro: false, gym: false };
const cfg = () => Object.assign({}, CFG0, store.get('cfg', {}));
const setCfg = (k, v) => { const c = store.get('cfg', {}); c[k] = v; store.set('cfg', c); };
const METAS0 = { kefir: '150 ml', azucar: '', agua: '', peso: '', notas: '', kcalMin: '', kcalMax: '', balMin: '', balMax: '', base: '' };
const metas = () => Object.assign({}, METAS0, store.get('metas', {}));

// ---------- migracion (no borra claves antiguas) ----------
function migrar() {
  const v = store.get('v', 1);
  if (v < 2) {
    const ps = store.get('pesos', []);
    for (let i = 1; i <= 6; i++) {
      const kg = num(store.get('peso' + i, ''));
      if (kg > 0) { const f = iso(dateOf(i, 0)); if (!ps.some(p => p.f === f)) ps.push({ f, kg, origen: 'semana' + i }); }
    }
    store.set('pesos', ps);
    store.set('v', 2);
  }
}

// ---------- navegacion ----------
const OLD_TAB = { rutinas: ['plan', 'rutinas'], hitos: ['plan', 'hitos'], nutri: ['plan', 'nutri'], cusco: ['plan', 'cusco'] };
function showSub(t, s) {
  if (!document.getElementById(t + '-' + s)) return;
  document.querySelectorAll('#' + t + ' .subnav button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  document.querySelectorAll('#' + t + ' > .sub').forEach(d => d.classList.toggle('on', d.id === t + '-' + s));
  store.set('sub_' + t, s);
}
function showTab(t, sub) {
  if (OLD_TAB[t]) { sub = OLD_TAB[t][1]; t = OLD_TAB[t][0]; }
  if (!document.getElementById(t) || !document.querySelector('#tabs button[data-t="' + t + '"]')) t = 'hoy';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === t));
  store.set('tab', t);
  const sn = document.querySelector('#' + t + ' .subnav');
  if (sn) showSub(t, sub || store.get('sub_' + t, sn.querySelector('button').dataset.s));
  if (t === 'progreso') renderProgreso();
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.t));
document.querySelectorAll('.subnav').forEach(n => n.querySelectorAll('button').forEach(b => b.onclick = () => showSub(n.dataset.p, b.dataset.s)));

// ---------- sesiones: checklist y series ----------
const getLog = () => store.get('log', {});
function updLog(f, rk, fn) {
  const log = getLog(); const s = log[f] || (log[f] = {});
  s.r = rk; s.done = s.done || {}; s.sets = s.sets || {};
  fn(s); store.set('log', log);
}
function rutDe(f) { const s = getLog()[f]; if (s && s.r && R[s.r]) return s.r; return SCHED.find(x => x.js === pd(f).getDay()).r; }
function exList(rk, w) {
  const out = [];
  R[rk].b.forEach(b => { if (b.n.startsWith('Test') && ![1, 3, 5].includes(w.n)) return; b.e.forEach(e => out.push({ blk: fill(b.n, w), e })); });
  return out;
}
function setTxt(t) {
  const p = [];
  if (t.kg) p.push(r1(t.kg) + ' kg');
  if (t.reps) p.push((t.kg ? '× ' : '') + t.reps + (t.kg ? '' : ' rep.'));
  if (t.seg) p.push(t.seg + ' s');
  return p.join(' ') || '—';
}
function prevSets(x, f) {
  const log = getLog(); const fs = Object.keys(log).filter(k => k < f && log[k].sets && log[k].sets[x] && log[k].sets[x].length).sort();
  if (!fs.length) return null; const k = fs[fs.length - 1]; return { f: k, sets: log[k].sets[x] };
}
let openEx = '';
function sesionHTML(f, rk) {
  const w = WEEKS[weekOf(pd(f)) - 1]; const s = getLog()[f] || {}; const L = exList(rk, w);
  if (!L.length) return '<p class="small muted">Día de descanso: no hay ejercicios programados.</p>';
  const done = s.done || {}, sets = s.sets || {};
  const nd = L.filter(o => done[o.e.x]).length; let blk = '';
  let h = `<div class="row sp small muted"><span>${R[rk].t} · Semana ${w.n}</span><span>${nd}/${L.length} hechos</span></div>
    <div class="prog"><div style="width:${100 * nd / L.length}%"></div></div>`;
  L.forEach((o, i) => {
    if (o.blk !== blk) { blk = o.blk; h += `<div class="block">${blk}</div>`; }
    const x = o.e.x, ss = sets[x] || [], dn = !!done[x], op = openEx === f + '|' + x;
    h += `<div class="exr"><div class="row"><label class="chk ${dn ? 'done' : ''}" style="flex:1;border:0"><input type="checkbox" data-a="done" data-i="${i}" ${dn ? 'checked' : ''}><span class="small"><b>${x}</b><br><i class="muted" style="font-style:normal;text-decoration:none">${fill(o.e.d, w)}${ss.length ? ' · ' + ss.length + ' series registradas' : ''}</i></span></label><button class="mini" data-a="open" data-i="${i}">${op ? 'Cerrar' : 'Series'}</button></div>`;
    if (op) {
      const prev = prevSets(x, f); const ref = ss.length ? ss[ss.length - 1] : (prev ? prev.sets[0] : {});
      h += `<div class="setbox">${ss.map((t, j) => `<div class="row sp small" style="padding:3px 0"><span>${j + 1}. ${setTxt(t)}</span><button class="mini" data-a="del" data-i="${i}" data-j="${j}">Quitar</button></div>`).join('')}
        <div class="setin"><input inputmode="decimal" placeholder="kg" data-f="kg" value="${ref.kg || ''}"><input inputmode="numeric" placeholder="reps" data-f="reps" value="${ref.reps || ''}"><input inputmode="numeric" placeholder="seg" data-f="seg" value="${ref.seg || ''}"><button class="mini pri" data-a="add" data-i="${i}">Añadir serie</button></div>
        <p class="small muted">Complete kg y repeticiones, o solo el tiempo en segundos. ${prev ? 'Sesión anterior (' + fmt(pd(prev.f)) + '): ' + prev.sets.map(setTxt).join('; ') + '.' : 'Sin registros anteriores.'}</p></div>`;
    }
    h += '</div>';
  });
  const c = cfg();
  h += `<div class="row" style="margin-top:10px;flex-wrap:wrap"><span class="small muted">Cronómetro de descanso:</span>${[60, 90, 120, 180].map(x => `<button class="mini" data-a="rest" data-s="${x}">${x} s</button>`).join('')}</div>
    <p class="small muted" style="margin-top:6px">Al añadir una serie se inicia el descanso configurado (${c.desc} s).</p>`;
  return h;
}
function bindSesion(el, f, rk) {
  if (!el) return;
  el.innerHTML = sesionHTML(f, rk);
  const L = exList(rk, WEEKS[weekOf(pd(f)) - 1]);
  el.onchange = ev => {
    const c = ev.target; if (c.dataset.a !== 'done') return;
    const x = L[+c.dataset.i].e.x; updLog(f, rk, s => { if (c.checked) s.done[x] = true; else delete s.done[x]; }); renderSes();
  };
  el.onclick = ev => {
    const b = ev.target.closest('button[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'rest') { startTimer(+b.dataset.s); return; }
    const x = L[+b.dataset.i].e.x;
    if (a === 'open') { openEx = openEx === f + '|' + x ? '' : f + '|' + x; }
    if (a === 'add') {
      const box = b.closest('.setin'); const g = k => num(box.querySelector('[data-f="' + k + '"]').value);
      const t = { kg: g('kg'), reps: Math.round(g('reps')), seg: Math.round(g('seg')) };
      if (!t.kg && !t.reps && !t.seg) { alert('Ingrese kg y repeticiones, o el tiempo en segundos.'); return; }
      updLog(f, rk, s => { (s.sets[x] = s.sets[x] || []).push(t); s.done[x] = true; });
      startTimer(cfg().desc);
    }
    if (a === 'del') {
      if (!confirm('Se quitará esta serie del registro.')) return;
      updLog(f, rk, s => { s.sets[x].splice(+b.dataset.j, 1); if (!s.sets[x].length) delete s.sets[x]; });
    }
    renderSes();
  };
}
let regF = hoyISO(), regR = null;
function renderSes() {
  const h = hoyISO();
  bindSesion($('#hoySesion'), h, rutDe(h));
  const fI = $('#regFecha'), rS = $('#regRut');
  if (fI) {
    fI.value = regF; if (!regR) regR = rutDe(regF);
    rS.innerHTML = Object.keys(R).filter(k => k !== 'de').map(k => `<option value="${k}" ${k === regR ? 'selected' : ''}>${R[k].t}</option>`).join('');
    fI.onchange = () => { if (fI.value) { regF = fI.value; regR = rutDe(regF); if (regR === 'de') regR = 'fa'; renderSes(); } };
    rS.onchange = () => { regR = rS.value; renderSes(); };
    if (regR === 'de') regR = 'fa';
    bindSesion($('#regSesion'), regF, regR);
    const log = getLog(); const fs = Object.keys(log).filter(k => Object.keys(log[k].done || {}).length || Object.keys(log[k].sets || {}).length).sort().reverse();
    $('#regHist').innerHTML = fs.length ? '<table><tr><th>Fecha</th><th>Rutina</th><th>Hechos</th><th>Series</th></tr>' + fs.slice(0, 30).map(k => { const s = log[k]; const ns = Object.values(s.sets || {}).reduce((a, b) => a + b.length, 0); return `<tr data-f="${k}" style="cursor:pointer"><td>${fmt(pd(k))}</td><td class="small">${R[s.r] ? R[s.r].t : ''}</td><td>${Object.keys(s.done || {}).length}</td><td>${ns}</td></tr>`; }).join('') + '</table><p class="small muted" style="margin-top:6px">Toque una fila para abrir esa sesión.</p>' : '<p class="small muted">Todavía no hay sesiones registradas.</p>';
    $('#regHist').querySelectorAll('tr[data-f]').forEach(tr => tr.onclick = () => { regF = tr.dataset.f; regR = rutDe(regF); renderSes(); window.scrollTo({ top: 0 }); });
  }
}

// ---------- cronometro de descanso ----------
let tEnd = 0, tInt = null;
function beep() {
  try { const A = new (window.AudioContext || window.webkitAudioContext)(); const o = A.createOscillator(), g = A.createGain(); o.connect(g); g.connect(A.destination); o.frequency.value = 880; g.gain.value = .15; o.start(); o.stop(A.currentTime + .4); } catch (e) { }
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { }
}
function tick() {
  const el = $('#timer'); const r = Math.ceil((tEnd - Date.now()) / 1000);
  if (r <= 0) { clearInterval(tInt); tInt = null; $('#timerT').textContent = 'Descanso terminado'; beep(); setTimeout(() => { if (!tInt) el.classList.remove('on'); }, 5000); return; }
  el.classList.add('on'); $('#timerT').textContent = 'Descanso ' + Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0');
}
function startTimer(s) { if (!(s > 0)) return; tEnd = Date.now() + s * 1000; clearInterval(tInt); tInt = setInterval(tick, 250); tick(); }
$('#tMas').onclick = () => { if (tInt) { tEnd += 30000; tick(); } else startTimer(30); };
$('#tStop').onclick = () => { clearInterval(tInt); tInt = null; $('#timer').classList.remove('on'); };

// ---------- peso ----------
const getPesos = () => store.get('pesos', []).slice().sort((a, b) => a.f < b.f ? -1 : a.f > b.f ? 1 : 0);
function tendencia(ps) { let t = null; return ps.map(p => { t = t === null ? p.kg : t + 0.25 * (p.kg - t); return { f: p.f, kg: p.kg, t }; }); }
function renderPeso() {
  const ps = tendencia(getPesos());
  $('#pesoF').value = $('#pesoF').value || hoyISO();
  $('#pesoLista').innerHTML = ps.length ? '<table><tr><th>Fecha</th><th>Peso</th><th>Tendencia</th><th></th></tr>' + ps.slice().reverse().map(p => `<tr><td>${fmt(pd(p.f))} ${pd(p.f).getFullYear()}</td><td>${r1(p.kg)} kg</td><td>${r1(p.t)} kg</td><td><button class="mini" data-pf="${p.f}">Quitar</button></td></tr>`).join('') + '</table>' : '<p class="small muted">Aún no hay pesos registrados.</p>';
  $('#pesoLista').querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { if (!confirm('Se quitará este registro de peso.')) return; store.set('pesos', store.get('pesos', []).filter(p => p.f !== b.dataset.pf)); renderPeso(); });
  $('#pesoGraf').innerHTML = pesoChart();
}
$('#pesoOk').onclick = () => {
  const f = $('#pesoF').value, kg = num($('#pesoKg').value);
  if (!f || !(kg > 20 && kg < 400)) { alert('Ingrese una fecha y un peso válido en kg.'); return; }
  const ps = store.get('pesos', []).filter(p => p.f !== f); ps.push({ f, kg }); store.set('pesos', ps); $('#pesoKg').value = ''; renderPeso();
};
function pesoChart() {
  const ps = tendencia(getPesos()); if (!ps.length) return '<p class="small muted">Registre su peso para ver el gráfico.</p>';
  const u = ps[ps.length - 1]; const m = metas();
  let txt = `Último: <b>${r1(u.kg)} kg</b> · Tendencia: <b>${r1(u.t)} kg</b>`;
  if (ps.length > 1) txt += ` · Cambio de la tendencia desde el inicio: <b>${(u.t - ps[0].t > 0 ? '+' : '') + r1(u.t - ps[0].t)} kg</b>`;
  if (m.peso) txt += ` · Meta definida por usted: <b>${esc(m.peso)}</b>`;
  return lineChart([{ pts: ps.map(p => [dayN(p.f), p.kg]), color: 'var(--mut)', dots: true, line: false }, { pts: ps.map(p => [dayN(p.f), p.t]), color: 'var(--pur2)' }], { unit: 'kg' }) +
    `<p class="small" style="margin-top:6px">${txt}</p><p class="small muted">Puntos: peso registrado. Línea: tendencia suavizada (media móvil exponencial, factor 0,25).</p>`;
}

// ---------- graficos SVG ----------
function lineChart(series, o) {
  o = o || {}; const W = 340, H = o.h || 160, pl = 38, pr = 10, pt = 10, pb = 20;
  const all = series.reduce((a, s) => a.concat(s.pts), []);
  if (!all.length) return '<p class="small muted">Aún no hay datos suficientes.</p>';
  let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  if (x0 === x1) { x0 -= 1; x1 += 1; } const pad = (y1 - y0) * .12 || 1; y0 -= pad; y1 += pad;
  const X = x => pl + (x - x0) / (x1 - x0) * (W - pl - pr), Y = y => pt + (1 - (y - y0) / (y1 - y0)) * (H - pt - pb);
  let g = '';
  for (let k = 0; k <= 3; k++) { const y = y0 + (y1 - y0) * k / 3; g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(y)}" y2="${Y(y)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 5}" y="${Y(y) + 4}" text-anchor="end" font-size="10" fill="var(--mut)">${r1(y)}</text>`; }
  g += `<text x="${pl}" y="${H - 4}" font-size="10" fill="var(--mut)">${fmtN(x0)}</text><text x="${W - pr}" y="${H - 4}" text-anchor="end" font-size="10" fill="var(--mut)">${fmtN(x1)}</text>`;
  series.forEach(s => {
    if (s.line !== false && s.pts.length > 1) g += `<path d="${s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"/>`;
    if (s.dots || s.pts.length === 1) s.pts.forEach(p => g += `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" fill="${s.color}"/>`);
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
function barChart(items) {
  if (!items.length) return '<p class="small muted">Aún no hay datos suficientes.</p>';
  const W = 340, H = 150, pb = 20, pt = 16, mx = Math.max(...items.map(i => i.v)) || 1, bw = (W - 10) / items.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">` + items.map((it, i) => { const h = (H - pb - pt) * it.v / mx, x = 5 + i * bw; return `<rect x="${(x + bw * .15).toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="var(--pur)"/><text x="${(x + bw / 2).toFixed(1)}" y="${(H - pb - h - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--tx)">${Math.round(it.v)}</text><text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--mut)">${it.l}</text>`; }).join('') + '</svg>';
}

// ---------- estadisticas de fuerza ----------
const e1 = t => t.kg > 0 && t.reps > 0 ? (t.reps === 1 ? t.kg : t.kg * (1 + t.reps / 30)) : 0;
function exHist() {
  const log = getLog(), H = {};
  Object.keys(log).sort().forEach(f => { const s = log[f].sets || {}; for (const x in s) if (s[x].length) (H[x] = H[x] || []).push({ f, sets: s[x] }); });
  return H;
}
function volSemanal() {
  const log = getLog(), V = {};
  Object.keys(log).forEach(f => { let v = 0; const s = log[f].sets || {}; for (const x in s) s[x].forEach(t => v += (t.kg || 0) * (t.reps || 0)); if (v) { const k = lunesDe(f); V[k] = (V[k] || 0) + v; } });
  return Object.keys(V).sort().map(k => ({ l: fmt(pd(k)), v: V[k], k }));
}
function estancados(H) {
  const out = [];
  for (const x in H) {
    const tops = H[x].map(s => Math.max(...s.sets.map(e1))).filter(v => v > 0);
    if (tops.length >= 3) { const n = tops.length; if (Math.max(tops[n - 1], tops[n - 2]) <= tops[n - 3] + 1e-9) out.push(x); }
  }
  return out;
}
let selEx = '';
function renderProgreso() {
  const H = exHist(); const names = Object.keys(H).sort();
  // resumen semanal
  const lun = lunesDe(hoyISO()); const dom = pd(lun); dom.setDate(dom.getDate() + 6); const domI = iso(dom);
  const log = getLog(), hab = store.get('hab', {}); let ses = 0, nSets = 0, vol = 0, hechos = 0, kef = 0, azu = 0, agua = 0, dAgua = 0;
  Object.keys(log).filter(f => f >= lun && f <= domI).forEach(f => { const s = log[f]; const d = Object.keys(s.done || {}).length; let n = 0; for (const x in (s.sets || {})) s.sets[x].forEach(t => { n++; vol += (t.kg || 0) * (t.reps || 0); }); if (d || n) ses++; hechos += d; nSets += n; });
  Object.keys(hab).filter(f => f >= lun && f <= domI).forEach(f => { if (hab[f].kefir) kef++; if (hab[f].azucar) azu++; if (hab[f].agua) { agua += hab[f].agua; dAgua++; } });
  const ps = tendencia(getPesos()); const antes = ps.filter(p => p.f < lun), enSem = ps.filter(p => p.f >= lun && p.f <= domI);
  const dPeso = antes.length && enSem.length ? enSem[enSem.length - 1].t - antes[antes.length - 1].t : null;
  $('#progResumen').innerHTML = `<p class="small muted" style="margin-bottom:8px">Semana del ${fmt(pd(lun))} al ${fmt(dom)}</p><div class="grid2">
    <div class="kpi"><b>${ses}</b><span>sesiones con registro</span></div><div class="kpi"><b>${hechos}</b><span>ejercicios marcados</span></div>
    <div class="kpi"><b>${nSets}</b><span>series registradas</span></div><div class="kpi"><b>${Math.round(vol)} kg</b><span>volumen (kg × rep.)</span></div>
    <div class="kpi"><b>${kef}/7</b><span>días con kéfir</span></div><div class="kpi"><b>${azu}/7</b><span>días con azúcares reducidos</span></div>
    <div class="kpi"><b>${dAgua ? r1(agua / dAgua) : '—'}</b><span>vasos de agua (promedio)</span></div><div class="kpi"><b>${dPeso === null ? '—' : (dPeso > 0 ? '+' : '') + r1(dPeso) + ' kg'}</b><span>tendencia de peso en la semana</span></div></div>`;
  $('#progPeso').innerHTML = pesoChart();
  // fuerza
  if (!names.includes(selEx)) selEx = names.find(n => H[n].some(s => s.sets.some(t => t.kg > 0))) || names[0] || '';
  if (!names.length) { $('#progEx').innerHTML = '<p class="small muted">Registre series en una sesión para ver el avance por ejercicio.</p>'; }
  else {
    const h = H[selEx]; const conKg = h.some(s => s.sets.some(t => t.kg > 0)); let ch;
    if (conKg) ch = lineChart([{ pts: h.map(s => [dayN(s.f), Math.max(...s.sets.map(t => t.kg || 0))]), color: 'var(--ok)', dots: true }, { pts: h.filter(s => s.sets.some(t => e1(t) > 0)).map(s => [dayN(s.f), Math.max(...s.sets.map(e1))]), color: 'var(--pur2)', dots: true }]) + '<p class="small muted">Verde: carga máxima de la sesión (kg). Morado: 1RM estimado (fórmula de Epley; orientativo, más fiable con 12 repeticiones o menos).</p>';
    else if (h.some(s => s.sets.some(t => t.seg > 0))) ch = lineChart([{ pts: h.map(s => [dayN(s.f), Math.max(...s.sets.map(t => t.seg || 0))]), color: 'var(--ok)', dots: true }]) + '<p class="small muted">Mejor tiempo de la sesión (segundos).</p>';
    else ch = lineChart([{ pts: h.map(s => [dayN(s.f), Math.max(...s.sets.map(t => t.reps || 0))]), color: 'var(--ok)', dots: true }]) + '<p class="small muted">Máximo de repeticiones por sesión.</p>';
    $('#progEx').innerHTML = `<select class="fi" id="selEx" style="width:100%;margin-bottom:8px">${names.map(n => `<option ${n === selEx ? 'selected' : ''}>${n}</option>`).join('')}</select>${ch}`;
    $('#selEx').onchange = e => { selEx = e.target.value; renderProgreso(); };
  }
  // records
  $('#progPR').innerHTML = names.length ? '<table><tr><th>Ejercicio</th><th>Carga máx.</th><th>1RM est.</th><th>Rep. máx.</th><th>Tiempo máx.</th></tr>' + names.map(n => {
    const all = H[n].reduce((a, s) => a.concat(s.sets), []); const mk = Math.max(...all.map(t => t.kg || 0)), m1 = Math.max(...all.map(e1)), mr = Math.max(...all.map(t => t.reps || 0)), ms = Math.max(...all.map(t => t.seg || 0));
    return `<tr><td class="small">${n}</td><td>${mk ? r1(mk) + ' kg' : '—'}</td><td>${m1 ? r1(m1) + ' kg' : '—'}</td><td>${mr || '—'}</td><td>${ms ? ms + ' s' : '—'}</td></tr>`;
  }).join('') + '</table>' : '<p class="small muted">Sin récords todavía.</p>';
  $('#progVol').innerHTML = barChart(volSemanal().slice(-8)) + '<p class="small muted">Suma de kg × repeticiones por semana (lunes a domingo).</p>';
  const est = estancados(H);
  $('#progEst').innerHTML = est.length ? est.map(x => `<div class="note"><b>${x}:</b> el 1RM estimado no ha mejorado en las últimas 3 sesiones registradas. Revise si desea cambiar la carga, las repeticiones o el descanso.</div>`).join('') : '<p class="small muted">Sin avisos: ninguna carga lleva 3 sesiones sin mejorar (se necesitan al menos 3 sesiones con kg y repeticiones).</p>';
  // habitos
  $('#progKcal').innerHTML = progKcalHTML();
  $('#progHab').innerHTML = `<div class="grid2"><div class="kpi"><b>${nDias(racha('kefir'))}</b><span>racha de kéfir</span></div><div class="kpi"><b>${nDias(racha('azucar'))}</b><span>racha de azúcares reducidos</span></div></div>` + hab14();
  // test de cinta (dato existente)
  const tp = [1, 3, 5].map(t => [t, num(store.get('t' + t + 'fc', ''))]).filter(p => p[1] > 0);
  $('#progTest').innerHTML = tp.length ? barChart(tp.map(p => ({ l: 'Semana ' + p[0], v: p[1] }))) + '<p class="small muted">Frecuencia cardiaca al minuto 15 del test de cinta (se registra en Plan, Hitos).</p>' : '<p class="small muted">Aún no hay tests de cinta registrados (Plan, Hitos).</p>';
}

// ---------- alimentacion y habitos ----------
const getHab = () => store.get('hab', {});
function setHab(f, fn) { const h = getHab(); const d = h[f] || (h[f] = {}); fn(d); store.set('hab', h); }
function racha(k) {
  const h = getHab(); const d = new Date(); d.setHours(0, 0, 0, 0);
  if (!(h[iso(d)] && h[iso(d)][k])) d.setDate(d.getDate() - 1);
  let n = 0; while (h[iso(d)] && h[iso(d)][k]) { n++; d.setDate(d.getDate() - 1); } return n;
}
function habHTML(f) {
  const d = getHab()[f] || {}, m = metas();
  return `<label class="chk ${d.kefir ? 'done' : ''}"><input type="checkbox" data-hb="kefir" ${d.kefir ? 'checked' : ''}><span class="small"><b>Kéfir diario</b>${m.kefir ? ' · meta: ' + esc(m.kefir) : ''}<br><i class="muted" style="font-style:normal">Racha actual: ${nDias(racha('kefir'))}</i></span></label>
   <label class="chk ${d.azucar ? 'done' : ''}"><input type="checkbox" data-hb="azucar" ${d.azucar ? 'checked' : ''}><span class="small"><b>Día con azúcares reducidos</b>${m.azucar ? ' · meta: ' + esc(m.azucar) : ''}<br><i class="muted" style="font-style:normal">Racha actual: ${nDias(racha('azucar'))}</i></span></label>
   <div class="row sp" style="padding:9px 0"><span class="small"><b>Hidratación</b><br><span class="muted">${d.agua || 0} vasos${m.agua ? ' · meta: ' + esc(m.agua) : ' · sin meta definida'}</span></span><span><button class="mini" data-hb="agua-">Quitar</button> <button class="mini pri" data-hb="agua+">Sumar vaso</button></span></div>`;
}
function bindHab(el, f) {
  if (!el) return; el.innerHTML = habHTML(f);
  el.onchange = ev => { const k = ev.target.dataset.hb; if (k === 'kefir' || k === 'azucar') { setHab(f, d => d[k] = ev.target.checked); renderHab(); } };
  el.onclick = ev => { const b = ev.target.closest('button[data-hb]'); if (!b) return; setHab(f, d => d.agua = Math.max(0, (d.agua || 0) + (b.dataset.hb === 'agua+' ? 1 : -1))); renderHab(); };
}
function hab14() {
  const h = getHab(); let rows = ''; const d = new Date();
  for (let i = 0; i < 14; i++) { const k = iso(d), x = h[k] || {}; rows += `<tr><td>${DN[d.getDay()]} ${fmt(d)}</td><td>${x.kefir ? 'Sí' : '—'}</td><td>${x.azucar ? 'Sí' : '—'}</td><td>${x.agua || '—'}</td></tr>`; d.setDate(d.getDate() - 1); }
  return '<table style="margin-top:8px"><tr><th>Día</th><th>Kéfir</th><th>Azúcares reducidos</th><th>Vasos de agua</th></tr>' + rows + '</table>';
}
let habF = hoyISO();
function renderHab() {
  bindHab($('#hoyHab'), hoyISO()); pintarKcal();
  const fI = $('#habFecha'); if (!fI) return;
  fI.value = habF; fI.onchange = () => { if (fI.value) { habF = fI.value; renderHab(); } };
  bindHab($('#habDia'), habF);
  const dd = getHab()[habF] || {}; const c = dd.com || {}, kc = dd.kc || {};
  $('#habComidas').innerHTML = [['des', 'Desayuno'], ['alm', 'Almuerzo'], ['cen', 'Cena'], ['ext', 'Otros (meriendas, antojos, bebidas)']].map(p => `<label class="small muted" style="display:block;margin-top:8px">${p[1]}</label><div class="row"><textarea class="fi" rows="2" data-c="${p[0]}" style="flex:1;min-width:0">${esc(c[p[0]])}</textarea><label class="row" style="gap:5px;flex:0 0 auto"><input class="fi" type="number" min="0" step="1" inputmode="numeric" data-k="${p[0]}" aria-label="${p[1]}: kcal" value="${esc(kc[p[0]] || '')}" style="width:74px"><span class="small muted">kcal</span></label></div><div data-u="${p[0]}"></div>`).join('');
  $('#habComidas').querySelectorAll('textarea').forEach(t => t.oninput = () => { setHab(habF, d => { d.com = d.com || {}; d.com[t.dataset.c] = t.value; }); sugerirKcal(t.dataset.c); });
  $('#habComidas').querySelectorAll('input[data-k]').forEach(t => t.oninput = () => { setHab(habF, d => { d.kc = d.kc || {}; d.kc[t.dataset.k] = Math.max(0, Math.round(num(t.value))); }); pintarKcal(); sugerirKcal(t.dataset.k); });
  $('#habKcal').innerHTML = `<div class="input"><label>Calorías activas del ejercicio (reloj), kcal</label><input inputmode="numeric" data-d="act" value="${dd.act || ''}"></div>
    <div class="input"><label>Pasos del día</label><input inputmode="numeric" data-d="pasos" value="${dd.pasos || ''}"></div><div id="habKcalRes" style="margin-top:10px"></div>`;
  $('#habKcal').querySelectorAll('input[data-d]').forEach(t => t.oninput = () => { setHab(habF, d => d[t.dataset.d] = Math.round(num(t.value))); pintarKcal(); });
  pintarKcal();
  ['des', 'alm', 'cen', 'ext'].forEach(sugerirKcal);
  $('#habTabla').innerHTML = hab14();
  renderMetasVista();
}
// ---------- calorias, pasos y balance (rangos definidos por el usuario) ----------
const sg = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n));
function kcalDia(f) {
  const d = getHab()[f] || {}, m = metas(), kc = d.kc || {};
  const ing = ['des', 'alm', 'cen', 'ext'].reduce((a, k) => a + num(kc[k]), 0), act = num(d.act), base = num(m.base);
  return { ing, act, pasos: num(d.pasos), base, bal: ing > 0 && base > 0 ? ing - (base + act) : null };
}
const nm = v => num(String(v == null ? '' : v).replace('−', '-'));
function enRango(v, a, b) {
  a = String(a == null ? '' : a).trim(); b = String(b == null ? '' : b).trim();
  if (a === '' && b === '') return null;
  let lo = a === '' ? -Infinity : nm(a), hi = b === '' ? Infinity : nm(b); if (lo > hi) { const t = lo; lo = hi; hi = t; }
  return v < lo ? -1 : v > hi ? 1 : 0;
}
const sgR = v => String(nm(v)).replace('-', '−');
const rangoTxt = (a, b, u) => (String(a).trim() !== '' && String(b).trim() !== '' ? 'de ' + sgR(a) + ' a ' + sgR(b) : String(a).trim() !== '' ? 'desde ' + sgR(a) : 'hasta ' + sgR(b)) + ' ' + u;
const estTxt = r => r === 0 ? '<b style="color:var(--ok)">dentro del rango</b>' : r < 0 ? '<b style="color:var(--warn)">por debajo del rango</b>' : '<b style="color:var(--warn)">por encima del rango</b>';
function kcalHTML(f) {
  const k = kcalDia(f), m = metas(); let h = '';
  if (!k.ing && !k.act && !k.pasos) return '<p class="small muted">Sin calorías ni pasos registrados para este día (Registro, Alimentación y hábitos).</p>';
  const rI = enRango(k.ing, m.kcalMin, m.kcalMax);
  h += `<p class="small"><b>Ingesta:</b> ${k.ing ? Math.round(k.ing) + ' kcal' : 'sin registrar'}${k.ing && rI !== null ? ' · meta ' + rangoTxt(m.kcalMin, m.kcalMax, 'kcal') + ': ' + estTxt(rI) : ''}</p>`;
  h += `<p class="small"><b>Gasto:</b> ${k.base ? Math.round(k.base) + ' kcal de gasto base' : 'gasto base sin definir'} + ${Math.round(k.act)} kcal activas${k.pasos ? ' · ' + Math.round(k.pasos) + ' pasos' : ''}</p>`;
  if (k.bal !== null) { const rB = enRango(k.bal, m.balMin, m.balMax); h += `<p class="small"><b>Balance:</b> ${sg(k.bal)} kcal (${k.bal < 0 ? 'déficit' : k.bal > 0 ? 'superávit' : 'equilibrio'})${rB !== null ? ' · objetivo ' + rangoTxt(m.balMin, m.balMax, 'kcal') + ': ' + estTxt(rB) : ''}</p>`; }
  else if (!k.base) h += '<p class="small muted">Para calcular el balance, defina su gasto base diario en Ajustes.</p>';
  else h += '<p class="small muted">Registre las calorías de las comidas para calcular el balance.</p>';
  return h;
}
function sugerirKcal(k) {
  const box = $('#habComidas'); if (!box) return;
  const ta = box.querySelector('textarea[data-c="' + k + '"]'), inp = box.querySelector('input[data-k="' + k + '"]'), u = box.querySelector('[data-u="' + k + '"]');
  if (!ta || !inp || !u) return;
  const m = ta.value.match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|cal)/i) || ta.value.match(/(\d+(?:[.,]\d+)?)/);
  const n = m ? Math.round(num(m[1])) : 0;
  if (n > 0 && inp.value.trim() === '') {
    u.innerHTML = '<button class="mini" style="margin-top:4px">Usar ' + n + ' como kcal</button>';
    u.firstChild.onclick = () => { inp.value = n; inp.oninput(); };
  } else u.innerHTML = '';
}
function irAjustesKcal() { showTab('ajustes'); const c = $('#ajKcal'); if (c) c.scrollIntoView(); }
function resumenKcal(f) {
  const k = kcalDia(f), m = metas();
  const rI = k.ing > 0 ? enRango(k.ing, m.kcalMin, m.kcalMax) : null, rB = k.bal !== null ? enRango(k.bal, m.balMin, m.balMax) : null;
  const est = r => r === null ? '' : r === 0 ? '<b style="color:var(--ok)">Dentro del rango</b>' : '<b style="color:var(--warn)">Fuera del rango (' + (r < 0 ? 'por debajo' : 'por encima') + ')</b>';
  const hayI = enRango(0, m.kcalMin, m.kcalMax) !== null, hayB = enRango(0, m.balMin, m.balMax) !== null;
  let h = `<table>
    <tr><td><b>Ingesta total</b><br><span class="small muted">suma de las comidas</span></td><td><b>${k.ing > 0 ? Math.round(k.ing) + ' kcal' : 'Sin registrar'}</b><br><span class="small">${k.ing > 0 ? (hayI ? est(rI) + '<br><span class="muted">rango: ' + rangoTxt(m.kcalMin, m.kcalMax, 'kcal') + '</span>' : '<span class="muted">sin rango definido</span>') : ''}</span></td></tr>
    <tr><td><b>Gasto</b><br><span class="small muted">gasto base + calorías activas</span></td><td><b>${k.base > 0 ? Math.round(k.base + k.act) + ' kcal' : 'Sin calcular'}</b><br><span class="small muted">${k.base > 0 ? Math.round(k.base) : 'sin definir'} + ${Math.round(k.act)}</span></td></tr>
    <tr><td><b>Balance</b><br><span class="small muted">ingesta − gasto</span></td><td><b>${k.bal !== null ? sg(k.bal) + ' kcal (' + (k.bal < 0 ? 'déficit' : k.bal > 0 ? 'superávit' : 'equilibrio') + ')' : 'Sin calcular'}</b><br><span class="small">${k.bal !== null ? (hayB ? est(rB) + '<br><span class="muted">objetivo: ' + rangoTxt(m.balMin, m.balMax, 'kcal') + '</span>' : '<span class="muted">sin objetivo definido</span>') : ''}</span></td></tr></table>`;
  if (!(k.base > 0)) h += '<div class="note" style="margin:10px 0 0">Falta definir el gasto base diario; sin ese dato no se puede calcular el gasto ni el balance. <button class="mini" data-ir="ajustes" style="margin-top:6px">Definir en Ajustes</button></div>';
  if (k.ing > 0 && rI === -1) h += '<div class="okn" style="margin:10px 0 0;border-left-color:var(--mut);background:var(--card2);color:var(--tx)">La ingesta registrada este día queda por debajo del mínimo que usted definió. Puede que aún falten comidas por registrar. Si ocurre con frecuencia, conviene consultarlo con un profesional.</div>';
  h += '<p class="small muted" style="margin-top:8px">Los rangos y el gasto base los define usted en Ajustes; la aplicación solo compara y no recomienda valores.</p>';
  return h;
}
function pintarKcal() {
  const t = $('#habKcalTop'); if (t) { t.innerHTML = resumenKcal(habF); const b = t.querySelector('[data-ir]'); if (b) b.onclick = irAjustesKcal; }
  const a = $('#habKcalRes'); if (a) a.innerHTML = '<p class="small muted">El resumen del día está al inicio de esta pantalla. Los pasos se guardan como referencia y no se suman al gasto.</p>';
  const b = $('#hoyKcal'); if (b) b.innerHTML = '<div style="border-top:1px solid var(--line);padding-top:8px;margin-top:4px">' + kcalHTML(hoyISO()) + '</div>';
}
function progKcalHTML() {
  const m = metas(); const d = new Date(); const dias = []; for (let i = 0; i < 14; i++) { dias.unshift(iso(d)); d.setDate(d.getDate() - 1); }
  const K = dias.map(f => Object.assign({ f }, kcalDia(f)));
  const cI = K.filter(k => k.ing > 0), cB = K.filter(k => k.bal !== null), cP = K.filter(k => k.pasos > 0), cA = K.filter(k => k.act > 0);
  if (!cI.length && !cP.length && !cA.length) return '<p class="small muted">Registre calorías, pasos o calorías activas para ver este apartado.</p>';
  const pr = (a, fn) => a.length ? Math.round(a.reduce((s, x) => s + fn(x), 0) / a.length) : null;
  const okI = cI.filter(k => enRango(k.ing, m.kcalMin, m.kcalMax) === 0).length, okB = cB.filter(k => enRango(k.bal, m.balMin, m.balMax) === 0).length;
  const hayI = enRango(0, m.kcalMin, m.kcalMax) !== null, hayB = enRango(0, m.balMin, m.balMax) !== null;
  let h = `<p class="small muted" style="margin-bottom:8px">Últimos 14 días</p><div class="grid2">
    <div class="kpi"><b>${pr(cI, k => k.ing) === null ? '—' : pr(cI, k => k.ing) + ' kcal'}</b><span>ingesta promedio (${cI.length} días)</span></div>
    <div class="kpi"><b>${pr(cB, k => k.bal) === null ? '—' : sg(pr(cB, k => k.bal)) + ' kcal'}</b><span>balance promedio</span></div>
    <div class="kpi"><b>${hayI ? okI + '/' + cI.length : '—'}</b><span>días con la ingesta dentro del rango</span></div>
    <div class="kpi"><b>${hayB ? okB + '/' + cB.length : '—'}</b><span>días con el balance dentro del objetivo</span></div>
    <div class="kpi"><b>${pr(cA, k => k.act) === null ? '—' : pr(cA, k => k.act) + ' kcal'}</b><span>calorías activas promedio</span></div>
    <div class="kpi"><b>${pr(cP, k => k.pasos) === null ? '—' : pr(cP, k => k.pasos)}</b><span>pasos promedio</span></div></div>`;
  if (cB.length) h += '<p class="small" style="margin-top:10px"><b>Balance diario (kcal)</b></p>' + lineChart([{ pts: cB.map(k => [dayN(k.f), k.bal]), color: 'var(--pur2)', dots: true }]) + (hayB ? '<p class="small muted">Objetivo definido por usted: ' + rangoTxt(m.balMin, m.balMax, 'kcal') + '. Los valores negativos indican déficit.</p>' : '<p class="small muted">Los valores negativos indican déficit. Puede definir un objetivo en Ajustes.</p>');
  if (cP.length) h += '<p class="small" style="margin-top:10px"><b>Pasos por día</b></p>' + barChart(cP.map(k => ({ l: fmt(pd(k.f)).replace('.', ''), v: k.pasos })));
  return h;
}

function renderMetasVista() {
  const m = metas(); const el = $('#metasBox'); if (!el) return;
  const it = [['Kéfir', m.kefir], ['Azúcares', m.azucar], ['Agua', m.agua], ['Peso', m.peso], ['Ingesta diaria', (m.kcalMin !== '' || m.kcalMax !== '') ? rangoTxt(m.kcalMin, m.kcalMax, 'kcal') : ''], ['Balance diario', (m.balMin !== '' || m.balMax !== '') ? rangoTxt(m.balMin, m.balMax, 'kcal') : ''], ['Gasto base', m.base ? m.base + ' kcal' : ''], ['Otras metas', m.notas]].filter(p => p[1]);
  el.innerHTML = '<h3>Mis metas</h3>' + (it.length ? '<ul class="dots small">' + it.map(p => `<li><b>${p[0]}:</b> ${esc(p[1])}</li>`).join('') + '</ul>' : '<p class="small muted">Aún no ha definido metas.</p>') + '<p class="small muted" style="margin-top:6px">Las metas y los rangos de calorías los define usted en Ajustes; la aplicación no los prescribe.</p>';
}

// ---------- Cusco: cuenta regresiva, fases y aclimatacion ----------
function diasViaje() { const h = new Date(); h.setHours(0, 0, 0, 0); return Math.round((pd(cfg().viaje) - h) / 864e5); }
function faseActual() {
  const c = cfg(), h = hoyISO();
  if (h > c.regreso) return 'Después del viaje: rutina nueva';
  if (h >= c.viaje) return 'En el viaje';
  if (h < iso(START)) return 'Antes del inicio del plan';
  const w = WEEKS[curWeek() - 1]; return 'Semana ' + w.n + ' · ' + w.t;
}
const ITIN = [];
const ACL = ['Ascenso gradual: aumentar la altitud y la actividad de forma progresiva', 'Hidratación: beber agua con regularidad durante el día', 'Sin alcohol durante las primeras 48 horas', 'Comidas ligeras los primeros días'];
const SINT = ['Dolor de cabeza', 'Náuseas', 'Mareo', 'Cansancio inusual', 'Falta de aire', 'Dificultad para dormir', 'Pérdida de apetito'];
function renderCusco() {
  const c = cfg(), n = diasViaje(), h = hoyISO();
  const cuenta = n > 0 ? `Faltan <b>${n} días</b> para el viaje a Cusco` : n === 0 ? '<b>Hoy</b> es el viaje a Cusco' : (h <= c.regreso ? `Día <b>${-n + 1}</b> del viaje` : 'El viaje ya terminó');
  $('#hoyCusco').innerHTML = `<div class="card"><div class="row sp"><span class="small">${cuenta}</span><span class="tag">${faseActual()}</span></div></div>`;
  const fases = WEEKS.map(w => ({ t: 'Semana ' + w.n + ' · ' + w.t, f: w.f, on: h >= iso(START) && h < c.viaje && curWeek() === w.n }));
  fases.push({ t: 'Viaje a Cusco', f: fmt(pd(c.viaje)) + ' – ' + fmt(pd(c.regreso)), on: h >= c.viaje && h <= c.regreso });
  fases.push({ t: 'Rutina posterior al viaje', f: 'desde el regreso', on: h > c.regreso });
  $('#cuscoTop').innerHTML = `<div class="card pur"><h3>Cuenta regresiva</h3><p>${cuenta}.</p><p class="small muted">Fecha de llegada: ${fmt(pd(c.viaje))} ${pd(c.viaje).getFullYear()} (editable en Ajustes).</p></div>
   <div class="card"><h3>Fases hasta el viaje</h3>${fases.map(f => `<div class="row sp" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="small">${f.on ? '<b>' + f.t + '</b> <span class="tag">Actual</span>' : f.t}</span><span class="small muted">${f.f}</span></div>`).join('')}</div>
   ${ITIN.length ? `<div class="card"><h3>Itinerario</h3><table>${ITIN.map(i => `<tr><td><b>${i[0]}</b></td><td class="small">${i[1]}</td></tr>`).join('')}</table></div>` : ''}`;
  const a = store.get('acl', { chk: {}, sint: [] }); a.chk = a.chk || {}; a.sint = a.sint || [];
  $('#aclBox').innerHTML = `<h3>Aclimatación a la altura</h3><p class="small muted">Lista de verificación general.</p>
   ${ACL.map((x, i) => `<label class="chk ${a.chk[i] ? 'done' : ''}"><input type="checkbox" data-ac="${i}" ${a.chk[i] ? 'checked' : ''}><span class="small">${x}</span></label>`).join('')}
   <div class="note" style="margin-top:10px">Esta lista es general y no constituye un consejo médico. Consulte a un médico antes del viaje y ante cualquier síntoma.</div>
   <h3 style="margin-top:12px">Registro de síntomas</h3>
   <div class="row" style="flex-wrap:wrap;margin:6px 0"><input type="date" class="fi" id="sintF" value="${h}"><select class="fi" id="sintI"><option value="1">Leve</option><option value="2">Moderado</option><option value="3">Intenso</option></select></div>
   <div>${SINT.map((x, i) => `<label class="chk" style="border:0;padding:4px 0"><input type="checkbox" data-si="${i}"><span class="small">${x}</span></label>`).join('')}</div>
   <textarea class="fi" id="sintN" rows="2" placeholder="Nota (opcional)" style="width:100%;margin-top:6px"></textarea>
   <button class="btn" id="sintOk">Guardar registro de síntomas</button>
   <div style="margin-top:10px">${a.sint.length ? '<table><tr><th>Fecha</th><th>Síntomas</th><th>Intensidad</th><th></th></tr>' + a.sint.map((s, j) => `<tr><td>${fmt(pd(s.f))}</td><td class="small">${esc(s.items.join(', '))}${s.nota ? '<br><span class="muted">' + esc(s.nota) + '</span>' : ''}</td><td>${['', 'Leve', 'Moderado', 'Intenso'][s.int] || ''}</td><td><button class="mini" data-sd="${j}">Quitar</button></td></tr>`).join('') + '</table>' : '<p class="small muted">Sin síntomas registrados.</p>'}</div>
   <p class="small muted" style="margin-top:6px">El registro sirve para mostrárselo a un médico. Si tiene síntomas, consulte a un médico.</p>`;
  const save = () => store.set('acl', a);
  $('#aclBox').querySelectorAll('[data-ac]').forEach(cb => cb.onchange = () => { a.chk[cb.dataset.ac] = cb.checked; save(); cb.parentElement.classList.toggle('done', cb.checked); });
  $('#sintOk').onclick = () => {
    const items = [...$('#aclBox').querySelectorAll('[data-si]:checked')].map(x => SINT[+x.dataset.si]); const nota = $('#sintN').value.trim();
    if (!items.length && !nota) { alert('Marque al menos un síntoma o escriba una nota.'); return; }
    a.sint.push({ f: $('#sintF').value || h, items, int: +$('#sintI').value, nota }); a.sint.sort((x, y) => x.f < y.f ? 1 : -1); save(); renderCusco();
  };
  $('#aclBox').querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { if (!confirm('Se quitará este registro de síntomas.')) return; a.sint.splice(+b.dataset.sd, 1); save(); renderCusco(); });
}

// ---------- generador de rutina posterior al viaje ----------
const GEN0 = { inicio: '2027-01-11', sem: 8, desc: 4, gym: [1, 3, 6, 0], casa: [2, 4] };
const PASOS = ['3 × 12 con carga cómoda', '3 × 10 con algo más de carga', '4 × 8 con la misma carga o algo más', '4 × 10 con la carga anterior', '4 × 8 con algo más de carga'];
function renderGen() {
  const g = Object.assign({}, GEN0, store.get('gen', {}));
  const dias = [1, 2, 3, 4, 5, 6, 0];
  const chk = (k) => dias.map(d => `<label class="small" style="margin-right:8px;white-space:nowrap"><input type="checkbox" data-g="${k}" value="${d}" ${g[k].includes(d) ? 'checked' : ''}> ${DN[d]}</label>`).join('');
  let out = '';
  const gymD = dias.filter(d => g.gym.includes(d)), casaD = dias.filter(d => g.casa.includes(d) && !g.gym.includes(d));
  const GS = ['Fuerza A', 'Fuerza B', 'Intervalos y core', 'Resistencia en Zona 2'], CS = ['Casa A: calistenia', 'Casa B: escaleras y movilidad'];
  const sem = Math.min(24, Math.max(1, Math.round(num(g.sem)) || 8)), cada = Math.min(8, Math.max(2, Math.round(num(g.desc)) || 4));
  for (let k = 1; k <= sem; k++) {
    const ini = pd(g.inicio); ini.setDate(ini.getDate() + (k - 1) * 7); const esD = k % cada === 0; const bloque = Math.ceil(k / cada), paso = (k - 1) % cada;
    const fuerza = esD ? '2 × 10 con carga ligera (descarga: cerca de la mitad del volumen)' : PASOS[Math.min(paso, PASOS.length - 1)] + (bloque > 1 ? ' (partiendo de las cargas del bloque ' + (bloque - 1) + ')' : '');
    const z2 = esD ? 20 : Math.min(45, 25 + 5 * paso + 5 * (bloque - 1)), rondas = esD ? 2 : Math.min(4, 3 + (paso > 1 ? 1 : 0));
    out += `<div class="card ${esD ? 'pur' : ''}"><div class="row sp"><h3>Semana ${k}${esD ? ' · Descarga' : ' · Bloque ' + bloque}</h3><span class="small muted">desde el ${fmt(ini)}</span></div>
     <p class="small"><b>Fuerza:</b> ${fuerza}.</p><p class="small"><b>Cardio en Zona 2:</b> ${z2} min por sesión de gimnasio.</p>
     <table style="margin-top:6px">${dias.map(d => { const gi = gymD.indexOf(d), ci = casaD.indexOf(d); const t = gi >= 0 ? `<span class="tag gym">Gimnasio</span> ${GS[gi % GS.length]}` : ci >= 0 ? `<span class="tag casa">Casa</span> ${CS[ci % CS.length]} · ${ci % CS.length === 0 ? rondas + ' rondas, ' : ''}máximo 30 min` : '<span class="tag desc">Descanso</span>'; return `<tr><td style="width:44px"><b>${DN[d]}</b></td><td class="small">${t}</td></tr>`; }).join('')}</table></div>`;
  }
  $('#genBox').innerHTML = `<div class="card"><h3>Generador de rutina posterior al viaje</h3>
    <p class="small muted">Progresión por bloques con una semana de descarga al final de cada bloque. Las rutinas de casa duran como máximo 30 minutos. Los días propuestos provienen del horario que ya tenía la aplicación; ajústelos a su disponibilidad.</p>
    <div class="input"><label>Fecha de inicio</label><input type="date" data-g="inicio" value="${g.inicio}" style="width:150px"></div>
    <div class="input"><label>Número de semanas</label><input inputmode="numeric" data-g="sem" value="${g.sem}"></div>
    <div class="input"><label>Descarga cada (semanas)</label><input inputmode="numeric" data-g="desc" value="${g.desc}"></div>
    <p class="small" style="margin-top:10px"><b>Días de gimnasio</b></p><div>${chk('gym')}</div>
    <p class="small" style="margin-top:8px"><b>Días de casa (máximo 30 min)</b></p><div>${chk('casa')}</div></div>${out}
    <p class="small muted">Las rutinas Fuerza A, Fuerza B, Casa A y Casa B se detallan en Plan, Rutinas.</p>`;
  $('#genBox').querySelectorAll('[data-g]').forEach(i => i.onchange = () => {
    const k = i.dataset.g;
    if (k === 'gym' || k === 'casa') g[k] = [...$('#genBox').querySelectorAll('[data-g="' + k + '"]:checked')].map(x => +x.value);
    else if (k === 'inicio') { if (i.value) g.inicio = i.value; } else g[k] = Math.round(num(i.value)) || GEN0[k];
    store.set('gen', g); renderGen();
  });
}

// ---------- ajustes, exportar e importar ----------
function aplicarTema() { const c = cfg(); document.body.classList.toggle('claro', !!c.claro); document.body.classList.toggle('gym', !!c.gym); }
function datosTodos() {
  const d = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('pc_') === 0) { const v = localStorage.getItem(k); try { d[k] = JSON.parse(v); } catch (e) { d[k] = v; } } }
  return { app: 'plan-cusco', version: 2, exportado: new Date().toISOString(), datos: d };
}
function exportar() {
  const txt = JSON.stringify(datosTodos(), null, 1);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = 'plan-cusco_' + hoyISO() + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importarTexto(txt) {
  let o; try { o = JSON.parse(txt); } catch (e) { alert('El archivo no es un JSON válido.'); return false; }
  if (!o || o.app !== 'plan-cusco' || !o.datos || typeof o.datos !== 'object') { alert('El archivo no corresponde a una exportación de esta aplicación.'); return false; }
  const n = Object.keys(o.datos).filter(k => k.indexOf('pc_') === 0).length;
  if (!confirm('Se reemplazarán los datos actuales por los del archivo (' + n + ' claves, exportado el ' + String(o.exportado || '').slice(0, 10) + '). Antes se guardará una copia de los datos actuales, que podrá restaurar desde Ajustes.')) return false;
  try { localStorage.setItem('pcbak_ultimo', JSON.stringify(datosTodos())); } catch (e) { alert('No se pudo guardar la copia previa; se cancela la importación.'); return false; }
  const viejas = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('pc_') === 0) viejas.push(k); }
  viejas.forEach(k => localStorage.removeItem(k));
  Object.keys(o.datos).forEach(k => { if (k.indexOf('pc_') === 0) localStorage.setItem(k, JSON.stringify(o.datos[k])); });
  location.reload(); return true;
}
function renderAjustes() {
  const c = cfg(), m = metas();
  const bak = localStorage.getItem('pcbak_ultimo');
  $('#ajBox').innerHTML = `
   <div class="card"><h3>Mis metas</h3><p class="small muted">Las define usted, en texto libre.</p>
    ${[['kefir', 'Kéfir diario'], ['azucar', 'Reducción de azúcares'], ['agua', 'Hidratación (por ejemplo, vasos al día)'], ['peso', 'Peso'], ['notas', 'Otras metas']].map(p => `<label class="small muted" style="display:block;margin-top:8px">${p[1]}</label><input class="fi" data-m="${p[0]}" value="${esc(m[p[0]])}" style="width:100%">`).join('')}</div>
   <div class="card" id="ajKcal"><h3>Calorías: rangos definidos por usted</h3><p class="small muted">La aplicación no calcula ni recomienda estos valores; solo compara lo que registre con los rangos que usted escriba. Use valores negativos para el déficit (por ejemplo, de −500 a −300).</p>
    ${[['kcalMin', 'Ingesta diaria mínima (kcal)'], ['kcalMax', 'Ingesta diaria máxima (kcal)'], ['base', 'Gasto base diario sin ejercicio (kcal)'], ['balMin', 'Balance objetivo, desde (kcal)'], ['balMax', 'Balance objetivo, hasta (kcal)']].map(p => `<div class="input"><label>${p[1]}</label><input data-m="${p[0]}" value="${esc(m[p[0]])}"></div>`).join('')}
    <p class="small muted" style="margin-top:10px"><b>Cómo se usa el gasto base:</b> es su gasto diario sin contar el ejercicio. Cada día se le suman las calorías activas que usted copie del reloj, y ese total es el gasto del día. Los pasos se guardan solo como referencia y no se suman aparte, para no contar dos veces la misma actividad.</p></div>
   <div class="card"><h3>Viaje y entrenamiento</h3>
    <div class="input"><label>Fecha de llegada a Cusco</label><input type="date" data-c="viaje" value="${c.viaje}" style="width:150px"></div>
    <div class="input"><label>Fecha de regreso</label><input type="date" data-c="regreso" value="${c.regreso}" style="width:150px"></div>
    <div class="input"><label>Descanso entre series (segundos)</label><input inputmode="numeric" data-c="desc" value="${c.desc}"></div></div>
   <div class="card"><h3>Apariencia</h3>
    <label class="chk"><input type="checkbox" data-c="claro" ${c.claro ? 'checked' : ''}><span class="small">Tema claro (por defecto, tema oscuro)</span></label>
    <label class="chk"><input type="checkbox" data-c="gym" ${c.gym ? 'checked' : ''}><span class="small">Modo gimnasio: botones y campos grandes</span></label></div>
   <div class="card"><h3>Datos</h3><p class="small muted">Los datos se guardan en este navegador (localStorage, claves con prefijo pc_). Exporte con regularidad para tener una copia.</p>
    <button class="btn" id="expBtn">Exportar datos (JSON)</button>
    <button class="btn" id="impBtn" style="background:var(--card2);color:var(--tx);border:1px solid var(--line)">Importar datos (JSON)</button>
    <input type="file" id="impFile" accept=".json,application/json" style="display:none">
    ${bak ? '<button class="btn" id="bakBtn" style="background:var(--card2);color:var(--tx);border:1px solid var(--line)">Restaurar la copia previa a la última importación</button>' : ''}</div>
   <div class="card"><h3>Uso sin conexión e instalación</h3><p class="small">La aplicación funciona sin conexión al abrir <b>index.html</b> directamente. Para instalarla como aplicación, el navegador exige servirla desde una dirección http o https; en ese caso se activa automáticamente la copia sin conexión y aparece la opción «Instalar» del navegador. Estado: <b id="swEstado">${location.protocol.indexOf('http') === 0 ? 'servida por ' + location.protocol.replace(':', '') : 'abierta como archivo local (sin instalación)'}</b>.</p></div>`;
  $('#ajBox').querySelectorAll('[data-m]').forEach(i => i.oninput = () => { const mm = store.get('metas', {}); mm[i.dataset.m] = i.value; store.set('metas', mm); renderHab(); });
  $('#ajBox').querySelectorAll('[data-c]').forEach(i => i.onchange = () => {
    const k = i.dataset.c;
    if (i.type === 'checkbox') setCfg(k, i.checked); else if (k === 'desc') setCfg(k, Math.min(600, Math.max(10, Math.round(num(i.value)) || 90))); else if (i.value) setCfg(k, i.value);
    aplicarTema(); renderCusco(); renderSes();
  });
  $('#expBtn').onclick = exportar;
  $('#impBtn').onclick = () => $('#impFile').click();
  $('#impFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => importarTexto(r.result); r.readAsText(f); };
  const bb = $('#bakBtn'); if (bb) bb.onclick = () => { const t = localStorage.getItem('pcbak_ultimo'); if (t) importarTexto(t); };
}

// ---------- arranque ----------
function renderAll() {
  renderHoy(); renderPlan(); renderRut(); renderHitos(); renderMaleta(); renderProg();
  renderCusco(); renderSes(); renderHab(); renderPeso(); renderGen(); renderAjustes();
  if ($('#progreso').classList.contains('on')) renderProgreso();
}
migrar();
aplicarTema();
renderAll();
showTab(store.get('tab', 'hoy'));
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(() => { });
