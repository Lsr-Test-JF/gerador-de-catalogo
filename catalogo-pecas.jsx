import { useState, useRef, useCallback, useEffect } from "react";

const RED = "#c0392b";
const DARK = "#1a1a2e";
const PDF_W = 2480;
const PDF_H = 3508;
const ITEMS_PER_PAGE = 5;

function gid() { return Math.random().toString(36).substr(2, 9); }
function defaultItem() {
  return { id: gid(), images: [null, null], lusarCode: "", nOriginal: "", nAdicional: "", lonasLe: "", lonasLona: "", lonasThermoid: "", obs: "", freio: "Óleo", aplicacao: "" };
}
function defaultPage(title = "SAPATAS DE FREIO A ÓLEO") {
  return { id: gid(), headerTitle: title, headerSubtitle: "", leftLogoUrl: null, rightLogoUrl: null, items: [defaultItem()] };
}

// ─── Parse JSON import ───
function parseImportJSON(raw) {
  const parsed = JSON.parse(raw);
  const keys = Object.keys(parsed);
  const items = keys.map(key => {
    const d = parsed[key];
    return {
      id: gid(),
      images: [null, null],
      lusarCode: d.LUSAR || key,
      nOriginal: d.N_Original || "",
      nAdicional: d.N_Adicional || "",
      lonasLe: d.FRAS_LE || "",
      lonasLona: d.LONAFLEX || "",
      lonasThermoid: d.THERMOID || "",
      obs: d.Obs || "",
      freio: (d.Freio || "Óleo").toLowerCase().includes("ar") ? "Ar" : "Óleo",
      aplicacao: d.Aplicacao || "",
    };
  });
  // Split into groups of ITEMS_PER_PAGE
  const pages = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
    pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  }
  return pages;
}

function rr(ctx, x, y, w, h, r = 0) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, maxW) {
  const result = [];
  for (const para of (text || "").split("\n")) {
    const words = para.split(" "); let line = "";
    for (const word of words) { const test = line ? line + " " + word : word; if (ctx.measureText(test).width > maxW && line) { result.push(line); line = word; } else line = test; }
    result.push(line);
  }
  return result;
}
function trunc(ctx, text, maxW) {
  let t = text || "";
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
function preloadAll(pages) {
  const urls = new Set();
  for (const p of pages) { if (p.leftLogoUrl) urls.add(p.leftLogoUrl); if (p.rightLogoUrl) urls.add(p.rightLogoUrl); for (const it of p.items) for (const img of it.images) if (img) urls.add(img); }
  const map = {};
  return Promise.all([...urls].map(url => new Promise(res => { const img = new Image(); img.onload = () => { map[url] = img; res(); }; img.onerror = res; img.src = url; }))).then(() => map);
}

function calcLayout(page, W, H, S) {
  const ml = 8 * S, mr = 12 * S, mf = 8 * S;
  const cw = W - ml - mr;
  const hdrH = 28 * S;
  const curYStart = hdrH + 2 * S;
  const availH = H - curYStart - mf;
  const nItems = page.items.length;
  const GAP = 2.5 * S;
  const fs_ap = 2.1 * S;
  const fs_field = 3.15 * S;
  const lh_ap = fs_ap * 1.55;
  const lh_field = fs_field * 1.65;
  const imgZoneW = cw * 0.28;
  const lusarH = 5.5 * S;
  const fieldW = cw - imgZoneW - 6 * S;
  const pad = 2 * S;
  const mc = document.createElement("canvas");
  const mctx = mc.getContext("2d");

  function minH(item) {
    const imgH = Math.max(22 * S, availH * 0.28);
    const leftH = imgH + lusarH + pad * 2;
    // +1 row for OBS
    const fixedFieldH = pad + lh_field * 4.5 + lh_field * 0.85 + pad;
    mctx.font = `${fs_ap}px sans-serif`;
    const apLines = wrapText(mctx, item.aplicacao, fieldW);
    const apH = Math.max(1, apLines.length) * lh_ap;
    return Math.max(leftH, fixedFieldH + apH + pad);
  }

  const rawH = page.items.map(minH);
  const totalNeeded = rawH.reduce((a, b) => a + b, 0) + GAP * Math.max(0, nItems - 1);
  const overflows = totalNeeded > availH;
  const scaleFactor = overflows ? availH / totalNeeded : 1;
  const itemHeights = rawH.map(h => h * scaleFactor);
  return { ml, mr, mf, cw, hdrH, curYStart, availH, GAP, itemHeights, overflows, totalNeeded, scaleFactor, imgZoneW, lusarH, fieldW, pad, fs_ap, fs_field, lh_ap, lh_field };
}

function drawItemCard(ctx, item, x, y, w, h, S, imgMap, layout) {
  const { pad, imgZoneW, lusarH, fieldW, fs_ap, fs_field, lh_ap, lh_field } = layout;
  const RADIUS = 3.5 * S;
  rr(ctx, x, y, w, h, RADIUS);
  ctx.strokeStyle = RED; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.fillStyle = "#fff"; rr(ctx, x, y, w, h, RADIUS); ctx.fill();

  const imgAreaH = h - pad - lusarH - pad;
  const halfW = imgZoneW / 2;

  for (let i = 0; i < 2; i++) {
    const slotX = x + i * halfW, slotY = y + pad;
    ctx.save();
    ctx.beginPath();
    if (i === 0) {
      ctx.moveTo(slotX + RADIUS, slotY); ctx.lineTo(slotX + halfW, slotY); ctx.lineTo(slotX + halfW, slotY + imgAreaH); ctx.lineTo(slotX + RADIUS, slotY + imgAreaH); ctx.arcTo(slotX, slotY + imgAreaH, slotX, slotY + imgAreaH - RADIUS, RADIUS); ctx.lineTo(slotX, slotY + RADIUS); ctx.arcTo(slotX, slotY, slotX + RADIUS, slotY, RADIUS);
    } else {
      ctx.moveTo(slotX, slotY); ctx.lineTo(slotX + halfW - RADIUS, slotY); ctx.arcTo(slotX + halfW, slotY, slotX + halfW, slotY + RADIUS, RADIUS); ctx.lineTo(slotX + halfW, slotY + imgAreaH - RADIUS); ctx.arcTo(slotX + halfW, slotY + imgAreaH, slotX + halfW - RADIUS, slotY + imgAreaH, RADIUS); ctx.lineTo(slotX, slotY + imgAreaH);
    }
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = "#f0f0f0"; ctx.fillRect(slotX, slotY, halfW, imgAreaH);
    const url = item.images[i];
    if (url && imgMap?.[url]) { const img = imgMap[url]; const sc = Math.min(halfW / img.naturalWidth, imgAreaH / img.naturalHeight); const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc; ctx.drawImage(img, slotX + (halfW - dw) / 2, slotY + (imgAreaH - dh) / 2, dw, dh); }
    ctx.restore();
  }

  // Separator bar
  const barX = x + imgZoneW, barMargin = imgAreaH * 0.12;
  ctx.strokeStyle = "rgba(192,57,43,0.45)"; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(barX, y + pad + barMargin); ctx.lineTo(barX, y + pad + imgAreaH - barMargin); ctx.stroke();

  // LUSAR
  const lusarMidY = y + pad + imgAreaH + lusarH * 0.55;
  ctx.fillStyle = RED; ctx.font = `bold ${4.2 * S}px Georgia`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`LUSAR ${item.lusarCode}`, x + imgZoneW / 2, lusarMidY);
  ctx.textBaseline = "alphabetic";

  // Fields
  const fx = x + imgZoneW + 4 * S;
  ctx.textAlign = "left";
  let fy = y + pad + fs_field * 1.2;
  const divider = dy => { ctx.strokeStyle = "#e5e5e5"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(fx, dy + fs_field * 0.45); ctx.lineTo(fx + fieldW, dy + fs_field * 0.45); ctx.stroke(); };
  const bold = (t, bx, by) => { ctx.font = `bold ${fs_field}px sans-serif`; ctx.fillStyle = DARK; ctx.fillText(t, bx, by); return ctx.measureText(t).width; };
  const normal = (t, bx, by, mw) => { ctx.font = `${fs_field}px sans-serif`; ctx.fillStyle = "#333"; ctx.fillText(trunc(ctx, t, mw), bx, by); };

  // Row 1: Nº
  let lw = bold("Nº Original:", fx, fy); normal(item.nOriginal, fx + lw + 2, fy, fieldW / 2 - lw - 6);
  lw = bold("Nº Adicional:", fx + fieldW / 2, fy); normal(item.nAdicional, fx + fieldW / 2 + lw + 2, fy, fieldW / 2 - lw - 4);
  divider(fy); fy += lh_field;

  // Row 2: Lonas
  const col = fieldW / 3;
  [["FRAS-LE:", item.lonasLe], ["LONAFLEX:", item.lonasLona], ["THERMOID:", item.lonasThermoid]].forEach(([lbl, val], i) => {
    const bw = bold(lbl, fx + col * i, fy); normal(val, fx + col * i + bw + 2, fy, col - bw - 8);
    if (i < 2) { ctx.fillStyle = RED; ctx.font = `bold ${fs_field}px sans-serif`; ctx.fillText("|", fx + col * (i + 1) - 4, fy); }
  });
  divider(fy); fy += lh_field;

  // Row 3: OBS
  const obsLw = bold("OBS:", fx, fy);
  normal(item.obs || "", fx + obsLw + 2, fy, fieldW - obsLw - 4);
  divider(fy); fy += lh_field;

  // Row 4: Freio
  bold(`Freio ${item.freio}`, fx, fy);
  divider(fy); fy += lh_field;

  // Row 5: Aplicação
  bold("Aplicação:", fx, fy); fy += lh_field * 0.85;
  ctx.font = `${fs_ap}px sans-serif`; ctx.fillStyle = "#333";
  const apLines = wrapText(ctx, item.aplicacao, fieldW);
  const bottomLimit = y + h - pad * 0.5;
  for (const line of apLines) { if (fy + fs_ap > bottomLimit) break; ctx.fillText(line, fx, fy); fy += lh_ap; }
}

