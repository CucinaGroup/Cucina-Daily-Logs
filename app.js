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
  const nav = $("#tabs");
  if (!SITES.length && !IS_ADMIN) {
    nav.innerHTML = "";
    $("#view").innerHTML = "<div class='card'><div class='body'>This login isn't linked to a site yet. Ask your manager to assign it in Supabase (site_logins) before entering data.</div></div>";
    return;
  }
  MY_SITE = SITES[0] || null;
  MULTI = SITES.length > 1;
  const tag = el("span", { textContent: IS_ADMIN ? "All sites (admin)" : (MY_SITE ? "Site: " + MY_SITE.name : "") });
  tag.style.fontWeight = "bold"; tag.style.color = "var(--bar-text)";
  $("#who").prepend(tag);

  const navDefs = Object.entries(LOGS).filter(([id]) => id !== "sites").map(([id, def]) => ({ id, label: def.label }));
  navDefs.push({ id: "order", label: "Order" });
  if (IS_ADMIN) navDefs.push({ id: "catalogue", label: "Catalogue" });
  navDefs.push({ id: "refresher", label: "Refresher" });
  if (IS_ADMIN) navDefs.push({ id: "questions", label: "Questions" });

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
  if (id === "refresher") return renderRefresher(view);
  if (id === "questions") return renderQuestions(view);
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


/* ===================== REFRESHER QUIZ ===================== */
const PASS_PCT = 80;   // pass mark

async function loadQuestions(activeOnly) {
  let q = sb.from("refresher_questions").select("*").order("id");
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return data || [];
}

/* ---- Questions bank (admin) ---- */
async function renderQuestions(view) {
  view.innerHTML = "";
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Add refresher question" }));
  const b = el("div", { className: "body" });
  const grid = el("div", { className: "formgrid" });
  const qI = el("textarea");
  const aI = el("input", { type: "text" });
  const bI = el("input", { type: "text" });
  const cI = el("input", { type: "text" });
  const dI = el("input", { type: "text" });
  const correct = el("select");
  ["A","B","C","D"].forEach(o => correct.append(el("option", { value: o, textContent: o })));
  grid.append(
    fieldWrap("Question", qI),
    fieldWrap("Option A", aI),
    fieldWrap("Option B", bI),
    fieldWrap("Option C", cI),
    fieldWrap("Option D", dI),
    fieldWrap("Correct answer", correct)
  );
  b.append(grid);
  const msg = el("span", { className: "msg" });
  const save = el("button", { className: "btn", textContent: "Add question" });
  b.append(el("div", { className: "actions" }, [save, msg]));
  card.append(b); view.append(card);

  const listCard = el("div", { className: "card" });
  listCard.append(el("h2", { textContent: "Question bank" }));
  listCard.append(el("div", { className: "body" }));
  view.append(listCard);
  loadQuestionList(listCard);

  save.onclick = async () => {
    const question = qI.value.trim();
    if (!question || !aI.value.trim() || !bI.value.trim()) { msg.textContent = "Question and at least options A and B are required."; msg.className = "msg err"; return; }
    save.disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
    const { error } = await sb.from("refresher_questions").insert([{
      question, option_a: aI.value || null, option_b: bI.value || null,
      option_c: cI.value || null, option_d: dI.value || null, correct: correct.value
    }]);
    save.disabled = false;
    if (error) { msg.textContent = error.message; msg.className = "msg err"; return; }
    msg.textContent = "Added ✓"; msg.className = "msg ok";
    qI.value = ""; aI.value = ""; bI.value = ""; cI.value = ""; dI.value = "";
    loadQuestionList(listCard);
  };
}

