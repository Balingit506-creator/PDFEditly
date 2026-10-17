import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import * as PDFLib from "pdf-lib";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
const $ = (id) => document.getElementById(id);
const HINTS = {
  select:
    "Click any mark to select it, then drag to move. Double-click text to edit · select an arrow or line to drag its end points.",
  text: "Click the page to type · click existing text to move it · double-click to edit · Enter for a new line, click away to finish",
  hl: "Drag over text to highlight it.",
  draw: "Press and drag to draw.",
  white: "Drag over anything you want to cover up.",
  sign: "Click the page to place your signature · drag to move · pull the dot to resize",
  check: "Click to place a check mark · drag to move · pull the dot to resize",
  cross: "Click to place an X · drag to move · pull the dot to resize",
};
HINTS.rect = "Drag to draw a rectangle · select it to move or resize";
HINTS.cloud = "Drag to draw a cloud box · select it to move or resize";
HINTS.arrow =
  "Drag from one box to another to connect them · arrows follow when boxes move";
HINTS.photo =
  "Click the page to place your photo · drag to move · pull the dot to resize";
const COLORS = [
  "#171b2b",
  "#e5383b",
  "#2b7de9",
  "#16a34a",
  "#f59e0b",
  "#ffe600",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#92400e",
  "#6b7280",
];
const FONTS = {
  Helvetica: {
    css: "Helvetica,Arial,sans-serif",
    n: [
      "Helvetica",
      "HelveticaBold",
      "HelveticaOblique",
      "HelveticaBoldOblique",
    ],
  },
  Times: {
    css: '"Times New Roman",Times,serif',
    n: [
      "TimesRoman",
      "TimesRomanBold",
      "TimesRomanItalic",
      "TimesRomanBoldItalic",
    ],
  },
  Courier: {
    css: '"Courier New",Courier,monospace',
    n: ["Courier", "CourierBold", "CourierOblique", "CourierBoldOblique"],
  },
};
const MK = {
  check: [[0.12, 0.55, 0.4, 0.82, 0.88, 0.2]],
  cross: [
    [0.2, 0.2, 0.8, 0.8],
    [0.8, 0.2, 0.2, 0.8],
  ],
};
let rs = false,
  rsd = null,
  unit = "in";
function edgePt(b, t, gw, gh) {
  const cx = b.x + b.w / 2,
    cy = b.y + b.h / 2,
    dx = (t[0] - cx) * gw,
    dy = (t[1] - cy) * gh,
    hw = (b.w * gw) / 2,
    hh = (b.h * gh) / 2;
  if (!dx && !dy) return [cx, cy];
  const s =
    b.k === "cloud" || b.k === "ellipse"
      ? 1 / Math.hypot(dx / hw, dy / hh)
      : Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
  return [cx + (dx * s) / gw, cy + (dy * s) / gh];
}
function ends(a, gw = pages[cur].wpt, gh = pages[cur].hpt) {
  const c = (e) =>
      e.ref
        ? [fb(e.ref).x + fb(e.ref).w / 2, fb(e.ref).y + fb(e.ref).h / 2]
        : e.p,
    t1 = c(a.a),
    t2 = c(a.b),
    an = (e, t) =>
      e.ref
        ? (e.side && anchors(e.ref)[e.side]) || edgePt(fb(e.ref), t, gw, gh)
        : e.p;
  return [an(a.a, t2), an(a.b, t1)];
}
function arrowLen(a) {
  const [p, q] = ends(a);
  return Math.hypot((q[0] - p[0]) * ov.width, (q[1] - p[1]) * ov.height);
}
function shapePts(a, gw = pages[cur].wpt, gh = pages[cur].hpt) {
  if (a.t === "arrow") {
    const [p, q] = ends(a, gw, gh),
      th = Math.atan2((q[1] - p[1]) * gh, (q[0] - p[0]) * gw),
      L = Math.max(11, (a.lw || 2) * 4.5),
      h = (s) => [
        q[0] - (L * Math.cos(th + s)) / gw,
        q[1] - (L * Math.sin(th + s)) / gh,
      ];
    return a.nh
      ? [[p, q]]
      : [
          [p, q],
          [h(0.45), q, h(-0.45)],
        ];
  }
  const { x, y, w, h } = a;
  const P = (u, v) => [x + u * w, y + v * h];
  if (a.k === "tri") return [[P(0.5, 0), P(1, 1), P(0, 1), P(0.5, 0)]];
  if (a.k === "clrect" || a.k === "cltri" || a.k === "clpent") {
    const b = shapePts(
      { ...a, k: { clrect: "rect", cltri: "tri", clpent: "pentagon" }[a.k] },
      gw,
      gh,
    )[0];
    return [cloudify(b, gw, gh)];
  }
  if (a.k === "rect")
    return [
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
      ],
    ];
  if (a.k === "round") {
    const r = Math.min(w * gw, h * gh) * 0.22,
      ru = r / gw,
      rv = r / gh,
      pl = [];
    [
      [x + w - ru, y + rv, -90],
      [x + w - ru, y + h - rv, 0],
      [x + ru, y + h - rv, 90],
      [x + ru, y + rv, 180],
    ].forEach(([cx, cy, a0]) => {
      for (let i = 0; i <= 8; i++) {
        const t = ((a0 + i * 11.25) * Math.PI) / 180;
        pl.push([cx + ru * Math.cos(t), cy + rv * Math.sin(t)]);
      }
    });
    pl.push(pl[0]);
    return [pl];
  }
  if (a.k === "ellipse") {
    const pl = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      pl.push(P(0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t)));
    }
    return [pl];
  }
  if (a.k === "elbow") return [[P(0, 0), P(0.5, 0), P(0.5, 1), P(1, 1)]];
  if (a.k === "pentagon")
    return [
      [0, 1, 2, 3, 4, 5].map((i) => {
        const t = ((-90 + 72 * i) * Math.PI) / 180;
        return P(0.5 + (0.5 * Math.cos(t)) / 0.951, (Math.sin(t) + 1) / 1.809);
      }),
    ];
  if (a.k === "curve") {
    const pl = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      pl.push(P(t, 1 - (0.5 - 0.5 * Math.cos(Math.PI * t))));
    }
    return [pl];
  }
  if (a.k === "dshape") {
    const pl = [P(0, 0), P(0.5, 0)];
    for (let i = 1; i <= 24; i++) {
      const t = -Math.PI / 2 + (i / 24) * Math.PI;
      pl.push(P(0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t)));
    }
    pl.push(P(0, 1), P(0, 0));
    return [pl];
  }
  if (a.k === "lshape")
    return [
      [P(0, 0), P(0.4, 0), P(0.4, 0.6), P(1, 0.6), P(1, 1), P(0, 1), P(0, 0)],
    ];
  const b = Math.max(6, Math.min(36, Math.round((w * gw + h * gh) / 38))),
    n = b * 14,
    pl = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2,
      r = 0.9 + 0.1 * Math.abs(Math.sin((b * t) / 2));
    pl.push([
      x + w / 2 + (w / 2) * r * Math.cos(t),
      y + h / 2 + (h / 2) * r * Math.sin(t),
    ]);
  }
  return [pl];
}
const OPEN = ["elbow", "curve"];
const fidx = (a) => (a.b && a.i ? 3 : a.i ? 2 : a.b ? 1 : 0);
const fontStr = (a, k) =>
  (a.i ? "italic " : "") +
  (a.b ? "bold " : "") +
  a.s * k +
  "px " +
  FONTS[a.f].css;
let bytes,
  doc,
  pages = [],
  cur = 0,
  zoom = 1.2,
  fit = 1.2,
  tool = "select",
  fname = "document.pdf",
  tok = 0,
  drag = null,
  mv = null,
  sel = null,
  tp = null,
  tt;
const opt = { c: COLORS[0], f: "Helvetica", s: 18, b: false, i: false };
const cv = $("cv"),
  ov = $("ov"),
  octx = ov.getContext("2d"),
  ti = $("ti");
const kk = () => ov.height / pages[cur].hpt;
function toast(m) {
  const t = $("toast");
  t.textContent = m;
  t.classList.add("show");
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove("show"), 2600);
}

COLORS.forEach((c, i) => {
  const b = document.createElement("button");
  b.className = "sw" + (i ? "" : " on");
  b.style.background = c;
  b.dataset.c = c;
  b.title = "Colour";
  b.onclick = () => setColor(c);
  $("cols").append(b);
});
$("cc").oninput = (e) => setColor(e.target.value);
function setColor(c) {
  if (tool === "ah" || (sel && sel.t === "ah")) opt.hc = c;
  else opt.c = c;
  document
    .querySelectorAll(".sw")
    .forEach((x) => x.classList.toggle("on", x.dataset.c === c));
  if (sel && sel.c) sel.c = c;
  styleInput();
  if (doc) paint();
}
function syncOpts() {
  $("ff").value = opt.f;
  $("sn").value = opt.s;
  $("bb").classList.toggle("on", opt.b);
  $("ib").classList.toggle("on", opt.i);
  document
    .querySelectorAll(".sw")
    .forEach((x) => x.classList.toggle("on", x.dataset.c === opt.c));
}
function showOpts() {
  $("topts").hidden = !(tool === "text" || (sel && sel.t === "text"));
  $("popts").hidden = !(sel && sel.k === "photo");
  $("lopts").hidden = !(
    ["shape", "draw", "arrow", "rect", "cloud"].includes(tool) ||
    (sel && ["box", "arrow", "draw"].includes(sel.t))
  );
  syncPhoto();
}
function applyOpts() {
  if (sel && sel.t === "text")
    Object.assign(sel, { f: opt.f, s: opt.s, b: opt.b, i: opt.i });
  styleInput();
  if (doc) paint();
}
function styleInput() {
  if (!tp) return;
  const k = kk();
  ti.style.font = fontStr(opt, k);
  ti.style.color = opt.c;
  ti.style.lineHeight = "1.2";
  const L = ti.value.split("\n");
  octx.font = fontStr(opt, k);
  ti.style.width =
    Math.max(110, Math.max(...L.map((l) => octx.measureText(l).width)) + 26) +
    "px";
  ti.style.height = L.length * opt.s * k * 1.2 + 4 + "px";
}
const clampS = (v) => Math.max(6, Math.min(300, Math.round(v)));
$("ff").onchange = (e) => {
  opt.f = e.target.value;
  applyOpts();
};
$("sn").oninput = (e) => {
  const v = +e.target.value;
  if (v >= 6) {
    opt.s = clampS(v);
    applyOpts();
  }
};
$("sm").onclick = () => {
  opt.s = clampS(opt.s - 2);
  syncOpts();
  applyOpts();
};
$("sp").onclick = () => {
  opt.s = clampS(opt.s + 2);
  syncOpts();
  applyOpts();
};
$("bb").onclick = () => {
  opt.b = !opt.b;
  syncOpts();
  applyOpts();
};
$("ib").onclick = () => {
  opt.i = !opt.i;
  syncOpts();
  applyOpts();
};
syncOpts();

$("open").onclick = $("open2").onclick = () => $("file").click();
$("file").onchange = (e) => {
  if (e.target.files[0]) {
    showApp();
    load(e.target.files[0]);
  }
};
const st = $("stage");
st.ondragover = (e) => {
  e.preventDefault();
  $("drop").classList.add("over");
};
st.ondragleave = () => $("drop").classList.remove("over");
st.ondrop = (e) => {
  e.preventDefault();
  $("drop").classList.remove("over");
  const f = e.dataTransfer.files[0];
  f && load(f);
};

