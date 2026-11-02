/**
 * Isolated HTTP integration test. Uses synthetic accounts and an in-memory
 * Supabase-compatible fixture; it never reads or writes a real Supabase project.
 * Run with: node tests/staff-portal.integration.mjs
 * Stop any other Next server using this checkout first (.next is shared).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPort = Number(process.env.STAFF_TEST_APP_PORT || 3105);
const fixturePort = Number(process.env.STAFF_TEST_FIXTURE_PORT || 4105);
const base = `http://127.0.0.1:${appPort}`;
const fixtureBase = `http://127.0.0.1:${fixturePort}`;
const ownerCredentials = { role: 'owner', username: 'Fixture Owner', password: 'fixture-owner-password' };
const timestamp = new Date().toISOString();
let date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Boise' }).format(new Date());
while ([0, 6].includes(new Date(date).getUTCDay())) date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
const tables = {
  bookings: [1, 2].map(id => ({
    id, first_name: id === 1 ? 'Assigned' : 'Private', last_name: 'Fixture Customer',
    apartment_complex: `Fixture Apartments ${id}`, street_address: `${id} Fixture Street, Rexburg, 83440`,
    phone: '(208) 555-0100', car_make: 'Fixture', car_model: 'Car', car_color: 'Blue',
    license_plate: `FIXTURE${id}`, license_state: 'ID', subscription_tier: 'Basic', subscription_frequency: 'Weekly',
    status: 'Active', payment_option: 'Cash', payment_status: 'Unpaid', service_day: 'Monday', scrape_by_time: '06:00 AM',
    weekly_schedule: { Monday: '06:00 AM' }, created_at: timestamp, notes: 'Fixture customer notes',
  })),
  staff_members: [], service_jobs: [], staff_requests: [],
};
const users = new Map();
const objects = new Map();
let fixtureCalls = 0;
let nextOutput = '';
let nextProcess;
let passed = 0;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (nextProcess?.pid) { try { process.kill(-nextProcess.pid, 'SIGTERM'); } catch {} } server.closeAllConnections(); server.close(); process.exit(0); });

function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...extra });
  res.end(JSON.stringify(body));
}
function match(row, key, filter) {
  const dot = filter.indexOf('.');
  const op = filter.slice(0, dot), value = filter.slice(dot + 1);
  if (op === 'eq') return String(row[key]) === value;
  if (op === 'neq') return String(row[key]) !== value;
  if (op === 'gte') return String(row[key]) >= value;
  if (op === 'lte') return String(row[key]) <= value;
  if (op === 'gt') return String(row[key]) > value;
  if (op === 'lt') return String(row[key]) < value;
  if (op === 'is') return value === 'null' ? row[key] == null : String(row[key]) === value;
  if (op === 'in') return value.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')).includes(String(row[key]));
  throw new Error(`Fixture does not support filter ${key}: ${op}`);
}
function filtered(rows, params) {
  const controls = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);
  return rows.filter(row => [...params].every(([key, filter]) => controls.has(key) || match(row, key, filter)));
}
function projection(row, select) {
  if (!select || select === '*') return { ...row };
  return Object.fromEntries(select.split(',').filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
}
function jwt(id) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return `${header}.${payload}.fixture-signature`;
}
async function fixture(req, res) {
  fixtureCalls++;
  const url = new URL(req.url, fixtureBase);
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const body = req.headers['content-type']?.includes('application/json') && raw.length ? JSON.parse(raw.toString()) : null;
  if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
    if ([...users.values()].some(user => user.email === body.email)) return send(res, 422, { msg: 'User already exists', code: 'email_exists' });
    const user = { id: randomUUID(), email: body.email, password: body.password, aud: 'authenticated', role: 'authenticated', email_confirmed_at: timestamp, created_at: timestamp, app_metadata: {}, user_metadata: {} };
    users.set(user.id, user); const { password, ...publicUser } = user;
    return send(res, 200, publicUser);
  }
  if (url.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') {
    users.delete(url.pathname.split('/').at(-1)); return send(res, 200, {});
  }
  if (url.pathname === '/auth/v1/token') {
    const user = [...users.values()].find(user => user.email === body.email && user.password === body.password);
    if (!user) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials' });
    const { password, ...publicUser } = user;
    return send(res, 200, { access_token: jwt(user.id), refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: publicUser });
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.slice('/rest/v1/'.length);
    if (!tables[table]) return send(res, 404, { code: 'PGRST205', message: `Missing table ${table}` });
    let rows = filtered(tables[table], url.searchParams);
    if (req.method === 'POST') {
      const inserted = (Array.isArray(body) ? body : [body]).map(item => ({ id: item.id || randomUUID(), created_at: timestamp, updated_at: timestamp, ...item }));
      if (table === 'service_jobs') {
        for (const item of inserted) {
          if (tables[table].some(old => old.booking_id === item.booking_id && old.service_date === item.service_date)) return send(res, 409, { code: '23505', message: 'Duplicate fixture job' });
          Object.assign(item, { status: item.status || 'pending', started_at: item.started_at || null, completed_at: item.completed_at || null, front_photo_path: item.front_photo_path || null, back_photo_path: item.back_photo_path || null, review_note: item.review_note || null, notes: item.notes || null });
        }
      }
      if (table === 'staff_members') inserted.forEach(item => { item.active ??= true; });
      if (table === 'staff_requests') inserted.forEach(item => { item.resolved ??= false; });
      tables[table].push(...inserted); rows = inserted;
    } else if (req.method === 'PATCH') {
      rows.forEach(item => Object.assign(item, body, { updated_at: new Date().toISOString() }));
    } else if (req.method === 'DELETE') {
      tables[table] = tables[table].filter(item => !rows.includes(item));
    } else if (req.method !== 'GET') throw new Error(`Unsupported fixture REST method ${req.method}`);
    if (url.searchParams.has('order')) {
      const [key, direction] = url.searchParams.get('order').split('.');
      rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (direction === 'desc' ? -1 : 1));
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Math.min(Number(url.searchParams.get('limit') || 1000), 1000);
    rows = rows.slice(offset, offset + limit);
    const output = rows.map(row => projection(row, url.searchParams.get('select')));
    if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
      if (output.length !== 1) return send(res, 406, { code: 'PGRST116', details: `The result contains ${output.length} rows`, message: 'Cannot coerce result to a single JSON object' });
      return send(res, 200, output[0]);
    }
    return send(res, 200, output);
  }
  if (url.pathname.startsWith('/storage/v1/object/sign/')) {
    const key = url.pathname.slice('/storage/v1/object/sign/'.length);
    if (!objects.has(key)) return send(res, 404, { message: 'Object not found' });
    if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(objects.get(key)); }
    return send(res, 200, { signedURL: `/object/sign/${key}?token=fixture-token` });
  }
  if (url.pathname.startsWith('/storage/v1/object/')) {
    const key = url.pathname.slice('/storage/v1/object/'.length);
    if (req.method === 'POST' || req.method === 'PUT') { objects.set(key, raw); return send(res, 200, { Key: key, Id: randomUUID() }); }
    if (req.method === 'DELETE') return send(res, 200, []);
    if (req.method === 'GET' && objects.has(key)) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(objects.get(key)); }
  }
  throw new Error(`Unimplemented fixture request ${req.method} ${url.pathname}`);
}
const server = createServer((req, res) => fixture(req, res).catch(error => { console.error(error.message); send(res, 500, { error: error.message }); }));

async function call(route, { cookie, method = 'GET', body, headers = {}, origin = base } = {}) {
  const response = await fetch(base + route, {
    method, redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { origin } : {}), ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text(); let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, headers: response.headers, data };
}
function cookieOf(result) { return result.headers.get('set-cookie')?.split(';')[0]; }
function expectStatus(result, expected, description) { assert.equal(result.status, expected, `${description}: ${JSON.stringify(result.data)}`); }
async function step(name, work) { await work(); passed++; console.log(`PASS ${name}`); }
async function waitReady() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (nextProcess.exitCode !== null) throw Error('Next exited before readiness');
    try { const r = await fetch(base + '/api/auth/logout', { method: 'POST', signal: AbortSignal.timeout(1000) }); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw Error('Timed out waiting for Next dev server');
}

let ownerCookie, firstWorker, secondWorker, workerCookie, otherCookie, job1, job2;
try {
  server.listen(fixturePort, '127.0.0.1'); await once(server, 'listening');
  const synthetic = {
    NEXT_PUBLIC_SUPABASE_URL: fixtureBase, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', INTERNAL_USERNAME: ownerCredentials.username,
    INTERNAL_PASSWORD: ownerCredentials.password, INTERNAL_SESSION_TOKEN: 'fixture-session-key-at-least-thirty-two-characters',
  };
  nextProcess = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], {
    cwd: root, env: { ...process.env, ...synthetic, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  const capture = chunk => { nextOutput = (nextOutput + chunk.toString()).slice(-12000); };
  nextProcess.stdout.on('data', capture); nextProcess.stderr.on('data', capture);
  await waitReady();

  await step('Unauthenticated and invalid sessions cannot access staff records', async () => {
    expectStatus(await call('/api/staff'), 401, 'Unauthenticated');
    expectStatus(await call('/api/staff', { cookie: 'blake_internal_session=fixture-session-key-at-least-thirty-two-characters' }), 401, 'Legacy raw secret cookie');
    expectStatus(await call('/api/staff', { cookie: 'blake_internal_session=v1.invalid.invalid' }), 401, 'Malformed session');
  });
  await step('Owner login authenticates and rejects bad credentials/origins', async () => {
    expectStatus(await call('/api/auth/login', { method: 'POST', body: { ...ownerCredentials, password: 'wrong' } }), 401, 'Wrong owner password');
    expectStatus(await call('/api/auth/login', { method: 'POST', body: ownerCredentials, origin: 'https://untrusted.example' }), 403, 'Cross-origin login');
    const login = await call('/api/auth/login', { method: 'POST', body: ownerCredentials });
    expectStatus(login, 200, 'Owner login'); ownerCookie = cookieOf(login); assert.ok(ownerCookie); assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  });
  await step('Owner creates two individual employee accounts', async () => {
    for (const [name, email] of [['First Worker', 'first@fixture.test'], ['Second Worker', 'second@fixture.test']]) {
      const created = await call('/api/staff/workers', { method: 'POST', cookie: ownerCookie, body: { name, email, password: 'fixture-worker-password-123' } });
      expectStatus(created, 201, 'Create employee');
    }
    const data = await call('/api/staff', { cookie: ownerCookie }); expectStatus(data, 200, 'Owner data');
    firstWorker = data.data.workers.find(x => x.email === 'first@fixture.test'); secondWorker = data.data.workers.find(x => x.email === 'second@fixture.test');
    assert.ok(firstWorker?.id); assert.ok(secondWorker?.id); assert.equal(data.data.bookings.length, 2);
  });
  await step('Owner schedules one job for each employee', async () => {
    for (const [booking_id, worker_id] of [[1, firstWorker.id], [2, secondWorker.id]]) {
      const assigned = await call('/api/staff/jobs', { method: 'POST', cookie: ownerCookie, body: { booking_id, worker_id, service_date: date } });
      expectStatus(assigned, 201, 'Create route job');
    }
    job1 = tables.service_jobs.find(x => x.booking_id === 1); job2 = tables.service_jobs.find(x => x.booking_id === 2); assert.ok(job1); assert.ok(job2);
  });
  await step('Employees authenticate and receive only their own work and customer', async () => {
    const login = await call('/api/auth/login', { method: 'POST', body: { role: 'worker', username: 'first@fixture.test', password: 'fixture-worker-password-123' } });
    expectStatus(login, 200, 'Employee login'); workerCookie = cookieOf(login); assert.ok(workerCookie);
    const login2 = await call('/api/auth/login', { method: 'POST', body: { role: 'worker', username: 'second@fixture.test', password: 'fixture-worker-password-123' } });
    expectStatus(login2, 200, 'Other employee login'); otherCookie = cookieOf(login2);
    const records = await call(`/api/staff?date=${date}`, { cookie: workerCookie }); expectStatus(records, 200, 'Employee records');
    assert.equal(records.data.session.role, 'worker'); assert.equal(records.data.jobs.length, 1); assert.equal(records.data.jobs[0].id, job1.id);
    assert.deepEqual(records.data.bookings.map(x => x.id), [1]); assert.equal(records.data.workers.length, 1);
    assert.ok(!JSON.stringify(records.data).includes('Private Fixture Customer')); assert.ok(!JSON.stringify(records.data).includes('second@fixture.test'));
  });
  await step('Role tampering, owner actions, other jobs and cross-origin writes are rejected', async () => {
    const value = workerCookie.split('=')[1], parts = value.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); payload.role = 'owner';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expectStatus(await call('/api/staff', { cookie: `blake_internal_session=${parts.join('.')}` }), 401, 'Tampered role');
    expectStatus(await call('/api/staff/workers', { method: 'POST', cookie: workerCookie, body: { name: 'Not Allowed', email: 'blocked@fixture.test', password: 'fixture-worker-password-123' } }), 403, 'Employee creating accounts');
    const otherJob = await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job2.id, action: 'start' } }); assert.ok([403, 404].includes(otherJob.status));
    expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job1.id, action: 'approve' } }), 403, 'Employee approval');
    expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, origin: 'https://untrusted.example', body: { id: job1.id, action: 'start' } }), 403, 'Cross-origin write');
    expectStatus(await call('/api/bookings', { method: 'PATCH', cookie: workerCookie, body: { id: 1, payment_status: 'Paid' } }), 403, 'Employee changing payment');
  });
  await step('Only owner payment updates persist and employee financial fields stay redacted', async () => {
    expectStatus(await call('/api/bookings', { method: 'PATCH', cookie: ownerCookie, body: { id: 1, payment_status: 'Paid' } }), 200, 'Owner payment update');
    assert.equal(tables.bookings[0].payment_status, 'Paid');
    const records = await call(`/api/staff?date=${date}`, { cookie: workerCookie }); expectStatus(records, 200, 'Redacted worker data');
    const booking = records.data.bookings[0]; assert.equal(booking.subscription_tier, 'Basic'); assert.equal(booking.subscription_frequency, ''); assert.equal(booking.payment_option, null);
  });
  await step('Worker starts a job and cannot submit without both photos', async () => {
    expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job1.id, action: 'start' } }), 200, 'Start job');
    assert.equal(job1.status, 'in_progress'); assert.ok(job1.started_at);
    expectStatus(await call('/api/staff/workers', { method: 'PATCH', cookie: ownerCookie, body: { id: firstWorker.id, active: false } }), 409, 'Do not strand an employee’s active work');
    assert.equal(firstWorker.active, true);
    const submitted = await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job1.id, action: 'submit' } });
    assert.ok([400, 409, 422].includes(submitted.status)); assert.equal(job1.status, 'in_progress');
  });
  await step('Private photo uploads enforce job ownership and image format', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPrkAAAAASUVORK5CYII=', 'base64');
    function upload(jobId, side, bytes = png, type = 'image/png') { const data = new FormData(); data.set('job_id', jobId); data.set('side', side); data.set('file', new Blob([bytes], { type }), 'fixture.png'); return data; }
    const other = await call('/api/staff/photos', { method: 'POST', cookie: otherCookie, body: upload(job1.id, 'front') }); assert.ok([403, 404].includes(other.status));
    const invalid = await call('/api/staff/photos', { method: 'POST', cookie: workerCookie, body: upload(job1.id, 'front', Buffer.from('not an image')) }); assert.ok([400, 415, 422].includes(invalid.status));
    for (const side of ['front', 'back']) expectStatus(await call('/api/staff/photos', { method: 'POST', cookie: workerCookie, body: upload(job1.id, side) }), 200, `Upload ${side}`);
    assert.ok(job1.front_photo_path); assert.ok(job1.back_photo_path); assert.equal(objects.size, 2);
    const denied = await call(`/api/staff/photos?job_id=${job1.id}&side=front`, { cookie: otherCookie }); assert.ok([403, 404].includes(denied.status));
    const view = await call(`/api/staff/photos?job_id=${job1.id}&side=front`, { cookie: ownerCookie }); assert.ok([200, 302, 303, 307].includes(view.status));
  });
  await step('Submitted work requires owner review and supports redo then approval', async () => {
    expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job1.id, action: 'submit', notes: 'Fixture completion' } }), 200, 'Submit job'); assert.equal(job1.status, 'submitted');
    expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: ownerCookie, body: { id: job1.id, action: 'redo', review_note: 'Please rescrape the front.' } }), 200, 'Request redo');
    assert.ok(['pending', 'in_progress'].includes(job1.status)); assert.ok(job1.review_note);
    assert.equal(job1.front_photo_path, null); assert.equal(job1.back_photo_path, null);
    expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job1.id, action: 'submit' } }), 409, 'Redo cannot reuse rejected proof');
    if (job1.status === 'pending') expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job1.id, action: 'start' } }), 200, 'Restart redo');
    for (const side of ['front', 'back']) {
      const data = new FormData(); data.set('job_id', job1.id); data.set('side', side); data.set('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPrkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'retake.png');
      expectStatus(await call('/api/staff/photos', { method: 'POST', cookie: workerCookie, body: data }), 200, 'Redo photo');
    }
    expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job1.id, action: 'submit' } }), 200, 'Resubmit');
    expectStatus(await call('/api/staff/jobs', { method: 'PATCH', cookie: ownerCookie, body: { id: job1.id, action: 'approve' } }), 200, 'Approve'); assert.equal(job1.status, 'completed');
    const reopen = await call('/api/staff/jobs', { method: 'PATCH', cookie: workerCookie, body: { id: job1.id, action: 'start' } }); assert.ok([400, 409, 422].includes(reopen.status)); assert.equal(job1.status, 'completed');
  });
  await step('Worker requests persist and only the owner can resolve them', async () => {
    expectStatus(await call('/api/staff/requests', { method: 'POST', cookie: workerCookie, body: { kind: 'supplies', message: 'Fixture supply request.' } }), 201, 'Create request');
    const request = tables.staff_requests[0]; assert.ok(request); assert.equal(request.worker_id, firstWorker.id);
    expectStatus(await call('/api/staff/requests', { method: 'PATCH', cookie: workerCookie, body: { id: request.id, resolved: true } }), 403, 'Employee resolving');
    expectStatus(await call('/api/staff/requests', { method: 'PATCH', cookie: ownerCookie, body: { id: request.id, resolved: true } }), 200, 'Owner resolves'); assert.equal(request.resolved, true);
  });
  await step('Portal queries paginate beyond Supabase’s default 1000-row limit', async () => {
    const days = Array.from({ length: 57 }, (_, index) => new Date(Date.parse(date) + (index - 28) * 86400000).toISOString().slice(0, 10)).filter(day => ![0, 6].includes(new Date(day).getUTCDay()));
    const generated = [];
    for (let index = 0; index < 40 && generated.length < 1201; index++) {
      const booking = { ...tables.bookings[0], id: 100 + index, first_name: `Pagination ${index}`, license_plate: `PAGE${index}` };
      tables.bookings.push(booking);
      for (const service_date of days) {
        generated.push({ ...job2, id: randomUUID(), booking_id: booking.id, worker_id: firstWorker.id, service_date });
        if (generated.length === 1201) break;
      }
    }
    tables.service_jobs.push(...generated);
    const records = await call(`/api/staff?date=${date}`, { cookie: workerCookie }); expectStatus(records, 200, 'Paginated employee jobs');
    assert.equal(records.data.jobs.length, 1202); assert.ok(records.data.jobs.some(job => job.id === generated.at(-1).id));
    assert.equal(records.data.bookings.length, new Set(generated.map(job => job.booking_id)).size + 1);
    tables.service_jobs = tables.service_jobs.filter(job => !generated.includes(job));
    tables.bookings = tables.bookings.filter(booking => booking.id < 100);
  });
  await step('Deactivation revokes employee access and logout clears the browser cookie', async () => {
    expectStatus(await call('/api/staff/workers', { method: 'PATCH', cookie: ownerCookie, body: { id: firstWorker.id, active: false } }), 200, 'Deactivate employee');
    expectStatus(await call('/api/staff', { cookie: workerCookie }), 401, 'Disabled employee session');
    const logout = await call('/api/auth/logout', { method: 'POST', cookie: ownerCookie }); expectStatus(logout, 200, 'Logout'); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i);
    expectStatus(await call('/api/staff'), 401, 'Cleared browser session');
  });
  const validBooking = { first_name: 'Signup', last_name: 'Fixture', street_address: '1 Test St', city: 'Rexburg', zip_code: '83440', phone: '2085550100', car_make: 'Test', car_model: 'Car', car_color: 'Blue', license_plate: 'TEST', license_state: 'ID', service_day: 'Tuesday', scrape_by_time: '06:00 AM', subscription_tier: 'Basic', subscription_frequency: 'Weekly', payment_option: 'Cash', weekly_schedule: JSON.stringify({ Monday: '', Tuesday: '06:00 AM' }) };
  await step('Public booking rejects malformed requests without server errors or inserts', async () => {
    const before = tables.bookings.length;
    for (const body of [null, [], {}, { ...validBooking, first_name: '   ' }, { ...validBooking, weekly_schedule: 'null' }, { ...validBooking, weekly_schedule: '[]' }, { ...validBooking, weekly_schedule: '{bad' }]) {
      expectStatus(await call('/api/bookings', { method: 'POST', body }), 400, 'Invalid booking shape');
    }
    for (const body of [{ ...validBooking, service_day: 'constructor' }, { ...validBooking, subscription_tier: 'invented' }, { ...validBooking, payment_option: 'invented' }, { ...validBooking, weekly_schedule: JSON.stringify({ Tuesday: '07:00 AM' }) }, { ...validBooking, weekly_schedule: JSON.stringify({ Tuesday: null }) }, { ...validBooking, zip_code: '00000' }]) {
      expectStatus(await call('/api/bookings', { method: 'POST', body }), 422, 'Invalid booking values');
    }
    expectStatus(await call('/api/bookings', { method: 'POST', body: validBooking, origin: 'https://untrusted.example' }), 403, 'Cross-origin booking');
    assert.equal(tables.bookings.length, before);
  });
  await step('Public signup persists selected days while ignoring deselected days', async () => {
    const before = tables.bookings.length;
    expectStatus(await call('/api/bookings', { method: 'POST', body: validBooking }), 200, 'Submit public booking');
    assert.equal(tables.bookings.length, before + 1);
    assert.deepEqual(tables.bookings.at(-1).weekly_schedule, { Tuesday: '06:00 AM' });
    assert.equal(tables.bookings.at(-1).phone, '(208) 555-0100');
    assert.equal(tables.bookings.at(-1).payment_status, 'Unpaid');
  });
  console.log(`Verified ${passed} staff integration scenarios using ${fixtureCalls} isolated fixture requests.`);
} catch (error) {
  console.error(error.stack || error.message);
  console.error('Next test-server output (synthetic configuration only):\n' + nextOutput);
  process.exitCode = 1;
} finally {
  if (process.env.STAFF_TEST_KEEP_SERVER === '1' && process.exitCode !== 1) {
    tables.staff_members.find(worker => worker.id === firstWorker.id).active = true;
    job2.worker_id = firstWorker.id;
    console.log(`Synthetic UI server retained at ${base}; fixture ${fixtureBase}; runner PID ${process.pid}; Next PID ${nextProcess.pid}.`);
    console.log('Owner: Fixture Owner / fixture-owner-password. Employee: first@fixture.test / fixture-worker-password-123.');
    console.log('Stop this runner with Control+C after browser checks.');
  } else {
    if (nextProcess?.pid) { try { process.kill(-nextProcess.pid, 'SIGTERM'); } catch {} }
    server.closeAllConnections(); server.close();
  }
}
