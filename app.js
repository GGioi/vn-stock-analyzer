/* VN Stock Analyzer – logic chính */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DCHART = 'https://dchart-api.vndirect.com.vn/dchart/history';
const FINFO = 'https://api-finfo.vndirect.com.vn/v4';
const INDEXES = ['VNINDEX', 'VN30', 'HNX', 'HNX30', 'UPCOM'];
const fmt = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtP = v => fmt(v, 2);
const pct = (v, d = 2) => v == null || isNaN(v) ? '–' : (v >= 0 ? '+' : '') + fmt(v, d) + '%';
const cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : 'nt';
const big = v => { v = Math.abs(v) >= 1e12 ? fmt(v / 1e12, 2) + ' nghìn tỷ' : Math.abs(v) >= 1e9 ? fmt(v / 1e9, 1) + ' tỷ' : fmt(v); return v; };

const S = { sym: 'VNM', tf: 'D', raw: null, bars: null, fund: {}, shares: null, charts: {}, series: {}, lines: [] };

/* ---------------- Tabs ---------------- */
$$('.tabs button').forEach(b => b.onclick = () => {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'tech') resizeCharts();
});

/* ---------------- Dữ liệu ---------------- */
async function loadSymbols() {
  try {
    let list = JSON.parse(sessionStorage.getItem('symlist') || 'null');
    if (!list) {
      const r = await fetch(`${FINFO}/stocks?q=type:STOCK~status:LISTED&fields=code&size=3000`).then(r => r.json());
      list = r.data.map(d => d.code).sort();
      sessionStorage.setItem('symlist', JSON.stringify(list));
    }
    $('#symList').innerHTML = [...INDEXES, ...list].map(c => `<option value="${c}">`).join('');
  } catch (e) { $('#symList').innerHTML = INDEXES.map(c => `<option value="${c}">`).join(''); }
}

async function fetchBars(sym) {
  const to = Math.floor(Date.now() / 1000), from = to - 86400 * 365 * 6;
  const r = await fetch(`${DCHART}?symbol=${encodeURIComponent(sym)}&resolution=D&from=${from}&to=${to}`);
  const j = await r.json();
  if (j.s !== 'ok' || !j.t || !j.t.length) throw new Error('Không tìm thấy dữ liệu cho mã ' + sym);
  const isIdx = INDEXES.includes(sym), k = isIdx ? 1 : 1000; // giá cổ phiếu trả về đơn vị nghìn đồng
  return j.t.map((t, i) => ({ t, o: j.o[i] * k, h: j.h[i] * k, l: j.l[i] * k, c: j.c[i] * k, v: j.v[i] }))
    .filter(b => b.c > 0 && b.h > 0 && b.l > 0);
}

function aggregate(bars, tf) {
  if (tf === 'D') return bars;
  const out = []; let cur = null, key = null;
  for (const b of bars) {
    const d = new Date(b.t * 1000);
    let k;
    if (tf === 'M') k = d.getUTCFullYear() * 100 + d.getUTCMonth();
    else { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day); k = +t; }
    if (k !== key) { cur = { ...b }; out.push(cur); key = k; }
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
  }
  return out;
}

async function fetchFund(sym) {
  const codes = '51006,51012,51035,51004,53007,52002,52001,51001,51002,51007,51011,52005,53006,51003';
  const r = await fetch(`${FINFO}/ratios/latest?order=reportDate&where=code:${sym}&fields=itemCode,itemName,value,reportDate&size=100&filter=itemCode:${codes}`).then(r => r.json());
  const m = {}; (r.data || []).forEach(d => m[d.itemCode] = d.value); return m;
}