async function load(f) {
  if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
    toast("That doesn’t look like a PDF.");
    return;
  }
  try {
    fname = f.name;
    bytes = new Uint8Array(await f.arrayBuffer());
    doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    pages = [];
    for (let i = 0; i < doc.numPages; i++)
      pages.push({ src: i, rot: 0, ann: [] });
    cur = 0;
    sel = null;
    $("drop").hidden = true;
    $("sheet").hidden = false;
    $("nav").hidden = $("dockwrap").hidden = false;
    $("save").disabled = false;
    $("fn").textContent = fname;
    const pg = await doc.getPage(1),
      w = pg.getViewport({ scale: 1 }).width;
    fit = zoom = Math.max(0.5, Math.min(2, (st.clientWidth - 60) / w));
    setTool("select");
    await thumbs();
    await show();
    toast("Opened " + fname);
  } catch (err) {
    toast("Couldn’t open that file.");
  }
}

async function thumbs() {
  const box = $("thumbs");
  box.innerHTML = "";
  for (let i = 0; i < pages.length; i++) {
    const pg = await doc.getPage(pages[i].src + 1),
      vp = pg.getViewport({ scale: 0.25, rotation: pages[i].rot });
    const d = document.createElement("div");
    d.className = "th" + (i === cur ? " sel" : "");
    const c = document.createElement("canvas");
    c.width = vp.width;
    c.height = vp.height;
    d.append(c, document.createTextNode(i + 1));
    d.onclick = () => go(i);
    box.append(d);
    pg.render({ canvasContext: c.getContext("2d"), viewport: vp });
  }
}
function go(i) {
  if (i < 0 || i >= pages.length || i === cur) return;
  commitText();
  select(null);
  cur = i;
  show();
  document.querySelectorAll(".th").forEach((d, j) => {
    d.classList.toggle("sel", j === i);
    if (j === i) d.scrollIntoView({ block: "nearest" });
  });
}

async function show() {
  const my = ++tok,
    p = pages[cur],
    pg = await doc.getPage(p.src + 1);
  const vp = pg.getViewport({ scale: zoom, rotation: p.rot });
  const v1 = pg.getViewport({ scale: 1 });
  p.hpt = v1.height;
  p.wpt = v1.width;
  cv.width = ov.width = vp.width;
  cv.height = ov.height = vp.height;
  $("zl").textContent = Math.round((zoom / fit) * 100) + "%";
  $("pg").textContent = cur + 1 + " / " + pages.length;
  $("prev").disabled = cur === 0;
  $("next").disabled = cur === pages.length - 1;
  $("undo").disabled = !p.ann.length;
  await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
  if (my === tok) paint();
}

