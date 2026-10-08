/* ===================================================================
   Cucina Food Safety Logbook — front-end logic
   =================================================================== */
const cfg = window.APP_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  (Array.isArray(kids) ? kids : [kids]).forEach(k =>
    n.append(k?.nodeType ? k : document.createTextNode(k ?? "")));
  return n;
};

if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-") ||
    !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("YOUR-")) {
  $("#setup").classList.remove("hidden");
  throw new Error("config.js not filled in");
}
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

/* ===================== LOG DEFINITIONS ===================== */
const SEL = (...o) => ({ type: "select", options: o });
// A time-of-day dropdown (every 30 min, 6:00 AM–11:30 PM) so staff pick, never type.
const TIME_OPTIONS = (() => {
  const out = [];
  for (let m = 6 * 60; m <= 23 * 60 + 30; m += 30) {
    const h = Math.floor(m / 60), mm = m % 60;
    const val = String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
    const ap = h < 12 ? "AM" : "PM";
    const h12 = ((h + 11) % 12) + 1;
    out.push({ value: val, label: h12 + ":" + String(mm).padStart(2, "0") + " " + ap });
  }
  return out;
})();
const MEP_TIMES = [
  { value: "10:00", label: "10:00 AM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "17:00", label: "5:00 PM" }
];
// One shared, alphabetical item list for ALL process logs.
const PROCESS_ITEMS = Array.from(new Set([
  "Chicken Inasal","Chicken Bone-In","Chicken Tenders","Chicken Soup","Sinigang","Gravy","Mash","Corn","Beans","Bacon","Pulled Pork","Mushroom Gravy","Cheese Sauce","Spaghetti Sauce","Karekare sauce","Pata","Rice","Crispy Bagnet","Grilled Pork Belly",
  "Slaw","Capsicum","Onion","Garlic","Egg","Shallots","Diced Tomatoes","Pickles","Cheese","Mayo","Beetroot","Sweet Tea","Traditional Lemonade","Strawberry Lemonade","Pure Strawberry Puree","Black Tea","Lettuce",
  "Crinkled Cut Fries","Shoestring Fries","Vanilla Ice Cream","Chocolate Ice Cream","Strawberry Ice Cream","Ube Ice Cream"
])).sort((a, b) => a.localeCompare(b));

function procDef(label, category, opts = {}) {
  const timeField = opts.timeSlots
    ? { key: "entry_time", label: "Collection time", type: "select", options: opts.timeSlots, req: true }
    : { key: "entry_time", label: "Time", type: "select", options: TIME_OPTIONS, req: true };
  return {
    label, table: "process_logs", fixed: { category },
    fields: [
      { key: "entry_date", label: "Date", type: "date", req: true },
      timeField,
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "food_item", label: "Food item", type: "select", options: PROCESS_ITEMS },
      { key: "process", label: "Process", ...SEL("Cook","Reheat","Hot Holding","Cooling") },
      { key: "temp", label: "Temp °C", type: "number" },
      { key: "recorded_by", label: "Recorded by", type: "employee" },
      { key: "corrective_action", label: "Corrective action", type: "textarea" }
    ]
  };
}
const LOGS = {
  sites: {
    label: "Sites", table: "sites", isSites: true,
    fields: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Site name", type: "text" },
      { key: "brand", label: "Brand", ...SEL("Flappy's Fried Chicken","Burger Point","Sir Manong","Masa") },
      { key: "location", label: "Location / notes", type: "text" }
    ],
    columns: ["code","name","brand","location"]
  },
  deliveries: {
    label: "Delivery Temp Log", table: "deliveries",
    fields: [
      { key: "entry_date", label: "Date", type: "date", req: true },
      { key: "entry_time", label: "Time", type: "time" },
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "supplier", label: "Supplier", ...SEL("PENRITH PRODUCTION","B&E","PFD","Midfield","SupplyDash","CPG","Sydney Direct","Three Pence Coffee","Asian") },
      { key: "item", label: "Item", ...SEL("BEEF","CHICKEN","PORK","SEAFOOD","OTHER") },
      { key: "temp", label: "Temp °C", type: "number" },
      { key: "best_before", label: "Best before", type: "date" },
      { key: "accept", label: "Accept", ...SEL("Y","N") },
      { key: "invoice_no", label: "Invoice no.", type: "text" },
      { key: "weight", label: "Quantity", type: "number" },
      { key: "unit", label: "Unit", ...SEL("Box","Kg","Ltr","10L Ice Cream Tub","Can","Ea") },
      { key: "receiver", label: "Receiver", type: "employee" },
      { key: "driver", label: "Driver", type: "text" },
      { key: "recorded_by", label: "Recorded by", type: "employee" },
      { key: "corrective_action", label: "Corrective action", type: "textarea" }
    ]
  },
  fridge_freezer: {
    label: "Fridge/Freezer Temp Log", table: "fridge_freezer",
    fields: [
      { key: "entry_date", label: "Date", type: "today", req: true },
      { key: "entry_time", label: "Collection time", type: "select", options: [{ value: "10:00", label: "10:00 AM" }, { value: "17:00", label: "5:00 PM" }], req: true },
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "area", label: "Area", ...SEL("FOH","BOH") },
      { key: "type", label: "Unit", ...SEL("Freezer","Fridge","Walk-in Coolroom Fridge","Walk-in Freezer") },
      { key: "temp", label: "Temp °C", type: "number" },
      { key: "recorded_by", label: "Recorded by", type: "employee" },
      { key: "corrective_action", label: "Corrective action", type: "textarea" }
    ],
    extraCols: ["within_range"]
  },
  process_mep:     procDef("Process - MEP Temp Log", "MEP", { timeSlots: MEP_TIMES }),
  process_risky:   procDef("Process - Risky Temp Log", "Risky"),
  process_freezer: procDef("Process - Freeze Temp Log", "Freezer"),
  food_waste: {
    label: "Food Wastage Log", table: "food_waste", totals: ["quantity","cost"],
    fields: [
      { key: "entry_date", label: "Date", type: "date", req: true },
      { key: "entry_time", label: "Time", type: "time" },
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "recorded_by", label: "Recorded by", type: "employee" },
      { key: "item_description", label: "Item description", type: "select", options: PROCESS_ITEMS },
      { key: "loss_reason", label: "Loss reason", ...SEL("Closing","Leftover","Spoiled") },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "unit", label: "Unit", ...SEL("kg","L","ea") },
      { key: "cost", label: "Cost $", type: "number" },
      { key: "verified_by", label: "Verified by", type: "text" }
    ]
  }
};
const NUMERIC = new Set(["temp","weight","quantity","cost","cook_temp","reheat_temp","hot_holding_temp","site_id"]);

/* ===================== AUTH ===================== */
let SITES = [];
let MY_SITE = null;
let MULTI = false;       // more than one site visible
let IS_ADMIN = false;    // all-site admin login
let IS_MANAGER = false;  // leave-only manager login
let MGR_SITE = null;     // a manager's own site (they can only decide/delete this one)
let ALL_SITES = [];      // full site list for the leave picker (via all_sites RPC)
let EMPLOYEES = [];      // name roster for the Recorded-by dropdowns
const canManageLeave = () => IS_ADMIN || IS_MANAGER;
const canDecideLeave = (siteId) => IS_ADMIN || (IS_MANAGER && siteId === MGR_SITE);
const allSiteName = id => { const s = ALL_SITES.find(x => x.id === id) || SITES.find(x => x.id === id); return s ? `${s.code} · ${s.name}` : ("Site " + id); };
let CURRENT = "deliveries";
let booted = false;

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
async function doSignIn() {
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const msg = $("#loginMsg");
  if (!email || !password) { msg.textContent = "Enter email and password."; msg.className = "msg err"; return; }
  msg.textContent = "Signing in…"; msg.className = "msg";
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { msg.textContent = error.message; msg.className = "msg err"; }
}
$("#signIn").onclick = doSignIn;
$("#password").addEventListener("keydown", e => { if (e.key === "Enter") doSignIn(); });

/* ===================== BOOT + NAV ===================== */
async function boot() {
  if (booted) return; booted = true;
  await loadSites();
  await loadEmployees();
  try { const { data } = await sb.rpc("is_admin"); IS_ADMIN = !!data; } catch (e) { IS_ADMIN = false; }
  try { const { data } = await sb.rpc("is_manager"); IS_MANAGER = !!data; } catch (e) { IS_MANAGER = false; }
  if (IS_MANAGER) { try { const { data } = await sb.rpc("manager_site_id"); MGR_SITE = data || null; } catch (e) { MGR_SITE = null; } }
  const nav = $("#tabs");
  if (!SITES.length && !IS_ADMIN && !IS_MANAGER) {
    nav.innerHTML = "";
    $("#view").innerHTML = "<div class='card'><div class='body'>This login isn't linked to a site yet. Ask your manager to assign it in Supabase (site_logins) before entering data.</div></div>";
    return;
  }
  MY_SITE = SITES[0] || null;
  MULTI = SITES.length > 1;
  const tag = el("span", { textContent: IS_ADMIN ? "All sites (admin)" : (IS_MANAGER ? (MY_SITE ? "Site: " + MY_SITE.name + " (manager)" : "Manager") : (MY_SITE ? "Site: " + MY_SITE.name : "")) });
  tag.style.fontWeight = "bold"; tag.style.color = "var(--bar-text)";
  $("#who").prepend(tag);

  const mgr = IS_ADMIN || IS_MANAGER;
  // Grouped navigation. Each group has a header; items can be role-gated.
  const groups = [
    { header: null, items: [{ id: "employees", label: "Employee Input Portal" }] },
    { header: "Daily Logs", items: [
      { id: "deliveries", label: "Delivery Temp Log" },
      { id: "fridge_freezer", label: "Fridge/Freezer Temp Log" },
      { id: "process_mep", label: "Process - MEP Temp Log" },
      { id: "process_risky", label: "Process - Risky Temp Log" },
      { id: "process_freezer", label: "Process - Freeze Temp Log" },
      { id: "food_waste", label: "Food Wastage Log" }
    ]},
    { header: "Documents & Requests", items: [
      { id: "leave", label: "Leave" },
      { id: "pestcon", label: "Pest Control Document" },
      { id: "msds", label: "MSDS Document" }
    ]},
    { header: null, items: [{ id: "complaints", label: "Complaints / Suggestions Box" }] },
    { header: "Manager Portal", show: mgr, items: [
      { id: "cash", label: "Daily Cash Sales Log" },
      { id: "order", label: "Site Order" }
    ]},
    { header: "Admin", show: IS_ADMIN, items: [
      { id: "catalogue", label: "Catalogue" }
    ]}
  ];
  const visible = groups.filter(g => g.show === undefined || g.show);
  const allItems = visible.flatMap(g => g.items);
  if (!allItems.some(d => d.id === CURRENT)) CURRENT = allItems[0].id;

  function highlight() { [...nav.querySelectorAll("button")].forEach(btn => btn.classList.toggle("active", btn.dataset.id === CURRENT)); }
  nav.innerHTML = "";
  visible.forEach(g => {
    if (g.header) nav.append(el("div", { className: "navhdr", textContent: g.header }));
    g.items.forEach(d => {
      const btn = el("button", { textContent: d.label, className: d.id === CURRENT ? "active" : "" });
      btn.dataset.id = d.id;
      btn.onclick = () => { CURRENT = d.id; highlight(); openTab(d.id); };
      nav.append(btn);
    });
  });
  openTab(CURRENT);
}
async function loadSites() {
  const { data } = await sb.from("sites").select("id,code,name,brand").order("code");
  SITES = data || [];
}
const siteName = id => { const s = SITES.find(x => x.id === id); return s ? `${s.code} · ${s.name}` : ("Site " + id); };
function statusClass(s) { s = s || "Submitted"; if (s === "Accepted" || s === "Purchased" || s === "Approved" || s === "Delivered") return "ok"; if (s === "Rejected") return "bad"; return "pending"; }
function fieldWrap(label, input) {
  return el("div", { className: "field" }, [el("label", { textContent: label }), input]);
}