/* ---------------- Charts ---------------- */
function mkChart(id, opts = {}) {
  const el = $(id), dark = !matchMedia('(prefers-color-scheme: light)').matches;
  const ch = LightweightCharts.createChart(el, {
    layout: { background: { color: 'transparent' }, textColor: dark ? '#9fb0cf' : '#44506b' },
    grid: { vertLines: { color: dark ? '#1f2a44' : '#e5e9f3' }, horzLines: { color: dark ? '#1f2a44' : '#e5e9f3' } },
    rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: false },
    crosshair: { mode: 0 }, ...opts
  });
  return ch;
}
function initCharts() {
  const c = S.charts;
  c.main = mkChart('#chMain'); c.rsi = mkChart('#chRSI'); c.macd = mkChart('#chMACD'); c.sto = mkChart('#chSTO');
  const sr = S.series, UP = '#16c784', DN = '#ea3943';
  sr.candle = c.main.addCandlestickSeries({ upColor: UP, downColor: DN, borderVisible: false, wickUpColor: UP, wickDownColor: DN });
  sr.vol = c.main.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
  c.main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
  const ln = (ch, color, w = 1) => ch.addLineSeries({ color, lineWidth: w, lastValueVisible: false, priceLineVisible: false });
  sr.ma20 = ln(c.main, '#f5a524'); sr.ma50 = ln(c.main, '#3b82f6'); sr.ma200 = ln(c.main, '#a855f7', 2);
  sr.bbU = ln(c.main, '#94a3b8'); sr.bbM = ln(c.main, '#64748b'); sr.bbL = ln(c.main, '#94a3b8');
  sr.tk = ln(c.main, '#06b6d4'); sr.kj = ln(c.main, '#ef4444'); sr.sa = ln(c.main, '#16c78488'); sr.sb = ln(c.main, '#ea394388');
  sr.rsi = ln(c.rsi, '#a855f7', 2); sr.rsi70 = ln(c.rsi, '#ea394388'); sr.rsi30 = ln(c.rsi, '#16c78488');
  sr.hist = c.macd.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
  sr.macd = ln(c.macd, '#3b82f6'); sr.sig = ln(c.macd, '#f5a524');
  sr.k = ln(c.sto, '#3b82f6'); sr.d = ln(c.sto, '#f5a524'); sr.s80 = ln(c.sto, '#ea394388'); sr.s20 = ln(c.sto, '#16c78488');
  let busy = false;
  const all = [c.main, c.rsi, c.macd, c.sto];
  all.forEach(a => a.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (busy || !r) return; busy = true; all.forEach(b => b !== a && b.timeScale().setVisibleLogicalRange(r)); busy = false;
  }));
  ['oMA', 'oBB', 'oIch', 'oFib', 'oSR'].forEach(id => $('#' + id).onchange = applyOverlays);
  addEventListener('resize', resizeCharts);
}
function resizeCharts() {
  for (const [k, id] of [['main', '#chMain'], ['rsi', '#chRSI'], ['macd', '#chMACD'], ['sto', '#chSTO']]) {
    const el = $(id); S.charts[k] && S.charts[k].applyOptions({ width: el.clientWidth, height: el.clientHeight });
  }
}
function applyOverlays() {
  const sr = S.series, on = id => $('#' + id).checked;
  ['ma20', 'ma50', 'ma200'].forEach(k => sr[k].applyOptions({ visible: on('oMA') }));
  ['bbU', 'bbM', 'bbL'].forEach(k => sr[k].applyOptions({ visible: on('oBB') }));
  ['tk', 'kj', 'sa', 'sb'].forEach(k => sr[k].applyOptions({ visible: on('oIch') }));
  S.lines.forEach(l => sr.candle.removePriceLine(l)); S.lines = [];
  const A = S.analysis; if (!A) return;
  const add = (price, color, title, style = 2) => S.lines.push(sr.candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
  if (on('oFib')) A.fib.levels.forEach(l => add(l.p, '#eab308', 'Fib ' + (l.r * 100).toFixed(1) + '%', 3));
  if (on('oSR')) { A.lv.res.forEach(x => add(x.p, '#ea3943', 'KC')); A.lv.sup.forEach(x => add(x.p, '#16c784', 'HT')); }
}

const toSeries = (bars, arr) => bars.map((b, i) => isNaN(arr[i]) ? { time: b.time } : { time: b.time, value: arr[i] });

/* ---------------- Phân tích ---------------- */
function analyze(bars) {
  const o = bars.map(b => b.o), h = bars.map(b => b.h), l = bars.map(b => b.l), c = bars.map(b => b.c), v = bars.map(b => b.v);
  const A = { o, h, l, c, v };
  A.sma = {}; A.ema = {};
  [5, 10, 20, 50, 100, 200].forEach(p => { A.sma[p] = IND.sma(c, p); A.ema[p] = IND.ema(c, p); });
  A.rsi = IND.rsi(c, 14); A.macd = IND.macd(c); A.sto = IND.stoch(h, l, c);
  A.bb = IND.bb(c); A.atr = IND.atr(h, l, c); A.adx = IND.adx(h, l, c);
  A.cci = IND.cci(h, l, c); A.wr = IND.willr(h, l, c); A.roc = IND.roc(c);
  A.obv = IND.obv(c, v); A.obvMa = IND.sma(A.obv, 20); A.mfi = IND.mfi(h, l, c, v);
  A.ich = IND.ichimoku(h, l, c); A.vma20 = IND.sma(v, 20);
  A.pivot = IND.pivots(h, l, c);
  A.fib = IND.fib(h, l, Math.min(120, c.length));
  const price = IND.last(c);
  A.lv = IND.levels(h, l, price);
  A.patterns = IND.patterns(o, h, l, c);
  A.signals = buildSignals(A, price);
  return A;
}

function buildSignals(A, price) {
  const L = a => IND.last(a), rows = []; // {g: nhóm, n, val, s: 1/-1/0}
  const add = (g, n, val, s) => rows.push({ g, n, val, s });
  [5, 10, 20, 50, 100, 200].forEach(p => {
    const s = L(A.sma[p]), e = L(A.ema[p]);
    if (!isNaN(s)) add('Xu hướng', `SMA ${p}`, fmtP(s), price > s ? 1 : -1);
    if (!isNaN(e)) add('Xu hướng', `EMA ${p}`, fmtP(e), price > e ? 1 : -1);
  });
  const ic = A.ich, sa = L(ic.spanA), sb = L(ic.spanB);
  if (!isNaN(sa) && !isNaN(sb)) add('Xu hướng', 'Ichimoku (mây)', `${fmt(Math.min(sa, sb))}–${fmt(Math.max(sa, sb))}`, price > Math.max(sa, sb) ? 1 : price < Math.min(sa, sb) ? -1 : 0);
  const ad = L(A.adx.adx), pdi = L(A.adx.pdi), mdi = L(A.adx.mdi);
  if (!isNaN(ad)) add('Xu hướng', 'ADX (14)', `${fmt(ad, 1)} (+DI ${fmt(pdi, 1)} / −DI ${fmt(mdi, 1)})`, ad > 20 ? (pdi > mdi ? 1 : -1) : 0);
  const m = L(A.macd.line), sg = L(A.macd.signal);
  if (!isNaN(sg)) add('Động lượng', 'MACD (12,26,9)', `${fmt(m, 2)} / ${fmt(sg, 2)}`, m > sg ? 1 : -1);
  const r = L(A.rsi); if (!isNaN(r)) add('Động lượng', 'RSI (14)', fmt(r, 1), r < 30 ? 1 : r > 70 ? -1 : r > 50 ? 0.5 : -0.5);
  const k = L(A.sto.K), d = L(A.sto.D); if (!isNaN(d)) add('Động lượng', 'Stochastic %K/%D', `${fmt(k, 1)} / ${fmt(d, 1)}`, k < 20 ? 1 : k > 80 ? -1 : k > d ? 0.5 : -0.5);
  const cc = L(A.cci); if (!isNaN(cc)) add('Động lượng', 'CCI (20)', fmt(cc, 1), cc < -100 ? 1 : cc > 100 ? -1 : 0);
  const w = L(A.wr); if (!isNaN(w)) add('Động lượng', 'Williams %R (14)', fmt(w, 1), w < -80 ? 1 : w > -20 ? -1 : 0);
  const ro = L(A.roc); if (!isNaN(ro)) add('Động lượng', 'ROC (12)', fmt(ro, 2) + '%', ro > 0 ? 1 : -1);
  const mf = L(A.mfi); if (!isNaN(mf)) add('Khối lượng', 'MFI (14)', fmt(mf, 1), mf < 20 ? 1 : mf > 80 ? -1 : 0);
  const ob = L(A.obv), om = L(A.obvMa); if (!isNaN(om)) add('Khối lượng', 'OBV vs SMA20', fmt(ob), ob > om ? 1 : -1);
  const bu = L(A.bb.up), bl = L(A.bb.lo); if (!isNaN(bu)) add('Biến động', 'Bollinger (20,2)', `${fmt(bl)}–${fmt(bu)}`, price < bl ? 1 : price > bu ? -1 : 0);
  const at = L(A.atr); if (!isNaN(at)) add('Biến động', 'ATR (14)', `${fmt(at)} (${fmt(at / price * 100, 2)}%)`, 0);
  return rows;
}

const label = s => s >= 0.75 ? ['Mua', 'up'] : s <= -0.75 ? ['Bán', 'dn'] : s > 0 ? ['Nghiêng mua', 'up'] : s < 0 ? ['Nghiêng bán', 'dn'] : ['Trung lập', 'nt'];

function renderAnalysis(A, bars) {
  const price = IND.last(A.c), prev = A.c[A.c.length - 2];
  const sig = A.signals.filter(r => r.n !== 'ATR (14)');
  const buy = sig.filter(r => r.s > 0).length, sell = sig.filter(r => r.s < 0).length, neu = sig.length - buy - sell;
  const score = sig.reduce((a, r) => a + r.s, 0) / sig.length; // -1..1
  const verdict = score > .5 ? ['MUA MẠNH', 'up'] : score > .15 ? ['MUA', 'up'] : score < -.5 ? ['BÁN MẠNH', 'dn'] : score < -.15 ? ['BÁN', 'dn'] : ['TRUNG LẬP', 'nt'];
  $('#summaryCard').innerHTML = `<h3>Tổng hợp tín hiệu (${S.tf === 'D' ? 'Ngày' : S.tf === 'W' ? 'Tuần' : 'Tháng'})</h3>
    <div class="gauge"><div class="big ${verdict[1]}">${verdict[0]}</div>
    <div class="bar"><i style="width:${buy / sig.length * 100}%;background:var(--up)"></i><i style="width:${neu / sig.length * 100}%;background:var(--warn)"></i><i style="width:${sell / sig.length * 100}%;background:var(--dn)"></i></div>
    <div class="muted"><span class="up">${buy} Mua</span> · <span class="nt">${neu} Trung lập</span> · <span class="dn">${sell} Bán</span> / ${sig.length} chỉ báo</div></div>`;
  const P = A.pivot;
  $('#levelsCard').innerHTML = `<h3>Hỗ trợ – Kháng cự</h3>
    ${A.lv.res.slice().reverse().map(x => `<div class="row"><span class="dn">Kháng cự (${x.n} lần chạm)</span><b>${fmt(x.p)}</b></div>`).join('')}
    <div class="row"><span>Giá hiện tại</span><b>${fmt(price)}</b></div>
    ${A.lv.sup.map(x => `<div class="row"><span class="up">Hỗ trợ (${x.n} lần chạm)</span><b>${fmt(x.p)}</b></div>`).join('')}
    <h3 style="margin-top:12px">Pivot Points</h3>
    ${[['R3', P.R3], ['R2', P.R2], ['R1', P.R1], ['Pivot', P.P], ['S1', P.S1], ['S2', P.S2], ['S3', P.S3]].map(([n, p]) => `<div class="row"><span>${n}</span><b>${fmt(p)}</b></div>`).join('')}`;
  $('#patternCard').innerHTML = `<h3>Mẫu hình nến gần nhất</h3>` + (A.patterns.length ? A.patterns.map(p =>
    `<div class="row"><span><span class="tag ${p.s > 0 ? 'up' : p.s < 0 ? 'dn' : 'nt'}">${p.s > 0 ? 'Tăng' : p.s < 0 ? 'Giảm' : 'Trung lập'}</span> ${p.n}</span></div><div class="muted" style="font-size:12px">${p.d}</div>`).join('') : '<p class="muted">Không phát hiện mẫu hình nổi bật.</p>');

  let g = '';
  $('#indTable').innerHTML = `<table><thead><tr><th>Nhóm</th><th>Chỉ báo</th><th>Giá trị</th><th>Tín hiệu</th></tr></thead><tbody>${A.signals.map(r => {
    const [t, c] = r.n === 'ATR (14)' ? ['Biến động', 'nt'] : label(r.s); const gg = r.g === g ? '' : r.g; g = r.g;
    return `<tr><td class="muted">${gg}</td><td>${r.n}</td><td>${r.val}</td><td><span class="tag ${c}">${t}</span></td></tr>`;
  }).join('')}</tbody></table>`;
  $('#commentCard').innerHTML = '<h3>Nhận định tự động</h3>' + commentary(A, price, score, verdict);
}

function commentary(A, price, score, verdict) {
  const L = a => IND.last(a), p = [];
  const s20 = L(A.sma[20]), s50 = L(A.sma[50]), s200 = L(A.sma[200]);
  let trend;
  if (price > s20 && s20 > s50 && s50 > (s200 || 0)) trend = 'Xu hướng <b class="up">tăng mạnh</b>: giá nằm trên MA20 > MA50 > MA200.';
  else if (price < s20 && s20 < s50 && s50 < (s200 || 1e18)) trend = 'Xu hướng <b class="dn">giảm mạnh</b>: giá nằm dưới MA20 < MA50 < MA200.';
  else if (price > s50) trend = 'Xu hướng trung hạn <b class="up">tích cực</b> (giá trên MA50) nhưng chưa thật sự đồng pha giữa các đường MA.';
  else trend = 'Xu hướng trung hạn <b class="dn">yếu</b> (giá dưới MA50), cần tín hiệu lấy lại MA50 để cải thiện.';
  p.push(trend);
  const r = L(A.rsi), m = L(A.macd.line), sg = L(A.macd.signal);
  p.push(`Động lượng: RSI ${fmt(r, 1)} ${r > 70 ? '(quá mua – rủi ro điều chỉnh)' : r < 30 ? '(quá bán – có thể hồi kỹ thuật)' : '(vùng trung tính)'}; MACD ${m > sg ? '<span class="up">cắt lên đường tín hiệu</span>' : '<span class="dn">nằm dưới đường tín hiệu</span>'}.`);
  const vr = A.v[A.v.length - 1] / L(A.vma20);
  p.push(`Khối lượng phiên gần nhất bằng ${fmt(vr, 2)} lần trung bình 20 phiên${vr > 1.5 ? ' – dòng tiền tham gia mạnh' : vr < 0.7 ? ' – thanh khoản thấp' : ''}.`);
  const bw = (L(A.bb.up) - L(A.bb.lo)) / L(A.bb.mid) * 100;
  p.push(`Biên độ Bollinger ${fmt(bw, 1)}% – ${bw < 8 ? 'thu hẹp, thường báo hiệu biến động mạnh sắp tới' : 'biến động bình thường'}. ATR ≈ ${fmt(L(A.atr))} đồng/phiên.`);
  const sup = A.lv.sup[0], res = A.lv.res[0];
  p.push(`Vùng quan trọng: ${sup ? `hỗ trợ gần <b>${fmt(sup.p)}</b>` : 'chưa xác định hỗ trợ'}${res ? `, kháng cự gần <b>${fmt(res.p)}</b>` : ''}. Cắt lỗ tham khảo theo ATR: <b>${fmt(price - 2 * L(A.atr))}</b>.`);
  p.push(`<b>Kết luận kỹ thuật:</b> <span class="${verdict[1]}">${verdict[0]}</span> (điểm tổng hợp ${fmt(score * 100, 0)}/100).`);
  return p.map(x => `<p style="margin:6px 0">• ${x}</p>`).join('') + '<p class="muted" style="font-size:12px">Nhận định tự động từ chỉ báo, không phải khuyến nghị đầu tư.</p>';
}

function renderFund() {
  const f = S.fund, p = IND.last(S.raw).c;
  const items = [
    ['Vốn hóa', f['51003'] ? big(f['51003']) : f['51004'] ? big(f['51004'] * p) : '–'],
    ['EPS 4 quý', fmt(f['53007']) + ' đ'], ['BVPS', fmt(f['51035']) + ' đ'],
    ['P/E', fmt(f['51006'], 2)], ['P/B', fmt(f['51012'], 2)], ['P/S', fmt(f['51011'], 2)],
    ['ROE', f['52002'] != null ? fmt(f['52002'] * 100, 2) + '%' : '–'], ['ROA', f['52001'] != null ? fmt(f['52001'] * 100, 2) + '%' : '–'],
    ['Biên LN gộp', f['53006'] != null ? fmt(f['53006'] * 100, 1) + '%' : '–'], ['Tăng trưởng LNST 4Q', f['52005'] != null ? pct(f['52005'] * 100, 1) : '–'],
    ['Beta', fmt(f['51007'], 2)], ['Cao/Thấp 52 tuần', `${fmt(f['51001'])} / ${fmt(f['51002'])}`], ['SL cổ phiếu', f['51004'] ? big(f['51004']) : '–']
  ];
  $('#fundBox').innerHTML = Object.keys(f).length ? items.map(([k, v]) => `<div class="kpi"><small>${k}</small><b>${v}</b></div>`).join('') : '<p class="muted">Không có dữ liệu cơ bản (chỉ số / mã không hỗ trợ).</p>';
}

function renderTicker() {
  const b = S.raw, last = b[b.length - 1], prev = b[b.length - 2] || last, ch = last.c - prev.c;
  const d = new Date(last.t * 1000).toLocaleDateString('vi-VN', { timeZone: 'UTC' });
  $('#ticker').innerHTML = `<div class="m"><span class="sym">${S.sym}</span><small>Cập nhật ${d}</small></div>
    <div class="m"><span class="px ${cls(ch)}">${fmt(last.c, INDEXES.includes(S.sym) ? 2 : 0)}</span><small class="${cls(ch)}">${ch >= 0 ? '▲' : '▼'} ${fmt(Math.abs(ch), INDEXES.includes(S.sym) ? 2 : 0)} (${pct(ch / prev.c * 100)})</small></div>
    <div class="m"><b>${fmt(last.o)} / ${fmt(last.h)} / ${fmt(last.l)}</b><small>Mở / Cao / Thấp</small></div>
    <div class="m"><b>${fmt(last.v)}</b><small>Khối lượng</small></div>`;
}

function renderCharts() {
  const raw = S.raw, bars = aggregate(raw, S.tf).map(b => ({ ...b, time: new Date(b.t * 1000).toISOString().slice(0, 10) }));
  S.bars = bars;
  const A = S.analysis = analyze(bars), sr = S.series;
  sr.candle.setData(bars.map(b => ({ time: b.time, open: b.o, high: b.h, low: b.l, close: b.c })));
  sr.vol.setData(bars.map(b => ({ time: b.time, value: b.v, color: b.c >= b.o ? '#16c78455' : '#ea394355' })));
  sr.ma20.setData(toSeries(bars, A.sma[20])); sr.ma50.setData(toSeries(bars, A.sma[50])); sr.ma200.setData(toSeries(bars, A.sma[200]));
  sr.bbU.setData(toSeries(bars, A.bb.up)); sr.bbM.setData(toSeries(bars, A.bb.mid)); sr.bbL.setData(toSeries(bars, A.bb.lo));
  sr.tk.setData(toSeries(bars, A.ich.tenkan)); sr.kj.setData(toSeries(bars, A.ich.kijun)); sr.sa.setData(toSeries(bars, A.ich.spanA)); sr.sb.setData(toSeries(bars, A.ich.spanB));
  const flat = n => bars.map(b => ({ time: b.time, value: n }));
  sr.rsi.setData(toSeries(bars, A.rsi)); sr.rsi70.setData(flat(70)); sr.rsi30.setData(flat(30));
  sr.hist.setData(bars.map((b, i) => isNaN(A.macd.hist[i]) ? { time: b.time } : { time: b.time, value: A.macd.hist[i], color: A.macd.hist[i] >= 0 ? '#16c78499' : '#ea394399' }));
  sr.macd.setData(toSeries(bars, A.macd.line)); sr.sig.setData(toSeries(bars, A.macd.signal));
  sr.k.setData(toSeries(bars, A.sto.K)); sr.d.setData(toSeries(bars, A.sto.D)); sr.s80.setData(flat(80)); sr.s20.setData(flat(20));
  applyOverlays(); renderAnalysis(A, bars);
  const n = bars.length, from = Math.max(0, n - (S.tf === 'D' ? 130 : S.tf === 'W' ? 104 : 60));
  S.charts.main.timeScale().setVisibleLogicalRange({ from, to: n + 3 });
  resizeCharts();
}

async function load(sym) {
  sym = (sym || '').trim().toUpperCase(); if (!sym) return;
  $('#ticker').innerHTML = '<span class="muted">Đang tải ' + sym + '…</span>';
  try {
    S.raw = await fetchBars(sym); S.sym = sym; S.fund = {};
    renderTicker(); renderCharts();
    S.fund = INDEXES.includes(sym) ? {} : await fetchFund(sym).catch(() => ({}));
    S.shares = S.fund['51004'] || null; renderFund(); fillValuation();
    history.replaceState(null, '', '#' + sym);
  } catch (e) { $('#ticker').innerHTML = `<span class="err">${e.message}</span>`; }
}

/* ---------------- Giá trị nội tại ---------------- */
function fillValuation(over = {}) {
  const f = S.fund, p = S.raw ? IND.last(S.raw).c : null;
  const set = (id, v) => { if (v != null && !isNaN(v)) $('#' + id).value = Math.round(v * 100) / 100; };
  set('v_price', p);
  set('v_eps', over.eps ?? f['53007']); set('v_bvps', over.bvps ?? f['51035']);
  set('v_roe', over.roe ?? (f['52002'] != null ? f['52002'] * 100 : null));
  if (over.g != null) set('v_g1', over.g); else if (f['52005'] != null) set('v_g1', Math.max(0, Math.min(25, f['52005'] * 100)));
  if (f['51006'] && !over.pe) set('v_pe', Math.max(6, Math.min(20, f['51006'])));
  $('#valSrc').textContent = over.src ? '· từ báo cáo PDF' : `· ${S.sym} từ VNDirect`;
  calcValuation();
}
const numv = id => parseFloat($('#' + id).value);
function calcValuation() {
  const price = numv('v_price'), eps = numv('v_eps'), bv = numv('v_bvps'), roe = numv('v_roe') / 100,
    g1 = numv('v_g1') / 100, n = Math.max(1, numv('v_n') | 0), gt = numv('v_gt') / 100, r = numv('v_r') / 100,
    conv = numv('v_conv') / 100, pe = numv('v_pe'), y = numv('v_y') / 100, mos = numv('v_mos') / 100;
  const res = [];
  if (eps > 0 && r > gt) {
    let pv = 0, e = eps; for (let t = 1; t <= n; t++) { e *= 1 + g1; pv += e * conv / (1 + r) ** t; }
    const tv = e * (1 + gt) * conv / (r - gt) / (1 + r) ** n; res.push(['DCF – FCFE 2 giai đoạn', pv + tv, `${n} năm tăng trưởng ${fmt(g1 * 100, 1)}%, sau đó ${fmt(gt * 100, 1)}%`]);
  }
  if (eps > 0 && bv > 0) res.push(['Graham Number', Math.sqrt(22.5 * eps * bv), '√(22,5 × EPS × BVPS)']);
  if (eps > 0 && y > 0) res.push(['Công thức tăng trưởng Graham', eps * (8.5 + 2 * Math.min(g1 * 100, 8)) * 4.4 / Math.max(y * 100, 6), 'EPS×(8,5+2g)×4,4/Y (g≤8%, Y≥6%)']);
  if (eps > 0 && pe > 0) res.push(['P/E mục tiêu', eps * (1 + g1) * pe, `EPS dự phóng × ${fmt(pe, 1)}x`]);
  if (bv > 0 && roe > 0 && r > gt) res.push(['P/B hợp lý (ROE)', Math.max(0, (roe - gt) / (r - gt)) * bv, `(ROE−g)/(r−g) = ${fmt((roe - gt) / (r - gt), 2)}x BVPS`]);
  const box = $('#valResult');
  if (!res.length) { box.innerHTML = '<h3>Kết quả</h3><p class="muted">Cần EPS &gt; 0 (hoặc BVPS/ROE) để định giá. Với doanh nghiệp lỗ, hãy dùng giá trị sổ sách.</p>'; return; }
  const vals = res.map(x => x[1]).sort((a, b) => a - b), med = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length, iv = (med + avg) / 2; // kết hợp trung vị & trung bình để giảm nhiễu
  const maxV = Math.max(...vals, price, iv) * 1.05, buy = iv * (1 - mos), up = (iv / price - 1) * 100;
  const verdict = price <= buy ? ['ĐỊNH GIÁ THẤP – có biên an toàn', 'up'] : price <= iv ? ['HẤP DẪN / HỢP LÝ', 'up'] : price <= iv * 1.15 ? ['HƠI ĐẮT', 'nt'] : ['ĐỊNH GIÁ CAO', 'dn'];
  const bar = (name, v, sub) => `<div><div class="row" style="border:none"><span>${name} <span class="muted" style="font-size:12px">${sub || ''}</span></span><b class="${v >= price ? 'up' : 'dn'}">${fmt(v)} đ (${pct((v / price - 1) * 100, 1)})</b></div>
    <div class="vbar"><span style="width:${v / maxV * 100}%"></span><i class="pm" style="left:${price / maxV * 100}%"></i></div></div>`;
  box.innerHTML = `<h3>Giá trị nội tại ước tính – ${S.sym}</h3>
    <div class="kpis"><div class="kpi"><small>Giá trị nội tại</small><b class="${up >= 0 ? 'up' : 'dn'}">${fmt(iv)} đ</b></div>
    <div class="kpi"><small>Giá thị trường</small><b>${fmt(price)} đ</b></div>
    <div class="kpi"><small>Upside / Downside</small><b class="${cls(up)}">${pct(up, 1)}</b></div>
    <div class="kpi"><small>Giá mua an toàn (−${fmt(mos * 100, 0)}%)</small><b>${fmt(buy)} đ</b></div></div>
    <div class="verdict ${verdict[1]}">${verdict[0]}</div>
    ${res.map(x => bar(x[0], x[1], x[2])).join('')}
    <p class="muted" style="font-size:12px">Vạch vàng = giá thị trường. Giá trị nội tại = trung bình của (trung vị, trung bình) các mô hình. Kết quả rất nhạy với giả định – hãy kiểm tra lại EPS, tăng trưởng và chi phí vốn.</p>`;
}
$('#valCalc').onclick = calcValuation;
$$('#valForm input').forEach(i => i.addEventListener('change', calcValuation));

/* ---------------- PDF ---------------- */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const drop = $('#drop');
['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('hover'); }));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('hover'); }));
drop.addEventListener('drop', ev => ev.dataTransfer.files[0] && handlePdf(ev.dataTransfer.files[0]));
$('#pdfFile').onchange = ev => ev.target.files[0] && handlePdf(ev.target.files[0]);

async function extractLines(file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, lines = [];
  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const tc = await (await pdf.getPage(pn)).getTextContent(), rows = [];
    for (const it of tc.items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3), row = rows.find(r => Math.abs(r.y - y) <= 1);
      if (row) row.items.push(it); else rows.push({ y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y).forEach(r => lines.push(r.items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').normalize('NFC').replace(/\s+/g, ' ').trim()));
  }
  return { lines, pages: pdf.numPages };
}
function parseNums(s) {
  const out = [], re = /\(?-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?\)?|\(?-?\d{4,}\)?/g;
  for (const m of s.match(re) || []) {
    const neg = m.startsWith('(') || m.startsWith('-'), clean = m.replace(/[()\-]/g, '');
    let v;
    if (/^\d{1,3}([.,]\d{3})+$/.test(clean)) v = parseFloat(clean.replace(/[.,]/g, ''));
    else v = parseFloat(clean.replace(/[.,]/g, ''));
    out.push(neg ? -v : v);
  }
  return out;
}
const FIELDS = [
  ['rev', 'Doanh thu thuần', /^(\d+\.?\s*)?doanh thu (thuần )?(về )?(bán hàng|hoạt động|thuần)/i, 'pl'],
  ['gross', 'Lợi nhuận gộp', /lợi nhuận gộp/i, 'pl'],
  ['ebit', 'LN thuần từ HĐKD', /lợi nhuận thuần từ hoạt động kinh doanh|lợi nhuận từ hoạt động kinh doanh/i, 'pl'],
  ['pbt', 'LN trước thuế', /tổng lợi nhuận kế toán trước thuế|lợi nhuận trước thuế/i, 'pl'],
  ['np', 'LN sau thuế', /lợi nhuận sau thuế thu nhập doanh nghiệp|^\d*\.?\s*lợi nhuận sau thuế/i, 'pl'],
  ['npParent', 'LNST công ty mẹ', /(lợi nhuận sau thuế|lợi nhuận).*(của )?(công ty mẹ|cổ đông công ty mẹ|chủ sở hữu công ty mẹ)/i, 'pl'],
  ['assets', 'Tổng tài sản', /tổng cộng tài sản|tổng tài sản/i, 'bs'],
  ['liab', 'Nợ phải trả', /^(c\s*[-–.]\s*)?nợ phải trả/i, 'bs'],
  ['equity', 'Vốn chủ sở hữu', /^(d\s*[-–.]\s*)?vốn chủ sở hữu|^\d*\.?\s*vốn chủ sở hữu/i, 'bs'],
  ['cfo', 'Dòng tiền từ HĐKD', /lưu chuyển tiền (thuần )?từ hoạt động kinh doanh/i, 'cf'],
];
function extractFields(lines) {
  const res = {};
  for (const [key, name, re] of FIELDS) {
    for (const ln of lines) {
      if (!re.test(ln)) continue;
      const nums = parseNums(ln);
      if (nums.length) { res[key] = { name, cur: nums[0], prev: nums.length > 1 ? nums[1] : null, line: ln }; break; }
    }
  }
  return res;
}
let PDFDATA = null;
async function handlePdf(file) {
  const out = $('#pdfOut'); out.innerHTML = `<div class="card"><p>Đang đọc <b>${file.name}</b>…</p></div>`;
  try {
    const { lines, pages } = await extractLines(file);
    if (lines.join('').length < 200) { out.innerHTML = '<div class="card err">PDF có vẻ là ảnh scan, không đọc được chữ. Hãy dùng bản PDF dạng văn bản hoặc OCR trước.</div>'; return; }
    const full = lines.join('\n'), u = full.match(/đơn vị tính[:\s]*([^\n]{0,30})/i), ut = (u ? u[1] : full.slice(0, 3000)).toLowerCase();
    $('#p_unit').value = /tỷ đồng|tỉ đồng/.test(ut) ? '1e9' : /triệu/.test(ut) ? '1e6' : /nghìn|ngàn/.test(ut) ? '1e3' : '1';
    if (/quý|quarter/i.test(full.slice(0, 1500)) && !/năm\s*20\d\d\s*\n?.*kiểm toán/i.test(full.slice(0, 500))) $('#p_period').value = /quý\s*(i{1,3}|iv|[1-4])/i.test(full.slice(0, 2500)) ? '4' : '1';
    const m = file.name.match(/\b([A-Z]{3})\b/); if (m && !$('#p_shares').value && S.shares) $('#p_shares').value = S.shares;
    PDFDATA = { file: file.name, pages, fields: extractFields(lines) };
    renderPdf();
  } catch (e) { out.innerHTML = `<div class="card err">Lỗi đọc PDF: ${e.message}</div>`; }
}
['p_period', 'p_unit', 'p_shares'].forEach(id => $('#' + id).addEventListener('change', () => PDFDATA && renderPdf()));

function renderPdf() {
  const F = PDFDATA.fields, out = $('#pdfOut');
  const unit = parseFloat($('#p_unit').value), ann = parseFloat($('#p_period').value);
  if (!$('#p_shares').value && S.shares) $('#p_shares').value = S.shares;
  const rows = FIELDS.map(([k, name]) => {
    const f = F[k]; return `<tr><td>${name}</td>
      <td class="r"><input class="edit" data-k="${k}" data-f="cur" value="${f ? f.cur : ''}"></td>
      <td class="r"><input class="edit" data-k="${k}" data-f="prev" value="${f && f.prev != null ? f.prev : ''}"></td>
      <td class="r" id="yoy_${k}">–</td><td class="muted" style="font-size:11px;max-width:260px;overflow:hidden;text-overflow:ellipsis">${f ? f.line.slice(0, 60) : 'không tìm thấy'}</td></tr>`;
  }).join('');
  out.innerHTML = `<div class="card"><h3>Dữ liệu trích xuất từ <i>${PDFDATA.file}</i> (${PDFDATA.pages} trang)</h3>
    <p class="muted">Kiểm tra &amp; chỉnh số liệu nếu cần (giá trị theo đơn vị trong báo cáo). “Kỳ này” = cột đầu, “Kỳ trước” = cột kế tiếp (cùng kỳ năm trước với KQKD; đầu năm với bảng CĐKT).</p>
    <div class="tablewrap"><table><thead><tr><th>Chỉ tiêu</th><th class="r">Kỳ này</th><th class="r">Kỳ trước</th><th class="r">Tăng trưởng</th><th>Dòng gốc</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="card"><h3>Phân tích tài chính</h3><div id="pdfAnalysis"></div></div>`;
  $$('#pdfOut input.edit').forEach(i => i.onchange = () => {
    const k = i.dataset.k; F[k] = F[k] || { name: k, cur: null, prev: null, line: 'nhập tay' };
    F[k][i.dataset.f] = i.value === '' ? null : parseFloat(i.value); analyzeFin(unit, ann);
  });
  analyzeFin(unit, ann);
}

function analyzeFin(unit, ann) {
  const F = PDFDATA.fields, v = k => F[k] && F[k].cur != null ? F[k].cur : null, pv = k => F[k] && F[k].prev != null ? F[k].prev : null;
  FIELDS.forEach(([k]) => { const c = v(k), p = pv(k), el = $('#yoy_' + k); if (el) el.innerHTML = c != null && p ? `<span class="${cls(c - p)}">${pct((c - p) / Math.abs(p) * 100, 1)}</span>` : '–'; });
  const np = v('npParent') ?? v('np'), npP = pv('npParent') ?? pv('np');
  const eq = v('equity'), as = v('assets'), li = v('liab') ?? (as && eq ? as - eq : null), rev = v('rev');
  const shares = parseFloat($('#p_shares').value) || null, K = [];
  const kpi = (n, val, c = '') => K.push(`<div class="kpi"><small>${n}</small><b class="${c}">${val}</b></div>`);
  const notes = [];
  if (rev != null && v('gross') != null) kpi('Biên LN gộp', fmt(v('gross') / rev * 100, 1) + '%');
  if (rev != null && v('ebit') != null) kpi('Biên LN hoạt động', fmt(v('ebit') / rev * 100, 1) + '%');
  const nm = rev && np != null ? np / rev * 100 : null; if (nm != null) kpi('Biên LN ròng', fmt(nm, 1) + '%', cls(nm));
  const roe = np != null && eq ? np * ann / eq * 100 : null, roa = np != null && as ? np * ann / as * 100 : null;
  if (roe != null) kpi(`ROE (quy năm ×${ann})`, fmt(roe, 1) + '%', roe >= 15 ? 'up' : roe < 8 ? 'dn' : 'nt');
  if (roa != null) kpi('ROA (quy năm)', fmt(roa, 1) + '%', roa >= 7 ? 'up' : roa < 2 ? 'dn' : 'nt');
  const de = li != null && eq ? li / eq : null; if (de != null) kpi('Nợ/Vốn chủ (D/E)', fmt(de, 2) + 'x', de > 2 ? 'dn' : de < 1 ? 'up' : 'nt');
  if (as && eq) kpi('Đòn bẩy tài chính', fmt(as / eq, 2) + 'x');
  const cq = v('cfo') != null && np ? v('cfo') / np : null; if (cq != null) kpi('Dòng tiền HĐKD / LNST', fmt(cq, 2) + 'x', cq >= 0.8 ? 'up' : cq < 0 ? 'dn' : 'nt');
  const g = k => v(k) != null && pv(k) ? (v(k) - pv(k)) / Math.abs(pv(k)) * 100 : null;
  if (g('rev') != null) kpi('Tăng trưởng doanh thu', pct(g('rev'), 1), cls(g('rev')));
  const gnp = np != null && npP ? (np - npP) / Math.abs(npP) * 100 : null; if (gnp != null) kpi('Tăng trưởng LNST', pct(gnp, 1), cls(gnp));
  let eps = null, bvps = null;
  if (shares && np != null) { eps = np * unit * ann / shares; kpi('EPS quy năm (đ)', fmt(eps), cls(eps)); }
  if (shares && eq) { bvps = eq * unit / shares; kpi('BVPS (đ)', fmt(bvps)); }
  // Chấm điểm sức khỏe tài chính
  let score = 0, tot = 0; const chk = (cond, w, good, bad) => { tot += w; if (cond) { score += w; notes.push('✅ ' + good); } else notes.push('⚠️ ' + bad); };
  if (roe != null) chk(roe >= 12, 25, `ROE ${fmt(roe, 1)}% – hiệu quả sử dụng vốn tốt`, `ROE ${fmt(roe, 1)}% – dưới ngưỡng 12%`);
  if (nm != null) chk(nm >= 8, 15, `Biên lợi nhuận ròng ${fmt(nm, 1)}% khá`, `Biên lợi nhuận ròng ${fmt(nm, 1)}% mỏng`);
  if (de != null) chk(de <= 1.5, 20, `Đòn bẩy thấp (D/E ${fmt(de, 2)}x)`, `Đòn bẩy cao (D/E ${fmt(de, 2)}x) – rủi ro tài chính (không áp dụng cho ngân hàng/CK)`);
  if (cq != null) chk(cq >= 0.7, 20, `Dòng tiền HĐKD hỗ trợ lợi nhuận (${fmt(cq, 2)}x)`, `Dòng tiền HĐKD yếu so với LNST (${fmt(cq, 2)}x) – chất lượng lợi nhuận thấp`);
  if (gnp != null) chk(gnp > 5, 20, `Lợi nhuận tăng trưởng ${pct(gnp, 1)}`, `Lợi nhuận tăng trưởng yếu/âm (${pct(gnp, 1)})`);
  const sc = tot ? Math.round(score / tot * 100) : null;
  const gr = sc == null ? '' : `<div class="verdict ${sc >= 70 ? 'up' : sc >= 45 ? 'nt' : 'dn'}">Điểm sức khỏe tài chính: ${sc}/100 – ${sc >= 70 ? 'Tốt' : sc >= 45 ? 'Trung bình' : 'Yếu'}</div>`;
  $('#pdfAnalysis').innerHTML = `${gr}<div class="kpis">${K.join('') || '<p class="muted">Chưa đủ dữ liệu để tính chỉ số.</p>'}</div>
    <ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>
    ${eps != null ? `<button class="primary" id="toVal">➜ Dùng EPS/BVPS này để định giá ${S.sym}</button>` : '<p class="muted">Nhập “Số CP lưu hành” để tính EPS/BVPS và chuyển sang định giá.</p>'}`;
  const b = $('#toVal'); if (b) b.onclick = () => {
    fillValuation({ eps, bvps, roe: roe, g: gnp != null ? Math.max(0, Math.min(25, gnp)) : null, src: 'pdf' });
    $$('.tabs button').find(x => x.dataset.tab === 'val').click();
  };
}

/* ---------------- Khởi động ---------------- */
$('#quick').innerHTML = INDEXES.map(i => `<button data-s="${i}">${i}</button>`).join('') + ['VNM', 'FPT', 'HPG', 'VCB', 'VIC', 'MWG'].map(i => `<button data-s="${i}">${i}</button>`).join('');
$('#quick').onclick = e => { const s = e.target.dataset.s; if (s) { $('#symInput').value = s; load(s); } };
$('#symForm').onsubmit = e => { e.preventDefault(); load($('#symInput').value); };
$('#tfSeg').onclick = e => { const t = e.target.dataset.tf; if (!t || !S.raw) return; S.tf = t; $$('#tfSeg button').forEach(b => b.classList.toggle('active', b === e.target)); renderCharts(); };
initCharts(); loadSymbols();
const init = (location.hash || '#VNM').slice(1).toUpperCase(); $('#symInput').value = init; load(init);
