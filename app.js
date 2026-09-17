/* ===================================================================
   Cucina Food Safety Logbook — front-end logic (vanilla JS)
   =================================================================== */
const cfg = window.APP_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  (Array.isArray(kids) ? kids : [kids]).forEach(k =>
    n.append(k?.nodeType ? k : document.createTextNode(k ?? "")));
  return n;
};

/* ---------- guard: config filled in? ---------- */
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-") ||
    !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("YOUR-")) {
  $("#setup").classList.remove("hidden");
  throw new Error("config.js not filled in");
}
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

/* ===================================================================
   LOG DEFINITIONS  — one entry per config drives forms, tables, CSV
   =================================================================== */
const SEL = (...o) => ({ type: "select", options: o });
const LOGS = {
  sites: {
    label: "① Sites", table: "sites", isSites: true,
    fields: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Site name", type: "text" },
      { key: "brand", label: "Brand", ...SEL("Flappy's Fried Chicken","Burger Point","Sir Manong","Masa") },
      { key: "location", label: "Location / notes", type: "text" }
    ],
    columns: ["code","name","brand","location"]
  },
  deliveries: {
    label: "② Delivery", table: "deliveries",
    fields: [
      { key: "entry_date", label: "Date", type: "date", req: true },
      { key: "entry_time", label: "Time", type: "time" },
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "item", label: "Item", ...SEL("BEEF","CHICKEN","PORK","SEAFOOD","OTHER") },
      { key: "temp", label: "Temp °C", type: "number" },
      { key: "best_before", label: "Best before", type: "date" },
      { key: "accept", label: "Accept", ...SEL("Y","N") },
      { key: "invoice_no", label: "Invoice no.", type: "text" },
      { key: "weight", label: "Weight kg", type: "number" },
      { key: "receiver", label: "Receiver", type: "text" },
      { key: "driver", label: "Driver", type: "text" },
      { key: "recorded_by", label: "Recorded by", type: "text" },
      { key: "corrective_action", label: "Corrective action", type: "textarea" }
    ]
  },
  fridge_freezer: {
    label: "③ Fridge / Freezer", table: "fridge_freezer",
    fields: [
      { key: "entry_date", label: "Date", type: "date", req: true },
      { key: "entry_time", label: "Time", type: "time" },
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "area", label: "Area", ...SEL("FOH","BOH") },
      { key: "unit", label: "Unit / appliance", type: "text" },
      { key: "type", label: "Type", ...SEL("Fridge","Freezer") },
      { key: "temp", label: "Temp °C", type: "number" },
      { key: "recorded_by", label: "Recorded by", type: "text" },
      { key: "corrective_action", label: "Corrective action", type: "textarea" }
    ],
    extraCols: ["within_range"]
  },
  process_mep:     procDef("④ Process — MEP", "MEP"),
  process_risky:   procDef("⑤ Process — Risky", "Risky"),
  process_freezer: procDef("⑥ Process — Freezer", "Freezer"),
  food_waste: {
    label: "⑦ Food Waste", table: "food_waste", totals: ["quantity","cost"],
    fields: [
      { key: "entry_date", label: "Date", type: "date", req: true },
      { key: "entry_time", label: "Time", type: "time" },
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "recorded_by", label: "Recorded by", type: "text" },
      { key: "item_description", label: "Item description", type: "text" },
      { key: "loss_reason", label: "Loss reason", type: "text" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "unit", label: "Unit", ...SEL("kg","L","ea") },
      { key: "cost", label: "Cost $", type: "number" },
      { key: "verified_by", label: "Verified by", type: "text" }
    ]
  }
};
function procDef(label, category) {
  return {
    label, table: "process_logs", fixed: { category },
    fields: [
      { key: "entry_date", label: "Date", type: "date", req: true },
      { key: "entry_time", label: "Time", type: "time" },
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "food_item", label: "Food item", type: "text" },
      { key: "cook_temp", label: "Cook °C", type: "number" },
      { key: "reheat_temp", label: "Reheat °C", type: "number" },
      { key: "hot_holding_temp", label: "Hot holding °C", type: "number" },
      { key: "process_time", label: "Time", type: "text" },
      { key: "temp", label: "Temp °C", type: "number" },
      { key: "recorded_by", label: "Recorded by", type: "text" },
      { key: "corrective_action", label: "Corrective action", type: "textarea" }
    ]
  };
}
const NUMERIC = new Set(["temp","weight","quantity","cost","cook_temp","reheat_temp","hot_holding_temp","site_id"]);
const DATE_KEYS = new Set(["entry_date","best_before"]);