function bbox(a) {
  const W = ov.width,
    H = ov.height,
    k = kk();
  if (a.t === "text") {
    octx.font = fontStr(a, k);
    const L = tLines(a, (s) => octx.measureText(s).width, W);
    return [
      a.x * W,
      a.y * H,
      a.bw ? a.bw * W : Math.max(...L.map((l) => octx.measureText(l).width)),
      a.s * k * 1.2 * L.length,
    ];
  }
  if (a.t === "arrow") {
    const [e1, e2] = ends(a);
    return [
      Math.min(e1[0], e2[0]) * W,
      Math.min(e1[1], e2[1]) * H,
      Math.abs(e2[0] - e1[0]) * W,
      Math.abs(e2[1] - e1[1]) * H,
    ];
  }
  if (a.t === "sig" || a.t === "mark")
    return [a.x * W, a.y * H, a.w * W, a.w * W * a.ar];
  if (a.t === "draw" || a.t === "meas") {
    const xs = a.p.map((q) => q[0] * W),
      ys = a.p.map((q) => q[1] * H),
      x = Math.min(...xs),
      y = Math.min(...ys);
    return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
  }
  return [a.x * W, a.y * H, a.w * W, a.h * H];
}
function hit(px, py, textOnly) {
  const L = pages[cur].ann;
  for (let i = L.length - 1; i >= 0; i--) {
    const a = L[i];
    if (
      a.hide ||
      (textOnly &&
        (textOnly === true
          ? a.t !== "text"
          : !textOnly.includes(a.t) &&
            !(
              textOnly.includes("box") &&
              a.t === "draw" &&
              ((a.poly && !a.open) || a.cl || a.f)
            )))
    )
      continue;
    if (a.t === "arrow") {
      const [e1, e2] = ends(a),
        W = ov.width,
        H = ov.height,
        ax = e1[0] * W,
        ay = e1[1] * H,
        dx = e2[0] * W - ax,
        dy = e2[1] * H - ay,
        t = Math.max(
          0,
          Math.min(
            1,
            ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
      if (Math.hypot(px - ax - t * dx, py - ay - t * dy) < 8) return a;
      continue;
    }
    if (a.t === "box") {
      const [x, y, w, h] = bbox(a),
        m = 8;
      if (px < x - m || px > x + w + m || py < y - m || py > y + h + m)
        continue;
      if (Array.isArray(textOnly) && textOnly.includes("box")) return a;
      if (!a.f && px > x + m && px < x + w - m && py > y + m && py < y + h - m)
        continue;
      return a;
    }
    const [x, y, w, h] = bbox(a),
      m = a.t === "draw" ? 7 : 3;
    if (px >= x - m && px <= x + w + m && py >= y - m && py <= y + h + m)
      return a;
  }
  return null;
}
function paint() {
  syncC();
  const W = ov.width,
    H = ov.height,
    k = kk();
  octx.clearRect(0, 0, W, H);
  for (const a of pages[cur].ann) if (!a.hide) drawA(octx, a, W, H, k);
  if (drag) {
    drag.lw = drag.lw || opt.lw;
    drawA(octx, drag, W, H, k);
  }
  if (connTool() || (drag && drag.t === "arrow")) {
    octx.save();
    octx.fillStyle = "#0e7490";
    octx.globalAlpha = 0.55;
    for (const a of pages[cur].ann)
      if (
        a.t === "box" ||
        (a.t === "draw" && ((a.poly && !a.open) || a.cl || a.f))
      )
        for (const sd of Object.keys(anchors(a))) {
          const q = sidePx(a, sd);
          octx.beginPath();
          octx.arc(q[0], q[1], 4, 0, 7);
          octx.fill();
        }
    octx.globalAlpha = 1;
    if (drag && drag.t === "arrow")
      for (const e of [drag.a, drag.b])
        if (e.ref && e.side) {
          const q = sidePx(e.ref, e.side);
          octx.beginPath();
          octx.arc(q[0], q[1], 7, 0, 7);
          octx.fill();
        }
    if (pb && pbs) {
      const q = sidePx(pbs.ref, pbs.side);
      octx.beginPath();
      octx.arc(q[0], q[1], 7, 0, 7);
      octx.fill();
    }
    if (eh && sel && sel.t === "arrow") {
      const e = sel[eh.i ? "b" : "a"];
      if (e.ref && e.side) {
        const q = sidePx(e.ref, e.side);
        octx.beginPath();
        octx.arc(q[0], q[1], 7, 0, 7);
        octx.fill();
      }
    }
    octx.restore();
  }
  if (pb) {
    drawA(octx, { ...pb, p: pbm ? [...pb.p, pbm] : pb.p }, W, H, k);
    octx.save();
    octx.fillStyle = pb.c;
    pb.p.forEach((z, i) => {
      octx.beginPath();
      octx.arc(z[0] * W, z[1] * H, i ? 3 : 6, 0, 7);
      octx.fill();
    });
    octx.restore();
  }
  if (drag && drag.t === "arrow")
    for (const e of [drag.a, drag.b])
      if (e.ref) {
        const [x, y, w, h] = bbox(e.ref);
        octx.save();
        octx.strokeStyle = "#0e7490";
        octx.lineWidth = 1.5;
        octx.setLineDash([5, 4]);
        octx.strokeRect(x - 4, y - 4, w + 8, h + 8);
        octx.restore();
      }
  if (sel && !sel.hide && pages[cur].ann.includes(sel)) {
    const [x, y, w, h] = bbox(sel);
    octx.save();
    octx.strokeStyle = "#0e7490";
    octx.lineWidth = 1.5;
    octx.setLineDash([5, 4]);
    octx.strokeRect(x - 4, y - 3, w + 8, h + 6);
    if (RSZ.includes(sel.t)) {
      octx.setLineDash([]);
      octx.fillStyle = "#0e7490";
      octx.beginPath();
      octx.arc(x + w + 4, y + h + 3, 6, 0, 7);
      octx.fill();
    }
    if (sel.t === "text") {
      octx.fillStyle = "#0e7490";
      octx.beginPath();
      octx.arc(x + w + 4, y + h / 2, 5, 0, 7);
      octx.fill();
    }
    octx.setLineDash([]);
    for (const h of hlist(sel)) {
      octx.beginPath();
      octx.arc(h[0] * W, h[1] * H, 6, 0, 7);
      octx.fillStyle = "#fff";
      octx.fill();
      octx.strokeStyle = "#0e7490";
      octx.lineWidth = 2;
      octx.stroke();
    }
    octx.restore();
    if (sel.k === "photo") {
      syncPhoto();
      photoLabel();
    }
  }
}
function drawA(c, a, W, H, k) {
  if (a.t === "text") {
    c.fillStyle = a.c;
    c.font = fontStr(a, k);
    c.textBaseline = "top";
    tLines(a, (s) => c.measureText(s).width, W).forEach((l, i) =>
      c.fillText(l, a.x * W, a.y * H + i * a.s * k * 1.2),
    );
  } else if (a.t === "box" || a.t === "arrow") {
    c.strokeStyle = c.fillStyle = a.c;
    const op = OPEN.includes(a.k),
      fl = a.f && a.t === "box" && !op;
    c.lineWidth = (a.f && op ? 2 : 1) * (a.lw || 2) * k;
    c.lineCap = c.lineJoin = "round";
    for (const pl of shapePts(a)) {
      c.beginPath();
      pl.forEach((q, i) =>
        i ? c.lineTo(q[0] * W, q[1] * H) : c.moveTo(q[0] * W, q[1] * H),
      );
      if (fl) c.fill();
      c.stroke();
    }
  } else if (a.t === "sig") {
    c.drawImage(a.im, a.x * W, a.y * H, a.w * W, a.w * W * a.ar);
  } else if (a.t === "mark") {
    const s = a.w * W,
      x0 = a.x * W,
      y0 = a.y * H;
    c.strokeStyle = a.c;
    c.lineWidth = 0.13 * s;
    c.lineCap = c.lineJoin = "round";
    c.beginPath();
    MK[a.k].forEach((l) => {
      c.moveTo(x0 + l[0] * s, y0 + l[1] * s);
      for (let i = 2; i < l.length; i += 2)
        c.lineTo(x0 + l[i] * s, y0 + l[i + 1] * s);
    });
    c.stroke();
  } else if (a.t === "draw") {
    c.strokeStyle = a.c;
    c.lineWidth = (a.lw || 2) * k;
    c.lineCap = c.lineJoin = "round";
    c.beginPath();
    (a.cl && a.p.length > 2
      ? cloudify(a.p, pages[cur].wpt, pages[cur].hpt, 0, a.poly)
      : a.p
    ).forEach((q, i) =>
      i ? c.lineTo(q[0] * W, q[1] * H) : c.moveTo(q[0] * W, q[1] * H),
    );
    if (a.f || (a.poly && !a.open)) c.closePath();
    if (a.f) {
      c.globalAlpha = 0.85;
      c.fill();
      c.globalAlpha = 1;
    }
    c.stroke();
    if (a.arr && a.p.length > 1) {
      const hp = ahPts(a.p, pages[cur].wpt, pages[cur].hpt, a.lw || 2);
      c.beginPath();
      hp.forEach((q, i) =>
        i ? c.lineTo(q[0] * W, q[1] * H) : c.moveTo(q[0] * W, q[1] * H),
      );
      c.stroke();
    }
  } else if (a.t === "note") {
    const x = a.x * W,
      y = a.y * H,
      w = a.w * W,
      h = a.h * H;
    c.fillStyle = "#fde047";
    c.strokeStyle = "#a16207";
    c.lineWidth = 1.2 * k;
    c.fillRect(x, y, w, h);
    c.strokeRect(x, y, w, h);
    c.beginPath();
    c.moveTo(x + w * 0.2, y + h * 0.35);
    c.lineTo(x + w * 0.8, y + h * 0.35);
    c.moveTo(x + w * 0.2, y + h * 0.62);
    c.lineTo(x + w * 0.6, y + h * 0.62);
    c.stroke();
  } else if (a.t === "tbox" || a.t === "call") {
    const x = a.x * W,
      y = a.y * H,
      w = a.w * W,
      h = a.h * H;
    c.fillStyle = "#fffbe6";
    c.strokeStyle = a.c;
    c.lineWidth = 1.2 * k;
    c.fillRect(x, y, w, h);
    c.strokeRect(x, y, w, h);
    if (a.t === "call") {
      c.beginPath();
      c.moveTo(x + w * 0.15, y + h);
      c.lineTo(x + w * 0.15 - 24 * k, y + h + 30 * k);
      c.stroke();
    }
    c.font = 12 * k + "px Helvetica,Arial,sans-serif";
    c.fillStyle = a.c;
    c.textBaseline = "top";
    wrap((s) => c.measureText(s).width, a.v || "", w - 8 * k).forEach((l, i) =>
      c.fillText(l, x + 4 * k, y + 4 * k + i * 14.4 * k),
    );
  } else if (a.t === "ul" || a.t === "st" || a.t === "sq") {
    const y = (a.t === "st" ? a.y + a.h / 2 : a.y + a.h) * H,
      pl =
        a.t === "sq"
          ? zig(a.x * W, (a.x + a.w) * W, y, 2.5 * k, 1.5 * k)
          : [
              [a.x * W, y],
              [(a.x + a.w) * W, y],
            ];
    c.strokeStyle = a.c;
    c.lineWidth = 1.6 * k;
    c.lineJoin = "round";
    c.beginPath();
    pl.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
    c.stroke();
  } else if (a.t === "ah") {
    c.globalAlpha = 0.3;
    c.fillStyle = a.c;
    c.fillRect(a.x * W, a.y * H, a.w * W, a.h * H);
    c.globalAlpha = 1;
    c.strokeStyle = a.c;
    c.lineWidth = 1.2 * k;
    c.setLineDash([5 * k, 3 * k]);
    c.strokeRect(a.x * W, a.y * H, a.w * W, a.h * H);
    c.setLineDash([]);
  } else if (a.t === "meas") {
    const [p, q] = a.p.map((z) => [z[0] * W, z[1] * H]),
      th = Math.atan2(q[1] - p[1], q[0] - p[0]),
      nx = -Math.sin(th) * 5 * k,
      ny = Math.cos(th) * 5 * k;
    c.strokeStyle = a.c;
    c.lineWidth = 1.5 * k;
    c.beginPath();
    c.moveTo(p[0], p[1]);
    c.lineTo(q[0], q[1]);
    for (const e of [p, q]) {
      c.moveTo(e[0] - nx, e[1] - ny);
      c.lineTo(e[0] + nx, e[1] + ny);
    }
    c.stroke();
    const t = mLabel(a);
    c.font = "600 " + 11 * k + "px system-ui,sans-serif";
    const tw = c.measureText(t).width;
    c.fillStyle = "#fff";
    c.fillRect(
      (p[0] + q[0]) / 2 + 4 * k,
      (p[1] + q[1]) / 2 - 14 * k,
      tw + 6 * k,
      14 * k,
    );
    c.fillStyle = a.c;
    c.textBaseline = "top";
    c.fillText(t, (p[0] + q[0]) / 2 + 7 * k, (p[1] + q[1]) / 2 - 12 * k);
  } else {
    c.globalAlpha = a.t === "hl" ? 0.35 : 1;
    c.fillStyle = a.t === "hl" ? "#ffe600" : "#fff";
    c.fillRect(a.x * W, a.y * H, a.w * W, a.h * H);
    c.globalAlpha = 1;
  }
}
function select(a) {
  sel = a;
  if (a && a.t === "text") {
    Object.assign(opt, { f: a.f, s: a.s, b: a.b, i: a.i, c: a.c });
    syncOpts();
  }
  if (a && a.lw) {
    opt.lw = a.lw;
    $("lw").value = a.lw;
  }
  $("trash").disabled = !a;
  showOpts();
  if (doc) paint();
}

function setTool(t) {
  commitText();
  pb = null;
  tool = t;
  if (
    !["select", "text", "sign", "check", "cross", "photo", "stamp"].includes(t)
  )
    select(null);
  document
    .querySelectorAll("#dock [data-t]")
    .forEach((x) => x.classList.toggle("on", x.dataset.t === t));
  document
    .querySelectorAll("#cr [data-t]")
    .forEach((x) => x.classList.toggle("on", x.dataset.t === t));
  $("hint").textContent = HINTS[t] + " · Right-drag to pan";
  showOpts();
  ov.style.cursor = curs(t);
}
document.querySelectorAll("#dock [data-t]").forEach(
  (b) =>
    (b.onclick = () => {
      rb = false;
      setTool(b.dataset.t);
    }),
);
setTool("select");

const pt = (e) => {
  const r = ov.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
};
function canAnn() {
  if (pages[cur].rot) {
    toast("Rotate the page back to 0° to annotate it.");
    return false;
  }
  return true;
}

ov.onpointerdown = (e) => {
  if (e.button === 2 || e.button === 1) return;
  if (!doc) return;
  commitText();
  const [x, y] = pt(e),
    W = ov.width,
    H = ov.height;
  if (tool === "select" && sel) {
    const hs = hlist(sel);
    for (let i = 0; i < hs.length; i++)
      if (Math.hypot((hs[i][0] - x) * W, (hs[i][1] - y) * H) < 10) {
        eh = { i };
        ov.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
  }
  if (
    tool === "shape" &&
    ["clpoly", "poly", "polyline", "arrowpath"].includes(shapeKind)
  ) {
    if (!canAnn()) return;
    polyClick(x, y);
    e.preventDefault();
    return;
  }
  if (tool === "hand") {
    pan = { x: e.clientX, y: e.clientY, l: st.scrollLeft, t: st.scrollTop };
    st.setPointerCapture(e.pointerId);
    ov.style.cursor = "grabbing";
    e.preventDefault();
    return;
  }
  if (tool === "erase") {
    ers = true;
    eraseAt(x, y);
    ov.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (tool === "note") {
    const a = hit(x * W, y * H, ["note"]);
    if (a) {
      select(a);
      mv = { x, y };
      ov.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    select(null);
    if (!canAnn()) return;
    const w = 0.03,
      n = {
        t: "note",
        x: x - w / 2,
        y: y - (w * W) / H / 2,
        w,
        h: (w * W) / H,
        v: "",
      };
    pages[cur].ann.push(n);
    select(n);
    $("undo").disabled = false;
    openCM(n, true);
    e.preventDefault();
    return;
  }
  if (sel && RSZ.includes(sel.t)) {
    const [bx, by, bw, bh] = bbox(sel);
    rsd = { w: bw, s: sel.s };
    if (
      sel.t === "text" &&
      Math.hypot(x * W - bx - bw - 4, y * H - by - bh / 2) < 10
    ) {
      rw = true;
      ov.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (Math.hypot(x * W - bx - bw - 4, y * H - by - bh - 3) < 12) {
      rs = true;
      ov.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
  }
  if (
    tool === "sign" ||
    tool === "check" ||
    tool === "cross" ||
    tool === "photo" ||
    tool === "stamp"
  ) {
    const a = hit(x * W, y * H, ["sig", "mark"]);
    if (a) {
      select(a);
      mv = { x, y };
      ov.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    select(null);
    if (!canAnn()) return;
    let n;
    if (tool === "photo") {
      if (!activePhoto) {
        openPhoto();
        return;
      }
      const w = 0.4;
      n = {
        t: "sig",
        k: "photo",
        o: {
          im: activePhoto.im,
          jpeg: activePhoto.src.startsWith("data:image/jpeg"),
        },
        w,
        ar: activePhoto.ar,
        src: activePhoto.src,
        im: activePhoto.im,
        x: x - w / 2,
        y: y - (w * W * activePhoto.ar) / H / 2,
      };
    } else if (tool === "stamp") {
      if (!stampGen) return;
      const g = stampGen();
      n = {
        t: "sig",
        w: g.w,
        ar: g.ar,
        src: g.src,
        im: g.im,
        x: x - g.w / 2,
        y: y - (g.w * W * g.ar) / H / 2,
      };
    } else if (tool === "sign") {
      if (!activeSig) {
        openSig();
        return;
      }
      const w = 0.2;
      n = {
        t: "sig",
        w,
        ar: activeSig.ar,
        src: activeSig.src,
        im: activeSig.im,
        x: x - w / 2,
        y: y - (w * W * activeSig.ar) / H / 2,
      };
    } else {
      const w = 0.04;
      n = {
        t: "mark",
        k: tool,
        w,
        ar: 1,
        c: opt.c,
        x: x - w / 2,
        y: y - (w * W) / H / 2,
      };
    }
    pages[cur].ann.push(n);
    select(n);
    $("undo").disabled = false;
    afterPlace();
    e.preventDefault();
    return;
  }
  if (tool === "select" || tool === "text") {
    const a = hit(x * W, y * H, tool === "text");
    if (a) {
      select(a);
      mv = { x, y };
      ov.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    select(null);
    if (tool === "select") return;
  }
  if (!canAnn()) return;
  if (tool === "text") {
    openText(x, y);
    e.preventDefault();
    return;
  }
  ov.setPointerCapture(e.pointerId);
  const sl = tool === "shape" && shapeKind === "line";
  drag =
    tool === "arrow" || sl
      ? (() => {
          const bx = hit(x * W, y * H, ["box"]);
          return {
            t: "arrow",
            nh: sl,
            c: opt.c,
            a: bx ? { ref: bx, side: snapSide(bx, x, y) } : { p: [x, y] },
            b: { p: [x, y] },
          };
        })()
      : tool === "shape" &&
          (shapeKind === "free" ||
            shapeKind === "clfree" ||
            shapeKind === "arrowfree")
        ? {
            t: "draw",
            c: opt.c,
            f: shapeFill,
            cl: shapeKind === "clfree",
            arr: shapeKind === "arrowfree",
            p: [[x, y]],
          }
        : tool === "shape"
          ? {
              t: "box",
              k: shapeKind,
              f: shapeFill,
              c: opt.c,
              x,
              y,
              w: 0,
              h: 0,
              x0: x,
              y0: y,
            }
          : tool === "rect" || tool === "cloud"
            ? { t: "box", k: tool, c: opt.c, x, y, w: 0, h: 0, x0: x, y0: y }
            : tool === "draw"
              ? { t: "draw", c: opt.c, p: [[x, y]] }
              : tool === "meas"
                ? {
                    t: "meas",
                    c: opt.c,
                    p: [
                      [x, y],
                      [x, y],
                    ],
                  }
                : {
                    t: tool,
                    c: tool === "ah" ? opt.hc : opt.c,
                    x,
                    y,
                    w: 0,
                    h: 0,
                    x0: x,
                    y0: y,
                  };
};
ov.onpointermove = (e) => {
  const [x, y] = pt(e);
  if (ers) {
    eraseAt(x, y);
    return;
  }
  if (eh && sel) {
    moveH(x, y);
    return;
  }
  if (pb) {
    pbm = polyPt(x, y);
    paint();
    return;
  }
  if (rw && sel) {
    sel.bw = Math.max(0.04, x - sel.x);
    paint();
    return;
  }
  if (rs && sel) {
    if (sel.t === "text") {
      const nw = Math.max(8, x * ov.width - sel.x * ov.width);
      sel.s = Math.max(6, Math.min(300, Math.round((rsd.s * nw) / rsd.w)));
      opt.s = sel.s;
      $("sn").value = sel.s;
      if (sel.bw) sel.bw = Math.max(0.04, x - sel.x);
    } else if (BOXY.includes(sel.t)) {
      sel.w = Math.max(0.01, x - sel.x);
      sel.h = Math.max(0.01, y - sel.y);
    } else sel.w = Math.max(0.02, x - sel.x);
    paint();
    return;
  }
  if (mv && sel) {
    const dx = x - mv.x,
      dy = y - mv.y;
    mv.x = x;
    mv.y = y;
    if (sel.p) {
      if (sel.ca || sel.cb) {
        delete sel.ca;
        delete sel.cb;
      }
      sel.p.forEach((q) => {
        q[0] += dx;
        q[1] += dy;
      });
    } else if (sel.t === "arrow") {
      if (sel.a.ref || sel.b.ref) {
        const [e1, e2] = ends(sel);
        sel.a = { p: [...e1] };
        sel.b = { p: [...e2] };
      }
      for (const e of [sel.a, sel.b]) {
        e.p[0] += dx;
        e.p[1] += dy;
      }
    } else {
      sel.x += dx;
      sel.y += dy;
    }
    paint();
    return;
  }
  if (drag) {
    if (drag.t === "draw") drag.p.push([x, y]);
    else if (drag.t === "meas") drag.p[1] = [x, y];
    else if (drag.t === "arrow") {
      const bx = hit(x * ov.width, y * ov.height, ["box"]);
      drag.b =
        bx && bx !== drag.a.ref
          ? { ref: bx, side: snapSide(bx, x, y) }
          : { p: [x, y] };
    } else {
      drag.x = Math.min(x, drag.x0);
      drag.y = Math.min(y, drag.y0);
      drag.w = Math.abs(x - drag.x0);
      drag.h = Math.abs(y - drag.y0);
    }
    paint();
    return;
  }
  if (tool === "select" || tool === "text") {
    ov.style.cursor = hit(x * ov.width, y * ov.height, tool === "text")
      ? "move"
      : tool === "text"
        ? "text"
        : "default";
  }
};
ov.onpointerup = () => {
  ers = rw = false;
  eh = null;
  if (mv && sel && sel.t === "arrow")
    for (const [e, o] of [
      [sel.a, sel.b],
      [sel.b, sel.a],
    ])
      if (e.p) {
        const b = hit(e.p[0] * ov.width, e.p[1] * ov.height, ["box"]);
        if (b && b !== o.ref) {
          e.side = snapSide(b, e.p[0], e.p[1]);
          e.ref = b;
          delete e.p;
        }
      }
  mv = null;
  rs = false;
  if (!drag) return;
  const a = drag;
  drag = null;
  if (
    a.t === "draw"
      ? a.p.length > 1
      : a.t === "meas"
        ? Math.hypot(
            (a.p[1][0] - a.p[0][0]) * ov.width,
            (a.p[1][1] - a.p[0][1]) * ov.height,
          ) > 12
        : a.t === "arrow"
          ? arrowLen(a) > 12
          : a.w > 0.003 && a.h > 0.003
  ) {
    if (a.t === "draw" && a.arr && !a.poly) endSnap(a);
    a.lw = a.lw || opt.lw;
    pages[cur].ann.push(a);
    select(a);
    if (a.t === "tbox" || a.t === "call") openCM(a, true);
    afterPlace();
  }
  $("undo").disabled = !pages[cur].ann.length;
  paint();
};
ov.ondblclick = (e) => {
  if (pb) {
    polyDone();
    return;
  }
  const [x, y] = pt(e),
    a = hit(x * ov.width, y * ov.height, true);
  if (a) editText(a);
  else {
    const n = hit(x * ov.width, y * ov.height, ["note", "tbox", "call"]);
    if (n) openCM(n);
  }
};

function openText(x, y) {
  tp = { x, y };
  ti.value = "";
  Object.assign(ti.style, {
    display: "block",
    left: x * ov.width + "px",
    top: y * ov.height + "px",
  });
  styleInput();
  setTimeout(() => ti.focus(), 0);
}
function editText(a) {
  commitText();
  select(a);
  a.hide = true;
  tp = { x: a.x, y: a.y, edit: a };
  ti.value = a.v;
  Object.assign(ti.style, {
    display: "block",
    left: a.x * ov.width + "px",
    top: a.y * ov.height + "px",
  });
  styleInput();
  paint();
  setTimeout(() => {
    ti.focus();
    ti.select();
  }, 0);
}
function commitText() {
  if (!tp) return;
  const v = ti.value.trim(),
    t = tp;
  tp = null;
  ti.style.display = "none";
  ti.value = "";
  if (t.edit) {
    t.edit.hide = false;
    if (v) t.edit.v = v;
    else {
      const L = pages[cur].ann;
      L.splice(L.indexOf(t.edit), 1);
      select(null);
    }
  } else if (v) {
    const a = {
      t: "text",
      x: t.x,
      y: t.y,
      s: opt.s,
      c: opt.c,
      f: opt.f,
      b: opt.b,
      i: opt.i,
      v,
    };
    pages[cur].ann.push(a);
    select(a);
  }
  $("undo").disabled = !pages[cur].ann.length;
  if (doc) paint();
}
ti.oninput = styleInput;
ti.onkeydown = (e) => {
  e.stopPropagation();
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    commitText();
  }
  if (e.key === "Escape") {
    if (tp.edit) ti.value = tp.edit.v;
    else ti.value = "";
    commitText();
  }
};
ti.onblur = () =>
  setTimeout(() => {
    if (
      document.activeElement !== ti &&
      !$("topts").contains(document.activeElement)
    )
      commitText();
  }, 0);

const undo = () => {
  if (!doc) return;
  commitText();
  const a = pages[cur].ann.pop();
  if (a) detach(a);
  if (a === sel) select(null);
  $("undo").disabled = !pages[cur].ann.length;
  paint();
};
function removeSel() {
  if (!sel) return;
  const L = pages[cur].ann,
    i = L.indexOf(sel);
  if (i > -1) L.splice(i, 1);
  detach(sel);
  select(null);
  $("undo").disabled = !L.length;
  paint();
}
$("undo").onclick = undo;
$("trash").onclick = removeSel;
const rotate = () => {
  const p = pages[cur];
  if (p.ann.length) {
    toast("Remove this page’s marks before rotating it.");
    return;
  }
  p.rot = (p.rot + 90) % 360;
  show();
  thumbs();
};
$("rot").onclick = rotate;
$("del").onclick = () => {
  if (pages.length < 2) {
    toast("A PDF needs at least one page.");
    return;
  }
  select(null);
  pages.splice(cur, 1);
  cur = Math.min(cur, pages.length - 1);
  thumbs();
  show();
  toast("Page deleted");
};
const zoomBy = (d) => {
  zoom = Math.min(4, Math.max(0.4, zoom + d));
  show();
};
$("zi").onclick = () => zoomBy(0.2);
$("zo").onclick = () => zoomBy(-0.2);
$("zl").onclick = () => {
  zoom = fit;
  show();
};
$("prev").onclick = () => go(cur - 1);
$("next").onclick = () => go(cur + 1);

addEventListener("keydown", (e) => {
  if (
    !doc ||
    (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) &&
      document.activeElement !== document.body &&
      document.activeElement.id !== "cc")
  )
    return;
  const k = e.key.toLowerCase();
  if (pb) {
    if (k === "enter") {
      e.preventDefault();
      polyDone();
      return;
    }
    if (k === "escape") {
      pb = null;
      paint();
      return;
    }
    if (k === "backspace") {
      e.preventDefault();
      pb.p.pop();
      delete pb.cb;
      if (!pb.p.length) pb = null;
      paint();
      return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && k === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && k === "s") {
    e.preventDefault();
    save();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === "delete" || k === "backspace") {
    e.preventDefault();
    removeSel();
  } else if (k === "arrowleft" || k === "pageup") go(cur - 1);
  else if (k === "arrowright" || k === "pagedown") go(cur + 1);
  else if (k === "v") setTool("select");
  else if (k === "t") setTool("text");
  else if (k === "h") setTool("ah");
  else if (k === "g") openSig();
  else if (k === "p") openPhoto();
  else if (k === "c") setTool("check");
  else if (k === "b") setTool("rect");
  else if (k === "o") setTool("cloud");
  else if (k === "a") setTool("arrow");
  else if (k === "s") shp.hidden = !shp.hidden;
  else if (k === "x") setTool("cross");
  else if (k === "d") setTool("draw");
  else if (k === "r" && e.shiftKey) rotate();
  else if (k === "r") setTool("white");
  else if (k === "+" || k === "=") zoomBy(0.2);
  else if (k === "-") zoomBy(-0.2);
});

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return PDFLib.rgb(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  );
};
async function save() {
  commitText();
  syncC();
  toast("Building your PDF…");
  try {
    const { PDFDocument, StandardFonts, degrees, rgb } = PDFLib;
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true }),
      out = await PDFDocument.create(),
      fc = {};
    for (const p of pages) {
      const [pg] = await out.copyPages(src, [p.src]);
      if (p.rot)
        pg.setRotation(degrees((pg.getRotation().angle + p.rot) % 360));
      out.addPage(pg);
      const { width: W, height: H } = pg.getSize();
      for (const a0 of p.ann) {
        const a =
          a0.t === "draw" && a0.cl && a0.p.length > 2
            ? { ...a0, p: cloudify(a0.p, W, H, 0, a0.poly) }
            : a0.t === "draw" && a0.poly && !a0.open
              ? { ...a0, p: [...a0.p, a0.p[0]] }
              : a0;
        if (a.t === "text") {
          try {
            const n = FONTS[a.f].n[fidx(a)];
            fc[n] = fc[n] || (await out.embedFont(StandardFonts[n]));
            tLines(a, (s) => fc[n].widthOfTextAtSize(s, a.s), W).forEach(
              (l, i) => {
                if (l)
                  pg.drawText(l, {
                    x: a.x * W,
                    y: H - a.y * H - a.s * 0.88 - i * a.s * 1.2,
                    size: a.s,
                    font: fc[n],
                    color: hex(a.c),
                  });
              },
            );
          } catch (_) {}
        } else if (a.t === "box" || a.t === "arrow") {
          const op = OPEN.includes(a.k) || a.t === "arrow",
            tk = (a.f && op ? 2 : 1) * (a.lw || 2);
          for (const pl of shapePts(a, W, H)) {
            if (a.f && a.t === "box" && !op) {
              pg.drawSvgPath(
                "M" +
                  pl.map((q) => q[0] * W + " " + q[1] * H).join(" L") +
                  " Z",
                {
                  x: 0,
                  y: H,
                  color: hex(a.c),
                  borderColor: hex(a.c),
                  borderWidth: a.lw || 2,
                },
              );
              continue;
            }
            for (let i = 1; i < pl.length; i++)
              pg.drawLine({
                start: { x: pl[i - 1][0] * W, y: H - pl[i - 1][1] * H },
                end: { x: pl[i][0] * W, y: H - pl[i][1] * H },
                thickness: tk,
                color: hex(a.c),
                lineCap: 1,
              });
          }
        } else if (a.t === "sig") {
          try {
            const im = (fc[a.src] =
                fc[a.src] ||
                (await (a.src.startsWith("data:image/jpeg")
                  ? out.embedJpg(a.src)
                  : out.embedPng(a.src)))),
              w = a.w * W,
              h = w * a.ar;
            pg.drawImage(im, {
              x: a.x * W,
              y: H - a.y * H - h,
              width: w,
              height: h,
            });
          } catch (_) {}
        } else if (a.t === "mark") {
          const s = a.w * W,
            x0 = a.x * W,
            y0 = H - a.y * H;
          for (const l of MK[a.k])
            for (let i = 2; i < l.length; i += 2)
              pg.drawLine({
                start: { x: x0 + l[i - 2] * s, y: y0 - l[i - 1] * s },
                end: { x: x0 + l[i] * s, y: y0 - l[i + 1] * s },
                thickness: 0.13 * s,
                color: hex(a.c),
                lineCap: 1,
              });
        } else if (a.t === "draw" && a.f && a.p.length > 2)
          pg.drawSvgPath(
            "M" + a.p.map((q) => q[0] * W + " " + q[1] * H).join(" L") + " Z",
            {
              x: 0,
              y: H,
              color: hex(a.c),
              borderColor: hex(a.c),
              borderWidth: a.lw || 2,
            },
          );
        else if (a.t === "draw") {
          for (let i = 1; i < a.p.length; i++)
            pg.drawLine({
              start: { x: a.p[i - 1][0] * W, y: H - a.p[i - 1][1] * H },
              end: { x: a.p[i][0] * W, y: H - a.p[i][1] * H },
              thickness: a.lw || 2,
              color: hex(a.c),
              lineCap: 1,
            });
          if (a.arr && a.p.length > 1) {
            const hp = ahPts(a.p, W, H, a.lw || 2);
            for (let i = 1; i < 3; i++)
              pg.drawLine({
                start: { x: hp[i - 1][0] * W, y: H - hp[i - 1][1] * H },
                end: { x: hp[i][0] * W, y: H - hp[i][1] * H },
                thickness: a.lw || 2,
                color: hex(a.c),
                lineCap: 1,
              });
          }
        } else if (["ul", "st", "sq"].includes(a.t)) {
          const x0 = a.x * W,
            x1 = (a.x + a.w) * W,
            yy = H - (a.t === "st" ? a.y + a.h / 2 : a.y + a.h) * H,
            pl =
              a.t === "sq"
                ? zig(x0, x1, yy, 2.5, 1.5)
                : [
                    [x0, yy],
                    [x1, yy],
                  ];
          for (let i = 1; i < pl.length; i++)
            pg.drawLine({
              start: { x: pl[i - 1][0], y: pl[i - 1][1] },
              end: { x: pl[i][0], y: pl[i][1] },
              thickness: 1.2,
              color: hex(a.c),
              lineCap: 1,
            });
        } else if (a.t === "ah")
          pg.drawRectangle({
            x: a.x * W,
            y: H - (a.y + a.h) * H,
            width: a.w * W,
            height: a.h * H,
            color: hex(a.c),
            opacity: 0.3,
            borderColor: hex(a.c),
            borderWidth: 1,
          });
        else if (a.t === "note")
          pg.drawRectangle({
            x: a.x * W,
            y: H - (a.y + a.h) * H,
            width: a.w * W,
            height: a.h * H,
            color: rgb(0.99, 0.88, 0.28),
            borderColor: rgb(0.63, 0.38, 0.03),
            borderWidth: 1,
          });
        else if (a.t === "tbox" || a.t === "call") {
          const f = (fc.Helvetica =
              fc.Helvetica || (await out.embedFont(StandardFonts.Helvetica))),
            bx = a.x * W,
            bw = a.w * W,
            bh = a.h * H,
            by = H - a.y * H - bh;
          pg.drawRectangle({
            x: bx,
            y: by,
            width: bw,
            height: bh,
            color: rgb(1, 0.98, 0.9),
            borderColor: hex(a.c),
            borderWidth: 1,
          });
          if (a.t === "call")
            pg.drawLine({
              start: { x: bx + bw * 0.15, y: by },
              end: { x: bx + bw * 0.15 - 24, y: by - 30 },
              thickness: 1,
              color: hex(a.c),
            });
          wrap((s) => f.widthOfTextAtSize(s, 12), a.v || "", bw - 8).forEach(
            (l, i) => {
              try {
                pg.drawText(l, {
                  x: bx + 4,
                  y: by + bh - 14.6 - i * 14.4,
                  size: 12,
                  font: f,
                  color: hex(a.c),
                });
              } catch (_) {}
            },
          );
        } else if (a.t === "meas") {
          const f = (fc.Helvetica =
              fc.Helvetica || (await out.embedFont(StandardFonts.Helvetica))),
            P = a.p.map((q) => [q[0] * W, H - q[1] * H]),
            t =
              (Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) / uu()).toFixed(
                2,
              ) +
              " " +
              unit;
          pg.drawLine({
            start: { x: P[0][0], y: P[0][1] },
            end: { x: P[1][0], y: P[1][1] },
            thickness: 1.5,
            color: hex(a.c),
          });
          pg.drawText(t, {
            x: (P[0][0] + P[1][0]) / 2 + 4,
            y: (P[0][1] + P[1][1]) / 2 + 4,
            size: 10,
            font: f,
            color: hex(a.c),
          });
        } else
          pg.drawRectangle({
            x: a.x * W,
            y: H - (a.y + a.h) * H,
            width: a.w * W,
            height: a.h * H,
            color: a.t === "hl" ? rgb(1, 0.9, 0) : rgb(1, 1, 1),
            opacity: a.t === "hl" ? 0.35 : 1,
          });
      }
    }
    const data = await out.save(),
      name = fname.replace(/\.pdf$/i, "") + "-edited.pdf";
    const dl = await claude.use("downloads");
    if (!dl) {
      toast("Saving isn’t available in this view.");
      return;
    }
    await dl.save({ filename: name, data });
    toast("Saved " + name);
  } catch (err) {
    toast(
      err && err.code === "declined"
        ? "Save cancelled."
        : "Couldn’t save that file.",
    );
  }
}
$("save").onclick = save;

/* ---------- home page ---------- */
function showApp() {
  $("home").hidden = true;
  $("app").hidden = false;
}
function showHome() {
  commitText();
  $("app").hidden = true;
  $("home").hidden = false;
}
$("hgo").onclick = $("hgo3").onclick = showApp;
$("hgo2").onclick = () => {
  showApp();
  $("file").click();
};
$("gohome").onclick = showHome;
$("home").ondragover = (e) => e.preventDefault();
$("home").ondrop = (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) {
    showApp();
    load(f);
  }
};

/* ---------- signature ---------- */
const sigm = $("sigm"),
  sc = $("sc"),
  sx = sc.getContext("2d");
let sMode = "draw",
  sInk = "#111827",
  sd = false,
  sOn = false,
  sigs = [],
  activeSig = null;
try {
  sigs = JSON.parse(localStorage.getItem("pp-sigs") || "[]");
} catch (_) {}
const sp = (e) => {
  const r = sc.getBoundingClientRect();
  return [
    ((e.clientX - r.left) * 560) / r.width,
    ((e.clientY - r.top) * 200) / r.height,
  ];
};
sc.onpointerdown = (e) => {
  if (sMode !== "draw") return;
  sd = sOn = true;
  sc.setPointerCapture(e.pointerId);
  const p = sp(e);
  sx.strokeStyle = sInk;
  sx.lineWidth = 3;
  sx.lineCap = sx.lineJoin = "round";
  sx.beginPath();
  sx.moveTo(p[0], p[1]);
  sx.lineTo(p[0] + 0.1, p[1]);
  sx.stroke();
};
sc.onpointermove = (e) => {
  if (!sd) return;
  const p = sp(e);
  sx.lineTo(p[0], p[1]);
  sx.stroke();
};
sc.onpointerup = () => (sd = false);
function sReset() {
  sx.clearRect(0, 0, 560, 200);
  sOn = false;
}
function sType() {
  sReset();
  const v = $("stype").value;
  if (!v.trim()) return;
  sOn = true;
  let n = 90;
  const f = () =>
    "italic " +
    n +
    "px 'Brush Script MT','Segoe Script','Snell Roundhand',cursive";
  sx.font = f();
  while (sx.measureText(v).width > 520 && n > 20) {
    n -= 4;
    sx.font = f();
  }
  sx.fillStyle = sInk;
  sx.textAlign = "center";
  sx.textBaseline = "middle";
  sx.fillText(v, 280, 100);
}
function sTab(m) {
  sMode = m;
  sUp = null;
  $("tDraw").classList.toggle("on", m === "draw");
  $("tType").classList.toggle("on", m === "type");
  $("tUp").classList.toggle("on", m === "up");
  $("stype").hidden = m !== "type";
  $("supl").hidden = m !== "up";
  $("stype").value = "";
  sReset();
  sc.style.cursor = m === "draw" ? "crosshair" : "default";
}
$("tDraw").onclick = () => sTab("draw");
$("tType").onclick = () => {
  sTab("type");
  $("stype").focus();
};
let sUp = null;
function sUpload() {
  sReset();
  if (!sUp) return;
  const r = Math.min(520 / sUp.width, 180 / sUp.height, 1.5),
    w = sUp.width * r,
    h = sUp.height * r;
  sx.drawImage(sUp, (560 - w) / 2, (200 - h) / 2, w, h);
  if ($("sbg").checked) {
    const im = sx.getImageData(0, 0, 560, 200),
      d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      if (l > 205) d[i + 3] = 0;
      else if (l > 150) d[i + 3] = Math.round((d[i + 3] * (205 - l)) / 55);
    }
    sx.putImageData(im, 0, 0);
  }
  sOn = true;
}
$("tUp").onclick = () => {
  sTab("up");
  $("sfile").click();
};
$("spick").onclick = () => $("sfile").click();
$("sbg").onchange = sUpload;
$("sfile").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      sUp = im;
      sUpload();
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(f);
};
$("stype").oninput = sType;
$("sclear").onclick = () => {
  $("stype").value = "";
  sReset();
};
document.querySelectorAll("#sigm .sw").forEach(
  (b) =>
    (b.onclick = () => {
      sInk = b.dataset.c;
      document
        .querySelectorAll("#sigm .sw")
        .forEach((x) => x.classList.toggle("on", x === b));
      if (sMode === "type") sType();
    }),
);
function renderSaved() {
  const s = $("saved");
  s.innerHTML = "";
  sigs.forEach((src) => {
    const im = document.createElement("img");
    im.src = src;
    im.title = "Use this signature";
    im.onclick = () => useSrc(src);
    s.append(im);
  });
}
function openSig() {
  sTab("draw");
  renderSaved();
  sigm.hidden = false;
}
function useSrc(src) {
  const im = new Image();
  im.onload = () => {
    activeSig = { src, im, ar: im.height / im.width };
    sigm.hidden = true;
    setTool("sign");
    toast("Click the page to place your signature");
  };
  im.src = src;
}
function crop() {
  const d = sx.getImageData(0, 0, 560, 200).data;
  let x0 = 560,
    y0 = 200,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < 200; y++)
    for (let x = 0; x < 560; x++)
      if (d[(y * 560 + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const p = 6,
    c = document.createElement("canvas");
  c.width = x1 - x0 + 1 + p * 2;
  c.height = y1 - y0 + 1 + p * 2;
  c.getContext("2d").drawImage(sc, p - x0, p - y0);
  return c;
}
$("suse").onclick = () => {
  const c = sOn && crop();
  if (!c) {
    toast("Draw or type your signature first.");
    return;
  }
  const src = c.toDataURL("image/png");
  sigs = [src, ...sigs.filter((s) => s !== src)].slice(0, 4);
  try {
    localStorage.setItem("pp-sigs", JSON.stringify(sigs));
  } catch (_) {}
  useSrc(src);
};
$("scancel").onclick = () => (sigm.hidden = true);
sigm.onclick = (e) => {
  if (e.target === sigm) sigm.hidden = true;
};
document.querySelector('#dock [data-t="sign"]').onclick = openSig;

/* ---------- photos ---------- */
const phm = $("phm");
let photos = [],
  activePhoto = null;
function openPhoto() {
  renderPhotos();
  phm.hidden = false;
}
function renderPhotos() {
  const s = $("pthumbs");
  s.innerHTML = "";
  photos.forEach((p) => {
    const im = document.createElement("img");
    im.src = p.src;
    im.title = "Use this photo again";
    im.onclick = () => usePhoto(p);
    s.append(im);
  });
}
function usePhoto(p) {
  activePhoto = p;
  phm.hidden = true;
  setTool("photo");
  toast("Click the page to place your photo");
}
function addPhoto(f) {
  if (!f || !f.type.startsWith("image/")) {
    toast("Please choose an image file.");
    return;
  }
  const fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onerror = () => toast("Couldn’t read that image.");
    im.onload = () => {
      const r = Math.min(1, 1600 / Math.max(im.width, im.height)),
        c = document.createElement("canvas");
      c.width = Math.round(im.width * r);
      c.height = Math.round(im.height * r);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      const src =
          f.type === "image/jpeg"
            ? c.toDataURL("image/jpeg", 0.88)
            : c.toDataURL("image/png"),
        i2 = new Image();
      i2.onload = () => {
        const p = { src, im: i2, ar: c.height / c.width };
        photos = [p, ...photos].slice(0, 8);
        usePhoto(p);
      };
      i2.src = src;
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(f);
}
$("ppick").onclick = () => $("pfile").click();
$("pfile").onchange = (e) => {
  addPhoto(e.target.files[0]);
  e.target.value = "";
};
$("pcancel").onclick = () => (phm.hidden = true);
phm.onclick = (e) => {
  if (e.target === phm) phm.hidden = true;
};
const pd = $("pdrop");
pd.ondragover = (e) => {
  e.preventDefault();
  pd.classList.add("over");
};
pd.ondragleave = () => pd.classList.remove("over");
pd.ondrop = (e) => {
  e.preventDefault();
  pd.classList.remove("over");
  addPhoto(e.dataTransfer.files[0]);
};
document.querySelector('#dock [data-t="photo"]').onclick = openPhoto;

/* ---------- photo real-world size ---------- */
const uu = () => (unit === "in" ? 72 : 72 / 2.54);
function syncPhoto() {
  if (!sel || sel.k !== "photo" || !pages[cur] || !pages[cur].wpt) return;
  const w = (sel.w * pages[cur].wpt) / uu();
  if (document.activeElement !== $("pw")) $("pw").value = w.toFixed(2);
  if (document.activeElement !== $("ph"))
    $("ph").value = (w * sel.ar).toFixed(2);
  $("pu").value = unit;
}
function photoLabel() {
  const w = (sel.w * pages[cur].wpt) / uu(),
    t = w.toFixed(2) + " × " + (w * sel.ar).toFixed(2) + " " + unit;
  octx.save();
  octx.font = "600 12px system-ui,sans-serif";
  const tw = octx.measureText(t).width + 16,
    [bx, by, bw, bh] = bbox(sel),
    lx = bx + bw / 2 - tw / 2,
    ly = by + bh + 12;
  octx.fillStyle = "#171b2b";
  octx.beginPath();
  octx.roundRect(lx, ly, tw, 22, 11);
  octx.fill();
  octx.fillStyle = "#fff";
  octx.textBaseline = "middle";
  octx.textAlign = "left";
  octx.fillText(t, lx + 8, ly + 11);
  octx.restore();
}
$("pw").onchange = () => {
  const v = parseFloat($("pw").value);
  if (!sel || !(v > 0)) return;
  sel.w = Math.min(1, (v * uu()) / pages[cur].wpt);
  paint();
};
$("ph").onchange = () => {
  const v = parseFloat($("ph").value);
  if (!sel || !(v > 0)) return;
  sel.w = Math.min(1, (v * uu()) / sel.ar / pages[cur].wpt);
  paint();
};
$("pu").onchange = (e) => {
  unit = e.target.value;
  syncPhoto();
  paint();
};
function setPhotoSize(a, wIn, hIn) {
  const o = a.o,
    ar = hIn / wIn,
    sw = o.im.width,
    sh = o.im.height;
  let cw = sw,
    ch = sw * ar;
  if (ch > sh) {
    ch = sh;
    cw = sh / ar;
  }
  const c = document.createElement("canvas");
  c.width = Math.round(cw);
  c.height = Math.round(ch);
  c.getContext("2d").drawImage(
    o.im,
    (sw - cw) / 2,
    (sh - ch) / 2,
    cw,
    ch,
    0,
    0,
    c.width,
    c.height,
  );
  a.im = c;
  a.ar = c.height / c.width;
  a.src = c.toDataURL(o.jpeg ? "image/jpeg" : "image/png", 0.9);
  a.w = Math.min(1, (wIn * 72) / pages[cur].wpt);
  paint();
}
document.querySelectorAll(".pz").forEach(
  (b) =>
    (b.onclick = () => {
      if (sel && sel.o) setPhotoSize(sel, +b.dataset.w, +b.dataset.h);
    }),
);

/* ---------- shapes menu ---------- */
let shapeKind = "rect",
  shapeFill = false;
HINTS.shape =
  "Drag on the page to draw the shape · select it to move or resize";
const SH = [
  ["line", "Line", "M4 20 20 4"],
  ["rect", "Rectangle", "M4 5h16v14H4z"],
  [
    "round",
    "Rounded rectangle",
    "M9 5h6a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4a5 5 0 0 1 5-5z",
  ],
  ["ellipse", "Ellipse", "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"],
  ["elbow", "Step line", "M4 7h8v10h8"],
  ["pentagon", "Pentagon", "M12 3l8.5 6.2-3.2 10H6.7l-3.2-10z"],
  ["curve", "Curve", "M4 19c8 0 6-14 16-14"],
  ["dshape", "Half round", "M5 5h7a7 7 0 0 1 0 14H5z"],
  ["lshape", "L shape", "M5 4h6v8h8v8H5z"],
  ["cloud", "Cloud", "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"],
  ["arrow", "Arrow (connects boxes)", "M5 19 19 5M10 5h9v9"],
  ["free", "Freeform", "M3 17c3-12 6 5 9-3s5-5 9-9"],
  ["clrect", "Cloud rectangle", icoK("clrect")],
  ["cltri", "Cloud triangle", icoK("cltri")],
  ["clpent", "Cloud pentagon", icoK("clpent")],
  ["clfree", "Cloud freehand (drag any outline)", icoK("clfree")],
  [
    "clpoly",
    "Cloud polygon (click corners: L-shapes, any shape)",
    icoK("clpoly"),
  ],
  ["poly", "Polygon (click corners)", "M5 5l10-1 5 9-8 7-8-6z"],
  [
    "polyline",
    "Polyline (click points, double-click to end)",
    "M3 18l5-10 5 6 8-10",
  ],
  [
    "arrowpath",
    "Arrow path (click points, double-click to end)",
    "M3 19l6-9 5 5 5-8M15 7h4v4",
  ],
  ["arrowfree", "Freehand arrow (drag)", "M3 17c3-12 6 5 9-3s4-4 7-7M15 7h4v4"],
];
const shp = $("shapes");
for (const [fill, id] of [
  [false, "shO"],
  [true, "shF"],
])
  for (const [k, name, d] of SH) {
    if (
      fill &&
      (k === "line" ||
        k === "arrow" ||
        k === "polyline" ||
        k === "arrowpath" ||
        k === "arrowfree")
    )
      continue;
    const b = document.createElement("button"),
      open =
        OPEN.includes(k) ||
        k === "line" ||
        k === "arrow" ||
        k === "polyline" ||
        k === "arrowpath" ||
        k === "arrowfree";
    b.title = (fill ? "Filled " : "") + name.toLowerCase();
    b.dataset.k = k;
    b.dataset.f = fill ? 1 : 0;
    b.innerHTML =
      '<svg class="i" viewBox="0 0 24 24" style="' +
      (fill && !open
        ? "fill:currentColor;fill-opacity:.85"
        : fill
          ? "stroke-width:4"
          : "") +
      '"><path d="' +
      d +
      '"/></svg>';
    b.onclick = () => {
      shapeKind = k;
      shapeFill = fill;
      shp.hidden = true;
      setTool(k === "arrow" ? "arrow" : "shape");
      document
        .querySelectorAll("#shapes button")
        .forEach((x) => x.classList.toggle("on", x === b));
      toast(
        name +
          (fill ? " (filled)" : "") +
          (["clpoly", "poly", "polyline", "arrowpath"].includes(k)
            ? " · click each corner · click the first corner or double-click to finish · Backspace undoes a corner"
            : " · drag on the page to draw"),
      );
    };
    $(id).append(b);
  }
document.querySelector('#dock [data-t="shape"]').onclick = (e) => {
  e.stopPropagation();
  shp.hidden = !shp.hidden;
};
document.addEventListener("pointerdown", (e) => {
  if (
    !shp.hidden &&
    !shp.contains(e.target) &&
    !e.target.closest('[data-t="shape"]')
  )
    shp.hidden = true;
});

/* ---------- right-drag to pan ---------- */
let pan = null;
st.oncontextmenu = (e) => e.preventDefault();
st.addEventListener("pointerdown", (e) => {
  if (e.button !== 2 && e.button !== 1) return;
  e.preventDefault();
  pan = { x: e.clientX, y: e.clientY, l: st.scrollLeft, t: st.scrollTop };
  st.setPointerCapture(e.pointerId);
  ov.style.cursor = st.style.cursor = "grabbing";
});
st.addEventListener("pointermove", (e) => {
  if (!pan) return;
  st.scrollLeft = pan.l - (e.clientX - pan.x);
  st.scrollTop = pan.t - (e.clientY - pan.y);
});
const endPan = () => {
  if (!pan) return;
  pan = null;
  st.style.cursor = "";
  ov.style.cursor = curs(tool);
};
st.addEventListener("pointerup", endPan);
st.addEventListener("pointercancel", endPan);

/* ---------- Comment ribbon ---------- */
function resamp(P, c) {
  const Q = [...P, P[0]],
    cum = [0];
  for (let i = 1; i < Q.length; i++)
    cum.push(
      cum[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]),
    );
  const T = cum[cum.length - 1],
    n = Math.max(3, Math.round(T / c)),
    o = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const d = (T * i) / n;
    while (cum[k] < d) k++;
    const u = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    o.push([
      Q[k - 1][0] + (Q[k][0] - Q[k - 1][0]) * u,
      Q[k - 1][1] + (Q[k][1] - Q[k - 1][1]) * u,
    ]);
  }
  return o;
}
function cloudify(pl, gw, gh, c, keep) {
  let P = pl.map((q) => [q[0] * gw, q[1] * gh]);
  const f = P[0],
    l = P[P.length - 1];
  if (P.length > 2 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) P.pop();
  if (P.length < 3) return pl;
  let T = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i],
      b = P[(i + 1) % P.length];
    T += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  c = c || Math.max(7, Math.min(16, T / 14));
  if (P.length > 12 && !keep) P = resamp(P, c);
  let A = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i],
      b = P[(i + 1) % P.length];
    A += a[0] * b[1] - b[0] * a[1];
  }
  const sg = A > 0 ? 1 : -1,
    out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i],
      b = P[(i + 1) % P.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      L = Math.hypot(dx, dy) || 1,
      n = Math.max(1, Math.round(L / c)),
      ux = dx / L,
      uy = dy / L,
      nx = sg * uy,
      ny = -sg * ux,
      s = L / n,
      r = s / 2;
    for (let j = 0; j < n; j++) {
      const mx = a[0] + ux * s * (j + 0.5),
        my = a[1] + uy * s * (j + 0.5);
      for (let t = 0; t <= 8; t++) {
        if (t === 0 && (i || j)) continue;
        const th = (Math.PI * t) / 8;
        out.push([
          mx - ux * r * Math.cos(th) + nx * r * Math.sin(th),
          my - uy * r * Math.cos(th) + ny * r * Math.sin(th),
        ]);
      }
    }
  }
  out.push(out[0]);
  return out.map((q) => [q[0] / gw, q[1] / gh]);
}
function icoK(k) {
  const B = {
    clrect: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    cltri: [
      [0.5, 0],
      [1, 1],
      [0, 1],
    ],
    clpent: [0, 1, 2, 3, 4].map((i) => {
      const t = ((-90 + 72 * i) * Math.PI) / 180;
      return [0.5 + (0.5 * Math.cos(t)) / 0.951, (Math.sin(t) + 1) / 1.809];
    }),
    clpoly: [
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
      [1, 0.5],
      [1, 1],
      [0, 1],
    ],
    clfree: [
      [0, 0.5],
      [0.2, 0.1],
      [0.55, 0.25],
      [0.85, 0.05],
      [1, 0.55],
      [0.65, 0.95],
      [0.25, 0.8],
    ],
  }[k].map((q) => [0.2 + q[0] * 0.6, 0.2 + q[1] * 0.6]);
  return (
    "M" +
    cloudify(B, 24, 24, 6)
      .map((q) => (q[0] * 24).toFixed(1) + " " + (q[1] * 24).toFixed(1))
      .join("L") +
    "Z"
  );
}
var pb = null,
  pbm = null;