function renderPage(page, pageNum, totalPages, W, H, imgMap) {
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d"); const S = W / 210;
  const layout = calcLayout(page, W, H, S);
  const { ml, mr, hdrH, cw, curYStart, GAP, itemHeights } = layout;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, DARK); grad.addColorStop(1, "#16213e");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, hdrH);
  ctx.fillStyle = RED; ctx.fillRect(0, hdrH - 2.5 * S, W, 2.5 * S);
  const logoW = 40 * S, logoH = 19 * S, logoY = (hdrH - logoH) / 2;
  const drawLogo = (url, lx) => { if (url && imgMap?.[url]) { const img = imgMap[url]; const sc = Math.min(logoW / img.naturalWidth, logoH / img.naturalHeight); const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc; ctx.drawImage(img, lx + (logoW - dw) / 2, logoY + (logoH - dh) / 2, dw, dh); } };
  drawLogo(page.leftLogoUrl, ml); drawLogo(page.rightLogoUrl, W - mr - logoW);
  const titleFS = 5.8 * S, subtFS = 2.2 * S;
  const totalTextH = titleFS + (page.headerSubtitle ? subtFS * 1.6 : 0);
  const textCenterY = hdrH / 2 - totalTextH / 2 + titleFS;
  ctx.fillStyle = "#fff"; ctx.font = `bold ${titleFS}px Georgia`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(page.headerTitle.toUpperCase(), W / 2, textCenterY - 1.5 * S);
  if (page.headerSubtitle) { ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.font = `${subtFS}px sans-serif`; ctx.fillText(page.headerSubtitle, W / 2, textCenterY + subtFS * 1.4); }
  let curY = curYStart;
  for (let i = 0; i < page.items.length; i++) { drawItemCard(ctx, page.items[i], ml, curY, cw, itemHeights[i], S, imgMap, layout); curY += itemHeights[i] + GAP; }
  return canvas;
}