/* ===================================================================
   AUTH
   =================================================================== */
let SITES = [];
sb.auth.onAuthStateChange((_e, session) => renderAuth(session));
sb.auth.getSession().then(({ data }) => renderAuth(data.session));

function renderAuth(session) {
  if (session) {
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#who").innerHTML = "";
    $("#who").append(
      el("span", { textContent: session.user.email }),
      el("button", { textContent: "Sign out", onclick: () => sb.auth.signOut() })
    );
    boot();
  } else {
    $("#app").classList.add("hidden");
    $("#who").innerHTML = "";
    $("#login").classList.remove("hidden");
  }
}
$("#sendLink").onclick = async () => {
  const email = $("#email").value.trim();
  const msg = $("#loginMsg");
  if (!email) { msg.textContent = "Enter an email."; msg.className = "msg err"; return; }
  msg.textContent = "Sending…"; msg.className = "msg";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  msg.textContent = error ? error.message : "Check your inbox for the login link.";
  msg.className = "msg " + (error ? "err" : "ok");
};

/* ===================================================================
   APP BOOT + NAV
   =================================================================== */
let CURRENT = "deliveries";
let booted = false;
async function boot() {
  if (booted) return; booted = true;
  const nav = $("#tabs"); nav.innerHTML = "";
  Object.entries(LOGS).forEach(([id, def]) => {
    nav.append(el("button", {
      textContent: def.label,
      className: id === CURRENT ? "active" : "",
      onclick: (e) => { CURRENT = id; [...nav.children].forEach(b => b.classList.remove("active")); e.currentTarget.classList.add("active"); openTab(id); }
    }));
  });
  await loadSites();
  openTab(CURRENT);
}
async function loadSites() {
  const { data } = await sb.from("sites").select("id,code,name,brand").order("code");
  SITES = data || [];
}
const siteName = id => { const s = SITES.find(x => x.id === id); return s ? `${s.code} · ${s.name}` : ""; };

/* ===================================================================
   RENDER A TAB
   =================================================================== */