function polyPt(x, y) {
  pbs = null;
  if (pb ? pb.open : shapeKind === "polyline" || shapeKind === "arrowpath") {
    const t = hit(x * ov.width, y * ov.height, ["box"]),
      sd = t && snapSide(t, x, y);
    if (sd) {
      pbs = { ref: t, side: sd };
      return [...anchors(t)[sd]];
    }
  }
  if (!pb || !pb.p.length) return [x, y];
  const q = pb.p[pb.p.length - 1];
  return [
    Math.abs(x - q[0]) * ov.width < 9 ? q[0] : x,
    Math.abs(y - q[1]) * ov.height < 9 ? q[1] : y,
  ];
}
function polyClick(x, y) {
  const W = ov.width,
    H = ov.height;
  if (!pb) {
    pb = {
      t: "draw",
      cl: shapeKind === "clpoly",
      poly: true,
      open: shapeKind === "polyline" || shapeKind === "arrowpath",
      arr: shapeKind === "arrowpath",
      lw: opt.lw,
      c: opt.c,
      f: shapeFill,
      p: [polyPt(x, y)],
    };
    if (pbs) pb.ca = { ...pbs };
    pbm = pb.p[0];
    paint();
    return;
  }
  const f = pb.p[0],
    l = pb.p[pb.p.length - 1];
  if (
    !pb.open &&
    pb.p.length >= 3 &&
    Math.hypot((x - f[0]) * W, (y - f[1]) * H) < 12
  ) {
    polyDone();
    return;
  }
  const q = polyPt(x, y);
  if (Math.hypot((q[0] - l[0]) * W, (q[1] - l[1]) * H) < 3) return;
  pb.p.push(q);
  if (pbs) pb.cb = { ...pbs };
  else delete pb.cb;
  pbm = q;
  paint();
}
function polyDone() {
  if (!pb) return;
  const a = pb;
  pb = null;
  if (a.p.length >= (a.open ? 2 : 3)) {
    a.lw = a.lw || opt.lw;
    pages[cur].ann.push(a);
    select(a);
    $("undo").disabled = false;
    afterPlace();
  }
  paint();
}
var eh = null,
  pbs = null,
  SIDES = ["t", "r", "b", "l"];
