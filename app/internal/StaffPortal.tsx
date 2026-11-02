"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { Booking, Job, PortalData, StaffSession } from "../lib/staff-types";
import "./staff-portal.css";
import { PLAN_RATES, type ServiceFrequency } from "../lib/service-pricing";

type OwnerTab = "home" | "crew" | "schedule" | "customers" | "money";
type WorkerTab = "today" | "stats" | "requests";
type Tab = OwnerTab | WorkerTab;
const ownerTabs: [OwnerTab, string, string][] = [["home", "Home", "home"], ["crew", "Crew", "crew"], ["schedule", "Schedule", "calendar"], ["customers", "Customers", "people"], ["money", "Money", "money"]];
const workerTabs: [WorkerTab, string, string][] = [["today", "Today", "calendar"], ["stats", "Stats", "clock"], ["requests", "Requests", "message"]];
const jobLabels: Record<Job["status"], string> = { pending: "To do", in_progress: "In progress", submitted: "Awaiting review", completed: "Approved", absent: "Car not here" };
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Boise", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function money(value: number) { return value.toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function planValue(b: Booking) { return PLAN_RATES[b.subscription_tier === "Premium" ? "Premium" : "Basic"][b.subscription_frequency as ServiceFrequency] || 0; }
function fullName(b?: Booking) { return b ? `${b.first_name} ${b.last_name}` : "Customer unavailable"; }
function visitTime(b: Booking | undefined, date: string) { const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)); return b?.weekly_schedule?.[day] || b?.scrape_by_time || "Route"; }
function clock(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
    crew: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5" /></>,
    people: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v5m10-5v5M3 11h18m-13 4h2m4 0h2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    money: <><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M5 12h1m12 0h1" /></>,
    message: <path d="M21 15a3 3 0 0 1-3 3H9l-6 4V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
function Pill({ children, tone = "info" }: { children: ReactNode; tone?: string }) { return <span className={`sp-pill ${tone}`}>{children}</span>; }
function Tile({ value, label }: { value: ReactNode; label: string }) { return <div className="sp-tile"><strong>{value}</strong><span>{label}</span></div>; }
function Empty({ children }: { children: ReactNode }) { return <p className="sp-empty">{children}</p>; }
function Sheet({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog className="sp-sheet" ref={dialog} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="sp-sheet-inner"><div className="sp-row"><h2>{title}</h2><button className="sp-btn small" onClick={close} aria-label="Close details">Close</button></div>{children}</div></dialog>;
}

export default function StaffPortal({ session }: { session: StaffSession }) {
  const owner = session.role === "owner";
  const [view, setView] = useState<"owner" | "worker">(owner ? "owner" : "worker");
  const [tab, setTab] = useState<Tab>(owner ? "home" : "today");
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(today);
  const [worker, setWorker] = useState(session.workerId || "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Active");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [note, setNote] = useState("");
  const [review, setReview] = useState("");
  const [photoVersion, setPhotoVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/staff?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) { window.location.assign("/login"); return false; }
      if (!response.ok) throw Error(result.error || "Could not load the staff portal.");
      setData(result); setLoadError(""); return true;
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not connect. Please retry."); return false; }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    // Keep owner assignments and employee progress visible across devices.
    const timer = setInterval(() => { if (!document.hidden && !busy) void load(); }, 30000);
    const onVisible = () => { if (!document.hidden && !busy) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [load, busy]);
  useEffect(() => { if (!worker && owner && data?.workers[0]) setWorker(data.workers[0].id); }, [data, worker, owner]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(timer); }, [notice]);

  async function mutate(path: string, body: unknown, method = "POST") {
    if (busy) return false;
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (response.status === 401) { window.location.assign("/login"); return false; }
      if (!response.ok) throw Error(result.error || "Could not save. Please retry.");
      const refreshed = await load(); setNotice(refreshed ? "Saved" : "Saved. Refresh to see the latest changes."); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Please retry."); return false; }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { const r = await fetch("/api/auth/logout", { method: "POST" }); if (!r.ok) throw Error(); window.location.assign("/"); }
    catch { setError("Could not sign out. Please retry."); setBusy(false); }
  }
  function switchView(next: "owner" | "worker") { setView(next); setTab(next === "owner" ? "home" : "today"); setJobId(null); setCustomerId(null); }
  function openJob(j: Job) { setJobId(j.id); setNote(j.notes || ""); setReview(j.review_note || ""); }
  async function jobAction(j: Job, action: string, extra: Record<string, unknown> = {}) { return mutate("/api/staff/jobs", { id: j.id, action, ...extra }, "PATCH"); }
  async function upload(j: Job, side: "front" | "back", file?: File) {
    if (!file || busy) return;
    if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPG, PNG or WebP photo smaller than 5 MB."); return; }
    setBusy(true); setError("");
    const form = new FormData(); form.set("job_id", j.id); form.set("side", side); form.set("file", file);
    try {
      const response = await fetch("/api/staff/photos", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not upload photo.");
      setPhotoVersion(v => v + 1); const refreshed = await load(); setNotice(refreshed ? "Photo saved" : "Photo saved. Refresh to see the latest changes.");
    } catch (e) { setError(e instanceof Error ? e.message : "Photo upload failed."); }
    finally { setBusy(false); }
  }

  const bookings = data?.bookings || [];
  const jobs = data?.jobs || [];
  const workers = data?.workers || [];
  const requests = data?.requests || [];
  const workerJobs = jobs.filter(j => j.worker_id === worker);
  const dayJobs = (view === "owner" ? jobs : workerJobs).filter(j => j.service_date === date);
  const selectedCustomer = bookings.find(b => b.id === customerId);
  const selectedJob = jobs.find(j => j.id === jobId);
  const activeBookings = bookings.filter(b => b.status === "Active");
  const selectedWorker = workers.find(w => w.id === worker);
  const findBooking = (j: Job) => bookings.find(b => b.id === j.booking_id);
  const findWorker = (id: string | null) => workers.find(w => w.id === id)?.name || "Unassigned";
  const approved = (view === "owner" ? jobs : workerJobs).filter(j => j.status === "completed");
  const finishedToday = dayJobs.filter(j => j.status === "completed" || j.status === "submitted" || j.status === "absent").length;

  function jobRow(j: Job) {
    const b = findBooking(j);
    return <button key={j.id} className={`sp-job ${!j.worker_id ? "unassigned" : ""}`} onClick={() => openJob(j)}><span className="sp-job-time">{visitTime(b, j.service_date)}</span><span><strong>{fullName(b)}</strong><span className="sp-sub">{b?.apartment_complex || b?.street_address || "Location unavailable"}</span><span className="sp-sub">{view === "worker" && (b?.subscription_tier === "Basic" ? "Basic · Front and back windshield" : "Full · All six windows plus mirrors")}</span><span className="sp-sub">{view === "owner" ? findWorker(j.worker_id) : `${b?.car_color || ""} ${b?.car_make || ""} ${b?.car_model || ""}`}</span></span><Pill tone={j.status === "completed" ? "good" : j.status === "submitted" ? "warn" : "info"}>{jobLabels[j.status]}</Pill></button>;
  }
  function requestList(list = requests) {
    return list.length ? <div className="sp-list">{list.map(r => <article className="sp-card" key={r.id}><div className="sp-row"><strong>{owner && view === "owner" ? findWorker(r.worker_id) : r.kind === "supplies" ? "Supplies" : r.kind === "issue" ? "Route issue" : "Question"}</strong><Pill tone={r.resolved ? "good" : "warn"}>{r.resolved ? "Resolved" : "Open"}</Pill></div><p className="sp-wrap">{r.message}</p><p className="sp-sub">{new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Boise" })}</p>{owner && view === "owner" && <button disabled={busy} className="sp-btn small" onClick={() => void mutate("/api/staff/requests", { id: r.id, resolved: !r.resolved }, "PATCH")}>{r.resolved ? "Reopen" : "Mark resolved"}</button>}</article>)}</div> : <Empty>No requests yet.</Empty>;
  }
  function datePicker() { return <label className="sp-field">Service date <input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>; }

  return <div className="staff-portal">
    <header className="sp-header"><div><a className="sp-brand" href="/">Blake <b>Scrapes</b></a><span className="sp-sub">{session.name} · {owner ? "Owner" : "Employee"}</span></div><div className="sp-header-actions"><a href="/" className="sp-btn small">Website</a><button className="sp-btn small" disabled={busy} onClick={() => void load()}>Refresh</button><button className="sp-btn small" onClick={() => void logout()} disabled={busy}>Sign out</button></div></header>
    {owner && <div className="sp-viewbar"><div className="sp-seg" role="group" aria-label="Portal view"><button aria-pressed={view === "owner"} onClick={() => switchView("owner")}>Owner</button><button aria-pressed={view === "worker"} onClick={() => switchView("worker")}>Worker preview</button></div></div>}
    {view === "worker" && owner && <div className="sp-preview"><label className="sp-field">Preview employee <select value={worker} onChange={e => setWorker(e.target.value)}><option value="">Choose an employee</option>{workers.map(w => <option key={w.id} value={w.id}>{w.name}{w.active ? "" : " (inactive)"}</option>)}</select></label><p>Employee accounts only see their own assignments. This preview uses your owner access.</p></div>}
    <main className="sp-main">
      <div aria-live="polite">{(error || loadError) && <div role="alert" className="sp-error"><strong>Could not complete that request</strong><p>{error || loadError}</p><button className="sp-btn small" disabled={busy} onClick={() => { setError(""); setLoading(true); void load(); }}>Retry loading</button></div>}{notice && <p className="sp-notice">{notice}</p>}{loading && <p className="sp-sub">Loading staff workspace…</p>}</div>
      {!data && !loading && <section className="sp-card"><h1>Staff workspace</h1><p>Your account is signed in. Customer data and route tools will appear when the database connection is ready.</p><p className="sp-sub">New installations also need the staff portal database setup in <code>supabase/staff-portal.sql</code>.</p></section>}
      {data && <>
        {tab === "home" && <>
          <div><h1>Good morning, {session.name.split(" ")[0]}.</h1><p className="sp-sub">Your routes, customers and crew in one place.</p></div>
          <div className="sp-tiles"><Tile value={activeBookings.length} label="Active customers" /><Tile value={workers.filter(w => w.active).length} label="Active employees" /><Tile value={jobs.filter(j => j.service_date === today()).length} label="Jobs today" /><Tile value={jobs.filter(j => j.status === "submitted").length} label="Photos to review" /></div>
          <section className="sp-card"><div className="sp-row"><h2>Today’s progress</h2><span className="sp-sub">{jobs.filter(j => j.service_date === today() && ["completed", "submitted", "absent"].includes(j.status)).length} / {jobs.filter(j => j.service_date === today()).length}</span></div><progress max={Math.max(1, jobs.filter(j => j.service_date === today()).length)} value={jobs.filter(j => j.service_date === today() && ["completed", "submitted", "absent"].includes(j.status)).length} /><button className="sp-btn full" onClick={() => { setDate(today()); setTab("schedule"); }}>View today’s route</button></section>
          <section><h2>Needs attention</h2><div className="sp-list"><button className="sp-attention" onClick={() => setTab("schedule")}><span><strong>Review completed scraping</strong><span className="sp-sub">Approve front and back photos</span></span><Pill tone="warn">{jobs.filter(j => j.status === "submitted").length}</Pill></button><button className="sp-attention" onClick={() => { setFilter("Unpaid"); setTab("customers"); }}><span><strong>Unpaid customers</strong><span className="sp-sub">Review payment status</span></span><Pill tone="warn">{bookings.filter(b => b.payment_status === "Unpaid").length}</Pill></button><button className="sp-attention" onClick={() => setTab("crew")}><span><strong>Employee requests</strong><span className="sp-sub">Questions, supplies and route issues</span></span><Pill tone="info">{requests.filter(r => !r.resolved).length}</Pill></button></div></section>
        </>}
        {tab === "crew" && <>
          <div className="sp-row"><div><h1>Crew</h1><p className="sp-sub">Individual employee accounts and route assignments.</p></div><button className="sp-btn primary small" onClick={() => setShowCreate(true)}>Add employee</button></div>
          <div className="sp-list">{workers.length ? workers.map(w => <article className="sp-card" key={w.id}><div className="sp-row"><div><strong>{w.name}</strong><span className="sp-sub sp-wrap">{w.email}</span></div><Pill tone={w.active ? "good" : "mute"}>{w.active ? "Active" : "Inactive"}</Pill></div><p className="sp-sub">{jobs.filter(j => j.worker_id === w.id).length} assignments · {jobs.filter(j => j.worker_id === w.id && j.status === "completed").length} approved visits in loaded history</p><div className="sp-btns"><button className="sp-btn small" onClick={() => { setWorker(w.id); switchView("worker"); }}>View route</button><button className="sp-btn small" disabled={busy} onClick={() => void mutate("/api/staff/workers", { id: w.id, active: !w.active }, "PATCH")}>{w.active ? "Deactivate" : "Activate"}</button></div></article>) : <Empty>Add your first employee to assign routes. They’ll use their email and password at Staff Login.</Empty>}</div>
          <section><h2>Employee requests</h2>{requestList()}</section>
        </>}
        {tab === "schedule" && <>
          <div><h1>Schedule</h1><p className="sp-sub">Assign customers to employees and review their work.</p></div>{datePicker()}
          <details className="sp-details"><summary>Add a service visit</summary><form className="sp-form" onSubmit={async e => { e.preventDefault(); const values = new FormData(e.currentTarget); if (await mutate("/api/staff/jobs", { booking_id: Number(values.get("booking_id")), worker_id: values.get("worker_id") || null, service_date: date })) setNotice("Service visit scheduled"); }}><label className="sp-field">Customer<select name="booking_id" required><option value="">Choose a customer</option>{activeBookings.map(b => <option key={b.id} value={b.id}>{fullName(b)} · {b.apartment_complex || b.street_address}</option>)}</select></label><label className="sp-field">Employee<select name="worker_id"><option value="">Unassigned</option>{workers.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><p className="sp-sub">Scheduled for {date}. Recurring customer preferences are shown in their details; add each service date you want to assign.</p><button className="sp-btn primary" disabled={busy || !date}>Schedule visit</button></form></details>
          <div className="sp-row"><h2>Service visits</h2><Pill>{dayJobs.length} jobs</Pill></div><div className="sp-list">{dayJobs.length ? dayJobs.map(jobRow) : <Empty>No visits scheduled for this date.</Empty>}</div>
          {jobs.some(j => j.status === "submitted" && j.service_date !== date) && <section><h2>Other visits awaiting review</h2><div className="sp-list">{jobs.filter(j => j.status === "submitted" && j.service_date !== date).map(jobRow)}</div></section>}
        </>}
        {tab === "customers" && <>
          <div><h1>Customers</h1><p className="sp-sub">Live service requests from your website.</p></div><label className="sp-field">Search customers<input type="search" placeholder="Name, apartment, vehicle or plate" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="sp-chips">{["All", "Active", "Expired", "Unpaid"].map(f => <button className="sp-chip" key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>
          <div className="sp-list">{bookings.filter(b => (filter === "All" || (filter === "Unpaid" ? b.payment_status === "Unpaid" : b.status === filter)) && `${fullName(b)} ${b.apartment_complex || ""} ${b.car_make} ${b.car_model} ${b.license_plate}`.toLowerCase().includes(query.toLowerCase())).map(b => <button className="sp-customer" key={b.id} onClick={() => setCustomerId(b.id)}><span><strong>{fullName(b)}</strong><span className="sp-sub">{b.apartment_complex || b.street_address}</span><span className="sp-sub">{b.car_color} {b.car_make} {b.car_model}</span></span><span className="sp-list-end"><Pill tone={b.payment_status === "Paid" ? "good" : "warn"}>{b.payment_status}</Pill><span className="sp-sub">{b.status}</span></span></button>)}</div>
          {!bookings.length && <Empty>No customer requests yet. New website bookings will appear here.</Empty>}
        </>}
        {tab === "money" && <>
          <div><h1>Money</h1><p className="sp-sub">Plan values and recorded payment statuses.</p></div><div className="sp-tiles"><Tile value={money(activeBookings.reduce((n, b) => n + planValue(b), 0))} label="Estimated active plan value" /><Tile value={money(bookings.filter(b => b.payment_status === "Paid").reduce((n, b) => n + planValue(b), 0))} label="Estimated value marked paid" /><Tile value={bookings.filter(b => b.payment_status === "Unpaid").length} label="Bookings marked unpaid" /><Tile value={money(approved.length)} label="Calculated crew pay · $1 / approved visit" /></div><p className="sp-sub">Estimates use current advertised prices, including Basic ${PLAN_RATES.Basic.Semester} / Full ${PLAN_RATES.Premium.Semester} semester plans. Existing bookings may have different agreed prices, which are not recorded in this booking model. They are not a payment ledger or confirmed revenue. Crew pay is calculated from approved visits in the loaded history (30 days before through 90 days after the selected service date); no payout is sent.</p>
          <section><h2>Payments</h2><div className="sp-list">{bookings.map(b => <article className="sp-card" key={b.id}><div className="sp-row"><button className="sp-text-btn" onClick={() => setCustomerId(b.id)}>{fullName(b)}</button><strong>{money(planValue(b))}</strong></div><p className="sp-sub">{b.subscription_tier} · {b.subscription_frequency} · {b.payment_option || "No payment method"}</p><button className="sp-btn small" disabled={busy} onClick={() => void mutate("/api/bookings", { id: b.id, payment_status: b.payment_status === "Paid" ? "Unpaid" : "Paid" }, "PATCH")}>Mark {b.payment_status === "Paid" ? "unpaid" : "paid"}</button></article>)}</div></section>
        </>}
        {tab === "today" && <>
          <div><h1>{owner && selectedWorker ? `${selectedWorker.name}’s route` : "My route"}</h1><p className="sp-sub">Service dates use Rexburg, Idaho time.</p></div>{datePicker()}<div className="sp-tiles"><Tile value={dayJobs.length - finishedToday} label="Visits remaining" /><Tile value={finishedToday} label="Submitted or finished" /></div><div className="sp-list">{dayJobs.length ? dayJobs.map(jobRow) : <Empty>No assigned visits for this date. Your owner will assign customers to your route.</Empty>}</div><p className="sp-sub">Both front and back photos are required before submitting a visit. Your owner reviews the photos before the visit is approved.</p>
        </>}
        {tab === "stats" && <>
          <div><h1>My stats</h1><p className="sp-sub">Loaded history: 30 days before through 90 days after {date}.</p></div><div className="sp-tiles"><Tile value={workerJobs.length} label="Assigned visits" /><Tile value={workerJobs.filter(j => j.status === "submitted").length} label="Awaiting owner review" /><Tile value={approved.length} label="Approved visits" /><Tile value={money(approved.length)} label="Calculated earnings · $1 / approved visit" /></div><p className="sp-sub">Only owner-approved visits count toward these calculated earnings. This is not a payment or payroll record.</p><section><h2>Recent work</h2><div className="sp-list">{workerJobs.filter(j => ["submitted", "completed", "absent"].includes(j.status)).slice(0, 20).map(jobRow)}</div>{!workerJobs.length && <Empty>Your completed work will appear here.</Empty>}</section>
        </>}
        {tab === "requests" && <>
          <div><h1>Requests</h1><p className="sp-sub">Ask for supplies or send your owner a question.</p></div>{owner ? <p className="sp-card">Employees submit requests from their own accounts. You can review and resolve them in Crew.</p> : <form className="sp-card sp-form" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const values = new FormData(form); if (await mutate("/api/staff/requests", { kind: values.get("kind"), message: values.get("message") })) form.reset(); }}><label className="sp-field">Request type<select name="kind"><option value="supplies">Supplies</option><option value="question">Question / comment</option><option value="issue">Route issue</option></select></label><label className="sp-field">Message<textarea name="message" required minLength={1} maxLength={1000} placeholder="What do you need help with?" /></label><button className="sp-btn primary" disabled={busy}>Send to owner</button></form>}<section><h2>Request history</h2>{requestList(owner ? requests.filter(r => r.worker_id === worker) : requests)}</section>
        </>}
      </>}
    </main>
    <nav className="sp-nav" aria-label={view === "owner" ? "Owner navigation" : "Employee navigation"} style={{ gridTemplateColumns: `repeat(${view === "owner" ? 5 : 3},1fr)` }}>{(view === "owner" ? ownerTabs : workerTabs).map(([key, title, icon]) => <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}><Icon name={icon} />{title}</button>)}</nav>
    {showCreate && <Sheet title="Add employee" close={() => setShowCreate(false)}>{error && <p role="alert" className="sp-error">{error}</p>}<p className="sp-sub">Create a separate sign-in for each employee. They will only see their own assigned customers.</p><form className="sp-form" onSubmit={async e => { e.preventDefault(); const values = new FormData(e.currentTarget); if (await mutate("/api/staff/workers", { name: values.get("name"), email: values.get("email"), password: values.get("password") })) setShowCreate(false); }}><label className="sp-field">Name<input name="name" required maxLength={100} autoComplete="off" /></label><label className="sp-field">Email<input name="email" type="email" required autoComplete="off" /></label><label className="sp-field">Initial password<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><p className="sp-sub">Share these credentials privately with the employee. Passwords are not displayed in the crew list.</p><button disabled={busy} className="sp-btn primary">Create employee account</button></form></Sheet>}
    {selectedCustomer && <Sheet title="Customer details" close={() => setCustomerId(null)}>{error && <p role="alert" className="sp-error">{error}</p>}<h3>{fullName(selectedCustomer)}</h3><dl className="sp-kv"><dt>Apartment</dt><dd>{selectedCustomer.apartment_complex || "Other"}</dd><dt>Address</dt><dd>{selectedCustomer.street_address}</dd><dt>Phone</dt><dd><a href={`tel:${selectedCustomer.phone.replace(/[^+\d]/g, "")}`}>{selectedCustomer.phone}</a></dd><dt>Vehicle</dt><dd>{selectedCustomer.car_color} {selectedCustomer.car_make} {selectedCustomer.car_model}</dd><dt>License plate</dt><dd>{selectedCustomer.license_plate} {selectedCustomer.license_state}</dd><dt>Plan</dt><dd>{selectedCustomer.subscription_tier} · {selectedCustomer.subscription_frequency}</dd><dt>Payment</dt><dd>{selectedCustomer.payment_option || "Not selected"} · {selectedCustomer.payment_status}</dd><dt>Schedule</dt><dd>{Object.entries(selectedCustomer.weekly_schedule || {}).filter(([, time]) => time).map(([day, time]) => <div key={day}>{day}: {time}</div>)}{!Object.keys(selectedCustomer.weekly_schedule || {}).length && `${selectedCustomer.service_day || ""} ${selectedCustomer.scrape_by_time || ""}`}</dd></dl>{selectedCustomer.notes && <p className="sp-owner-note">{selectedCustomer.notes}</p>}<button className="sp-btn primary" disabled={busy} onClick={() => void mutate("/api/bookings", { id: selectedCustomer.id, payment_status: selectedCustomer.payment_status === "Paid" ? "Unpaid" : "Paid" }, "PATCH")}>Mark {selectedCustomer.payment_status === "Paid" ? "unpaid" : "paid"}</button></Sheet>}
    {selectedJob && <Sheet title="Service visit" close={() => setJobId(null)}>{(() => {
      const b = findBooking(selectedJob);
      const canWork = !owner;
      const writable = ["pending", "in_progress"].includes(selectedJob.status);
      const timerStart = selectedJob.started_at ? Date.parse(selectedJob.started_at) : null;
      return <>{error && <p role="alert" className="sp-error">{error}</p>}<div className="sp-row"><h3>{fullName(b)}</h3><Pill tone={selectedJob.status === "completed" ? "good" : "info"}>{jobLabels[selectedJob.status]}</Pill></div><p className="sp-sub">{selectedJob.service_date} · {findWorker(selectedJob.worker_id)}</p><p className="sp-coverage"><strong>{b?.subscription_tier === "Basic" ? "Basic" : "Full"} coverage:</strong> {b?.subscription_tier === "Basic" ? "Front and back windshield" : "All six windows plus mirrors"}</p><div className="sp-card"><p><strong>{b?.apartment_complex || "Customer location"}</strong><br />{b?.street_address}</p><p>{b?.car_color} {b?.car_make} {b?.car_model}<br /><span className="sp-plate">{b?.license_plate} {b?.license_state}</span></p>{b?.phone && <a className="sp-btn small" href={`tel:${b.phone.replace(/[^+\d]/g, "")}`}>Call customer</a>}{b?.notes && <p className="sp-owner-note">{b.notes}</p>}</div>
        {selectedJob.review_note && <p className="sp-owner-note">Owner note: {selectedJob.review_note}</p>}
        {selectedJob.started_at && <div className="sp-timer">{clock((selectedJob.completed_at ? Date.parse(selectedJob.completed_at) : now) - (timerStart || now))}<span>Scraping time</span></div>}
        {owner && view === "owner" && <label className="sp-field">Assigned employee<select disabled={busy || !["pending"].includes(selectedJob.status)} value={selectedJob.worker_id || ""} onChange={e => void jobAction(selectedJob, "assign", { worker_id: e.target.value || null })}><option value="">Unassigned</option>{workers.filter(w => w.active || w.id === selectedJob.worker_id).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><span className="sp-sub">Assignments can be changed before work starts.</span></label>}
        <div className="sp-photo-grid">{(["front", "back"] as const).map(side => {
          const path = side === "front" ? selectedJob.front_photo_path : selectedJob.back_photo_path;
          return <div key={side}><strong>{side === "front" ? "Front photo" : "Back photo"}</strong>{path ? <a href={`/api/staff/photos?job_id=${selectedJob.id}&side=${side}`} target="_blank" rel="noreferrer"><img src={`/api/staff/photos?job_id=${selectedJob.id}&side=${side}&v=${photoVersion}-${encodeURIComponent(selectedJob.updated_at)}`} alt={`${side} of the customer’s vehicle`} /></a> : <div className="sp-photo-empty">No photo yet</div>}{canWork && writable && <label className="sp-upload">{path ? "Retake photo" : "Add photo"}<input aria-label={`Upload ${side} photo`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e => { void upload(selectedJob, side, e.target.files?.[0]); e.target.value = ""; }} /></label>}</div>;
        })}</div>
        {canWork && writable && <><label className="sp-field">Visit notes<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Parking changes or anything your owner should know" /></label><div className="sp-btns">{selectedJob.status === "pending" && <button disabled={busy} className="sp-btn primary" onClick={() => void jobAction(selectedJob, "start", { notes: note })}>Start scraping</button>}{selectedJob.status === "in_progress" && <button disabled={busy || !selectedJob.front_photo_path || !selectedJob.back_photo_path} className="sp-btn primary" onClick={() => void jobAction(selectedJob, "submit", { notes: note })}>Submit for review</button>}<button disabled={busy} className="sp-btn" onClick={() => void jobAction(selectedJob, "absent", { notes: note })}>Car not here</button></div><p className="sp-sub">Both photos are required to submit. Missing cars do not count as approved work.</p></>}
        {owner && view === "owner" && selectedJob.status === "submitted" && <><label className="sp-field">Review note<textarea value={review} onChange={e => setReview(e.target.value)} maxLength={1000} placeholder="Explain what needs to be redone" /></label><div className="sp-btns"><button disabled={busy || !selectedJob.front_photo_path || !selectedJob.back_photo_path} className="sp-btn primary" onClick={() => void jobAction(selectedJob, "approve")}>Approve photos</button><button disabled={busy || !review.trim()} className="sp-btn" onClick={() => void jobAction(selectedJob, "redo", { review_note: review })}>Request redo</button></div></>}
        {selectedJob.notes && !writable && <p className="sp-wrap">Visit notes: {selectedJob.notes}</p>}{owner && view === "worker" && <p className="sp-sub">Work actions are available to this employee when they sign in to their own account.</p>}
      </>;
    })()}</Sheet>}
  </div>;
}
