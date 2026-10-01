// Thư viện chỉ báo kỹ thuật (mảng đầu vào cùng độ dài, giá trị chưa đủ dữ liệu = NaN)
const NaNs = n => new Array(n).fill(NaN);
const IND = {
  sma(a, p) {
    const o = NaNs(a.length); let s = 0;
    for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; }
    return o;
  },
  ema(a, p) {
    const o = NaNs(a.length), k = 2 / (p + 1); let prev = NaN, start = a.findIndex(v => !isNaN(v));
    if (start < 0) return o;
    for (let i = start; i < a.length; i++) {
      if (isNaN(prev)) { if (i - start === p - 1) { let s = 0; for (let j = start; j <= i; j++) s += a[j]; prev = s / p; o[i] = prev; } }
      else { prev = a[i] * k + prev * (1 - k); o[i] = prev; }
    }
    return o;
  },
  wilder(a, p) { // RMA
    const o = NaNs(a.length); let prev = NaN;
    for (let i = 0; i < a.length; i++) {
      if (i === p - 1) { let s = 0; for (let j = 0; j < p; j++) s += a[j]; prev = s / p; o[i] = prev; }
      else if (i >= p) { prev = (prev * (p - 1) + a[i]) / p; o[i] = prev; }
    }
    return o;
  },
  rsi(c, p = 14) {
    const g = [0], l = [0];
    for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g.push(Math.max(d, 0)); l.push(Math.max(-d, 0)); }
    const ag = IND.wilder(g.slice(1), p), al = IND.wilder(l.slice(1), p);
    return [NaN, ...ag.map((v, i) => isNaN(v) ? NaN : al[i] === 0 ? 100 : 100 - 100 / (1 + v / al[i]))];
  },
  macd(c, f = 12, s = 26, sg = 9) {
    const ef = IND.ema(c, f), es = IND.ema(c, s);
    const line = c.map((_, i) => ef[i] - es[i]);
    const signal = IND.ema(line, sg);
    return { line, signal, hist: line.map((v, i) => v - signal[i]) };
  },
  stoch(h, l, c, k = 14, d = 3, sm = 3) {
    const raw = NaNs(c.length);
    for (let i = k - 1; i < c.length; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - k + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); }
      raw[i] = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
    }
    const K = IND.sma(raw.map(v => isNaN(v) ? 0 : v), sm).map((v, i) => i < k - 1 + sm - 1 ? NaN : v);
    const D = IND.sma(K.map(v => isNaN(v) ? 0 : v), d).map((v, i) => i < k - 1 + sm + d - 2 ? NaN : v);
    return { K, D };
  },
  bb(c, p = 20, m = 2) {
    const mid = IND.sma(c, p), up = NaNs(c.length), lo = NaNs(c.length);
    for (let i = p - 1; i < c.length; i++) {
      let s = 0; for (let j = i - p + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / p); up[i] = mid[i] + m * sd; lo[i] = mid[i] - m * sd;
    }
    return { mid, up, lo };
  },
  tr(h, l, c) { return h.map((v, i) => i === 0 ? v - l[i] : Math.max(v - l[i], Math.abs(v - c[i - 1]), Math.abs(l[i] - c[i - 1]))); },
  atr(h, l, c, p = 14) { return IND.wilder(IND.tr(h, l, c), p); },
  adx(h, l, c, p = 14) {
    const n = c.length, pdm = [0], mdm = [0];
    for (let i = 1; i < n; i++) {
      const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
      pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
    }
    const atr = IND.wilder(IND.tr(h, l, c), p), sp = IND.wilder(pdm, p), sm = IND.wilder(mdm, p);
    const pdi = atr.map((v, i) => 100 * sp[i] / v), mdi = atr.map((v, i) => 100 * sm[i] / v);
    const dx = pdi.map((v, i) => 100 * Math.abs(v - mdi[i]) / (v + mdi[i]));
    const first = dx.findIndex(v => !isNaN(v)), adx = NaNs(n);
    if (first >= 0) {
      const w = IND.wilder(dx.slice(first), p);
      w.forEach((v, i) => adx[first + i] = v);
    }
    return { adx, pdi, mdi };
  },
  cci(h, l, c, p = 20) {
    const tp = c.map((v, i) => (h[i] + l[i] + v) / 3), ma = IND.sma(tp, p), o = NaNs(c.length);
    for (let i = p - 1; i < c.length; i++) {
      let md = 0; for (let j = i - p + 1; j <= i; j++) md += Math.abs(tp[j] - ma[i]);
      md /= p; o[i] = md === 0 ? 0 : (tp[i] - ma[i]) / (0.015 * md);
    }
    return o;
  },
  willr(h, l, c, p = 14) {
    const o = NaNs(c.length);
    for (let i = p - 1; i < c.length; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); }
      o[i] = hh === ll ? -50 : (hh - c[i]) / (hh - ll) * -100;
    }
    return o;
  },
  roc(c, p = 12) { return c.map((v, i) => i < p ? NaN : (v / c[i - p] - 1) * 100); },
  obv(c, v) { const o = [0]; for (let i = 1; i < c.length; i++) o.push(o[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0)); return o; },
  mfi(h, l, c, v, p = 14) {
    const tp = c.map((x, i) => (h[i] + l[i] + x) / 3), o = NaNs(c.length);
    for (let i = p; i < c.length; i++) {
      let pos = 0, neg = 0;
      for (let j = i - p + 1; j <= i; j++) { const f = tp[j] * v[j]; if (tp[j] > tp[j - 1]) pos += f; else if (tp[j] < tp[j - 1]) neg += f; }
      o[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    }
    return o;
  },
  ichimoku(h, l, c) {
    const mid = (i, p) => { let hh = -Infinity, ll = Infinity; for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); } return (hh + ll) / 2; };
    const n = c.length, tenkan = NaNs(n), kijun = NaNs(n), spanA = NaNs(n), spanB = NaNs(n);
    for (let i = 0; i < n; i++) {
      if (i >= 8) tenkan[i] = mid(i, 9);
      if (i >= 25) kijun[i] = mid(i, 26);
    }
    // mây của hôm nay = tính từ 26 phiên trước (không vẽ dịch về tương lai để giữ trục thời gian)
    for (let i = 26; i < n; i++) {
      const j = i - 26;
      if (!isNaN(tenkan[j]) && !isNaN(kijun[j])) spanA[i] = (tenkan[j] + kijun[j]) / 2;
      if (j >= 51) spanB[i] = mid(j, 52);
    }
    return { tenkan, kijun, spanA, spanB };
  },
  last: a => a[a.length - 1],
  pivots(h, l, c) { // Pivot cổ điển theo phiên gần nhất
    const H = h[h.length - 1], L = l[l.length - 1], C = c[c.length - 1], P = (H + L + C) / 3;
    return { P, R1: 2 * P - L, S1: 2 * P - H, R2: P + (H - L), S2: P - (H - L), R3: H + 2 * (P - L), S3: L - 2 * (H - P) };
  },
  fib(h, l, look = 120) {
    const n = h.length, s = Math.max(0, n - look);
    let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
    for (let i = s; i < n; i++) { if (h[i] > hi) { hi = h[i]; hiI = i; } if (l[i] < lo) { lo = l[i]; loI = i; } }
    const up = loI < hiI, d = hi - lo;
    const lv = [0, .236, .382, .5, .618, .786, 1].map(r => ({ r, p: up ? hi - d * r : lo + d * r }));
    return { hi, lo, up, levels: lv };
  },
  swings(h, l, k = 5) { // đỉnh/đáy cục bộ
    const hs = [], ls = [];
    for (let i = k; i < h.length - k; i++) {
      let isH = true, isL = true;
      for (let j = i - k; j <= i + k; j++) { if (h[j] > h[i]) isH = false; if (l[j] < l[i]) isL = false; }
      if (isH) hs.push({ i, p: h[i] }); if (isL) ls.push({ i, p: l[i] });
    }
    return { hs, ls };
  },
  levels(h, l, price, k = 5) { // cụm hỗ trợ/kháng cự gần giá nhất
    const { hs, ls } = IND.swings(h, l, k), all = [...hs, ...ls].filter(x => x.i > h.length - 260).map(x => x.p).sort((a, b) => a - b);
    const cl = []; // gom cụm trong 1.5%
    for (const p of all) { const g = cl[cl.length - 1]; if (g && p / g.avg < 1.015) { g.n++; g.sum += p; g.avg = g.sum / g.n; } else cl.push({ n: 1, sum: p, avg: p }); }
    const lv = cl.map(g => ({ p: g.avg, n: g.n }));
    return {
      res: lv.filter(x => x.p > price * 1.003).sort((a, b) => a.p - b.p).slice(0, 3),
      sup: lv.filter(x => x.p < price * 0.997).sort((a, b) => b.p - a.p).slice(0, 3)
    };
  },
  patterns(o, h, l, c) {
    const n = c.length, out = [], i = n - 1;
    if (n < 5) return out;
    const body = k => Math.abs(c[k] - o[k]), rng = k => h[k] - l[k] || 1e-9;
    const up = k => c[k] > o[k], dn = k => c[k] < o[k];
    const upS = k => h[k] - Math.max(o[k], c[k]), loS = k => Math.min(o[k], c[k]) - l[k];
    const trendDown = c[i - 1] < c[i - 4], trendUp = c[i - 1] > c[i - 4];
    if (body(i) <= rng(i) * 0.1) out.push({ n: 'Doji', s: 0, d: 'Thị trường lưỡng lự, có thể đảo chiều' });
    if (loS(i) >= 2 * body(i) && upS(i) <= body(i) * 0.5 && body(i) > 0 && trendDown) out.push({ n: 'Hammer (Búa)', s: 1, d: 'Tín hiệu đảo chiều tăng sau nhịp giảm' });
    if (upS(i) >= 2 * body(i) && loS(i) <= body(i) * 0.5 && body(i) > 0 && trendUp) out.push({ n: 'Shooting Star (Sao băng)', s: -1, d: 'Tín hiệu đảo chiều giảm sau nhịp tăng' });
    if (up(i) && dn(i - 1) && c[i] >= o[i - 1] && o[i] <= c[i - 1] && body(i) > body(i - 1)) out.push({ n: 'Bullish Engulfing', s: 1, d: 'Nến tăng nhấn chìm nến giảm – đảo chiều tăng' });
    if (dn(i) && up(i - 1) && o[i] >= c[i - 1] && c[i] <= o[i - 1] && body(i) > body(i - 1)) out.push({ n: 'Bearish Engulfing', s: -1, d: 'Nến giảm nhấn chìm nến tăng – đảo chiều giảm' });
    if (dn(i - 2) && body(i - 1) < body(i - 2) * 0.4 && up(i) && c[i] > (o[i - 2] + c[i - 2]) / 2) out.push({ n: 'Morning Star', s: 1, d: 'Mẫu hình sao mai – đảo chiều tăng' });
    if (up(i - 2) && body(i - 1) < body(i - 2) * 0.4 && dn(i) && c[i] < (o[i - 2] + c[i - 2]) / 2) out.push({ n: 'Evening Star', s: -1, d: 'Mẫu hình sao hôm – đảo chiều giảm' });
    if (up(i) && up(i - 1) && up(i - 2) && c[i] > c[i - 1] && c[i - 1] > c[i - 2]) out.push({ n: 'Three White Soldiers', s: 1, d: '3 nến tăng liên tiếp – động lượng tăng' });
    if (dn(i) && dn(i - 1) && dn(i - 2) && c[i] < c[i - 1] && c[i - 1] < c[i - 2]) out.push({ n: 'Three Black Crows', s: -1, d: '3 nến giảm liên tiếp – áp lực bán mạnh' });
    return out;
  }
};
