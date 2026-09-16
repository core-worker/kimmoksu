'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8'), source = fs.readFileSync('js/meetings.js', 'utf8');
const nodes = {}, events = {}, data = new Map(), watchers = [];
let counter = 0, offline = false, authListener, teamQueryError = null, delayedQuery = null;
function element(id) { return { id, value: '', textContent: '', innerHTML: '', hidden: false, open: false, disabled: false, style: {}, dataset: {}, events: {}, classList: { toggle() {} }, addEventListener(k, fn) { this.events[k] = fn; }, querySelectorAll() { return []; }, showModal() { this.open = true; }, close() { this.open = false; }, reset() {}, append() {} }; }
for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes[id] = element(id);
const n = id => { assert(nodes['meeting-' + id], id); return nodes['meeting-' + id]; };
const stamp = { toMillis: () => 1000 };
const snap = path => ({ exists: data.has(path), data: () => data.get(path), id: path.split('/').at(-1) });
function collectionSnapshot(path) { return { docs: [...data.keys()].filter(p => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')).map(snap) }; }
function notify() { for (const w of [...watchers]) if (w.live) w.fn(w.collection ? collectionSnapshot(w.path) : snap(w.path)); }
function ref(path, collection = false) { return { path, id: path.split('/').at(-1), collection: name => ref(path + '/' + name, true), where: (field, op, value) => ({ async get() { if (delayedQuery) await delayedQuery; if (teamQueryError) throw teamQueryError; const docs = collectionSnapshot(path).docs.filter(d => d.data()[field]?.includes(value)); return { docs, empty: !docs.length }; } }), doc: id => ref(path + '/' + (id || 'new-' + ++counter)), async get() { return snap(path); }, async set(value) { if (offline) throw { code: 'unavailable' }; data.set(path, { ...value }); notify(); }, onSnapshot(fn, err) { const w = { path, collection, fn, err, live: true }; watchers.push(w); fn(collection ? collectionSnapshot(path) : snap(path)); return () => { w.live = false; }; } }; }
const db = { collection: name => ref(name, true), async runTransaction(fn) { if (offline) throw { code: 'unavailable' }; const mutations = []; await fn({ get: r => r.get(), set: (r, d) => mutations.push(() => data.set(r.path, d)), update: (r, d) => mutations.push(() => data.set(r.path, { ...data.get(r.path), ...d })), delete: r => mutations.push(() => data.delete(r.path)) }); mutations.forEach(f => f()); notify(); } };
const storage = new Map();
const auth = { currentUser: null, onAuthStateChanged(fn) { authListener = fn; } };
const ctx = vm.createContext({ db, auth, console, firebase: { firestore: { FieldValue: { serverTimestamp: () => stamp } } }, document: { getElementById: id => { assert(nodes[id], id); return nodes[id]; }, createElement: () => element('button'), addEventListener: (k, f) => { events[k] = f; }, querySelector: () => null }, window: { addEventListener: (k, f) => { events[k] = f; } }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }, setTimeout: () => 1, clearTimeout() {}, Date, navigator: { clipboard: { writeText: async () => {} } }, confirm: () => false, showPage() {}, openPermModal() {} });
const team = 'teams/t1', context = { teamId: 't1', uid: 'u1', email: 'writer@example.com', nickname: '담당자' };
data.set(team, { owner: 'owner@example.com', admins: [], members: ['writer@example.com', 'reader@example.com'], meetingAdmins: ['writer@example.com'] });
vm.runInContext(source, ctx);
const api = ctx.window.KimmoksuMeetings;
function input(title, body) { n('title').value = title; n('body').value = body; n('form').events.input(); }
function click(id, draft = false) { events.click({ target: { closest: selector => selector === '[data-meeting-open]' ? { dataset: { meetingOpen: id, meetingDraft: draft ? 'true' : undefined } } : null } }); }
(async () => {
    api.start(context); assert.equal(n('new').hidden, false); assert.equal(n('count').textContent, '0');
    n('new').onclick(); input('<img src=x onerror=alert(1)>', '자재 회의 테스트');
    await n('save-draft').onclick();
    assert.equal(data.get(team + '/meetingDrafts/u1/items/new-1').body, '자재 회의 테스트');
    assert.equal(data.has(team + '/meetings/new-1'), false);
    click('new-1', true); await n('form').onsubmit({ preventDefault() {} });
    assert.equal(data.get(team + '/meetings/new-1').revision, 1); assert(!data.has(team + '/meetingDrafts/u1/items/new-1'));
    click('new-1'); assert(n('detail').innerHTML.includes('&lt;img')); assert(!n('detail').innerHTML.includes('<img'));
    n('query').value = '자재'; n('query').events.input(); assert.equal(n('count').textContent, '1');
    n('query').value = '없는단어'; n('query').events.input(); assert.equal(n('count').textContent, '0'); n('clear').onclick();
    n('edit').onclick(); input('수정 제목', '미게시 수정'); await n('save-draft').onclick(); assert.equal(data.get(team + '/meetings/new-1').body, '자재 회의 테스트');
    click('new-1', true); data.set(team + '/meetings/new-1', { ...data.get(team + '/meetings/new-1'), revision: 2, body: '다른 담당자의 수정' }); notify();
    await n('form').onsubmit({ preventDefault() {} }); assert.equal(data.get(team + '/meetings/new-1').body, '다른 담당자의 수정'); assert(n('editor').open); assert(n('save-state').textContent.includes('먼저 수정'));
    await n('close-editor').onclick();
    n('new').onclick(); input('연결 실패 테스트', '보존할 내용'); offline = true; await n('save-draft').onclick(); assert(n('editor').open); assert([...storage.values()].some(s => s.includes('보존할 내용'))); assert.equal(await api.prepareLogout(), false);
    offline = false; await n('close-editor').onclick(); assert(!n('editor').open);
    api.stop(); assert(!n('reader').open); assert(!n('editor').open); assert.equal(n('detail').textContent, '');
    api.start({ ...context, uid: 'u2', email: 'reader@example.com', nickname: '직원' }); assert(n('new').hidden); assert(n('tabs').hidden); click('new-1'); assert(n('edit').hidden); assert(n('pin').hidden);
    assert.equal(watchers.filter(w => w.live && w.path.includes('meetingDrafts')).length, 0);
    data.set(team, { ...data.get(team), members: ['writer@example.com'] }); notify(); assert(n('new').hidden); assert(!n('reader').open);
    assert.equal(watchers.filter(w => w.live).length, 0);
    // Startup works without any auth.js start() call (including a cached older auth.js).
    data.set(team, { owner: 'owner@example.com', admins: [], members: ['writer@example.com'], meetingAdmins: ['writer@example.com'] });
    auth.currentUser = { uid: 'u1', email: 'writer@example.com' };
    await authListener(auth.currentUser);
    assert.equal(n('new').hidden, false);
    assert(!n('recent').innerHTML.includes('로그인 후'));
    const subscribed = watchers.filter(w => w.live).length;
    api.start({ ...context }); assert.equal(watchers.filter(w => w.live).length, subscribed);
    // A real team permission failure must not masquerade as a signed-out session.
    watchers.find(w => w.live && w.path === team).err({ code: 'permission-denied' });
    assert(n('recent').innerHTML.includes('팀 정보 접근이 거부'));
    assert(!n('recent').innerHTML.includes('로그인 후'));
    teamQueryError = { code: 'permission-denied' };
    await authListener(auth.currentUser);
    assert(n('recent').innerHTML.includes('팀 정보 접근이 거부'));
    teamQueryError = null;
    await authListener({ uid: 'u3', email: 'no-team@example.com' });
    assert(n('recent').innerHTML.includes('소속 팀이 없습니다'));
    // A delayed lookup from the previous account must not restore its session after logout.
    let resolveQuery; delayedQuery = new Promise(resolve => { resolveQuery = resolve; });
    const oldLogin = authListener(auth.currentUser);
    auth.currentUser = null; await authListener(null); resolveQuery(); await oldLogin;
    assert(n('recent').innerHTML.includes('로그인 후'));
    assert.equal(watchers.filter(w => w.live).length, 0); delayedQuery = null;
    console.log('PASS: independent auth startup, permission/no-team messages, auth race cancellation, shared publishing, private drafts, edit isolation, escaping, search, revision conflict, save failures/recovery, logout and permission revocation.');
})().catch(e => { console.error(e); process.exitCode = 1; });