function connTool() {
  return (
    tool === "arrow" ||
    !!eh ||
    (tool === "shape" &&
      ["line", "arrowpath", "arrowfree", "polyline"].includes(shapeKind))
  );
}
function hlist(a) {
  if (a.t === "arrow") {
    const [e1, e2] = ends(a);
    return [e1, e2];
  }
  if (a.t === "draw") {
    if (a.poly) return a.p;
    if (a.arr && a.p.length > 1) return [a.p[0], a.p[a.p.length - 1]];
  }
  return [];
}
function moveH(x, y) {
  const a = sel,
    i = eh.i,
    W = ov.width,
    H = ov.height;
  if (a.t === "arrow") {
    const o = a[i ? "a" : "b"],
      t = hit(x * W, y * H, ["box"]);
    a[i ? "b" : "a"] =
      t && t !== o.ref ? { ref: t, side: snapSide(t, x, y) } : { p: [x, y] };
  } else {
    const n = a.p.length;
    let q = [x, y],
      c = null;
    if ((!a.poly || a.open) && (i === 0 || i === n - 1)) {
      const t = hit(x * W, y * H, ["box"]),
        sd = t && snapSide(t, x, y);
      if (sd) {
        q = [...anchors(t)[sd]];
        c = { ref: t, side: sd };
      }
    }
    a.p[i] = q;
    if (i === 0) {
      if (c) a.ca = c;
      else delete a.ca;
    }
    if (i === n - 1) {
      if (c) a.cb = c;
      else delete a.cb;
    }
  }
  paint();
}
function endSnap(a) {
  const n = a.p.length;
  for (const i of [0, n - 1]) {
    const t = hit(a.p[i][0] * ov.width, a.p[i][1] * ov.height, ["box"]),
      sd = t && snapSide(t, a.p[i][0], a.p[i][1]);
    if (sd) {
      a.p[i] = [...anchors(t)[sd]];
      a[i ? "cb" : "ca"] = { ref: t, side: sd };
    }
  }
}
function syncC() {
  for (const p of pages)
    for (const a of p.ann)
      if (a.t === "draw" && (a.ca || a.cb)) {
        if (a.ca) {
          const q = anchors(a.ca.ref)[a.ca.side];
          if (q) a.p[0] = [q[0], q[1]];
        }
        if (a.cb) {
          const q = anchors(a.cb.ref)[a.cb.side];
          if (q) a.p[a.p.length - 1] = [q[0], q[1]];
        }
      }
}
function detach(box) {
  for (const p of pages)
    for (const a of p.ann) {
      if (a.t === "arrow" && (a.a.ref === box || a.b.ref === box)) {
        const [e1, e2] = ends(a);
        if (a.a.ref === box) a.a = { p: e1 };
        if (a.b.ref === box) a.b = { p: e2 };
      }
      if (a.t === "draw") {
        if (a.ca && a.ca.ref === box) delete a.ca;
        if (a.cb && a.cb.ref === box) delete a.cb;
      }
    }
}
function fb(r) {
  if (r.t !== "draw") return r;
  const xs = r.p.map((q) => q[0]),
    ys = r.p.map((q) => q[1]),
    x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, k: "rect" };
}
function anchors(r) {
  const o = {};
  if (r.t === "draw" && r.poly) {
    const n = r.p.length,
      m = r.open ? n - 1 : n;
    for (let i = 0; i < n; i++) {
      o["v" + i] = r.p[i];
      if (i < m) {
        const b = r.p[(i + 1) % n];
        o["m" + i] = [(r.p[i][0] + b[0]) / 2, (r.p[i][1] + b[1]) / 2];
      }
    }
    return o;
  }
  const b = fb(r),
    cx = b.x + b.w / 2,
    cy = b.y + b.h / 2;
  if (r.k === "ellipse" || r.k === "cloud") {
    const A = {
      r: 0,
      br: 45,
      b: 90,
      bl: 135,
      l: 180,
      tl: 225,
      t: 270,
      tr: 315,
    };
    for (const id in A) {
      const t = (A[id] * Math.PI) / 180;
      o[id] = [cx + (Math.cos(t) * b.w) / 2, cy + (Math.sin(t) * b.h) / 2];
    }
    return o;
  }
  return Object.assign(o, {
    tl: [b.x, b.y],
    t: [cx, b.y],
    tr: [b.x + b.w, b.y],
    r: [b.x + b.w, cy],
    br: [b.x + b.w, b.y + b.h],
    b: [cx, b.y + b.h],
    bl: [b.x, b.y + b.h],
    l: [b.x, cy],
  });
}
function sidePx(a, s) {
  const q = anchors(a)[s];
  return q ? [q[0] * ov.width, q[1] * ov.height] : [-999, -999];
}
function snapSide(ref, x, y) {
  let best,
    bd = 18;
  for (const s of Object.keys(anchors(ref))) {
    const q = sidePx(ref, s),
      d = Math.hypot(q[0] - x * ov.width, q[1] - y * ov.height);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}
function ahPts(p, gw, gh, lw) {
  const q = p[p.length - 1];
  let i = p.length - 2;
  while (i > 0 && Math.hypot((p[i][0] - q[0]) * gw, (p[i][1] - q[1]) * gh) < 8)
    i--;
  const th = Math.atan2((q[1] - p[i][1]) * gh, (q[0] - p[i][0]) * gw),
    L = Math.max(11, lw * 4.5),
    h = (s) => [
      q[0] - (L * Math.cos(th + s)) / gw,
      q[1] - (L * Math.sin(th + s)) / gh,
    ];
  return [h(0.45), q, h(-0.45)];
}
$("lw").onchange = (e) => {
  opt.lw = +e.target.value;
  if (sel && ["box", "arrow", "draw"].includes(sel.t)) {
    sel.lw = opt.lw;
    paint();
  }
};
$("dsym").onclick = (e) => {
  e.stopPropagation();
  const m = $("cmenu");
  if (!m.hidden) m.hidden = true;
  else {
    shp.hidden = true;
    ACT.sym();
  }
};
var rw = false;
opt.hc = "#ffe600";
opt.lw = 2;
function tLines(a, m, W) {
  return a.bw ? wrap(m, a.v, a.bw * W) : a.v.split("\n");
}
var RSZ = [
    "sig",
    "mark",
    "text",
    "box",
    "tbox",
    "call",
    "ah",
    "ul",
    "st",
    "sq",
    "hl",
  ],
  BOXY = ["box", "tbox", "call", "ah", "ul", "st", "sq", "hl"],
  ers = false,
  rb = false,
  keep = true,
  stampGen = null,
  numN = 1,
  letN = 0,
  cmA = null,
  cmNew = false;
const COMM = ["note", "tbox", "call", "ul", "st", "sq", "ah", "hl"],
  CN = {
    note: "Note",
    tbox: "Textbox",
    call: "Callout",
    ul: "Underline",
    st: "Strikeout",
    sq: "Squiggly",
    ah: "Area highlight",
    hl: "Highlight",
  };
Object.assign(HINTS, {
  hand: "Drag to scroll the page",
  erase: "Click or drag over a mark to erase it",
  ul: "Drag across text to underline it",
  st: "Drag across text to strike it out",
  sq: "Drag across text for a squiggly underline",
  note: "Click the page to add a note · double-click a note to edit",
  tbox: "Drag to draw a text box, then type",
  call: "Drag to draw a callout, then type",
  ah: "Drag to highlight an area · pick any colour from the palette to change it",
  meas: "Drag to measure a distance",
  stamp: "Click the page to place it · drag to move · pull the dot to resize",
});
function curs(t) {
  return t === "select"
    ? "default"
    : t === "text"
      ? "text"
      : t === "hand"
        ? "grab"
        : t === "erase"
          ? "cell"
          : "crosshair";
}
function afterPlace() {
  if (rb && !keep) setTool("select");
}
function zig(x0, x1, y, s, a) {
  const p = [[x0, y]];
  let u = 0;
  for (let x = x0 + s; x < x1 + s; x += s) {
    u ^= 1;
    p.push([Math.min(x, x1), y + (u ? -a : a)]);
  }
  return p;
}
function wrap(m, t, mw) {
  const o = [];
  for (const para of t.split("\n")) {
    let l = "";
    for (const w of para.split(" ")) {
      const tr = l ? l + " " + w : w;
      if (m(tr) > mw && l) {
        o.push(l);
        l = w;
      } else l = tr;
    }
    o.push(l);
  }
  return o;
}
function mLabel(a) {
  const p = pages[cur],
    d =
      Math.hypot(
        (a.p[1][0] - a.p[0][0]) * p.wpt,
        (a.p[1][1] - a.p[0][1]) * p.hpt,
      ) / uu();
  return d.toFixed(2) + " " + unit;
}
function dropA(a) {
  const L = pages[cur].ann,
    i = L.indexOf(a);
  if (i > -1) L.splice(i, 1);
  detach(a);
  if (sel === a) select(null);
  $("undo").disabled = !L.length;
  paint();
}
function eraseAt(x, y) {
  const a = hit(x * ov.width, y * ov.height);
  if (a) dropA(a);
}
function openCM(a, nw) {
  cmA = a;
  cmNew = !!nw;
  $("cmt").value = a.v || "";
  $("cm").hidden = false;
  setTimeout(() => $("cmt").focus(), 0);
}
$("cms").onclick = () => {
  cmA.v = $("cmt").value;
  $("cm").hidden = true;
  paint();
  cmA = null;
};
$("cmx").onclick = () => {
  $("cm").hidden = true;
  if (cmNew && !cmA.v) dropA(cmA);
  cmA = null;
};
$("cmd").onclick = () => {
  $("cm").hidden = true;
  dropA(cmA);
  cmA = null;
};
const fin = (c, w) => ({
  im: c,
  src: c.toDataURL("image/png"),
  ar: c.height / c.width,
  w,
});
function stampImg(t, col) {
  const c = document.createElement("canvas"),
    f = "bold 44px Helvetica,Arial,sans-serif",
    x = c.getContext("2d");
  x.font = f;
  c.width = Math.ceil(x.measureText(t).width + 48);
  c.height = 84;
  x.font = f;
  x.lineWidth = 5;
  x.strokeStyle = x.fillStyle = col;
  x.beginPath();
  x.roundRect(4, 4, c.width - 8, 76, 10);
  x.stroke();
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(t, c.width / 2, 46);
  return fin(c, 0.22);
}
function glyphImg(t, col, ring) {
  const c = document.createElement("canvas");
  c.width = c.height = 84;
  const x = c.getContext("2d");
  x.strokeStyle = x.fillStyle = col;
  x.lineWidth = 5;
  if (ring) {
    x.beginPath();
    x.arc(42, 42, 36, 0, 7);
    x.stroke();
  }
  x.font = (ring ? "bold 44px" : "64px") + " Helvetica,Arial,sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(t, 42, ring ? 46 : 48);
  return fin(c, 0.04);
}
function useGen(g) {
  stampGen = g;
  setTool("stamp");
  rb = true;
}
function showMenu(items) {
  const m = $("cmenu");
  m.innerHTML = "";
  items.forEach(([l, f]) => {
    const b = document.createElement("button");
    b.textContent = l;
    b.style.padding = "0 12px";
    b.onclick = () => {
      m.hidden = true;
      f();
    };
    m.append(b);
  });
  m.hidden = false;
}
function openList(manage) {
  $("clt").textContent = manage ? "Manage comments" : "Comment summary";
  const box = $("clist");
  box.innerHTML = "";
  let n = 0;
  pages.forEach((p, i) =>
    p.ann
      .filter((a) => COMM.includes(a.t))
      .forEach((a) => {
        n++;
        const d = document.createElement("div");
        d.className = "cli";
        d.innerHTML = "<b>p." + (i + 1) + "</b><span></span>";
        d.querySelector("span").textContent =
          CN[a.t] + (a.v ? " — " + a.v : "");
        d.onclick = () => {
          $("cl").hidden = true;
          go(i);
          setTimeout(() => select(a), 60);
        };
        if (manage) {
          const x = document.createElement("button");
          x.className = "btn";
          x.textContent = "Delete";
          x.onclick = (e) => {
            e.stopPropagation();
            const L = p.ann;
            L.splice(L.indexOf(a), 1);
            if (i === cur) {
              if (sel === a) select(null);
              paint();
            }
            openList(true);
          };
          d.append(x);
        }
        box.append(d);
      }),
  );
  if (!n) box.innerHTML = '<p style="color:var(--mut)">No comments yet.</p>';
  $("cl").hidden = false;
}
$("clx").onclick = () => ($("cl").hidden = true);
$("cl").onclick = (e) => {
  if (e.target.id === "cl") $("cl").hidden = true;
};
async function exportC() {
  const data = new TextEncoder().encode(
    JSON.stringify(
      pages.map((p, i) => ({
        page: i,
        ann: p.ann.filter((a) => COMM.includes(a.t)),
      })),
    ),
  );
  try {
    const dl = await claude.use("downloads");
    if (!dl) {
      toast("Saving isn’t available in this view.");
      return;
    }
    await dl.save({
      filename: fname.replace(/\.pdf$/i, "") + "-comments.json",
      data,
    });
    toast("Comments exported");
  } catch (e) {
    toast("Couldn’t export comments.");
  }
}
$("ifile").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !doc) return;
  try {
    let n = 0;
    for (const r of JSON.parse(await f.text()))
      if (pages[r.page])
        for (const a of r.ann)
          if (COMM.includes(a.t)) {
            pages[r.page].ann.push(a);
            n++;
          }
    $("undo").disabled = !pages[cur].ann.length;
    paint();
    toast("Imported " + n + " comments");
  } catch (_) {
    toast("That isn’t a comments file.");
  }
};
const calc = (a, o, b) =>
  o === "+" ? a + b : o === "-" ? a - b : o === "*" ? a * b : b ? a / b : NaN;