async function loadQuestionList(card) {
  const body = card.querySelector(".body");
  body.innerHTML = "<div class='empty'>Loading…</div>";
  const qs = await loadQuestions(false);
  if (!qs.length) { body.innerHTML = "<div class='empty'>No questions yet — add some above.</div>"; return; }
  body.innerHTML = "";
  qs.forEach((q, i) => {
    const row = el("div", { className: "card", style: "margin-bottom:10px" });
    const rb = el("div", { className: "body" });
    rb.append(el("p", { style: "font-weight:bold;margin:0 0 6px", textContent: (i+1) + ". " + q.question + (q.active ? "" : "  (inactive)") }));
    ["a","b","c","d"].forEach(L => {
      const txt = q["option_" + L];
      if (txt) {
        const isC = q.correct === L.toUpperCase();
        rb.append(el("p", { style: "margin:2px 0;font-size:13px;color:" + (isC ? "#1f9d55" : "#555"), textContent: L.toUpperCase() + ". " + txt + (isC ? "  ✓ correct" : "") }));
      }
    });
    rb.append(el("div", { className: "actions" }, [
      el("button", { className: "btn ghost small", textContent: q.active ? "Deactivate" : "Reactivate", onclick: async () => {
        await sb.from("refresher_questions").update({ active: !q.active }).eq("id", q.id); loadQuestionList(card);
      }}),
      el("button", { className: "btn ghost small", textContent: "Delete", onclick: async () => {
        if (!confirm("Delete this question?")) return;
        await sb.from("refresher_questions").delete().eq("id", q.id); loadQuestionList(card);
      }})
    ]));
    row.append(rb); body.append(row);
  });
}