/* ===================== TAB ROUTER ===================== */
function openTab(id) {
  const view = $("#view"); view.innerHTML = "";
  if (id === "order") return renderOrder(view);
  if (id === "catalogue") return renderCatalogue(view);
  if (id === "leave") return renderLeave(view);
  if (id === "pestcon") return renderPestcon(view);
  if (id === "msds") return renderMSDS(view);
  if (id === "cash") return renderCashSales(view);
  if (id === "complaints") return renderComplaints(view);
  if (id === "employees") return renderEmployees(view);
  return renderLog(id, view);
}

/* ===================== LOG TABS ===================== */
function renderLog(id, view) {
  const def = LOGS[id];

  const form = el("div", { className: "card" });
  form.append(el("h2", { textContent: "New entry — " + def.label }));
  const body = el("div", { className: "body" });
  const grid = el("div", { className: "formgrid" });
  const inputs = {};
  def.fields.forEach(f => {
    const wrap = el("div", { className: "field" });
    wrap.append(el("label", { textContent: f.label + (f.req ? " *" : "") }));
    let input;
    if (f.type === "select") {
      input = el("select"); input.append(el("option", { value: "", textContent: "—" }));
      f.options.forEach(o => { const v = (o && typeof o === "object") ? o.value : o; const t = (o && typeof o === "object") ? o.label : o; input.append(el("option", { value: v, textContent: t })); });
    } else if (f.type === "today") {
      input = el("input", { type: "date" });
      input.value = new Date().toLocaleDateString("en-CA");
      input.disabled = true;
    } else if (f.type === "employee") {
      input = el("select"); input.append(el("option", { value: "", textContent: "—" }));
      let list = EMPLOYEES;
      if (!IS_ADMIN) {
        const sid = (MY_SITE && MY_SITE.id) || MGR_SITE;
        const filtered = EMPLOYEES.filter(x => Number(x.site_id) === Number(sid));
        list = filtered.length ? filtered : EMPLOYEES;   // fall back so it is never empty
      }
      Array.from(new Set(list.map(x => x.name))).sort((p, q) => p.localeCompare(q)).forEach(n => input.append(el("option", { value: n, textContent: n })));
    } else if (f.type === "site") {
      input = el("select");
      if (MULTI || IS_ADMIN) input.append(el("option", { value: "", textContent: "—" }));
      SITES.forEach(s => input.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
      if (!MULTI && !IS_ADMIN && MY_SITE) { input.value = MY_SITE.id; input.disabled = true; }
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
  body.append(el("div", { className: "actions" }, [saveBtn, msg]));
  form.append(body); view.append(form);

  saveBtn.onclick = async () => {
    const row = { ...(def.fixed || {}) };
    for (const f of def.fields) {
      let v = inputs[f.key].value;
      if (v === "") v = null;
      else if (NUMERIC.has(f.key)) v = Number(v);
      row[f.key] = v;
    }
    const missing = def.fields.filter(f => (f.req || f.type === "employee") && (row[f.key] === null || row[f.key] === undefined || row[f.key] === ""));
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

  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Records" }));
  const lbody = el("div", { className: "body" });
  if (!def.isSites) {
    const filters = el("div", { className: "filters" });
    let siteSel = null;
    if (MULTI || IS_ADMIN) {
      siteSel = el("select");
      siteSel.append(el("option", { value: "", textContent: "All sites" }));
      SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
      filters.append(fieldWrap("Site", siteSel));
    }
    const fromD = el("input", { type: "date" }), toD = el("input", { type: "date" });
    filters.append(
      fieldWrap("From", fromD), fieldWrap("To", toD),
      el("button", { className: "btn ghost", textContent: "Apply", onclick: () => loadTable(id, listCard, { site: siteSel ? siteSel.value : "", from: fromD.value, to: toD.value }) }),
      el("button", { className: "btn dark", textContent: "Export CSV", onclick: () => exportCSV(id) })
    );
    lbody.append(filters);
  }
  lbody.append(el("div", { className: "tablewrap" }));
  listCard.append(lbody); view.append(listCard);
  loadTable(id, listCard);
}

function tableColumns(def) {
  if (def.isSites) return def.columns.map(k => ({ key: k, label: k }));
  const cols = def.fields.map(f => ({ key: f.key, label: f.label }));
  (def.extraCols || []).forEach(k => cols.splice(6, 0, { key: k, label: "Within range" }));
  return cols;
}

let LAST_ROWS = [];
async function loadTable(id, card, flt = {}) {
  const def = LOGS[id];
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  let q;
  if (def.isSites) q = sb.from("sites").select("*").order("code");
  else {
    q = sb.from(def.table).select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    if (def.fixed) q = q.eq("category", def.fixed.category);
    if (flt.site) q = q.eq("site_id", flt.site);
    if (flt.from) q = q.gte("entry_date", flt.from);
    if (flt.to) q = q.lte("entry_date", flt.to);
  }
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

/* ===================== CATALOGUE (admin) ===================== */
async function loadCategories() {
  const { data } = await sb.from("item_categories").select("*").order("name");
  return data || [];
}
async function renderCatalogue(view) {
  view.innerHTML = "";
  const cats = await loadCategories();

  // ---- add item ----
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Add catalogue item" }));
  const b = el("div", { className: "body" });
  const grid = el("div", { className: "formgrid" });
  const catSel = el("select");
  cats.forEach(c => catSel.append(el("option", { value: c.id, textContent: c.name })));
  const nameI = el("input", { type: "text" });
  const codeI = el("input", { type: "text" });
  const priceI = el("input", { type: "number", step: "0.01", min: "0" });
  const photoI = el("input", { type: "file", accept: "image/*" });
  const descI = el("textarea");
  grid.append(
    fieldWrap("Category", catSel),
    fieldWrap("Item name", nameI),
    fieldWrap("Merchant code", codeI),
    fieldWrap("Price $", priceI),
    fieldWrap("Photo", photoI),
    fieldWrap("Description", descI)
  );
  b.append(grid);
  const msg = el("span", { className: "msg" });
  const save = el("button", { className: "btn", textContent: "Add item" });
  b.append(el("div", { className: "actions" }, [save, msg]));
  const newCat = el("input", { type: "text", placeholder: "New category name" });
  const addCat = el("button", { className: "btn ghost small", textContent: "Add category" });
  b.append(el("div", { className: "actions" }, [el("span", { className: "sub", textContent: "New category:" }), newCat, addCat]));
  card.append(b); view.append(card);

  // ---- manage categories ----
  const catCard = el("div", { className: "card" });
  catCard.append(el("h2", { textContent: "Categories" }));
  catCard.append(el("div", { className: "body" }));
  view.append(catCard);
  renderCategoryManager(catCard, view);

  // ---- catalogue list ----
  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Catalogue" }));
  listCard.append(el("div", { className: "body" }));
  view.append(listCard);
  renderCatalogueList(listCard);

  addCat.onclick = async () => {
    const n = newCat.value.trim(); if (!n) return;
    const { error } = await sb.from("item_categories").insert([{ name: n }]);
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    renderCatalogue(view);
  };
  save.onclick = async () => {
    const name = nameI.value.trim();
    if (!catSel.value || !name) { msg.textContent = "Category and item name are required."; msg.className = "msg err"; return; }
    save.disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
    let photo_url = null;
    const file = photoI.files[0];
    if (file) {
      const path = Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "");
      const { error: upErr } = await sb.storage.from("item-photos").upload(path, file);
      if (upErr) { save.disabled = false; msg.textContent = "Photo: " + upErr.message; msg.className = "msg err"; return; }
      photo_url = sb.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await sb.from("catalogue_items").insert([{
      category_id: Number(catSel.value), name, merchant_code: codeI.value || null,
      description: descI.value || null, price: Number(priceI.value || 0), photo_url
    }]);
    save.disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    msg.textContent = "Added ✓"; msg.className = "msg ok";
    nameI.value = ""; codeI.value = ""; priceI.value = ""; descI.value = ""; photoI.value = "";
    renderCatalogueList(listCard);
  };
}

async function renderCategoryManager(card, view) {
  const body = card.querySelector(".body");
  body.innerHTML = "";
  const cats = await loadCategories();
  if (!cats.length) { body.append(el("div", { className: "empty", textContent: "No categories yet — add one above." })); return; }
  cats.forEach(c => {
    const nameI = el("input", { type: "text", value: c.name });
    const cmsg = el("span", { className: "msg" });
    const rename = el("button", { className: "btn ghost small", textContent: "Rename", onclick: async () => {
      const n = nameI.value.trim(); if (!n) return;
      const { error } = await sb.from("item_categories").update({ name: n }).eq("id", c.id);
      if (error) { cmsg.textContent = error.message; cmsg.className = "msg err"; return; }
      renderCatalogue(view);
    }});
    const del = el("button", { className: "btn ghost small", textContent: "Delete", onclick: async () => {
      if (!confirm("Delete category \"" + c.name + "\"? Items in it become uncategorised.")) return;
      const { error } = await sb.from("item_categories").delete().eq("id", c.id);
      if (error) { cmsg.textContent = error.message; cmsg.className = "msg err"; return; }
      renderCatalogue(view);
    }});
    body.append(el("div", { className: "actions" }, [fieldWrap("Category", nameI), rename, del, cmsg]));
  });
}

function itemCard(i, cats, card) {
  const ci = el("div", { className: "item-card" });
  ci.append(i.photo_url
    ? el("img", { src: i.photo_url, alt: i.name, className: "item-thumb" })
    : el("div", { className: "item-thumb noimg", textContent: "No photo" }));
  ci.append(el("div", { className: "item-name", textContent: i.name }));
  if (i.merchant_code) ci.append(el("div", { className: "item-code", textContent: "Code: " + i.merchant_code }));
  if (i.description) ci.append(el("div", { className: "item-desc", textContent: i.description }));
  ci.append(el("div", { className: "item-price", textContent: "$" + Number(i.price).toFixed(2) }));
  ci.append(el("div", { className: "actions" }, [
    el("button", { className: "btn ghost small", textContent: "Edit", onclick: () => ci.replaceWith(itemEditCard(i, cats, card)) }),
    el("button", { className: "btn ghost small", textContent: "Delete", onclick: async () => {
      if (!confirm("Delete " + i.name + "?")) return;
      await sb.from("catalogue_items").delete().eq("id", i.id);
      renderCatalogueList(card);
    }})
  ]));
  return ci;
}

function itemEditCard(i, cats, card) {
  const ci = el("div", { className: "item-card" });
  const catSel = el("select");
  cats.forEach(c => { const o = el("option", { value: c.id, textContent: c.name }); if (c.id === i.category_id) o.selected = true; catSel.append(o); });
  const nameI = el("input", { type: "text", value: i.name });
  const codeI = el("input", { type: "text", value: i.merchant_code || "" });
  const priceI = el("input", { type: "number", step: "0.01", min: "0", value: i.price != null ? String(i.price) : "" });
  const photoI = el("input", { type: "file", accept: "image/*" });
  const descI = el("textarea"); descI.value = i.description || "";
  ci.append(
    fieldWrap("Category", catSel),
    fieldWrap("Item name", nameI),
    fieldWrap("Merchant code", codeI),
    fieldWrap("Price $", priceI),
    fieldWrap("Replace photo", photoI),
    fieldWrap("Description", descI)
  );
  const msg = el("span", { className: "msg" });
  const save = el("button", { className: "btn small", textContent: "Save", onclick: async () => {
    const name = nameI.value.trim();
    if (!name) { msg.textContent = "Name required."; msg.className = "msg err"; return; }
    save.disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
    const patch = { category_id: Number(catSel.value), name, merchant_code: codeI.value || null, description: descI.value || null, price: Number(priceI.value || 0) };
    const file = photoI.files[0];
    if (file) {
      const path = Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "");
      const { error: upErr } = await sb.storage.from("item-photos").upload(path, file);
      if (upErr) { save.disabled = false; msg.textContent = "Photo: " + upErr.message; msg.className = "msg err"; return; }
      patch.photo_url = sb.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await sb.from("catalogue_items").update(patch).eq("id", i.id);
    save.disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    renderCatalogueList(card);
  }});
  const cancel = el("button", { className: "btn ghost small", textContent: "Cancel", onclick: () => renderCatalogueList(card) });
  ci.append(el("div", { className: "actions" }, [save, cancel, msg]));
  return ci;
}

async function renderCatalogueList(card) {
  const body = card.querySelector(".body");
  body.innerHTML = "<div class='empty'>Loading…</div>";
  const [{ data: cats }, { data: items }] = await Promise.all([
    sb.from("item_categories").select("*").order("name"),
    sb.from("catalogue_items").select("*").order("name")
  ]);
  if (!items || !items.length) { body.innerHTML = "<div class='empty'>No items yet.</div>"; return; }
  body.innerHTML = "";
  (cats || []).forEach(c => {
    const group = items.filter(i => i.category_id === c.id);
    if (!group.length) return;
    body.append(el("div", { className: "cat-group", textContent: c.name }));
    const grid = el("div", { className: "cat-grid" });
    group.forEach(i => grid.append(itemCard(i, cats, card)));
    body.append(grid);
  });
  const uncategorised = items.filter(i => !(cats || []).some(c => c.id === i.category_id));
  if (uncategorised.length) {
    body.append(el("div", { className: "cat-group", textContent: "(Uncategorised)" }));
    const grid = el("div", { className: "cat-grid" });
    uncategorised.forEach(i => grid.append(itemCard(i, cats, card)));
    body.append(grid);
  }
}

/* ===================== ORDER (site + admin) ===================== */
async function renderOrder(view) {
  view.innerHTML = "";
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "New order" }));
  const b = el("div", { className: "body" });

  let orderSite = (!IS_ADMIN && MY_SITE) ? MY_SITE.id : null;
  if (IS_ADMIN) {
    const siteSel = el("select");
    siteSel.append(el("option", { value: "", textContent: "— choose site —" }));
    SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
    siteSel.onchange = () => { orderSite = siteSel.value ? Number(siteSel.value) : null; };
    b.append(fieldWrap("Ordering for site", siteSel));
  } else {
    b.append(el("div", { className: "sub", textContent: "Ordering for: " + (MY_SITE ? MY_SITE.name : "") }));
  }

  const listWrap = el("div"); b.append(listWrap);
  const totalBar = el("div", { className: "order-total" });
  const totalTxt = el("span", { textContent: "Order total: $0.00" });
  const submit = el("button", { className: "btn", textContent: "Submit order" });
  const omsg = el("span", { className: "msg" });
  totalBar.append(totalTxt, submit, omsg);
  b.append(totalBar);
  card.append(b); view.append(card);

  const [{ data: cats }, { data: items }] = await Promise.all([
    sb.from("item_categories").select("*").order("name"),
    sb.from("catalogue_items").select("*").eq("active", true).order("name")
  ]);
  const qty = {};
  function recompute() {
    let t = 0;
    (items || []).forEach(i => { t += (qty[i.id] || 0) * Number(i.price); });
    totalTxt.textContent = "Order total: $" + t.toFixed(2);
  }
  if (!items || !items.length) {
    listWrap.innerHTML = "<div class='empty'>No items in the catalogue yet.</div>";
  } else {
    (cats || []).forEach(c => {
      const group = items.filter(i => i.category_id === c.id);
      if (!group.length) return;
      listWrap.append(el("div", { className: "cat-group", textContent: c.name }));
      const grid = el("div", { className: "cat-grid" });
      group.forEach(i => {
        const ci = el("div", { className: "item-card" });
        ci.append(i.photo_url
          ? el("img", { src: i.photo_url, alt: i.name, className: "item-thumb" })
          : el("div", { className: "item-thumb noimg", textContent: "No photo" }));
        ci.append(el("div", { className: "item-name", textContent: i.name }));
        if (i.merchant_code) ci.append(el("div", { className: "item-code", textContent: "Code: " + i.merchant_code }));
        if (i.description) ci.append(el("div", { className: "item-desc", textContent: i.description }));
        ci.append(el("div", { className: "item-price", textContent: "$" + Number(i.price).toFixed(2) }));
        const q = el("input", { type: "number", min: "0", step: "1", value: "0", className: "qty" });
        q.oninput = () => { qty[i.id] = Number(q.value) || 0; recompute(); };
        ci.append(fieldWrap("Qty", q));
        grid.append(ci);
      });
      listWrap.append(grid);
    });
  }

  submit.onclick = async () => {
    if (!orderSite) { omsg.textContent = "Choose a site first."; omsg.className = "msg err"; return; }
    const lines = (items || []).filter(i => (qty[i.id] || 0) > 0);
    if (!lines.length) { omsg.textContent = "Add a quantity to at least one item."; omsg.className = "msg err"; return; }
    submit.disabled = true; omsg.textContent = "Submitting…"; omsg.className = "msg";
    const { data: ord, error } = await sb.from("orders").insert([{ site_id: orderSite }]).select().single();
    if (error) { submit.disabled = false; omsg.textContent = error.message; omsg.className = "msg err"; return; }
    const payload = lines.map(i => ({ order_id: ord.id, item_id: i.id, item_name: i.name, merchant_code: i.merchant_code || null, unit_price: Number(i.price), quantity: qty[i.id] }));
    const { error: lerr } = await sb.from("order_lines").insert(payload);
    submit.disabled = false;
    if (lerr) { omsg.textContent = lerr.message; omsg.className = "msg err"; return; }
    omsg.textContent = "Order submitted ✓"; omsg.className = "msg ok";
    renderOrder(view);
  };

  renderOrderHistory(view);
}

async function renderOrderHistory(view) {
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Order history" }));
  const b = el("div", { className: "body" });
  const filters = el("div", { className: "filters" });
  let siteSel = null;
  if (IS_ADMIN) {
    siteSel = el("select");
    siteSel.append(el("option", { value: "", textContent: "All sites" }));
    SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
    filters.append(fieldWrap("Site", siteSel));
  }
  filters.append(el("button", { className: "btn ghost", textContent: "Apply", onclick: () => load() }));
  filters.append(el("button", { className: "btn dark", textContent: "Export CSV", onclick: () => ordersCSV() }));
  b.append(filters);
  const wrap = el("div"); b.append(wrap);
  card.append(b); view.append(card);
  let lastOrders = [];

  function ordersCSV() {
    if (!lastOrders.length) return;
    const head = ["Order ID","Date","Site","Status","Delivered","Merchant code","Item","Qty","Unit price","Line total"];
    const rows = [];
    lastOrders.forEach(o => {
      const d = new Date(o.created_at).toLocaleString();
      (o.order_lines || []).forEach(l => rows.push([
        o.id, d, siteName(o.site_id), o.status || "Submitted", o.delivered ? "Yes" : "No", l.merchant_code || "", l.item_name,
        l.quantity, Number(l.unit_price).toFixed(2), (Number(l.unit_price) * Number(l.quantity)).toFixed(2)
      ]));
    });
    const csv = [head, ...rows].map(a => a.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const tag = (siteSel && siteSel.value) ? "_" + siteName(Number(siteSel.value)).split(" ")[0] : "_all-sites";
    const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "orders" + tag + "_" + new Date().toISOString().slice(0,10) + ".csv" });
    document.body.append(a); a.click(); a.remove();
  }

  async function load() {
    wrap.innerHTML = "<div class='empty'>Loading…</div>";
    let q = sb.from("orders").select("*, order_lines(id,quantity,unit_price,item_name,merchant_code)").order("created_at", { ascending: false }).limit(200);
    if (siteSel && siteSel.value) q = q.eq("site_id", siteSel.value);
    const { data, error } = await q;
    if (error) { wrap.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
    if (!data || !data.length) { lastOrders = []; wrap.innerHTML = "<div class='empty'>No orders yet.</div>"; return; }
    lastOrders = data;
    wrap.innerHTML = "";
    data.forEach(o => {
      const total = (o.order_lines || []).reduce((a, l) => a + Number(l.unit_price) * Number(l.quantity), 0);
      const det = el("details", { className: "order-row" });
      const d = new Date(o.created_at);
      const sum = el("summary");
      sum.append(el("span", { textContent: d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
      if (IS_ADMIN) sum.append(el("span", { className: "ord-site", textContent: siteName(o.site_id) }));
      sum.append(el("span", { className: "badge " + statusClass(o.status), textContent: o.status || "Submitted" }));
      if (o.delivered) sum.append(el("span", { className: "badge ok", textContent: "Delivered" }));
      sum.append(el("span", { className: "ord-total", textContent: "$" + total.toFixed(2) }));
      det.append(sum);

      const tbl = el("table");
      tbl.append(el("thead", {}, el("tr", {}, [el("th", { textContent: "Ordered" }), el("th", { textContent: "Item" }), el("th", { textContent: "Code" }), el("th", { textContent: "Qty" }), el("th", { textContent: "Unit $" }), el("th", { textContent: "Line $" })])));
      const tb = el("tbody");
      const orderedDate = new Date(o.created_at).toLocaleDateString();
      const qInputs = {};
      (o.order_lines || []).forEach(l => {
        let qtyCell;
        if (IS_ADMIN) {
          const qi = el("input", { type: "number", min: "0", step: "1", value: String(l.quantity), className: "qty" });
          qInputs[l.id] = qi; qtyCell = el("td", {}, qi);
        } else {
          qtyCell = el("td", { textContent: String(l.quantity) });
        }
        tb.append(el("tr", {}, [
          el("td", { textContent: orderedDate }),
          el("td", { textContent: l.item_name }),
          el("td", { textContent: l.merchant_code || "" }),
          qtyCell,
          el("td", { textContent: "$" + Number(l.unit_price).toFixed(2) }),
          el("td", { textContent: "$" + (Number(l.unit_price) * Number(l.quantity)).toFixed(2) })
        ]));
      });
      tbl.append(tb); det.append(tbl);

      if (IS_ADMIN) {
        const statusSel = el("select");
        ["Submitted","Accepted","Rejected","Purchased"].forEach(s => {
          const op = el("option", { value: s, textContent: s });
          if (s === (o.status || "Submitted")) op.selected = true;
          statusSel.append(op);
        });
        const amsg = el("span", { className: "msg" });
        const saveBtn = el("button", { className: "btn small", textContent: "Save changes", onclick: async () => {
          saveBtn.disabled = true; amsg.textContent = "Saving…"; amsg.className = "msg";
          for (const l of (o.order_lines || [])) {
            const nv = Number(qInputs[l.id].value) || 0;
            if (nv !== Number(l.quantity)) {
              if (nv <= 0) await sb.from("order_lines").delete().eq("id", l.id);
              else await sb.from("order_lines").update({ quantity: nv }).eq("id", l.id);
            }
          }
          const { error } = await sb.from("orders").update({ status: statusSel.value }).eq("id", o.id);
          saveBtn.disabled = false;
          if (error) { amsg.textContent = error.message; amsg.className = "msg err"; return; }
          load();
        }});
        det.append(el("div", { className: "actions" }, [fieldWrap("Status", statusSel), saveBtn, amsg]));
      } else {
        const dmsg = el("span", { className: "msg" });
        const dbtn = el("button", { className: "btn small", textContent: o.delivered ? "Mark NOT delivered" : "Mark delivered" });
        dbtn.onclick = async () => {
          dbtn.disabled = true; dmsg.textContent = "Saving…"; dmsg.className = "msg";
          const { error } = await sb.rpc("mark_delivered", { p_order_id: o.id, p_delivered: !o.delivered });
          dbtn.disabled = false;
          if (error) { dmsg.textContent = error.message; dmsg.className = "msg err"; return; }
          load();
        };
        det.append(el("div", { className: "actions" }, [dbtn, dmsg]));
      }
      wrap.append(det);
    });
  }
  load();
}



/* ===================== LEAVE REQUESTS ===================== */
// ---- Downloadable leave-form templates. Paste YOUR links here ----
// Each url can be an external link (Google Drive, Dropbox, your website) or a
// file you add to the repo (e.g. "templates/flappys-leave-form.pdf").
const LEAVE_TEMPLATES = [
  { label: "Leave Form — Flappy's Fried Chicken", url: "https://www.dropbox.com/scl/fi/20ufbv1s7100j4vhojdoh/LEAVE-FORM_TEMPLATE_FLAPPYS.pdf?rlkey=sqtphm4hl0u3to1pzwvc2f3i8&st=tmir5o2y&dl=0" },
  { label: "Leave Form — Burger Point",           url: "https://www.dropbox.com/scl/fi/enp373sw7anbvijzs11ue/LEAVE-FORM_TEMPLATE_BURGER-POINT.pdf?rlkey=un8vvem3bvcsykxvlv10rmvqr&st=qkwphaqu&dl=0" },
  { label: "Leave Form — Sir Manong",             url: "https://www.dropbox.com/scl/fi/yzup34u9tb6cuh37bmkag/LEAVE-FORM_TEMPLATE_SM.pdf?rlkey=v8gk61vh5td2ck4zdz16h3yvf&st=ji17y3wv&dl=0" },
  { label: "Leave Form — Masa",                   url: "https://www.dropbox.com/scl/fi/414wa2id25vyjfw92ze0s/MASA-LEAVE-REQUEST-FORM.pdf?rlkey=tf8e48ln0l6f7h5yr4b9cxbfj&st=0k6uhhcj&dl=0" }
];

async function renderLeave(view) {
  view.innerHTML = "";
  try { const { data } = await sb.rpc("all_sites"); ALL_SITES = data || []; } catch (e) { ALL_SITES = SITES.slice(); }
  {
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Apply for leave" }));
  const b = el("div", { className: "body" });

  // intro
  const intro = el("div", { style: "background:var(--input-bg);border:1px solid #e4dfc4;border-radius:10px;padding:16px 20px;margin-bottom:14px" });
  intro.append(el("p", { style: "margin:0 0 8px;font-size:14px;line-height:1.5;color:#333", textContent: "This portal is used to submit and manage employee leave applications. Team members are required to download the company's Leave Form below, complete all required information, sign the form, and submit their leave request through this portal together with the completed form." }));
  intro.append(el("p", { style: "margin:0 0 8px;font-size:14px;line-height:1.5;color:#333", textContent: "For Sick Leave or Carer's Leave, team members are also required to upload the relevant medical certificate or supporting documentation, where applicable, together with their leave application." }));
  intro.append(el("p", { style: "margin:0 0 8px;font-size:14px;line-height:1.5;color:#333", textContent: "All leave applications will be reviewed by the relevant Manager and Head Office. Once submitted, team members can view the status of their application, including whether it is Pending, Approved, or Declined, along with any applicable comments or reasons provided as part of the decision." }));
  intro.append(el("p", { style: "margin:0;font-size:14px;line-height:1.5;color:#333", textContent: "All submitted leave applications are treated as confidential and can only be accessed by authorised Managers and Head Office personnel." }));
  b.append(intro);

  // template downloads
  const tpl = el("div", { style: "margin-bottom:16px" });
  tpl.append(el("div", { className: "sub", style: "margin-bottom:6px", textContent: "Download your company's leave form:" }));
  const tplRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:10px" });
  const liveTpl = LEAVE_TEMPLATES.filter(t => t.url && t.url !== "REPLACE_WITH_LINK");
  if (liveTpl.length) {
    liveTpl.forEach(t => tplRow.append(el("a", { className: "btn ghost small", href: t.url, target: "_blank", textContent: t.label })));
  } else {
    tplRow.append(el("span", { className: "sub", textContent: "(Form links not set yet — add them in app.js → LEAVE_TEMPLATES.)" }));
  }
  tpl.append(tplRow);
  b.append(tpl);

  // form
  const grid = el("div", { className: "formgrid" });
  let orderSite = MY_SITE ? MY_SITE.id : null;
  const siteSel = el("select");
  siteSel.append(el("option", { value: "", textContent: "— choose site —" }));
  ALL_SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
  if (orderSite) siteSel.value = orderSite;
  siteSel.onchange = () => { orderSite = siteSel.value ? Number(siteSel.value) : null; };
  grid.append(fieldWrap("Site (you can apply for any site)", siteSel));
  const nameI = el("select");
  nameI.append(el("option", { value: "", textContent: "— your name —" }));
  Array.from(new Set(EMPLOYEES.map(e => e.name))).sort((x, y) => x.localeCompare(y)).forEach(n => nameI.append(el("option", { value: n, textContent: n })));
  const typeI = el("select");
  ["Annual leave","Personal / carer's leave","Sick leave","Unpaid leave","Other"].forEach(o => typeI.append(el("option", { value: o, textContent: o })));
  const fromI = el("input", { type: "date" });
  const toI = el("input", { type: "date" });
  const reasonI = el("textarea");
  const formI = el("input", { type: "file", accept: "application/pdf,image/*", multiple: true });
  grid.append(
    fieldWrap("Your name", nameI),
    fieldWrap("Leave type", typeI),
    fieldWrap("From", fromI),
    fieldWrap("To", toI),
    fieldWrap("Reason / notes", reasonI),
    fieldWrap("Attachments — signed leave form + medical certificate / supporting docs (you can select more than one)", formI)
  );
  b.append(grid);
  const msg = el("span", { className: "msg" });
  const save = el("button", { className: "btn", textContent: "Submit request" });
  b.append(el("div", { className: "actions" }, [save, msg]));
  card.append(b); view.append(card);

  save.onclick = async () => {
    if (!orderSite) { msg.textContent = "Choose a site first."; msg.className = "msg err"; return; }
    if (!nameI.value.trim() || !fromI.value || !toI.value) { msg.textContent = "Name, From and To dates are required."; msg.className = "msg err"; return; }
    if (toI.value < fromI.value) { msg.textContent = "The 'To' date can't be before the 'From' date."; msg.className = "msg err"; return; }
    save.disabled = true; msg.textContent = "Submitting…"; msg.className = "msg";
    const attachments = [];
    const files = Array.from(formI.files || []);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = orderSite + "/" + Date.now() + "_" + i + "_" + f.name.replace(/[^a-zA-Z0-9._-]/g, "");
      const { error: upErr } = await sb.storage.from("leave-forms").upload(path, f);
      if (upErr) { save.disabled = false; msg.textContent = "Attachment upload: " + upErr.message; msg.className = "msg err"; return; }
      attachments.push({ path, name: f.name });
    }
    const { error } = await sb.from("leave_requests").insert([{
      site_id: orderSite, staff_name: nameI.value.trim(), leave_type: typeI.value,
      date_from: fromI.value, date_to: toI.value, reason: reasonI.value || null,
      form_path: attachments.length ? attachments[0].path : null, attachments
    }]);
    save.disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    msg.textContent = "Submitted ✓"; msg.className = "msg ok";
    nameI.value = ""; fromI.value = ""; toI.value = ""; reasonI.value = ""; formI.value = "";
    loadLeaveList(listCard);
  };

  if (!canManageLeave()) {
    b.append(el("div", { className: "sub", style: "margin-top:12px", textContent: "Your request goes to your manager and head office for review. Submitted leave is private — only managers and head office can see it." }));
    return;
  }
  } // end submit card

  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Leave requests" }));
  const lb = el("div", { className: "body" });
  const filters = el("div", { className: "filters" });
  let fStatus = el("select");
  ["", "Pending", "Approved", "Declined"].forEach(o => fStatus.append(el("option", { value: o, textContent: o || "All statuses" })));
  const fSite = el("select");
  fSite.append(el("option", { value: "", textContent: "All sites" }));
  SITES.forEach(s => fSite.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
  filters.append(fieldWrap("Site", fSite));
  filters.append(fieldWrap("Status", fStatus),
    el("button", { className: "btn ghost", textContent: "Apply", onclick: () => loadLeaveList(listCard, { site: fSite.value, status: fStatus.value }) }),
    el("button", { className: "btn dark", textContent: "Export CSV", onclick: () => leaveCSV() }));
  lb.append(filters);
  lb.append(el("div", { className: "tablewrap" }));
  listCard.append(lb); view.append(listCard);
  loadLeaveList(listCard);
}

async function viewLeaveForm(path) {
  const { data, error } = await sb.storage.from("leave-forms").createSignedUrl(path, 120);
  if (error || !data) { alert("Couldn't open the form: " + (error ? error.message : "unknown error")); return; }
  window.open(data.signedUrl, "_blank");
}

function leaveFilesCell(r) {
  let files = Array.isArray(r.attachments) ? r.attachments.slice() : [];
  if (!files.length && r.form_path) files = [{ path: r.form_path, name: "Attachment" }];
  if (!files.length) return el("span", { textContent: "—" });
  const box = el("div", { style: "display:flex;flex-direction:column;gap:3px" });
  files.forEach((f, i) => box.append(el("button", { className: "btn ghost small", textContent: "Download " + (f.name || ("file " + (i+1))), onclick: () => viewLeaveForm(f.path) })));
  return box;
}

let LEAVE_ROWS = [];
async function loadLeaveList(card, flt = {}) {
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  let q = sb.from("leave_requests").select("*").order("created_at", { ascending: false }).limit(500);
  if (flt.site) q = q.eq("site_id", flt.site);
  if (flt.status) q = q.eq("status", flt.status);
  const { data, error } = await q;
  if (error) { tw.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  LEAVE_ROWS = data || [];
  if (!LEAVE_ROWS.length) { tw.innerHTML = "<div class='empty'>No leave requests yet.</div>"; return; }
  const table = el("table");
  const head = ["Submitted","Name","Site","Type","From","To","Form","Status","Reason for decision","Action"];
  table.append(el("thead", {}, el("tr", {}, head.map(h => el("th", { textContent: h })))));
  const tb = el("tbody");
  LEAVE_ROWS.forEach(r => {
    const sc = r.status === "Approved" ? "ok" : r.status === "Declined" ? "bad" : "pending";
    const cells = [
      el("td", { textContent: r.created_at ? new Date(r.created_at).toLocaleDateString() : "" }),
      el("td", { textContent: r.staff_name || "" })
    ];
    cells.push(el("td", { textContent: allSiteName(r.site_id) }));
    cells.push(
      el("td", { textContent: r.leave_type || "" }),
      el("td", { textContent: r.date_from || "" }),
      el("td", { textContent: r.date_to || "" }),
      el("td", {}, leaveFilesCell(r)),
      el("td", {}, el("span", { className: "badge " + sc, textContent: r.status || "Pending" })),
      el("td", { textContent: r.admin_note || "" })
    );
    if (canDecideLeave(r.site_id)) {
      const note = el("input", { type: "text", placeholder: "Reason (shown to staff)", style: "min-width:150px" });
      note.value = r.admin_note || "";
      async function setStatus(st) {
        await sb.from("leave_requests").update({ status: st, admin_note: note.value || null }).eq("id", r.id);
        loadLeaveList(card, flt);
      }
      const wrap = el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;align-items:center" }, [
        note,
        el("button", { className: "btn ghost small", textContent: "Approve", onclick: () => setStatus("Approved") }),
        el("button", { className: "btn ghost small", textContent: "Decline", onclick: () => setStatus("Declined") }),
        el("button", { className: "btn ghost small", textContent: "Pending", onclick: () => setStatus("Pending") }),
        el("button", { className: "btn ghost small", textContent: "Delete", onclick: async () => {
          if (!confirm("Delete this leave request?")) return;
          await sb.from("leave_requests").delete().eq("id", r.id);
          loadLeaveList(card, flt);
        }})
      ]);
      cells.push(el("td", {}, wrap));
    } else {
      cells.push(el("td", {}, el("span", { className: "sub", textContent: "View only" })));
    }
    tb.append(el("tr", {}, cells));
  });
  table.append(tb);
  tw.innerHTML = ""; tw.append(table);
}

function leaveCSV() {
  if (!LEAVE_ROWS.length) return;
  const head = ["Submitted","Name","Site","Type","From","To","Status","Reason for decision","Attachments"];
  const rows = LEAVE_ROWS.map(r => [
    r.created_at ? new Date(r.created_at).toLocaleString() : "", r.staff_name || "", allSiteName(r.site_id),
    r.leave_type || "", r.date_from || "", r.date_to || "", r.status || "Pending", r.admin_note || "",
    (Array.isArray(r.attachments) ? r.attachments.length : (r.form_path ? 1 : 0))
  ]);
  const csv = [head, ...rows].map(a => a.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "leave_" + new Date().toISOString().slice(0,10) + ".csv" });
  document.body.append(a); a.click(); a.remove();
}

/* ===================== PEST CONTROL ===================== */
function monthSelect(includeAll) {
  const sel = el("select");
  if (includeAll) sel.append(el("option", { value: "", textContent: "All months" }));
  const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const y = now.getFullYear(), m = now.getMonth() - i;
    const d = new Date(y, m, 1);
    const val = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    sel.append(el("option", { value: val, textContent: names[d.getMonth()] + " " + d.getFullYear() }));
  }
  return sel;
}
async function renderPestcon(view) {
  view.innerHTML = "";
  try { const { data } = await sb.rpc("all_sites"); ALL_SITES = data || []; } catch (e) { ALL_SITES = SITES.slice(); }

  const intro = el("div", { className: "card" });
  const ib = el("div", { className: "body" });
  ib.append(el("p", { style: "margin:0 0 6px;font-size:14px;line-height:1.5;color:#333", textContent: "This portal provides access to the monthly Pest Control reports for each restaurant site." }));
  ib.append(el("p", { style: "margin:0;font-size:14px;line-height:1.5;color:#333", textContent: "Please select the relevant site below and download the Pest Control report for the month you require." }));
  intro.append(ib); view.append(intro);

  // admin upload
  if (IS_ADMIN) {
    const card = el("div", { className: "card" });
    card.append(el("h2", { textContent: "Upload pest-control report" }));
    const b = el("div", { className: "body" });
    const grid = el("div", { className: "formgrid" });
    const siteSel = el("select");
    siteSel.append(el("option", { value: "", textContent: "— site —" }));
    ALL_SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
    const monthI = monthSelect(false);
    const titleI = el("input", { type: "text" });
    const fileI = el("input", { type: "file", accept: "application/pdf,image/*", multiple: true });
    grid.append(fieldWrap("Site", siteSel), fieldWrap("Month", monthI), fieldWrap("Title / provider", titleI), fieldWrap("File(s)", fileI));
    b.append(grid);
    const msg = el("span", { className: "msg" });
    const save = el("button", { className: "btn", textContent: "Upload" });
    b.append(el("div", { className: "actions" }, [save, msg]));
    card.append(b); view.append(card);

    save.onclick = async () => {
      const site_id = Number(siteSel.value);
      const files = Array.from(fileI.files || []);
      if (!site_id || !files.length) { msg.textContent = "Choose a site and at least one file."; msg.className = "msg err"; return; }
      save.disabled = true; msg.textContent = "Uploading…"; msg.className = "msg";
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = site_id + "/" + Date.now() + "_" + i + "_" + f.name.replace(/[^a-zA-Z0-9._-]/g, "");
        const { error: upErr } = await sb.storage.from("pestcon").upload(path, f);
        if (upErr) { save.disabled = false; msg.textContent = "Upload: " + upErr.message; msg.className = "msg err"; return; }
        const { error } = await sb.from("pestcon").insert([{ site_id, period_month: monthI.value + "-01", title: titleI.value || null, file_path: path }]);
        if (error) { save.disabled = false; msg.textContent = error.message; msg.className = "msg err"; return; }
      }
      save.disabled = false; msg.textContent = "Uploaded ✓"; msg.className = "msg ok";
      titleI.value = ""; fileI.value = "";
      loadPestconList(listCard, { site: siteSel.value });
    };
  }

  // list / download
  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Pest-control reports" }));
  const lb = el("div", { className: "body" });
  const filters = el("div", { className: "filters" });
  const fSite = el("select");
  fSite.append(el("option", { value: "", textContent: "All sites" }));
  ALL_SITES.forEach(s => fSite.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
  const fMonth = monthSelect(true);
  filters.append(fieldWrap("Site", fSite), fieldWrap("Month", fMonth),
    el("button", { className: "btn ghost", textContent: "View", onclick: () => loadPestconList(listCard, { site: fSite.value, month: fMonth.value }) }));
  lb.append(filters);
  lb.append(el("div", { className: "tablewrap" }));
  listCard.append(lb); view.append(listCard);
  loadPestconList(listCard);
}

async function loadPestconList(card, flt = {}) {
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  let q = sb.from("pestcon").select("*").order("period_month", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (flt.site) q = q.eq("site_id", flt.site);
  if (flt.month) q = q.eq("period_month", flt.month + "-01");
  const { data, error } = await q;
  if (error) { tw.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  const rows = data || [];
  if (!rows.length) { tw.innerHTML = "<div class='empty'>No pest-control reports yet.</div>"; return; }
  const table = el("table");
  const head = ["Month","Site","Title / provider","Report"].concat(IS_ADMIN ? ["Action"] : []);
  table.append(el("thead", {}, el("tr", {}, head.map(h => el("th", { textContent: h })))));
  const tb = el("tbody");
  rows.forEach(r => {
    const url = sb.storage.from("pestcon").getPublicUrl(r.file_path).data.publicUrl;
    const cells = [
      el("td", { textContent: r.period_month ? r.period_month.slice(0,7) : "" }),
      el("td", { textContent: allSiteName(r.site_id) }),
      el("td", { textContent: r.title || "" }),
      el("td", {}, el("a", { className: "btn ghost small", href: url, target: "_blank", textContent: "Download" }))
    ];
    if (IS_ADMIN) {
      cells.push(el("td", {}, el("button", { className: "btn ghost small", textContent: "Delete", onclick: async () => {
        if (!confirm("Delete this report?")) return;
        await sb.storage.from("pestcon").remove([r.file_path]);
        await sb.from("pestcon").delete().eq("id", r.id);
        loadPestconList(card, flt);
      }})));
    }
    tb.append(el("tr", {}, cells));
  });
  table.append(tb);
  tw.innerHTML = ""; tw.append(table);
}

/* ===================== EMPLOYEES (name roster) ===================== */
async function loadEmployees() {
  const { data } = await sb.from("employees").select("*").eq("active", true).order("name");
  EMPLOYEES = data || [];
}

async function renderEmployees(view) {
  view.innerHTML = "";
  try { const { data } = await sb.rpc("all_sites"); ALL_SITES = data || []; } catch (e) { ALL_SITES = SITES.slice(); }

  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Add your name" }));
  const b = el("div", { className: "body" });
  b.append(el("div", { className: "sub", textContent: "Add team members here so their names appear in the 'Recorded by' dropdown on the Process logs." }));
  const grid = el("div", { className: "formgrid" });
  const nameI = el("input", { type: "text" });
  const siteSel = el("select");
  siteSel.append(el("option", { value: "", textContent: "— site —" }));
  ALL_SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
  if (MY_SITE) siteSel.value = MY_SITE.id;
  grid.append(fieldWrap("Name", nameI), fieldWrap("Site", siteSel));
  b.append(grid);
  const msg = el("span", { className: "msg" });
  const save = el("button", { className: "btn", textContent: "Add" });
  b.append(el("div", { className: "actions" }, [save, msg]));
  card.append(b); view.append(card);

  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Team" }));
  listCard.append(el("div", { className: "body" }));
  view.append(listCard);
  loadEmployeeList(listCard);

  save.onclick = async () => {
    const name = nameI.value.trim();
    const site_id = Number(siteSel.value);
    if (!name || !site_id) { msg.textContent = "Name and site are required."; msg.className = "msg err"; return; }
    save.disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
    const { error } = await sb.from("employees").insert([{ name, site_id }]);
    save.disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    msg.textContent = "Added ✓"; msg.className = "msg ok";
    nameI.value = "";
    await loadEmployees();
    loadEmployeeList(listCard);
  };
}

async function loadEmployeeList(card) {
  const body = card.querySelector(".body");
  body.innerHTML = "<div class='empty'>Loading…</div>";
  const { data, error } = await sb.from("employees").select("*").eq("active", true).order("name");
  if (error) { body.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  const rows = (data || []).filter(e => IS_ADMIN || (MY_SITE && e.site_id === MY_SITE.id));
  if (!rows.length) { body.innerHTML = "<div class='empty'>No team members yet.</div>"; return; }
  const table = el("table");
  table.append(el("thead", {}, el("tr", {}, ["Name","Site",""].map(h => el("th", { textContent: h })))));
  const tb = el("tbody");
  rows.forEach(e => {
    tb.append(el("tr", {}, [
      el("td", { textContent: e.name }),
      el("td", { textContent: allSiteName(e.site_id) }),
      el("td", {}, el("button", { className: "btn ghost small", textContent: "Remove", onclick: async () => {
        if (!confirm("Remove " + e.name + "?")) return;
        await sb.from("employees").update({ active: false }).eq("id", e.id);
        await loadEmployees();
        loadEmployeeList(card);
      }}))
    ]));
  });
  table.append(tb);
  body.innerHTML = ""; body.append(el("div", { className: "tablewrap" }, table));
}

/* ===================== MSDS (Material Safety Data Sheets) ===================== */
async function renderMSDS(view) {
  view.innerHTML = "";
  try { const { data } = await sb.rpc("all_sites"); ALL_SITES = data || []; } catch (e) { ALL_SITES = SITES.slice(); }

  const intro = el("div", { className: "card" });
  const ib = el("div", { className: "body" });
  ib.append(el("p", { style: "margin:0 0 6px;font-size:14px;line-height:1.5;color:#333", textContent: "This portal provides access to the Material Safety Data Sheets (MSDS) for each restaurant site." }));
  ib.append(el("p", { style: "margin:0;font-size:14px;line-height:1.5;color:#333", textContent: "Please select the relevant site below and download the MSDS file for the chemical or product you require." }));
  intro.append(ib); view.append(intro);

  if (IS_ADMIN) {
    const card = el("div", { className: "card" });
    card.append(el("h2", { textContent: "Upload MSDS" }));
    const b = el("div", { className: "body" });
    const grid = el("div", { className: "formgrid" });
    const siteSel = el("select");
    siteSel.append(el("option", { value: "", textContent: "— site —" }));
    ALL_SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
    const titleI = el("input", { type: "text" });
    const fileI = el("input", { type: "file", accept: "application/pdf,image/*", multiple: true });
    grid.append(fieldWrap("Site", siteSel), fieldWrap("Chemical / product name", titleI), fieldWrap("File(s)", fileI));
    b.append(grid);
    const msg = el("span", { className: "msg" });
    const save = el("button", { className: "btn", textContent: "Upload" });
    b.append(el("div", { className: "actions" }, [save, msg]));
    card.append(b); view.append(card);

    save.onclick = async () => {
      const site_id = Number(siteSel.value);
      const files = Array.from(fileI.files || []);
      if (!site_id || !files.length) { msg.textContent = "Choose a site and at least one file."; msg.className = "msg err"; return; }
      save.disabled = true; msg.textContent = "Uploading…"; msg.className = "msg";
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = site_id + "/" + Date.now() + "_" + i + "_" + f.name.replace(/[^a-zA-Z0-9._-]/g, "");
        const { error: upErr } = await sb.storage.from("msds").upload(path, f);
        if (upErr) { save.disabled = false; msg.textContent = "Upload: " + upErr.message; msg.className = "msg err"; return; }
        const { error } = await sb.from("msds").insert([{ site_id, title: titleI.value || f.name, file_path: path }]);
        if (error) { save.disabled = false; msg.textContent = error.message; msg.className = "msg err"; return; }
      }
      save.disabled = false; msg.textContent = "Uploaded ✓"; msg.className = "msg ok";
      titleI.value = ""; fileI.value = "";
      loadMSDSList(listCard, { site: siteSel.value });
    };
  }

  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Safety data sheets" }));
  const lb = el("div", { className: "body" });
  const filters = el("div", { className: "filters" });
  const fSite = el("select");
  fSite.append(el("option", { value: "", textContent: "All sites" }));
  ALL_SITES.forEach(s => fSite.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
  filters.append(fieldWrap("Site", fSite),
    el("button", { className: "btn ghost", textContent: "View", onclick: () => loadMSDSList(listCard, { site: fSite.value }) }));
  lb.append(filters);
  lb.append(el("div", { className: "tablewrap" }));
  listCard.append(lb); view.append(listCard);
  loadMSDSList(listCard);
}

async function loadMSDSList(card, flt = {}) {
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  let q = sb.from("msds").select("*").order("title").limit(1000);
  if (flt.site) q = q.eq("site_id", flt.site);
  const { data, error } = await q;
  if (error) { tw.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  const rows = data || [];
  if (!rows.length) { tw.innerHTML = "<div class='empty'>No MSDS files yet.</div>"; return; }
  const table = el("table");
  const head = ["Chemical / product","Site","File"].concat(IS_ADMIN ? ["Action"] : []);
  table.append(el("thead", {}, el("tr", {}, head.map(h => el("th", { textContent: h })))));
  const tb = el("tbody");
  rows.forEach(r => {
    const url = sb.storage.from("msds").getPublicUrl(r.file_path).data.publicUrl;
    const cells = [
      el("td", { textContent: r.title || "" }),
      el("td", { textContent: allSiteName(r.site_id) }),
      el("td", {}, el("a", { className: "btn ghost small", href: url, target: "_blank", textContent: "Download" }))
    ];
    if (IS_ADMIN) {
      cells.push(el("td", {}, el("button", { className: "btn ghost small", textContent: "Delete", onclick: async () => {
        if (!confirm("Delete this MSDS?")) return;
        await sb.storage.from("msds").remove([r.file_path]);
        await sb.from("msds").delete().eq("id", r.id);
        loadMSDSList(card, flt);
      }})));
    }
    tb.append(el("tr", {}, cells));
  });
  table.append(tb);
  tw.innerHTML = ""; tw.append(table);
}

/* ===================== DAILY CASH SALES (managers + admin) ===================== */
const money = v => (v === null || v === undefined || v === "") ? "" : "$" + Number(v).toFixed(2);
function cashDiffCash(r) { return (r.cash_on_hand != null && r.actual_cash_lightspeed != null) ? Number(r.cash_on_hand) - Number(r.actual_cash_lightspeed) : null; }
function cashDiffLS(r) { return (r.actual_cash_lightspeed != null) ? Number(r.actual_cash_lightspeed) - ((Number(r.manual_tyro) || 0) + (Number(r.tab_square) || 0) + (Number(r.bank_transfer) || 0)) : null; }
function cashStatus(r) { const d = cashDiffCash(r); if (d == null) return null; if (Math.abs(d) < 0.005) return "Balanced"; return d > 0 ? "Over" : "Short"; }
function cashStatusBadge(r) { const s = cashStatus(r); if (!s) return el("span", { textContent: "" }); const cls = s === "Balanced" ? "ok" : s === "Short" ? "bad" : "pending"; return el("span", { className: "badge " + cls, textContent: s }); }
function empSelect(initial) {
  const sel = el("select");
  sel.append(el("option", { value: "", textContent: "— name —" }));
  Array.from(new Set(EMPLOYEES.map(e => e.name))).sort((x, y) => x.localeCompare(y)).forEach(n => sel.append(el("option", { value: n, textContent: n })));
  if (initial) sel.value = initial;
  return sel;
}
const CASH_NUM = new Set(["cash_on_hand","actual_cash_lightspeed","manual_tyro","tab_square","bank_transfer","expenses","amount"]);

async function renderCashSales(view) {
  view.innerHTML = "";
  const isAdmin = IS_ADMIN;

  if (isAdmin) return renderCashAdmin(view);
  return renderCashManager(view);
}

/* ---------- Manager view: on-hand only ---------- */
async function renderCashManager(view) {
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Daily cash — enter today's cash on hand" }));
  const b = el("div", { className: "body" });
  const grid = el("div", { className: "formgrid" });
  const dateI = el("input", { type: "date" }); dateI.value = new Date().toLocaleDateString("en-CA"); dateI.disabled = true;
  const recordedBy = empSelect();
  const tillBy = empSelect();
  const cashI = el("input", { type: "number", step: "0.01" });
  grid.append(fieldWrap("Date", dateI), fieldWrap("Recorded by", recordedBy), fieldWrap("Till Closed By", tillBy), fieldWrap("Cash Sales (On Hand) ($)", cashI));
  b.append(grid);
  const msg = el("span", { className: "msg" });
  const save = el("button", { className: "btn", textContent: "Save entry" });
  b.append(el("div", { className: "actions" }, [save, msg]));
  card.append(b); view.append(card);

  save.onclick = async () => {
    if (!recordedBy.value) { msg.textContent = "Choose Recorded by."; msg.className = "msg err"; return; }
    if (!tillBy.value) { msg.textContent = "Choose Till Closed By."; msg.className = "msg err"; return; }
    if (cashI.value === "") { msg.textContent = "Enter the cash on hand."; msg.className = "msg err"; return; }
    save.disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
    const { error } = await sb.rpc("cash_manager_insert", { p_date: dateI.value, p_recorded_by: recordedBy.value || null, p_till: tillBy.value || null, p_cash: Number(cashI.value) });
    save.disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    msg.textContent = "Saved ✓"; msg.className = "msg ok"; cashI.value = "";
    loadCashManager(listCard);
  };

  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Daily cash" }));
  listCard.append(el("div", { className: "body" }, el("div", { className: "tablewrap" })));
  view.append(listCard);
  loadCashManager(listCard);
}

async function loadCashManager(card) {
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  const { data, error } = await sb.from("cash_sales").select("*").order("entry_date", { ascending: false }).limit(500);
  if (error) { tw.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  const rows = data || [];
  if (!rows.length) { tw.innerHTML = "<div class='empty'>No entries yet.</div>"; return; }
  const table = el("table");
  table.append(el("thead", {}, el("tr", {}, ["Date","Recorded by","Till Closed By","Cash (On Hand) ($)","Actual (Lightspeed) ($)","Difference cash ($)","Difference (Lightspeed) ($)","Status","Save"].map(h => el("th", { textContent: h })))));
  const tb = el("tbody");
  rows.forEach(r => {
    const inp = el("input", { type: "number", step: "0.01", value: r.cash_on_hand != null ? r.cash_on_hand : "", style: "width:110px" });
    const m = el("span", { className: "msg" });
    tb.append(el("tr", {}, [
      el("td", { textContent: r.entry_date || "" }),
      el("td", { textContent: r.closed_by || "" }),
      el("td", { textContent: r.till_closed_by || "" }),
      el("td", {}, inp),
      el("td", { textContent: money(r.actual_cash_lightspeed) }),
      el("td", { textContent: money(cashDiffCash(r)) }),
      el("td", { textContent: money(cashDiffLS(r)) }),
      el("td", {}, cashStatusBadge(r)),
      el("td", {}, el("button", { className: "btn ghost small", textContent: "Save", onclick: async () => {
        const { error } = await sb.rpc("cash_manager_set_onhand", { p_id: r.id, p_cash: inp.value === "" ? null : Number(inp.value) });
        m.textContent = error ? "!" : "✓"; m.className = "msg " + (error ? "err" : "ok");
        loadCashManager(card);
      }}), m)
    ]));
  });
  table.append(tb);
  tw.innerHTML = ""; tw.append(table);
}

/* ---------- Admin view: all columns ---------- */
const CASH_FIELDS = [
  { k: "entry_date", label: "Date", type: "date" },
  { k: "closed_by", label: "Recorded by", type: "employee" },
  { k: "till_closed_by", label: "Till Closed By", type: "employee" },
  { k: "remarks", label: "Remarks", type: "text" },
  { k: "cash_on_hand", label: "Cash Sales (On Hand) ($)", type: "number" },
  { k: "actual_cash_lightspeed", label: "Actual Cash (Lightspeed) ($)", type: "number" },
  { k: "manual_tyro", label: "Manual Tyro ($)", type: "number" },
  { k: "manual_tyro_reason", label: "Manual Tyro reason", type: "text" },
  { k: "tab_square", label: "Tab Square (if available) ($)", type: "number" },
  { k: "bank_transfer", label: "Bank Transfer ($)", type: "number" },
  { k: "expenses", label: "Expenses ($)", type: "number" },
  { k: "item", label: "Item", type: "text" },
  { k: "amount", label: "Amount ($)", type: "number" }
];

async function renderCashAdmin(view) {
  try { const { data } = await sb.rpc("all_sites"); ALL_SITES = data || []; } catch (e) { ALL_SITES = SITES.slice(); }
  let editingId = null;

  const card = el("div", { className: "card" });
  const h = el("h2", { textContent: "New cash entry" });
  card.append(h);
  const b = el("div", { className: "body" });
  const grid = el("div", { className: "formgrid" });
  const siteSel = el("select");
  siteSel.append(el("option", { value: "", textContent: "— site —" }));
  ALL_SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
  grid.append(fieldWrap("Site", siteSel));
  const inputs = {};
  CASH_FIELDS.forEach(f => {
    let input;
    if (f.type === "employee") input = empSelect();
    else { input = el("input", { type: f.type === "number" ? "number" : f.type }); if (f.type === "number") input.step = "0.01"; }
    if (f.k === "entry_date") input.value = new Date().toLocaleDateString("en-CA");
    inputs[f.k] = input; grid.append(fieldWrap(f.label, input));
  });
  b.append(grid);
  const msg = el("span", { className: "msg" });
  const save = el("button", { className: "btn", textContent: "Save entry" });
  const cancel = el("button", { className: "btn ghost", textContent: "Clear", onclick: () => resetForm() });
  b.append(el("div", { className: "actions" }, [save, cancel, msg]));
  card.append(b); view.append(card);

  function resetForm() {
    editingId = null; h.textContent = "New cash entry"; save.textContent = "Save entry";
    siteSel.value = ""; CASH_FIELDS.forEach(f => inputs[f.k].value = "");
    inputs.entry_date.value = new Date().toLocaleDateString("en-CA");
  }
  function loadIntoForm(r) {
    editingId = r.id; h.textContent = "Edit cash entry"; save.textContent = "Update entry";
    siteSel.value = r.site_id || "";
    CASH_FIELDS.forEach(f => inputs[f.k].value = r[f.k] != null ? r[f.k] : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  save.onclick = async () => {
    const site_id = Number(siteSel.value);
    if (!site_id || !inputs.entry_date.value) { msg.textContent = "Site and Date are required."; msg.className = "msg err"; return; }
    if (!inputs.closed_by.value) { msg.textContent = "Choose Recorded by."; msg.className = "msg err"; return; }
    if (!inputs.till_closed_by.value) { msg.textContent = "Choose Till Closed By."; msg.className = "msg err"; return; }
    const row = { site_id };
    CASH_FIELDS.forEach(f => { let v = inputs[f.k].value; if (v === "") v = null; else if (CASH_NUM.has(f.k)) v = Number(v); row[f.k] = v; });
    save.disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
    const res = editingId
      ? await sb.from("cash_sales").update(row).eq("id", editingId)
      : await sb.from("cash_sales").insert([row]);
    save.disabled = false;
    if (res.error) { msg.textContent = res.error.message; msg.className = "msg err"; return; }
    msg.textContent = "Saved ✓"; msg.className = "msg ok"; resetForm();
    loadCashAdmin(listCard, { site: fSite ? fSite.value : "" });
  };

  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Daily cash sales" }));
  const lb = el("div", { className: "body" });
  const filters = el("div", { className: "filters" });
  const fSite = el("select");
  fSite.append(el("option", { value: "", textContent: "All sites" }));
  ALL_SITES.forEach(s => fSite.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
  const fMonth = monthSelect(true);
  const fFrom = el("input", { type: "date" }), fTo = el("input", { type: "date" });
  filters.append(fieldWrap("Site", fSite), fieldWrap("Month", fMonth), fieldWrap("From", fFrom), fieldWrap("To", fTo),
    el("button", { className: "btn ghost", textContent: "Apply", onclick: () => loadCashAdmin(listCard, { site: fSite.value, month: fMonth.value, from: fFrom.value, to: fTo.value }) }),
    el("button", { className: "btn dark", textContent: "Download CSV", onclick: () => cashCSV() }));
  lb.append(filters);
  lb.append(el("div", { className: "tablewrap" }));
  listCard.append(lb); view.append(listCard);
  window._cashLoadInto = loadIntoForm;
  loadCashAdmin(listCard);
}

let CASH_ROWS = [];
let CASH_FLT = {};
async function loadCashAdmin(card, flt = {}) {
  CASH_FLT = flt;
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  let q = sb.from("cash_sales").select("*").order("entry_date", { ascending: false }).limit(2000);
  if (flt.site) q = q.eq("site_id", flt.site);
  if (flt.month) {
    const [yy, mm] = flt.month.split("-").map(Number);
    const next = mm === 12 ? (yy + 1) + "-01-01" : yy + "-" + String(mm + 1).padStart(2, "0") + "-01";
    q = q.gte("entry_date", flt.month + "-01").lt("entry_date", next);
  }
  if (flt.from) q = q.gte("entry_date", flt.from);
  if (flt.to) q = q.lte("entry_date", flt.to);
  const { data, error } = await q;
  if (error) { tw.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  CASH_ROWS = data || [];
  if (!CASH_ROWS.length) { tw.innerHTML = "<div class='empty'>No entries yet.</div>"; return; }
  const cols = ["Date","Site","Recorded by","Till Closed By","Remarks","Cash (On Hand) ($)","Actual (Lightspeed) ($)","Difference cash ($)","Difference (Lightspeed) ($)","Status","Manual Tyro ($)","Manual Tyro reason","Tab Square ($)","Bank Transfer ($)","Expenses ($)","Item","Amount ($)","Action"];
  const table = el("table");
  table.append(el("thead", {}, el("tr", {}, cols.map(c => el("th", { textContent: c })))));
  const tb = el("tbody");
  CASH_ROWS.forEach(r => {
    tb.append(el("tr", {}, [
      el("td", { textContent: r.entry_date || "" }),
      el("td", { textContent: allSiteName(r.site_id) }),
      el("td", { textContent: r.closed_by || "" }),
      el("td", { textContent: r.till_closed_by || "" }),
      el("td", { textContent: r.remarks || "" }),
      el("td", { textContent: money(r.cash_on_hand) }),
      el("td", { textContent: money(r.actual_cash_lightspeed) }),
      el("td", { textContent: money(cashDiffCash(r)) }),
      el("td", { textContent: money(cashDiffLS(r)) }),
      el("td", {}, cashStatusBadge(r)),
      el("td", { textContent: money(r.manual_tyro) }),
      el("td", { textContent: r.manual_tyro_reason || "" }),
      el("td", { textContent: money(r.tab_square) }),
      el("td", { textContent: money(r.bank_transfer) }),
      el("td", { textContent: money(r.expenses) }),
      el("td", { textContent: r.item || "" }),
      el("td", { textContent: money(r.amount) }),
      el("td", {}, el("div", { style: "display:flex;gap:6px" }, [
        el("button", { className: "btn ghost small", textContent: "Edit", onclick: () => window._cashLoadInto(r) }),
        el("button", { className: "btn ghost small", textContent: "Delete", onclick: async () => {
          if (!confirm("Delete this entry?")) return;
          await sb.from("cash_sales").delete().eq("id", r.id); loadCashAdmin(card, flt);
        }})
      ]))
    ]));
  });
  table.append(tb);
  tw.innerHTML = ""; tw.append(table);
}

function cashCSV() {
  if (!CASH_ROWS.length) return;
  const head = ["Date","Site","Recorded by","Till Closed By","Remarks","Cash (On Hand) ($)","Actual (Lightspeed) ($)","Difference cash ($)","Difference (Lightspeed) ($)","Status","Manual Tyro ($)","Manual Tyro reason","Tab Square ($)","Bank Transfer ($)","Expenses ($)","Item","Amount ($)"];
  const rows = CASH_ROWS.map(r => [
    r.entry_date || "", allSiteName(r.site_id), r.closed_by || "", r.till_closed_by || "", r.remarks || "",
    r.cash_on_hand ?? "", r.actual_cash_lightspeed ?? "", cashDiffCash(r) ?? "", cashDiffLS(r) ?? "", cashStatus(r) ?? "",
    r.manual_tyro ?? "", r.manual_tyro_reason || "", r.tab_square ?? "", r.bank_transfer ?? "", r.expenses ?? "", r.item || "", r.amount ?? ""
  ]);
  // monthly TOTAL row across the money columns
  const sum = k => CASH_ROWS.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const sumFn = fn => CASH_ROWS.reduce((a, r) => a + (Number(fn(r)) || 0), 0);
  rows.push(["TOTAL","","","","",
    sum("cash_on_hand").toFixed(2), sum("actual_cash_lightspeed").toFixed(2),
    sumFn(cashDiffCash).toFixed(2), sumFn(cashDiffLS).toFixed(2), "",
    sum("manual_tyro").toFixed(2), "", sum("tab_square").toFixed(2), sum("bank_transfer").toFixed(2),
    sum("expenses").toFixed(2), "", sum("amount").toFixed(2)]);
  const csv = [head, ...rows].map(a => a.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const sitePart = CASH_FLT.site ? allSiteName(Number(CASH_FLT.site)).replace(/[^a-zA-Z0-9]+/g, "-") : "all-sites";
  const monthPart = CASH_FLT.month || (CASH_FLT.from || "") || new Date().toISOString().slice(0,7);
  const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "cash_sales_" + sitePart + "_" + monthPart + ".csv" });
  document.body.append(a); a.click(); a.remove();
}

/* ===================== COMPLAINTS / SUGGESTIONS BOX ===================== */
async function openPrivateFile(bucket, path) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120);
  if (error || !data) { alert("Couldn't open the file: " + (error ? error.message : "unknown error")); return; }
  window.open(data.signedUrl, "_blank");
}

async function renderComplaints(view) {
  view.innerHTML = "";

  // submit form — everyone
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Complaints / Suggestions Box" }));
  const b = el("div", { className: "body" });
  b.append(el("div", { className: "sub", textContent: "Share a complaint or suggestion. You can leave your name as Anonymous. Submissions are confidential and seen only by Head Office." }));
  const grid = el("div", { className: "formgrid" });
  const dateI = el("input", { type: "date" }); dateI.value = new Date().toLocaleDateString("en-CA"); dateI.disabled = true;
  const nameI = el("input", { type: "text", placeholder: "Leave blank to stay anonymous" });
  const fileI = el("input", { type: "file", accept: "application/pdf,image/*", multiple: true });
  grid.append(fieldWrap("Date", dateI), fieldWrap("Name (optional)", nameI), fieldWrap("Attachment (optional)", fileI));
  b.append(grid);
  const msgField = el("textarea", { maxLength: 3000, style: "min-height:120px" });
  const counter = el("div", { className: "sub", style: "text-align:right", textContent: "0 / 3000" });
  msgField.addEventListener("input", () => counter.textContent = msgField.value.length + " / 3000");
  b.append(el("div", { className: "field" }, [el("label", { textContent: "Complaints / Suggestions" }), msgField, counter]));
  const msg = el("span", { className: "msg" });
  const save = el("button", { className: "btn", textContent: "Submit" });
  b.append(el("div", { className: "actions" }, [save, msg]));
  card.append(b); view.append(card);

  save.onclick = async () => {
    if (!msgField.value.trim()) { msg.textContent = "Please write your complaint or suggestion."; msg.className = "msg err"; return; }
    save.disabled = true; msg.textContent = "Submitting…"; msg.className = "msg";
    const attachments = [];
    const files = Array.from(fileI.files || []);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = Date.now() + "_" + i + "_" + f.name.replace(/[^a-zA-Z0-9._-]/g, "");
      const { error: upErr } = await sb.storage.from("complaints").upload(path, f);
      if (upErr) { save.disabled = false; msg.textContent = "Attachment: " + upErr.message; msg.className = "msg err"; return; }
      attachments.push({ path, name: f.name });
    }
    const { error } = await sb.from("complaints").insert([{
      site_id: MY_SITE ? MY_SITE.id : null,
      name: nameI.value.trim() || "Anonymous",
      message: msgField.value.trim(),
      attachments
    }]);
    save.disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    msg.textContent = "Submitted ✓ Thank you."; msg.className = "msg ok";
    nameI.value = ""; msgField.value = ""; fileI.value = ""; counter.textContent = "0 / 3000";
    if (IS_ADMIN) loadComplaints(listCard);
  };

  // list — ADMIN ONLY
  if (!IS_ADMIN) return;
  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Submissions" }));
  listCard.append(el("div", { className: "body" }, el("div", { className: "tablewrap" })));
  view.append(listCard);
  loadComplaints(listCard);
}

async function loadComplaints(card) {
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  const { data, error } = await sb.from("complaints").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) { tw.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  const rows = data || [];
  if (!rows.length) { tw.innerHTML = "<div class='empty'>No submissions yet.</div>"; return; }
  const table = el("table");
  table.append(el("thead", {}, el("tr", {}, ["Submitted","Name","Site","Complaint / Suggestion","Attachments","Action"].map(h => el("th", { textContent: h })))));
  const tb = el("tbody");
  rows.forEach(r => {
    const files = Array.isArray(r.attachments) ? r.attachments : [];
    const fbox = el("div", { style: "display:flex;flex-direction:column;gap:3px" });
    if (!files.length) fbox.append(el("span", { textContent: "—" }));
    files.forEach((f, i) => fbox.append(el("button", { className: "btn ghost small", textContent: "Download " + (f.name || ("file " + (i+1))), onclick: () => openPrivateFile("complaints", f.path) })));
    tb.append(el("tr", {}, [
      el("td", { textContent: r.created_at ? new Date(r.created_at).toLocaleString() : "" }),
      el("td", { textContent: r.name || "Anonymous" }),
      el("td", { textContent: r.site_id ? allSiteName(r.site_id) : "" }),
      el("td", { style: "white-space:normal;max-width:520px" }, r.message || ""),
      el("td", {}, fbox),
      el("td", {}, el("button", { className: "btn ghost small", textContent: "Delete", onclick: async () => {
        if (!confirm("Delete this submission?")) return;
        for (const f of files) { try { await sb.storage.from("complaints").remove([f.path]); } catch (e) {} }
        await sb.from("complaints").delete().eq("id", r.id);
        loadComplaints(card);
      }}))
    ]));
  });
  table.append(tb);
  tw.innerHTML = ""; tw.append(table);
}