function buildPDF(canvases) {
  const A4W = 595.28, A4H = 841.89;
  const toLatin1 = s => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xFF; return a; };
  const b64bin = b64 => toLatin1(atob(b64));
  const chunks = []; let pos = 0; const offsets = {};
  const push = u8 => { chunks.push(u8); pos += u8.length; }; const pt = s => push(toLatin1(s));
  const n = canvases.length; const pgNums = canvases.map((_, i) => 3 + i * 3 + 2);
  pt("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  offsets[1] = pos; pt(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  offsets[2] = pos; pt(`2 0 obj\n<< /Type /Pages /Kids [${pgNums.map(x => `${x} 0 R`).join(" ")}] /Count ${n} >>\nendobj\n`);
  for (let i = 0; i < n; i++) {
    const c = canvases[i]; const jpeg = b64bin(c.toDataURL("image/jpeg", 0.97).split(",")[1]);
    const iN = 3 + i * 3, cN = 3 + i * 3 + 1, pN = 3 + i * 3 + 2;
    offsets[iN] = pos; pt(`${iN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); push(jpeg); pt(`\nendstream\nendobj\n`);
    const cs = `q ${A4W.toFixed(2)} 0 0 ${A4H.toFixed(2)} 0 0 cm /Im${i} Do Q`;
    offsets[cN] = pos; pt(`${cN} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
    offsets[pN] = pos; pt(`${pN} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4W.toFixed(2)} ${A4H.toFixed(2)}] /Contents ${cN} 0 R /Resources << /XObject << /Im${i} ${iN} 0 R >> >> >>\nendobj\n`);
  }
  const xref = pos; const tot = 2 + n * 3;
  let xr = `xref\n0 ${tot + 1}\n0000000000 65535 f \n`;
  for (let k = 1; k <= tot; k++) xr += String(offsets[k]).padStart(10, "0") + " 00000 n \n";
  xr += `trailer\n<< /Size ${tot + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; pt(xr);
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0; for (const ch of chunks) { out.set(ch, off); off += ch.length; } return out;
}

function downloadBlob(data, filename, mime) {
  const blob = new Blob([data], { type: mime }); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
}
function saveBackup(pages) { downloadBlob(new TextEncoder().encode(JSON.stringify({ version: 2, savedAt: new Date().toISOString(), pages })), `catalogo-backup-${Date.now()}.catbak`, "application/json"); }
function loadBackup(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => { try { const d = JSON.parse(e.target.result); if (!d.pages) throw 0; res(d); } catch { rej(new Error("Inválido")); } }; r.onerror = () => rej(new Error("Erro")); r.readAsText(file); }); }

// ─── Page Fill Meter ───
function PageFillMeter({ page }) {
  const [info, setInfo] = useState({ pct: 0, overflows: false });
  useEffect(() => {
    const S = PDF_W / 210;
    const layout = calcLayout(page, PDF_W, PDF_H, S);
    const pct = Math.min(150, Math.round((layout.totalNeeded / layout.availH) * 100));
    setInfo({ pct, overflows: layout.overflows });
  }, [page.items]);
  const color = info.overflows ? RED : info.pct > 85 ? "#e67e22" : "#27ae60";
  return (
    <div style={{ padding: "5px 12px 7px", borderBottom: `1px solid rgba(192,57,43,0.1)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: "#888", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Preenchimento</span>
        <span style={{ fontSize: 9, fontWeight: 700, color }}>{info.overflows ? `⚠ ${info.pct}% — será comprimido` : `${info.pct}%`}</span>
      </div>
      <div style={{ height: 4, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, info.pct)}%`, background: color, borderRadius: 3, transition: "width 0.3s, background 0.3s" }} />
      </div>
    </div>
  );
}

// ─── JSON Import Modal ───
function ImportModal({ onImport, onCancel }) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const tryParse = (text) => {
    setError(""); setPreview(null);
    if (!text.trim()) return;
    try {
      const groups = parseImportJSON(text);
      const totalItems = groups.reduce((s, g) => s + g.length, 0);
      setPreview({ pages: groups.length, items: totalItems });
    } catch (e) { setError("JSON inválido: " + e.message); }
  };

  const doImport = () => {
    try {
      const groups = parseImportJSON(raw);
      onImport(groups);
    } catch (e) { setError("Erro: " + e.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 640, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: DARK, fontFamily: "Georgia,serif" }}>📥 Importar JSON de Peças</div>

        <div style={{ fontSize: 11, color: "#666", background: "#f8f8f8", borderRadius: 6, padding: "10px 12px", border: "1px solid #eee" }}>
          <b>Estrutura esperada:</b> Um objeto JSON onde cada chave é o código da peça. Campos reconhecidos:<br />
          <code style={{ fontSize: 10 }}>LUSAR, N_Original, N_Adicional, FRAS_LE, LONAFLEX, THERMOID, Freio, Obs, Aplicacao</code><br />
          <span style={{ color: RED, fontWeight: 700 }}>Cada {ITEMS_PER_PAGE} peças = 1 nova página automaticamente.</span>
        </div>

        <textarea
          value={raw}
          onChange={e => { setRaw(e.target.value); tryParse(e.target.value); }}
          placeholder={'{\n  "750R": {\n    "LUSAR": "750R",\n    "N_Original": "225.1495",\n    "FRAS_LE": "4515-C",\n    "Freio": "AR",\n    "Obs": "Com Rolete",\n    "Aplicacao": "Bêndix Antiga"\n  }\n}'}
          rows={12}
          style={{ width: "100%", border: `2px solid ${error ? RED : "#ddd"}`, borderRadius: 6, fontSize: 11, fontFamily: "monospace", padding: "10px 12px", outline: "none", resize: "vertical", boxSizing: "border-box", background: "#fafafa" }}
        />

        {error && <div style={{ color: RED, fontSize: 11, fontWeight: 600 }}>⚠ {error}</div>}

        {preview && (
          <div style={{ background: "#eaf7ea", border: "1px solid #27ae60", borderRadius: 6, padding: "8px 14px", fontSize: 11, color: "#1a5e1a", fontWeight: 600 }}>
            ✓ Válido — <b>{preview.items} peça(s)</b> → <b>{preview.pages} página(s)</b> de até {ITEMS_PER_PAGE} itens cada
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "#eee", color: "#333", border: "none", borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Cancelar</button>
          <button onClick={doImport} disabled={!preview || !!error}
            style={{ background: preview && !error ? "#27ae60" : "#bbb", color: "#fff", border: "none", borderRadius: 6, padding: "8px 22px", cursor: preview && !error ? "pointer" : "default", fontWeight: 700, fontSize: 12 }}>
            ✓ Importar {preview ? `(${preview.pages} pág.)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Crop Editor ───
function CropEditor({ src, onDone, onCancel }) {
  const canvasRef = useRef(); const imgRef = useRef(null); const dragRef = useRef(null);
  const [rotation, setRotation] = useState(0); const [crop, setCrop] = useState(null); const [loaded, setLoaded] = useState(false);
  const DW = 560, DH = 400;
  useEffect(() => { const img = new Image(); img.onload = () => { imgRef.current = img; setLoaded(true); }; img.src = src; }, [src]);
  const getMetrics = useCallback(() => {
    const img = imgRef.current; if (!img) return null;
    const swapped = rotation % 180 !== 0;
    const dispW = swapped ? img.naturalHeight : img.naturalWidth, dispH = swapped ? img.naturalWidth : img.naturalHeight;
    const scale = Math.min((DW - 20) / dispW, (DH - 20) / dispH);
    return { scale, drawW: img.naturalWidth * scale, drawH: img.naturalHeight * scale, dispW, dispH, imgLeft: DW / 2 - dispW * scale / 2, imgTop: DH / 2 - dispH * scale / 2 };
  }, [rotation]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !imgRef.current || !loaded) return;
    const ctx = canvas.getContext("2d"); const img = imgRef.current; const m = getMetrics(); if (!m) return;
    ctx.fillStyle = "#0d0d1a"; ctx.fillRect(0, 0, DW, DH);
    ctx.save(); ctx.translate(DW / 2, DH / 2); ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(img, -m.drawW / 2, -m.drawH / 2, m.drawW, m.drawH); ctx.restore();
    if (crop && crop.w > 3 && crop.h > 3) {
      const { x, y, w, h } = crop;
      ctx.fillStyle = "rgba(0,0,0,0.52)";
      ctx.fillRect(0, 0, DW, y); ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, DW - x - w, h); ctx.fillRect(0, y + h, DW, DH - y - h);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 0.7;
      [1 / 3, 2 / 3].forEach(f => { ctx.beginPath(); ctx.moveTo(x + w * f, y); ctx.lineTo(x + w * f, y + h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y + h * f); ctx.lineTo(x + w, y + h * f); ctx.stroke(); });
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([hx, hy]) => { ctx.fillStyle = "#fff"; ctx.fillRect(hx - 5, hy - 5, 10, 10); ctx.strokeStyle = "#333"; ctx.lineWidth = 0.8; ctx.strokeRect(hx - 5, hy - 5, 10, 10); });
    }
  }, [loaded, rotation, crop]);
  const cpos = e => { const r = canvasRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * (DW / r.width), y: (e.clientY - r.top) * (DH / r.height) }; };
  const hitTest = pos => {
    if (!crop || crop.w < 5 || crop.h < 5) return null;
    const { x, y, w, h } = crop;
    for (const [hx, hy, k] of [[x, y, "tl"], [x + w, y, "tr"], [x, y + h, "bl"], [x + w, y + h, "br"]]) if (Math.abs(pos.x - hx) < 12 && Math.abs(pos.y - hy) < 12) return k;
    if (pos.x > x && pos.x < x + w && pos.y > y && pos.y < y + h) return "move";
    return null;
  };
  const onPointerDown = e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const pos = cpos(e); const hit = hitTest(pos); if (hit) dragRef.current = { kind: hit === "move" ? "move" : "resize", handle: hit, start: pos, orig: { ...crop } }; else { dragRef.current = { kind: "new", start: pos }; setCrop({ x: pos.x, y: pos.y, w: 0, h: 0 }); } };
  const onPointerMove = e => { e.preventDefault(); const d = dragRef.current; if (!d) return; const pos = cpos(e); if (d.kind === "new") { setCrop({ x: Math.min(pos.x, d.start.x), y: Math.min(pos.y, d.start.y), w: Math.abs(pos.x - d.start.x), h: Math.abs(pos.y - d.start.y) }); } else if (d.kind === "move") { setCrop({ x: Math.max(0, Math.min(DW - d.orig.w, d.orig.x + pos.x - d.start.x)), y: Math.max(0, Math.min(DH - d.orig.h, d.orig.y + pos.y - d.start.y)), w: d.orig.w, h: d.orig.h }); } else { let { x, y, w, h } = d.orig; const dx = pos.x - d.start.x, dy = pos.y - d.start.y; if (d.handle === "tl") { x += dx; y += dy; w -= dx; h -= dy; } if (d.handle === "tr") { y += dy; w += dx; h -= dy; } if (d.handle === "bl") { x += dx; w -= dx; h += dy; } if (d.handle === "br") { w += dx; h += dy; } if (w > 10 && h > 10) setCrop({ x: Math.max(0, x), y: Math.max(0, y), w: Math.max(10, w), h: Math.max(10, h) }); } };
  const onPointerUp = e => { e.preventDefault(); dragRef.current = null; };
  const confirm = () => {
    const img = imgRef.current; if (!img) return;
    const swapped = rotation % 180 !== 0; const rotW = swapped ? img.naturalHeight : img.naturalWidth, rotH = swapped ? img.naturalWidth : img.naturalHeight;
    const rc = document.createElement("canvas"); rc.width = rotW; rc.height = rotH;
    const rctx = rc.getContext("2d"); rctx.save(); rctx.translate(rotW / 2, rotH / 2); rctx.rotate(rotation * Math.PI / 180); rctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2); rctx.restore();
    if (!crop || crop.w < 5 || crop.h < 5) { onDone(rc.toDataURL("image/jpeg", 0.97)); return; }
    const m = getMetrics(); if (!m) { onDone(rc.toDataURL("image/jpeg", 0.97)); return; }
    const pixPerDisp = rotW / (m.dispW * m.scale);
    const srcX = Math.max(0, (crop.x - m.imgLeft) * pixPerDisp), srcY = Math.max(0, (crop.y - m.imgTop) * pixPerDisp);
    const srcW = Math.min(rotW - srcX, crop.w * pixPerDisp), srcH = Math.min(rotH - srcY, crop.h * pixPerDisp);
    if (srcW < 2 || srcH < 2) { onDone(rc.toDataURL("image/jpeg", 0.97)); return; }
    const cc = document.createElement("canvas"); cc.width = Math.round(srcW); cc.height = Math.round(srcH);
    cc.getContext("2d").drawImage(rc, srcX, srcY, srcW, srcH, 0, 0, cc.width, cc.height);
    onDone(cc.toDataURL("image/jpeg", 0.97));
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111827", borderRadius: 12, padding: 20, width: Math.min(600, window.innerWidth - 24), boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 14, marginBottom: 10, fontFamily: "Georgia,serif" }}>✂️ Editar Imagem</div>
        {!loaded && <div style={{ color: "#555", textAlign: "center", padding: "36px 0" }}>Carregando...</div>}
        <canvas ref={canvasRef} width={DW} height={DH}
          style={{ width: "100%", height: "auto", borderRadius: 8, cursor: "crosshair", display: loaded ? "block" : "none", userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
        <div style={{ display: "flex", gap: 7, marginTop: 12, justifyContent: "space-between", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setRotation(r => (r - 90 + 360) % 360); setCrop(null); }} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5, padding: "6px 13px", cursor: "pointer", fontSize: 12 }}>↺ −90°</button>
            <button onClick={() => { setRotation(r => (r + 90) % 360); setCrop(null); }} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 5, padding: "6px 13px", cursor: "pointer", fontSize: 12 }}>↻ +90°</button>
            <button onClick={() => setCrop(null)} style={{ background: "transparent", color: "#666", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "6px 11px", cursor: "pointer", fontSize: 11 }}>↩ Sem corte</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onCancel} style={{ background: "#1f2937", color: "#aaa", border: "none", borderRadius: 5, padding: "7px 16px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Cancelar</button>
            <button onClick={confirm} style={{ background: RED, color: "#fff", border: "none", borderRadius: 5, padding: "7px 20px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>✓ Usar Imagem</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Image Slot ───
function ImageSlot({ dataUrl, onUpload, onRemove, label }) {
  const fileRef = useRef(); const [pending, setPending] = useState(null);
  const onFile = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setPending(ev.target.result); r.readAsDataURL(f); e.target.value = ""; };
  return (
    <>
      {pending && <CropEditor src={pending} onDone={url => { onUpload(url); setPending(null); }} onCancel={() => setPending(null)} />}
      <div style={{ flex: 1, height: "100%", position: "relative", cursor: "pointer" }} onClick={() => !dataUrl && fileRef.current.click()}>
        {dataUrl
          ? <><img src={dataUrl} alt="" onClick={() => fileRef.current.click()} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "pointer" }} />
              <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ position: "absolute", top: 3, right: 3, background: "rgba(192,57,43,0.85)", color: "#fff", border: "none", borderRadius: "50%", width: 17, height: 17, cursor: "pointer", fontSize: 9, padding: 0, lineHeight: "17px", textAlign: "center", zIndex: 2 }}>✕</button></>
          : <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f0f0f0", color: "#bbb" }}>
              <div style={{ fontSize: 18 }}>📷</div><div style={{ fontSize: 8, marginTop: 2 }}>{label}</div>
            </div>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
      </div>
    </>
  );
}

