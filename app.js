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
function procDef(label, category) {
  return {
    label, table: "process_logs", fixed: { category },
    fields: [
      { key: "entry_date", label: "Date", type: "date", req: true },
      { key: "entry_time", label: "Time", type: "time" },
      { key: "site_id", label: "Site", type: "site", req: true },
      { key: "food_item", label: "Food item", type: "text" },
      { key: "process", label: "Process", ...SEL("Cook","Reheat","Hot Holding","Cooling") },
      { key: "process_time", label: "Time", type: "text" },
      { key: "temp", label: "Temp °C", type: "number" },
      { key: "recorded_by", label: "Recorded by", type: "text" },
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
    label: "Delivery", table: "deliveries",
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
    label: "Fridge / Freezer", table: "fridge_freezer",
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
  process_mep:     procDef("Process — MEP", "MEP"),
  process_risky:   procDef("Process — Risky", "Risky"),
  process_freezer: procDef("Process — Freezer", "Freezer"),
  food_waste: {
    label: "Food Waste", table: "food_waste", totals: ["quantity","cost"],
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
const NUMERIC = new Set(["temp","weight","quantity","cost","cook_temp","reheat_temp","hot_holding_temp","site_id"]);

/* ===================== AUTH ===================== */
let SITES = [];
let MY_SITE = null;
let MULTI = false;       // more than one site visible
let IS_ADMIN = false;    // all-site admin login
let IS_MANAGER = false;  // leave-only manager login
let MGR_SITE = null;     // a manager's own site (they can only decide/delete this one)
let ALL_SITES = [];      // full site list for the leave picker (via all_sites RPC)
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

  // Managers see the same tabs as a normal employee (plus leave-management
  // powers inside the Leave tab); only admins get the admin-only Catalogue tab.
  const navDefs = Object.entries(LOGS).filter(([id]) => id !== "sites").map(([id, def]) => ({ id, label: def.label }));
  navDefs.push({ id: "order", label: "Order" });
  if (IS_ADMIN) navDefs.push({ id: "catalogue", label: "Catalogue" });
  navDefs.push({ id: "leave", label: "Leave" });
  navDefs.push({ id: "pestcon", label: "Pest Control" });
  if (!navDefs.some(d => d.id === CURRENT)) CURRENT = navDefs[0].id;

  nav.innerHTML = "";
  navDefs.forEach(d => {
    nav.append(el("button", {
      textContent: d.label,
      className: d.id === CURRENT ? "active" : "",
      onclick: (e) => { CURRENT = d.id; [...nav.children].forEach(b => b.classList.remove("active")); e.currentTarget.classList.add("active"); openTab(d.id); }
    }));
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
      f.options.forEach(o => input.append(el("option", { value: o, textContent: o })));
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
  (def.extraCols || []).forEach(k => cols.splice(7, 0, { key: k, label: "Within range" }));
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
  { label: "Company 1 — Flappy's Fried Chicken", url: "REPLACE_WITH_LINK" },
  { label: "Company 2 — Burger Point",           url: "REPLACE_WITH_LINK" },
  { label: "Company 3 — Sir Manong",             url: "REPLACE_WITH_LINK" },
  { label: "Company 4 — Masa",                   url: "REPLACE_WITH_LINK" }
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
  const nameI = el("input", { type: "text" });
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
  ib.append(el("p", { style: "margin:0;font-size:14px;line-height:1.5;color:#333", textContent: "Monthly pest-control records for each site. Choose a site to view and download its reports. Head office uploads the reports here each month as proof of regular pest control." }));
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
