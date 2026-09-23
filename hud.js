// Canvas HUD – green symbology in the style of a fighter head-up display.
const G = '#8dffb4', GD = 'rgba(141,255,180,0.35)', RED = '#ff5a4a', AMB = '#ffcf4a';
const FONT = '"Chakra Petch", "Share Tech Mono", monospace';
let objKey = '', objT = -99;   // objectives list shows briefly after it changes, then folds to one line

export function drawHud(x, W, H, s) {
  x.clearRect(0, 0, W, H);
  if (!s.show) return;
  const cx = W / 2, cy = H / 2, u = Math.min(W, H) / 800; // unit scale
  x.save();
  // quieter HUD: thin lines, partly transparent, little glow
  x.globalAlpha = 0.72;
  x.lineWidth = Math.max(1, 1.1 * u); x.strokeStyle = G; x.fillStyle = G;
  x.shadowColor = 'rgba(80,255,150,0.4)'; x.shadowBlur = 2 * u;
  x.font = `600 ${Math.round(13 * u)}px ${FONT}`; x.textBaseline = 'middle';

  // --- pitch ladder (rotated by roll) ---
  const ppd = H / s.fovDeg; // pixels per degree
  x.save(); x.translate(s.bore ? s.bore.x : cx, s.bore ? s.bore.y : cy); x.rotate(-s.roll);
  x.beginPath(); x.rect(-220 * u, -180 * u, 440 * u, 360 * u); x.clip();
  const pd = s.pitch * 180 / Math.PI;
  x.font = `600 ${Math.round(10 * u)}px ${FONT}`;
  for (let a = -90; a <= 90; a += 10) {
    const y = (pd - a) * ppd; if (Math.abs(y) > 150 * u) continue;
    x.globalAlpha = 0.72 * Math.max(0, 1 - Math.abs(y) / (150 * u)) * (a === 0 ? 1 : 0.6);
    const w = a === 0 ? 150 * u : 36 * u, gap = 48 * u;
    x.setLineDash(a < 0 ? [8 * u, 6 * u] : []);
    x.beginPath(); x.moveTo(-gap - w, y); x.lineTo(-gap, y); x.moveTo(gap, y); x.lineTo(gap + w, y); x.stroke();
    if (a !== 0) { x.textAlign = 'right'; x.fillText(Math.abs(a), -gap - w - 6 * u, y); x.textAlign = 'left'; x.fillText(Math.abs(a), gap + w + 6 * u, y); }
  }
  x.setLineDash([]); x.restore(); x.globalAlpha = 0.72;
  x.font = `600 ${Math.round(13 * u)}px ${FONT}`;

  // --- boresight / gun cross ---
  const bx = s.bore ? s.bore.x : cx, by = s.bore ? s.bore.y : cy;
  x.beginPath(); x.moveTo(bx - 14 * u, by); x.lineTo(bx - 5 * u, by); x.moveTo(bx + 5 * u, by); x.lineTo(bx + 14 * u, by);
  x.moveTo(bx, by - 14 * u); x.lineTo(bx, by - 5 * u); x.moveTo(bx, by + 5 * u); x.lineTo(bx, by + 14 * u); x.stroke();
  // missile seeker circle
  x.strokeStyle = GD; x.beginPath(); x.arc(bx, by, s.seekR, 0, Math.PI * 2); x.stroke(); x.strokeStyle = G;

  // --- heading tape ---
  const hw = 200 * u, hy = 34 * u + s.safeTop;
  x.save(); x.globalAlpha = 0.45; x.beginPath(); x.rect(cx - hw / 2, hy - 22 * u, hw, 44 * u); x.clip();
  x.textAlign = 'center';
  for (let d = Math.floor(s.heading / 5) * 5 - 30; d <= s.heading + 30; d += 5) {
    const px = cx + (d - s.heading) * 4.2 * u; const big = d % 10 === 0;
    x.beginPath(); x.moveTo(px, hy + 12 * u); x.lineTo(px, hy + (big ? 2 : 7) * u); x.stroke();
    if (d % 30 === 0) { const v = ((d % 360) + 360) % 360; x.fillText(v === 0 ? 'N' : v === 90 ? 'E' : v === 180 ? 'S' : v === 270 ? 'W' : String(v / 10).padStart(2, '0'), px, hy - 8 * u); }
  }
  x.restore();
  x.globalAlpha = 0.6; x.beginPath(); x.moveTo(cx, hy + 14 * u); x.lineTo(cx - 4 * u, hy + 20 * u); x.lineTo(cx + 4 * u, hy + 20 * u); x.closePath(); x.fill(); x.globalAlpha = 0.72;

  // --- speed & altitude: bare numbers, extras only when they matter ---
  const sx = cx - 240 * u, ax = cx + 240 * u;
  x.textAlign = 'center'; x.font = `700 ${Math.round(17 * u)}px ${FONT}`;
  x.fillText(String(Math.round(s.speedKts)), sx, cy); x.fillText(String(Math.round(s.alt)), ax, cy);
  x.globalAlpha = 0.45; x.font = `600 ${Math.round(10 * u)}px ${FONT}`;
  x.fillText('KTS', sx, cy - 18 * u); x.fillText('ALT', ax, cy - 18 * u); x.globalAlpha = 0.72;
  x.font = `600 ${Math.round(12 * u)}px ${FONT}`;
  if (s.g > 4) { x.fillStyle = s.g > 7 ? AMB : G; x.fillText(`${s.g.toFixed(1)} G`, sx, cy + 20 * u); x.fillStyle = G; }
  if (s.ab) { x.fillStyle = AMB; x.fillText('A/B', sx, cy + 36 * u); x.fillStyle = G; }
  if (s.gear) x.fillText('GEAR', ax, cy + 20 * u);
  // throttle: a thin line next to the speed
  const tx = sx - 44 * u, th = 70 * u;
  x.globalAlpha = 0.35; x.fillRect(tx, cy - th / 2, 2 * u, th); x.globalAlpha = 0.8;
  x.fillRect(tx - 1 * u, cy + th / 2 - th * s.throttle, 4 * u, th * s.throttle); x.globalAlpha = 0.72;

  // --- targets ---
  x.font = `600 ${Math.round(12 * u)}px ${FONT}`;
  for (const t of s.targets) {
    const col = t.friendly ? '#9fd8ff' : (t.locked ? RED : G);
    x.strokeStyle = x.fillStyle = col;
    if (t.on) {
      const r = Math.max(10 * u, Math.min(40 * u, t.size));
      if (t.friendly) { x.beginPath(); x.arc(t.x, t.y, r, 0, Math.PI * 2); x.stroke(); }
      else if (t.ground) { x.beginPath(); x.moveTo(t.x, t.y - r); x.lineTo(t.x + r, t.y); x.lineTo(t.x, t.y + r); x.lineTo(t.x - r, t.y); x.closePath(); x.stroke(); }
      else x.strokeRect(t.x - r, t.y - r, r * 2, r * 2);
      x.textAlign = 'left'; x.fillText(t.label ?? `${(t.dist / 1000).toFixed(1)}`, t.x + r + 4 * u, t.y - r + 6 * u);
      if (t.lockProg > 0 && !t.locked) {
        x.beginPath(); x.arc(t.x, t.y, r + 8 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t.lockProg); x.stroke();
      }
      if (t.locked) {
        const k = r + 10 * u + Math.sin(s.time * 20) * 2 * u;
        x.lineWidth *= 1.6; x.beginPath(); x.moveTo(t.x, t.y - k); x.lineTo(t.x + k, t.y); x.lineTo(t.x, t.y + k); x.lineTo(t.x - k, t.y); x.closePath(); x.stroke(); x.lineWidth /= 1.6;
        x.textAlign = 'center'; x.fillText('LOCK', t.x, t.y + k + 12 * u);
      }
      if (t.lead) { x.beginPath(); x.arc(t.lead.x, t.lead.y, 4 * u, 0, 7); x.stroke(); }
    } else if (t.arrow) {
      // edge arrow
      const a = Math.atan2(t.y - cy, t.x - cx), R = Math.min(W, H) * 0.42;
      const ax2 = cx + Math.cos(a) * R, ay2 = cy + Math.sin(a) * R;
      x.save(); x.translate(ax2, ay2); x.rotate(a);
      x.beginPath(); x.moveTo(14 * u, 0); x.lineTo(-6 * u, -8 * u); x.lineTo(-6 * u, 8 * u); x.closePath(); x.fill(); x.restore();
    }
  }
  x.strokeStyle = x.fillStyle = G;

  // --- incoming missiles ---
  for (const m of s.threats) {
    if (!m.on) continue; x.strokeStyle = RED; x.beginPath(); x.arc(m.x, m.y, 12 * u, 0, 7); x.moveTo(m.x - 18 * u, m.y); x.lineTo(m.x + 18 * u, m.y); x.stroke();
  }
  x.strokeStyle = x.fillStyle = G;

  // --- bottom-left: weapons & status, compact ---
  // on phones the bottom corners belong to the thumbs: weapons go bottom-centre
  const lx = s.touch ? cx - 90 * u : 24 * u + s.safeL, ly = H - 22 * u - s.safeBot;
  x.textAlign = 'left'; x.font = `600 ${Math.round(12 * u)}px ${FONT}`;
  x.fillText(`${s.missileName} ×${s.missiles}   GUN ${s.ammo}   FLR ${s.flares}`, lx, ly - 30 * u);
  bar(x, lx, ly - 14 * u, 150 * u, 3 * u, s.fuel, s.fuel < 0.2 ? RED : G, 'FUEL', u);
  bar(x, lx, ly - 2 * u, 150 * u, 3 * u, s.hp, s.hp < 0.3 ? RED : G, 'HULL', u);

  // --- top-left: score, lives, objectives (full list only for a few seconds after a change) ---
  x.fillStyle = G; x.textAlign = 'left'; x.globalAlpha = 0.55;
  x.fillText(`${String(s.score).padStart(6, '0')}   ${'▲'.repeat(Math.max(0, s.lives))}`, (24 * u + s.safeL + (s.touch ? 58 : 0)), 26 * u + s.safeTop);
  const objs = s.objectives || [], key = objs.map(o => o.text + o.done).join('|');
  if (key !== objKey) { objKey = key; objT = s.time; }
  const showAll = s.time - objT < 6;
  x.font = `600 ${Math.round(12 * u)}px ${FONT}`;
  if (showAll) objs.forEach((o, i) => { x.globalAlpha = (o.done ? 0.35 : 0.8) * Math.min(1, (6 - (s.time - objT)) * 2); x.fillText((o.done ? '✓ ' : '› ') + o.text, (24 * u + s.safeL + (s.touch ? 58 : 0)), 46 * u + i * 16 * u + s.safeTop); });
  else { const left = objs.find(o => !o.done); if (left) { x.globalAlpha = 0.5; x.fillText('› ' + left.text, (24 * u + s.safeL + (s.touch ? 58 : 0)), 46 * u + s.safeTop); } }
  x.globalAlpha = 0.72; x.fillStyle = G;

  // --- radar (bottom right) ---
  const rr = 52 * u, rx = W - rr - 24 * u - s.safeR - (s.touch ? 4 * u : 0), ry = s.touch ? s.safeTop + 70 + rr : H - rr - 24 * u - s.safeBot;
  x.save(); x.globalAlpha = 0.6; x.fillStyle = 'rgba(0,30,15,0.25)'; x.beginPath(); x.arc(rx, ry, rr, 0, 7); x.fill(); x.stroke();
  x.strokeStyle = GD; x.beginPath(); x.arc(rx, ry, rr / 2, 0, 7); x.stroke();
  x.beginPath(); x.moveTo(rx, ry - rr); x.lineTo(rx, ry + rr); x.moveTo(rx - rr, ry); x.lineTo(rx + rr, ry); x.stroke();
  for (const b of s.radar) {
    const d = Math.hypot(b.x, b.y); const k = Math.min(1, d / s.radarRange);
    const px = rx + (b.x / (d || 1)) * k * rr, py = ry + (b.y / (d || 1)) * k * rr;
    x.fillStyle = b.c; if (b.big) x.fillRect(px - 4 * u, py - 4 * u, 8 * u, 8 * u); else { x.beginPath(); x.arc(px, py, 3 * u, 0, 7); x.fill(); }
  }
  x.fillStyle = G; x.beginPath(); x.moveTo(rx, ry - 6 * u); x.lineTo(rx - 4 * u, ry + 4 * u); x.lineTo(rx + 4 * u, ry + 4 * u); x.fill();
  x.restore();

  // --- carrier approach guide ---
  if (s.land) {
    const L = s.land, gx = cx + 150 * u, gy = cy - 40 * u, gh = 120 * u;
    x.strokeStyle = G; x.strokeRect(gx - 6 * u, gy - gh / 2, 12 * u, gh);
    const dy = Math.max(-1, Math.min(1, L.vDev)) * gh / 2;
    x.fillStyle = Math.abs(L.vDev) < 0.25 ? G : AMB; x.fillRect(gx - 10 * u, gy - dy - 3 * u, 20 * u, 6 * u);
    const dx = Math.max(-1, Math.min(1, L.hDev)) * 120 * u;
    x.strokeRect(cx - 120 * u, cy + 110 * u, 240 * u, 10 * u);
    x.fillStyle = Math.abs(L.hDev) < 0.25 ? G : AMB; x.fillRect(cx + dx - 3 * u, cy + 104 * u, 6 * u, 22 * u);
    x.fillStyle = G; x.textAlign = 'center';
    x.fillText(`DECK ${(L.dist / 1000).toFixed(2)} KM`, cx, cy + 140 * u);
    x.fillStyle = L.speedOk ? G : AMB; x.fillText(L.speedOk ? 'SPEED OK' : 'SLOW DOWN', cx - 90 * u, cy + 160 * u);
    x.fillStyle = L.gear ? G : AMB; x.fillText(L.gear ? 'GEAR DOWN' : 'GEAR ▸ G', cx + 90 * u, cy + 160 * u);
    x.fillStyle = G; x.textAlign = 'left'; x.fillText(L.vDev > 0.25 ? 'HIGH' : L.vDev < -0.25 ? 'LOW' : 'ON GLIDE', gx + 16 * u, gy);
  }
  // --- refuel guide ---
  if (s.refuel) {
    x.textAlign = 'center'; x.fillStyle = s.refuel.ok ? G : AMB;
    x.fillText(s.refuel.ok ? `CONTACT — ${Math.round(s.refuel.prog * 100)}%` : s.refuel.msg, cx, cy + 120 * u);
    x.strokeRect(cx - 80 * u, cy + 134 * u, 160 * u, 6 * u); x.fillRect(cx - 80 * u, cy + 134 * u, 160 * u * s.refuel.prog, 6 * u);
  }

  // --- warnings & messages ---
  x.textAlign = 'center';
  let wy = cy - 130 * u;
  for (const w of s.warnings) {
    if ((s.time * 3 % 1) < 0.65) { x.fillStyle = RED; x.font = `700 ${Math.round(16 * u)}px ${FONT}`; x.fillText(w, cx, wy); }
    wy += 26 * u;
  }
  if (s.msg) { x.fillStyle = s.msgCol || G; x.font = `700 ${Math.round(18 * u)}px ${FONT}`; x.fillText(s.msg, cx, cy - 190 * u + s.safeTop * 0.5); }
  x.restore();
}

function bar(x, X, Y, w, h, v, col, label, u) {
  const a = x.globalAlpha; x.font = `600 ${Math.round(9 * u)}px ${FONT}`;
  x.globalAlpha = 0.45; x.fillStyle = G; x.textAlign = 'left'; x.fillText(label, X, Y + h / 2);
  const bx = X + 34 * u; x.globalAlpha = 0.2; x.fillRect(bx, Y, w - 34 * u, h);
  x.globalAlpha = 0.8; x.fillStyle = col; x.fillRect(bx, Y, (w - 34 * u) * Math.max(0, Math.min(1, v)), h); x.fillStyle = G; x.globalAlpha = a;
  x.font = `600 ${Math.round(12 * u)}px ${FONT}`;
}