// ─── Part Card ───
function PartCard({ item, pageId, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown, onMoveToPage, onCopy, pages, isDragging, onDragStart, onDragEnd }) {
  const upd = ch => onUpdate(pageId, item.id, ch);
  const setImg = (i, url) => { const imgs = [...item.images]; imgs[i] = url; upd({ images: imgs }); };
  const inp = (key, label, flex = 1) => (
    <div style={{ display: "flex", alignItems: "center", gap: 3, flex }}>
      <span style={{ fontWeight: 700, fontSize: 10, whiteSpace: "nowrap", color: DARK }}>{label}:</span>
      <input value={item[key] || ""} onChange={e => upd({ [key]: e.target.value })}
        style={{ flex: 1, border: "none", borderBottom: `1.5px solid ${RED}`, outline: "none", fontSize: 10, padding: "1px 3px", background: "transparent", minWidth: 0 }} />
    </div>
  );
  const IMG_H = 88;
  return (
    <div draggable onDragStart={e => onDragStart(e, item.id, pageId)} onDragEnd={onDragEnd}
      style={{ display: "flex", gap: 8, border: `3px solid ${RED}`, borderRadius: 6, overflow: "hidden", background: isDragging ? "#fff5f5" : "#fff", marginBottom: 7, opacity: isDragging ? 0.4 : 1, boxShadow: "0 1px 6px rgba(192,57,43,0.12)", cursor: "grab" }}>
      {/* LEFT */}
      <div style={{ width: 155, minWidth: 155, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", height: IMG_H, overflow: "hidden", position: "relative" }}>
          <ImageSlot dataUrl={item.images[0]} label="Foto 1" onUpload={url => setImg(0, url)} onRemove={() => setImg(0, null)} />
          <div style={{ position: "absolute", left: "50%", top: "8%", bottom: "8%", width: 1, background: "rgba(192,57,43,0.3)", pointerEvents: "none" }} />
          <ImageSlot dataUrl={item.images[1]} label="Foto 2" onUpload={url => setImg(1, url)} onRemove={() => setImg(1, null)} />
        </div>
        <div style={{ borderTop: `2px solid ${RED}`, padding: "4px 4px 3px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "#fff" }}>
          <span style={{ color: RED, fontWeight: 900, fontSize: 13, letterSpacing: 1, fontFamily: "Georgia,serif" }}>LUSAR</span>
          <input value={item.lusarCode} onChange={e => upd({ lusarCode: e.target.value })} placeholder="000/000"
            style={{ width: 58, border: "none", borderBottom: `2px solid ${RED}`, outline: "none", fontSize: 12, fontWeight: 800, color: RED, background: "transparent", textAlign: "center", fontFamily: "Georgia,serif" }} />
        </div>
      </div>
      {/* Divider */}
      <div style={{ width: 2, background: "rgba(192,57,43,0.22)", flexShrink: 0, alignSelf: "stretch", margin: "10% 0" }} />
      {/* RIGHT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, padding: "7px 4px 7px 2px" }}>
        <div style={{ display: "flex", gap: 10, borderBottom: "1px solid #eee", paddingBottom: 3 }}>
          {inp("nOriginal", "Nº Original")} {inp("nAdicional", "Nº Adicional")}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid #eee", paddingBottom: 3, alignItems: "center" }}>
          {inp("lonasLe", "FRAS-LE")}
          <span style={{ color: RED, fontWeight: 700, fontSize: 10 }}>|</span>
          {inp("lonasLona", "LONAFLEX")}
          <span style={{ color: RED, fontWeight: 700, fontSize: 10 }}>|</span>
          {inp("lonasThermoid", "THERMOID")}
        </div>
        {/* OBS row */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #eee", paddingBottom: 3, alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 10, whiteSpace: "nowrap", color: DARK }}>OBS:</span>
          <input value={item.obs || ""} onChange={e => upd({ obs: e.target.value })} placeholder="Observação..."
            style={{ flex: 1, border: "none", borderBottom: `1.5px solid ${RED}`, outline: "none", fontSize: 10, padding: "1px 3px", background: "transparent" }} />
        </div>
        <div style={{ display: "flex", gap: 12, borderBottom: "1px solid #eee", paddingBottom: 3, alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 10, color: DARK }}>Freio:</span>
          {["Óleo", "Ar"].map(t => (
            <label key={t} style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 10 }}>
              <input type="radio" name={`fr-${item.id}`} value={t} checked={item.freio === t} onChange={() => upd({ freio: t })} style={{ accentColor: RED }} />
              Freio {t}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 10, color: DARK }}>Aplicação:</span>
          <textarea value={item.aplicacao} onChange={e => upd({ aplicacao: e.target.value })} placeholder="Descreva a aplicação..." rows={2}
            style={{ width: "100%", border: "1px solid #ddd", borderRadius: 4, fontSize: "6.5pt", padding: "3px 5px", resize: "vertical", outline: "none", background: "#fafafa", boxSizing: "border-box" }} />
        </div>
      </div>
      {/* ACTIONS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center", width: 24, padding: "6px 4px 6px 0" }}>
        <button onClick={() => onMoveUp(pageId, item.id)} disabled={isFirst} style={{ background: isFirst ? "#e0e0e0" : DARK, color: "#fff", border: "none", borderRadius: 3, width: 22, height: 22, cursor: isFirst ? "default" : "pointer", fontSize: 11 }}>▲</button>
        <button onClick={() => onMoveDown(pageId, item.id)} disabled={isLast} style={{ background: isLast ? "#e0e0e0" : DARK, color: "#fff", border: "none", borderRadius: 3, width: 22, height: 22, cursor: isLast ? "default" : "pointer", fontSize: 11 }}>▼</button>
        <button onClick={() => onCopy(pageId, item.id)} title="Duplicar" style={{ background: "#27ae60", color: "#fff", border: "none", borderRadius: 3, width: 22, height: 22, cursor: "pointer", fontSize: 13 }}>⎘</button>
        {pages.filter(p => p.id !== pageId).length > 0 && (
          <select onChange={e => { if (e.target.value) onMoveToPage(item.id, pageId, e.target.value); e.target.value = ""; }} defaultValue=""
            style={{ fontSize: 9, border: `1px solid ${RED}`, borderRadius: 3, color: RED, background: "#fff", width: 22, cursor: "pointer", padding: 0 }}>
            <option value="" disabled>↗</option>
            {pages.filter(p => p.id !== pageId).map(p => <option key={p.id} value={p.id}>P{pages.indexOf(p) + 1}</option>)}
          </select>
        )}
        <button onClick={() => onDelete(pageId, item.id)} style={{ background: RED, color: "#fff", border: "none", borderRadius: 3, width: 22, height: 22, cursor: "pointer", fontSize: 11, marginTop: "auto" }}>✕</button>
      </div>
    </div>
  );
}

// ─── Page Block ───
function PageBlock({ page, pages, pageIndex, onUpdateItem, onDeleteItem, onMoveItemUp, onMoveItemDown, onMoveItem, onCopyItem, onUpdatePage, onDeletePage, onAddItem, dragState, onDragStart, onDragEnd, onDrop }) {
  const leftRef = useRef(); const rightRef = useRef();
  const handleLogo = side => e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onUpdatePage(page.id, { [`${side}LogoUrl`]: ev.target.result }); r.readAsDataURL(f); e.target.value = ""; };
  return (
    <div style={{ background: "#fff", border: `2px solid ${RED}`, borderRadius: 8, marginBottom: 24, overflow: "hidden", boxShadow: "0 4px 16px rgba(192,57,43,0.10)" }}
      onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, page.id)}>
      <div style={{ background: `linear-gradient(90deg,${DARK},#16213e)`, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: `3px solid ${RED}` }}>
        <div onClick={() => leftRef.current.click()} style={{ width: 112, minWidth: 112, height: 56, background: "rgba(255,255,255,0.07)", border: "2px dashed rgba(192,57,43,0.4)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}>
          {page.leftLogoUrl ? <img src={page.leftLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ color: "rgba(192,57,43,0.7)", fontSize: 8.5, textAlign: "center" }}>Logo<br />Produto</span>}
          <input ref={leftRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogo("left")} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <input value={page.headerTitle} onChange={e => onUpdatePage(page.id, { headerTitle: e.target.value })}
            style={{ width: "100%", textAlign: "center", background: "transparent", border: "none", borderBottom: "2px solid rgba(192,57,43,0.4)", color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: 2, outline: "none", fontFamily: "Georgia,serif", textTransform: "uppercase" }} />
          <input value={page.headerSubtitle || ""} onChange={e => onUpdatePage(page.id, { headerSubtitle: e.target.value })} placeholder="nome da marca / subtítulo..."
            style={{ width: "80%", textAlign: "center", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)", fontSize: "7.5pt", outline: "none", letterSpacing: 1 }} />
        </div>
        <div onClick={() => rightRef.current.click()} style={{ width: 112, minWidth: 112, height: 56, background: "rgba(255,255,255,0.07)", border: "2px dashed rgba(192,57,43,0.4)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden" }}>
          {page.rightLogoUrl ? <img src={page.rightLogoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ color: "rgba(192,57,43,0.7)", fontSize: 8.5, textAlign: "center" }}>Logo<br />Empresa</span>}
          <input ref={rightRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogo("right")} />
        </div>
      </div>
      <div style={{ background: RED, padding: "3px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>PÁGINA {pageIndex + 1}</span>
        <button onClick={() => onDeletePage(page.id)} style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 3, padding: "1px 8px", cursor: "pointer", fontSize: 9 }}>✕ Remover</button>
      </div>
      <PageFillMeter page={page} />
      <div style={{ padding: 10 }}>
        {page.items.length === 0 && <div style={{ textAlign: "center", padding: "22px 0", color: "#ccc", fontSize: 11, border: "2px dashed #eee", borderRadius: 5 }}>Solte itens aqui ou adicione abaixo</div>}
        {page.items.map((item, idx) => (
          <PartCard key={item.id} item={item} pageId={page.id} pages={pages}
            isFirst={idx === 0} isLast={idx === page.items.length - 1}
            onUpdate={onUpdateItem} onDelete={onDeleteItem}
            onMoveUp={onMoveItemUp} onMoveDown={onMoveItemDown} onMoveToPage={onMoveItem} onCopy={onCopyItem}
            isDragging={dragState.dragId === item.id} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
        <button onClick={() => onAddItem(page.id)} style={{ width: "100%", padding: 7, background: "transparent", border: `2px dashed ${RED}`, borderRadius: 5, color: RED, cursor: "pointer", fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>+ ADICIONAR ITEM</button>
      </div>
    </div>
  );
}

function RestoreModal({ info, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 26, maxWidth: 380, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>
        <div style={{ color: DARK, fontWeight: 900, fontSize: 15, marginBottom: 10, fontFamily: "Georgia,serif" }}>📂 Restaurar Backup</div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>Salvo em: <b>{new Date(info.savedAt).toLocaleString("pt-BR")}</b></div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}><b>{info.pages.length} página(s)</b> · <b>{info.pages.reduce((s, p) => s + p.items.length, 0)} item(ns)</b></div>
        <div style={{ background: "#fff8e1", border: "1px solid #f9a825", borderRadius: 5, padding: "7px 12px", fontSize: 11, color: "#795548", marginBottom: 16 }}>⚠️ O trabalho atual será substituído. Continuar?</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "#eee", color: "#333", border: "none", borderRadius: 5, padding: "7px 16px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Cancelar</button>
          <button onClick={onConfirm} style={{ background: RED, color: "#fff", border: "none", borderRadius: 5, padding: "7px 18px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Restaurar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [pages, setPages] = useState([defaultPage()]);
  const [drag, setDrag] = useState({ dragId: null, fromPageId: null });
  const [pdfLoading, setPdfLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [restoreData, setRestoreData] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const backupRef = useRef();

  const updItem  = useCallback((pid, iid, ch) => setPages(prev => prev.map(p => p.id !== pid ? p : { ...p, items: p.items.map(it => it.id !== iid ? it : { ...it, ...ch }) })), []);
  const delItem  = useCallback((pid, iid) => setPages(prev => prev.map(p => p.id !== pid ? p : { ...p, items: p.items.filter(it => it.id !== iid) })), []);
  const copyItem = useCallback((pid, iid) => setPages(prev => prev.map(p => { if (p.id !== pid) return p; const idx = p.items.findIndex(it => it.id === iid); if (idx < 0) return p; const copy = { ...JSON.parse(JSON.stringify(p.items[idx])), id: gid() }; const items = [...p.items]; items.splice(idx + 1, 0, copy); return { ...p, items }; })), []);
  const moveUp   = useCallback((pid, iid) => setPages(prev => prev.map(p => { if (p.id !== pid) return p; const i = p.items.findIndex(it => it.id === iid); if (i <= 0) return p; const items = [...p.items]; [items[i - 1], items[i]] = [items[i], items[i - 1]]; return { ...p, items }; })), []);
  const moveDown = useCallback((pid, iid) => setPages(prev => prev.map(p => { if (p.id !== pid) return p; const i = p.items.findIndex(it => it.id === iid); if (i < 0 || i >= p.items.length - 1) return p; const items = [...p.items]; [items[i], items[i + 1]] = [items[i + 1], items[i]]; return { ...p, items }; })), []);
  const moveTo   = useCallback((iid, fpid, tpid) => setPages(prev => { const item = prev.find(p => p.id === fpid)?.items.find(it => it.id === iid); if (!item) return prev; return prev.map(p => { if (p.id === fpid) return { ...p, items: p.items.filter(it => it.id !== iid) }; if (p.id === tpid) return { ...p, items: [...p.items, item] }; return p; }); }), []);
  const updPage  = useCallback((pid, ch) => setPages(prev => prev.map(p => p.id !== pid ? p : { ...p, ...ch })), []);
  const delPage  = useCallback((pid) => setPages(prev => prev.length > 1 ? prev.filter(p => p.id !== pid) : prev), []);
  const addItem  = useCallback((pid) => setPages(prev => prev.map(p => p.id !== pid ? p : { ...p, items: [...p.items, defaultItem()] })), []);
  const addPage  = () => setPages(prev => [...prev, defaultPage()]);

  const handleImport = (groups) => {
    // Each group is an array of items → becomes one page
    // Inherit logo/header from the first existing page if available
    const template = pages[0];
    const newPages = groups.map((items, i) => ({
      id: gid(),
      headerTitle: template.headerTitle,
      headerSubtitle: template.headerSubtitle || "",
      leftLogoUrl: template.leftLogoUrl,
      rightLogoUrl: template.rightLogoUrl,
      items,
    }));
    setPages(prev => [...prev, ...newPages]);
    setShowImport(false);
  };

  const onDragStart = (e, iid, fpid) => { setDrag({ dragId: iid, fromPageId: fpid }); e.dataTransfer.effectAllowed = "move"; };
  const onDragEnd = () => setDrag({ dragId: null, fromPageId: null });
  const onDrop = (e, tpid) => { e.preventDefault(); if (drag.dragId && drag.fromPageId && drag.fromPageId !== tpid) moveTo(drag.dragId, drag.fromPageId, tpid); setDrag({ dragId: null, fromPageId: null }); };

  const handlePDF = async () => {
    setPdfLoading(true);
    try {
      setStatus("Carregando imagens...");
      const imgMap = await preloadAll(pages);
      setStatus("Renderizando..."); await new Promise(r => setTimeout(r, 40));
      const canvases = pages.map((pg, i) => { setStatus(`Pág ${i + 1}/${pages.length}...`); return renderPage(pg, i + 1, pages.length, PDF_W, PDF_H, imgMap); });
      setStatus("Montando PDF..."); await new Promise(r => setTimeout(r, 40));
      downloadBlob(buildPDF(canvases), "catalogo-pecas.pdf", "application/pdf");
      setStatus("");
    } catch (err) { setStatus("Erro: " + err.message); setTimeout(() => setStatus(""), 4000); }
    setPdfLoading(false);
  };

  const handleBackup = async e => { const file = e.target.files[0]; if (!file) return; e.target.value = ""; try { setRestoreData(await loadBackup(file)); } catch (err) { alert("Erro: " + err.message); } };

  return (
    <div style={{ minHeight: "100vh", background: "#e8e8e8", fontFamily: "'Segoe UI',sans-serif" }}>
      {restoreData && <RestoreModal info={restoreData} onConfirm={() => { setPages(restoreData.pages); setRestoreData(null); }} onCancel={() => setRestoreData(null)} />}
      {showImport && <ImportModal onImport={handleImport} onCancel={() => setShowImport(false)} />}

      {/* TOP BAR */}
      <div style={{ background: `linear-gradient(90deg,${DARK},${RED})`, padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 200, boxShadow: "0 3px 14px rgba(0,0,0,0.3)", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 17, letterSpacing: 2, fontFamily: "Georgia,serif" }}>CATÁLOGO DE PEÇAS</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>{pages.length} pág · {pages.reduce((a, p) => a + p.items.length, 0)} itens</div>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {status && <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>{status}</span>}
          <button onClick={addPage} style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "2px solid rgba(255,255,255,0.22)", borderRadius: 5, padding: "5px 13px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>+ Página</button>
          {/* JSON Import */}
          <button onClick={() => setShowImport(true)}
            style={{ background: "#27ae60", color: "#fff", border: "none", borderRadius: 5, padding: "5px 13px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>📥 Importar JSON</button>
          <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: "2px solid rgba(255,255,255,0.22)" }}>
            <button onClick={() => saveBackup(pages)} style={{ background: "rgba(255,255,255,0.11)", color: "#fff", border: "none", borderRight: "1px solid rgba(255,255,255,0.15)", padding: "5px 12px", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>💾 Backup</button>
            <button onClick={() => backupRef.current.click()} style={{ background: "rgba(255,255,255,0.11)", color: "#fff", border: "none", padding: "5px 12px", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>📂 Carregar</button>
            <input ref={backupRef} type="file" accept=".catbak,application/json" style={{ display: "none" }} onChange={handleBackup} />
          </div>
          <button onClick={handlePDF} disabled={pdfLoading}
            style={{ background: pdfLoading ? "#666" : RED, color: "#fff", border: "none", borderRadius: 5, padding: "5px 18px", cursor: pdfLoading ? "wait" : "pointer", fontWeight: 700, fontSize: 11, minWidth: 130, boxShadow: "0 2px 8px rgba(192,57,43,0.4)" }}>
            {pdfLoading ? `⏳ ${status || "Gerando..."}` : "⬇️ Baixar PDF"}
          </button>
        </div>
      </div>

      <div style={{ background: "#fff8e1", borderBottom: "2px solid #f9a825", padding: "5px 22px", fontSize: 10, color: "#795548", display: "flex", gap: 14, flexWrap: "wrap" }}>
        <span>📥 <b>Importar JSON</b> — cole o JSON e cada 5 peças vira uma página</span>
        <span>📷 Foto abre editor de corte</span>
        <span>⎘ Duplicar · ▲▼ Reordenar · ↗ Mover página</span>
        <span>💾 Backup completo com fotos</span>
      </div>

      <div style={{ maxWidth: 910, margin: "0 auto", padding: "18px 14px" }}>
        {pages.map((page, i) => (
          <PageBlock key={page.id} page={page} pages={pages} pageIndex={i}
            onUpdateItem={updItem} onDeleteItem={delItem} onMoveItemUp={moveUp} onMoveItemDown={moveDown}
            onMoveItem={moveTo} onCopyItem={copyItem} onUpdatePage={updPage} onDeletePage={delPage} onAddItem={addItem}
            dragState={drag} onDragStart={onDragStart} onDragEnd={onDragEnd} onDrop={onDrop} />
        ))}
        <button onClick={addPage} style={{ width: "100%", padding: 11, background: "transparent", border: `2px dashed ${RED}`, borderRadius: 7, color: RED, cursor: "pointer", fontWeight: 800, fontSize: 12, letterSpacing: 2 }}>+ ADICIONAR NOVA PÁGINA</button>
      </div>
    </div>
  );
}