/* ---- Take the refresher (everyone) ---- */
async function renderRefresher(view) {
  view.innerHTML = "";
  const card = el("div", { className: "card" });
  card.append(el("h2", { textContent: "Monthly refresher assessment" }));
  const b = el("div", { className: "body" });

  const top = el("div", { className: "formgrid" });
  let orderSite = (!IS_ADMIN && MY_SITE) ? MY_SITE.id : null;
  let siteSel = null;
  if (IS_ADMIN) {
    siteSel = el("select");
    siteSel.append(el("option", { value: "", textContent: "— site —" }));
    SITES.forEach(s => siteSel.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
    siteSel.onchange = () => { orderSite = siteSel.value ? Number(siteSel.value) : null; };
    top.append(fieldWrap("Site", siteSel));
  }
  const nameI = el("input", { type: "text" });
  const monthI = el("input", { type: "month" }); monthI.value = new Date().toISOString().slice(0,7);
  top.append(fieldWrap("Your name", nameI), fieldWrap("Month", monthI));
  b.append(top);
  b.append(el("div", { className: "sub", textContent: "Answer every question, then submit. Pass mark is " + PASS_PCT + "%." }));

  const qWrap = el("div"); b.append(qWrap);
  const answers = {};
  const qs = await loadQuestions(true);
  if (!qs.length) {
    qWrap.innerHTML = "<div class='empty'>No questions have been set up yet. Ask head office to add them in the Questions tab.</div>";
  } else {
    qs.forEach((q, i) => {
      const block = el("div", { style: "padding:12px 0;border-bottom:1px solid #eee" });
      block.append(el("p", { style: "font-weight:bold;margin:0 0 8px", textContent: (i+1) + ". " + q.question }));
      ["a","b","c","d"].forEach(L => {
        const txt = q["option_" + L];
        if (!txt) return;
        const opt = el("label", { style: "display:flex;gap:10px;align-items:center;padding:5px 0;font-size:14px;cursor:pointer" });
        const radio = el("input", { type: "radio", name: "q" + q.id, value: L.toUpperCase() });
        radio.onchange = () => { answers[q.id] = L.toUpperCase(); };
        opt.append(radio, el("span", { textContent: L.toUpperCase() + ". " + txt }));
        block.append(opt);
      });
      qWrap.append(block);
    });
  }

  const resultBar = el("div", { className: "order-total" });
  const resultTxt = el("span", { textContent: "Not submitted" });
  const submit = el("button", { className: "btn", textContent: "Submit answers" });
  const msg = el("span", { className: "msg" });
  resultBar.append(resultTxt, el("div", { style: "flex:1" }), submit, msg);
  if (qs.length) b.append(resultBar);
  card.append(b); view.append(card);

  submit.onclick = async () => {
    if (!orderSite) { msg.textContent = "Choose a site first."; msg.className = "msg err"; return; }
    if (!nameI.value.trim()) { msg.textContent = "Enter your name."; msg.className = "msg err"; return; }
    if (Object.keys(answers).length < qs.length) { msg.textContent = "Please answer all questions."; msg.className = "msg err"; return; }
    let correct = 0;
    qs.forEach(q => { if (answers[q.id] === q.correct) correct++; });
    const total = qs.length;
    const pct = Math.round((correct / total) * 100);
    const passed = pct >= PASS_PCT;
    resultTxt.textContent = "Score: " + correct + " / " + total + "  (" + pct + "%) — " + (passed ? "PASS" : "FAIL");
    resultBar.style.background = passed ? "#1f9d55" : "#e02424";
    resultBar.style.color = "#fff";
    submit.disabled = true; msg.textContent = "Saving…"; msg.className = "msg";
    const { error } = await sb.from("refresher_results").insert([{
      site_id: orderSite, staff_name: nameI.value.trim(), period_month: monthI.value + "-01",
      score: correct, total, percent: pct, passed
    }]);
    if (error) { submit.disabled = false; msg.textContent = error.message; msg.className = "msg err"; return; }
    msg.textContent = "Recorded ✓"; msg.className = "msg ok";
    loadRefresherResults(histCard, { site: IS_ADMIN && siteSel ? siteSel.value : "" });
  };

  // results history
  const histCard = el("div", { className: "card" });
  histCard.append(el("h2", { textContent: "Results" }));
  const hb = el("div", { className: "body" });
  const filters = el("div", { className: "filters" });
  let fSite = null;
  if (IS_ADMIN) {
    fSite = el("select");
    fSite.append(el("option", { value: "", textContent: "All sites" }));
    SITES.forEach(s => fSite.append(el("option", { value: s.id, textContent: `${s.code} · ${s.name}` })));
    filters.append(fieldWrap("Site", fSite));
  }
  const fMonth = el("input", { type: "month" });
  filters.append(fieldWrap("Month", fMonth),
    el("button", { className: "btn ghost", textContent: "Apply", onclick: () => loadRefresherResults(histCard, { site: fSite ? fSite.value : "", month: fMonth.value }) }),
    el("button", { className: "btn dark", textContent: "Export CSV", onclick: () => refresherCSV() }));
  hb.append(filters);
  hb.append(el("div", { className: "tablewrap" }));
  histCard.append(hb); view.append(histCard);
  loadRefresherResults(histCard);
}

let REFRESHER_ROWS = [];
async function loadRefresherResults(card, flt = {}) {
  const tw = card.querySelector(".tablewrap");
  tw.innerHTML = "<div class='empty'>Loading…</div>";
  let q = sb.from("refresher_results").select("*").order("period_month", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (flt.site) q = q.eq("site_id", flt.site);
  if (flt.month) q = q.eq("period_month", flt.month + "-01");
  const { data, error } = await q;
  if (error) { tw.innerHTML = `<div class='empty'>${error.message}</div>`; return; }
  REFRESHER_ROWS = data || [];
  if (!REFRESHER_ROWS.length) { tw.innerHTML = "<div class='empty'>No results yet.</div>"; return; }
  const table = el("table");
  const head = ["Month","Name"].concat(IS_ADMIN ? ["Site"] : []).concat(["Score","Result"]);
  table.append(el("thead", {}, el("tr", {}, head.map(h => el("th", { textContent: h })))));
  const tb = el("tbody");
  REFRESHER_ROWS.forEach(r => {
    const cells = [el("td", { textContent: r.period_month ? r.period_month.slice(0,7) : "" }), el("td", { textContent: r.staff_name || "" })];
    if (IS_ADMIN) cells.push(el("td", { textContent: siteName(r.site_id) }));
    cells.push(el("td", { textContent: r.score + " / " + r.total + " (" + r.percent + "%)" }));
    cells.push(el("td", {}, el("span", { className: "badge " + (r.passed ? "ok" : "bad"), textContent: r.passed ? "PASS" : "FAIL" })));
    tb.append(el("tr", {}, cells));
  });
  table.append(tb);
  tw.innerHTML = ""; tw.append(table);
}

function refresherCSV() {
  if (!REFRESHER_ROWS.length) return;
  const head = ["Month","Name","Site","Score","Total","Percent","Result"];
  const rows = REFRESHER_ROWS.map(r => [
    r.period_month ? r.period_month.slice(0,7) : "", r.staff_name || "", siteName(r.site_id),
    r.score, r.total, r.percent, r.passed ? "PASS" : "FAIL"
  ]);
  const csv = [head, ...rows].map(a => a.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "refresher_" + new Date().toISOString().slice(0,10) + ".csv" });
  document.body.append(a); a.click(); a.remove();
}