let ca = null,
  co = null,
  cs = "0",
  cn = true;
function ckey(k) {
  if (k === "C") {
    ca = co = null;
    cs = "0";
    cn = true;
  } else if ("+-*/=".includes(k)) {
    const v = parseFloat(cs);
    ca = co && !cn ? calc(ca, co, v) : v;
    cs = String(+ca.toFixed(10));
    co = k === "=" ? null : k;
    cn = true;
  } else if (cn) {
    cs = k === "." ? "0." : k;
    cn = false;
  } else if (k !== "." || !cs.includes(".")) cs += k;
  $("cd").value = cs;
}
[
  "7",
  "8",
  "9",
  "/",
  "4",
  "5",
  "6",
  "*",
  "1",
  "2",
  "3",
  "-",
  "0",
  ".",
  "C",
  "+",
  "=",
].forEach((k) => {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = k;
  b.onclick = () => ckey(k);
  $("ck").append(b);
});
$("cclose").onclick = () => ($("calm").hidden = true);
const RI = [
  [
    "hand",
    "Hand Tool",
    "M8 13V5a1.5 1.5 0 0 1 3 0v6m0-2V4a1.5 1.5 0 0 1 3 0v7m0-5a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 14",
  ],
  ["select", "Select", "m5 3 14 8-6 2-2 6z"],
  "|",
  ["ul", "Underline", "M6 4v7a6 6 0 0 0 12 0V4M5 21h14"],
  [
    "st",
    "Strikeout",
    "M4 12h16M16 6a4 3 0 0 0-8 1c0 2 2 3 4 3M8 18a4 3 0 0 0 8-1",
  ],
  ["sq", "Squiggly", "M6 4v8M18 4v8M3 18q1.5-3 3 0t3 0 3 0 3 0 3 0 3 0"],
  "|",
  ["note", "Note", "M5 4h14v12H9l-4 4zM9 9h6M9 12h4"],
  ["text", "Typewriter", "M5 6V4h14v2M12 4v16M9 20h6"],
  ["tbox", "Textbox", "M4 5h16v14H4zM8 10h8M8 14h5"],
  ["call", "Callout", "M4 4h16v10H11l-4 5v-5H4z"],
  "|",
  ["shape", "Drawing ▾", "M12 3l8.5 6.2-3.2 10H6.7l-3.2-10z"],
  ["draw", "Pencil", "M3 21c4-1 6-6 9-9s5-3 7-5M15 5l4 4"],
  ["erase", "Eraser", "m7 21-4-4 11-11 6 6-9 9zM9 21h11"],
  "|",
  [
    "ah",
    "Area Highlight",
    "M4 4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4M4 7V4",
  ],
  ["meas", "Measure", "M3 8h18v8H3zM7 8v4M11 8v3M15 8v4M19 8v3"],
  ["calc", "Calculator", "M6 3h12v18H6zM9 7h6M9 11h1M12 11h1M9 15h1M12 15h1"],
  "|",
  ["stamp", "Stamp ▾", "M9 12a3 3 0 1 1 6 0l1 4H8zM5 20h14v-2H5z"],
  ["cstamp", "Custom Stamp", "M9 12a3 3 0 1 1 6 0l1 4H8zM5 20h14v-2H5z"],
  ["sym", "Symbols ▾", "m5 12 5 5 9-10"],
  ["num", "Numbers", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM11 9l1-1v8"],
  [
    "let",
    "Letters",
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 16 12 8l3.5 8M9.7 13.5h4.6",
  ],
  "|",
  ["sum", "Summarize Comments", "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3"],
  ["imp", "Import", "M12 4v12m0 0-4-4m4 4 4-4M4 20h16"],
  ["exp", "Export", "M12 16V4m0 0L8 8m4-4 4 4M4 20h16"],
  ["man", "Manage Comments", "M4 6h16M4 12h16M4 18h10"],
  "|",
  ["keep", "Keep Tool Selected", "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"],
];
const STAMPS = [
  ["Approved", "#16a34a"],
  ["Rejected", "#e5383b"],
  ["Draft", "#2b7de9"],
  ["Confidential", "#e5383b"],
  ["Reviewed", "#f59e0b"],
];
const ACT = {
  shape: () => {
    shp.hidden = !shp.hidden;
    rb = true;
  },
  stamp: () =>
    showMenu(
      STAMPS.map(([l, c]) => [
        l,
        () => useGen(() => stampImg(l.toUpperCase(), c)),
      ]),
    ),
  cstamp: () => openPhoto(),
  sym: () =>
    showMenu([
      ["✓ Check", () => setTool("check")],
      ["✗ Cross", () => setTool("cross")],
      ...["★", "●", "▲", "■", "♥", "➜"].map((g) => [
        g,
        () => useGen(() => glyphImg(g, opt.c, false)),
      ]),
    ]),
  num: () => {
    useGen(() => glyphImg(String(numN++), opt.c, true));
    toast("Click to place numbers 1, 2, 3…");
  },
  let: () => {
    useGen(() =>
      glyphImg(String.fromCharCode(65 + (letN++ % 26)), opt.c, true),
    );
    toast("Click to place letters A, B, C…");
  },
  calc: () => ($("calm").hidden = false),
  sum: () => openList(false),
  man: () => openList(true),
  imp: () => $("ifile").click(),
  exp: () => exportC(),
  keep: (b) => {
    keep = !keep;
    b.classList.toggle("on", keep);
    toast(
      keep
        ? "Tool stays selected after each mark"
        : "Tool switches back to Select after each mark",
    );
  },
};
for (const it of RI) {
  if (it === "|") {
    const s = document.createElement("span");
    s.className = "sep";
    $("cr").append(s);
    continue;
  }
  const [t, l, d] = it,
    b = document.createElement("button");
  b.className = "rb" + (t === "keep" && keep ? " on" : "");
  b.title = l.replace(" ▾", "");
  if (t === "keep") b.dataset.k = 1;
  else b.dataset.t = t;
  b.innerHTML =
    '<svg class="i" viewBox="0 0 24 24"><path d="' +
    d +
    '"/></svg><span>' +
    l +
    "</span>";
  b.onclick = (e) => {
    e.stopPropagation();
    if (t !== "shape") shp.hidden = true;
    if (t !== "stamp" && t !== "sym") $("cmenu").hidden = true;
    if (ACT[t]) ACT[t](b);
    else {
      setTool(t);
      rb = true;
    }
  };
  $("cr").append(b);
}
document.addEventListener("pointerdown", (e) => {
  const m = $("cmenu");
  if (!m.hidden && !m.contains(e.target) && !e.target.closest("#cr,#dsym"))
    m.hidden = true;
});