function openTab(id) {
  const def = LOGS[id];
  const view = $("#view"); view.innerHTML = "";

  // ---- entry form ----
  const form = el("div", { className: "card" });
  form.append(el("h2", { textContent: (def.isSites ? "Add / manage sites" : "New entry — " + def.label) }));
  const body = el("div", { className: "body" });
  const grid = el("div", { className: "formgrid" });
  const inputs = {};
  def.fields.forEach(f => {
    const wrap = el("div", { className: "field" });
    wrap.append(el("label", { textContent: f.label + (f.req ? " *" : "") }));
    let input;
    if (f.type === "select") {
      input = el("select"); input.append(el("option", { value: "", textContent: "—" }));
      f.options.forEach(o => input.append(el("option", { value: o, textContent: o })));
    } else if (f.type === "site") {
      input = el("select"); input.append(el("option", { value: "", textContent: "—" }));
      SITES.forEach(s => input.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
    } else if (f.type === "textarea") {
      input = el("textarea");
    } else {
      input = el("input", { type: f.type });
    }
    inputs[f.key] = input; wrap.append(input); grid.append(wrap);
  });
  body.append(grid);
  const msg = el("span", { className: "msg" });
  const saveBtn = el("button", { className: "btn", textContent: "Save entry" });
  const actions = el("div", { className: "actions" }, [saveBtn, msg]);
  body.append(actions); form.append(body); view.append(form);

  saveBtn.onclick = async () => {
    const row = { ...(def.fixed || {}) };
    for (const f of def.fields) {
      let v = inputs[f.key].value;
      if (v === "") v = null;
      else if (NUMERIC.has(f.key)) v = Number(v);
      row[f.key] = v;
    }
    const missing = def.fields.filter(f => f.req && (row[f.key] === null || row[f.key] === undefined));
    if (missing.length) { msg.textContent = "Fill required (*) fields."; msg.className = "msg err"; return; }
    saveBtn.disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
    const { error } = await sb.from(def.table).insert([row]);
    saveBtn.disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    msg.textContent = "Saved ✓"; msg.className = "msg ok";
    def.fields.forEach(f => { if (!["entry_date","site_id","recorded_by"].includes(f.key)) inputs[f.key].value = ""; });
    if (def.isSites) { await loadSites(); }
    loadTable(id, listCard);
  };

  // ---- list / records ----
  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Records" }));
  const lbody = el("div", { className: "body" });

  if (!def.isSites) {
    const filters = el("div", { className: "filters" });
    const siteSel = el("select");
    siteSel.append(el("option", { value: "", textContent: "All sites" }));
    SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
    const fromD = el("input", { type: "date" }), toD = el("input", { type: "date" });
    filters.append(
      fieldWrap("Site", siteSel), fieldWrap("From", fromD), fieldWrap("To", toD),
      el("button", { className: "btn ghost", textContent: "Apply", onclick: () => loadTable(id, listCard, { site: siteSel.value, from: fromD.value, to: toD.value }) }),
      el("button", { className: "btn dark", textContent: "Export CSV", onclick: () => exportCSV(id) })
    );
    lbody.append(filters);
  }
  const tw = el("div", { className: "tablewrap", id: "tw" });
  lbody.append(tw); listCard.append(lbody); view.append(listCard);
  loadTable(id, listCard);
}
function fieldWrap(label, input) {
  return el("div", { className: "field" }, [el("label", { textContent: label }), input]);
}

/* ===================================================================
   LOAD + RENDER TABLE
   =================================================================== */
let LAST_ROWS = [];
async function loadTable(id, card, flt = {}) {
  const def = LOGS[id];
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  let q = sb.from(def.table).select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (def.isSites) q = sb.from("sites").select("*").order("code");
  if (def.fixed) q = q.eq("category", def.fixed.category);
  if (flt.site) q = q.eq("site_id", flt.site);
  if (flt.from) q = q.gte("entry_date", flt.from);
  if (flt.to) q = q.lte("entry_date", flt.to);
  const { data, error } = await q;
  if (error) { tw.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  LAST_ROWS = data || [];
  if (!LAST_ROWS.length) { tw.innerHTML = "<div class='empty'>No records yet.</div>"; return; }

  const cols = tableColumns(def);
  const table = el("table");
  table.append(el("thead", {}, el("tr", {}, cols.map(c => el("th", { textContent: c.label })))));
  const tb = el("tbody");
  LAST_ROWS.forEach(r => {
    tb.append(el("tr", {}, cols.map(c => {
      if (c.key === "within_range")
        return el("td", {}, r.within_range == null ? el("span", {}, "")
          : el("span", { className: "badge " + (r.within_range ? "ok" : "bad"), textContent: r.within_range ? "OK" : "CHECK" }));
      if (c.key === "site_id") return el("td", { textContent: siteName(r.site_id) });
      let v = r[c.key]; if (v == null) v = "";
      if (c.key === "cost" && v !== "") v = "$" + Number(v).toFixed(2);
      return el("td", { textContent: String(v) });
    })));
  });
  table.append(tb);
  if (def.totals) {
    const tf = el("tr");
    cols.forEach((c, i) => {
      if (i === 0) tf.append(el("td", { textContent: "TOTAL" }));
      else if (def.totals.includes(c.key)) {
        const sum = LAST_ROWS.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
        tf.append(el("td", { textContent: c.key === "cost" ? "$" + sum.toFixed(2) : sum.toFixed(2) }));
      } else tf.append(el("td", {}));
    });
    table.append(el("tfoot", {}, tf));
  }
  tw.innerHTML = ""; tw.append(table);
}
function tableColumns(def) {
  if (def.isSites) return def.columns.map(k => ({ key: k, label: k }));
  const cols = [];
  def.fields.forEach(f => cols.push({ key: f.key, label: f.label }));
  (def.extraCols || []).forEach(k => cols.splice(7, 0, { key: k, label: "Within range" }));
  return cols;
}

/* ---------- CSV export ---------- */
function exportCSV(id) {
  if (!LAST_ROWS.length) return;
  const def = LOGS[id];
  const cols = tableColumns(def);
  const head = cols.map(c => c.label);
  const rows = LAST_ROWS.map(r => cols.map(c => {
    if (c.key === "site_id") return siteName(r.site_id);
    if (c.key === "within_range") return r.within_range == null ? "" : (r.within_range ? "OK" : "CHECK");
    return r[c.key] ?? "";
  }));
  const csv = [head, ...rows].map(a => a.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `${id}_${new Date().toISOString().slice(0,10)}.csv` });
  document.body.append(a); a.click(); a.remove();
}
