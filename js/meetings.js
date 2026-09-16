/* Team-scoped meeting records. No test records or role switch are shipped. */
(() => {
    'use strict';
    const $ = id => document.getElementById('meeting-' + id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let session = null, records = [], drafts = [], unsubscribers = [], draftUnsubscribe = null;
    let writer = false, manager = false, tab = 'published', selected = null, editing = null;
    let timer = null, pending = Promise.resolve(), dirty = false, busy = false, version = 0, generation = 0;
    let recordsReady = false, recordsError = '', readMarks = {}, recovery = null;
    const now = () => firebase.firestore.FieldValue.serverTimestamp();
    const millis = value => value && typeof value.toMillis === 'function' ? value.toMillis() : 0;
    const teamRef = () => db.collection('teams').doc(session.teamId);
    const pubRef = id => teamRef().collection('meetings').doc(id);
    const draftRef = id => teamRef().collection('meetingDrafts').doc(session.uid).collection('items').doc(id);
    const key = type => `kimmoksu-meetings:${session.teamId}:${session.uid}:${type}`;
    function toast(text) { const el = $('toast'); el.textContent = text; el.style.display = 'block'; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.style.display = 'none'; }, 4500); }
    function fail(error) { return error?.code === 'permission-denied' ? '접근 권한을 확인할 수 없습니다. 관리자에게 문의해 주세요.' : error?.message === 'meeting-conflict' ? '다른 사람이 먼저 수정했습니다. 입력 내용은 임시저장되어 있습니다. 최신 회의록을 확인해 주세요.' : '저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'; }
    function backup() {
        if (!session || !editing) return;
        try { localStorage.setItem(key('recovery'), JSON.stringify({ ...editing, ...fields() })); }
        catch { $('save-state').textContent = '브라우저 복구 저장 실패 · 내용을 복사해 보관해 주세요.'; }
    }
    function clearBackup() { if (session) try { localStorage.removeItem(key('recovery')); } catch {} recovery = null; }
    function fields() { return { title: $('title').value, body: $('body').value, date: $('date').value }; }
    function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    function fresh(r) { return readMarks[r.id] !== r.revision; }
    function excerpt(r, q = '') { const text = String(r.body || '').replace(/\s+/g, ' '), i = text.toLowerCase().indexOf(q.toLowerCase()), start = Math.max(0, i - 25); return (start ? '…' : '') + text.slice(start, start + 120) + (text.length > start + 120 ? '…' : ''); }
    function highlight(text, q) { text = String(text || ''); if (!q) return esc(text); const i = text.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length)); }
    function render() {
        if (!$('list')) return;
        $('new').hidden = !writer; $('tabs').hidden = !writer;
        document.getElementById('btnMeetingPerm').hidden = !manager;
        const published = [...records].sort((a, b) => b.date.localeCompare(a.date) || millis(b.updatedAt) - millis(a.updatedAt));
        const empty = session ? (recordsError || (!recordsReady ? '회의록을 불러오는 중입니다.' : '아직 게시된 회의록이 없습니다.')) : '로그인 후 회의록을 확인할 수 있습니다.';
        $('recent').innerHTML = published.slice(0, 3).map(r => `<button class="recent-card" type="button" data-meeting-open="${esc(r.id)}"><span class="metadata">${esc(r.date)}${fresh(r) ? '<span class="new">NEW</span>' : ''}</span><strong>${esc(r.title)}</strong><span class="metadata">${esc(r.authorName)}</span></button>`).join('') || `<div class="empty">${esc(empty)}</div>`;
        $('home-list').innerHTML = published.slice(0, 3).map(r => row(r, '')).join('') || `<div class="empty">${esc(empty)}</div>`;
        const q = $('query').value.trim(), from = $('from').value, to = $('to').value;
        const rows = (tab === 'draft' && writer ? drafts : records).filter(r => (!q || (r.title + ' ' + r.body).toLowerCase().includes(q.toLowerCase())) && (!from || r.date >= from) && (!to || r.date <= to)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.date.localeCompare(a.date) || millis(b.updatedAt) - millis(a.updatedAt));
        $('count').textContent = String(rows.length);
        $('list').innerHTML = from && to && from > to ? '<div class="empty">시작일을 종료일 이전으로 선택해 주세요.</div>' : rows.map(r => row(r, q)).join('') || `<div class="empty">${esc(q || from || to ? '검색 조건에 맞는 회의록이 없습니다.' : tab === 'draft' ? '작성 중인 회의록이 없습니다.' : empty)}</div>`;
        $('status').textContent = recordsError;
        if (recovery && writer) { const b = document.createElement('button'); b.type = 'button'; b.textContent = '저장 중이던 내용 복구'; b.onclick = () => openEditor(recovery, true); $('status').append(' ', b); }
        $('tabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    }
    function row(r, q) { return `<button class="row" type="button" data-meeting-open="${esc(r.id)}"${tab === 'draft' && drafts.includes(r) ? ' data-meeting-draft="true"' : ''}><div class="row-left"><div class="row-title">${r.pinned ? '<span class="pin-tag">고정</span>' : ''}${highlight(r.title || '제목 없는 임시저장', q)}${r.revision && fresh(r) ? '<span class="new">NEW</span>' : ''}</div><p class="snippet">${highlight(excerpt(r, q), q)}</p></div><div class="row-meta">${esc(r.date)}<br>${esc(r.authorName)}</div></button>`; }
    function openRecord(id) {
        const r = records.find(item => item.id === id); if (!session || !r) return;
        selected = id; readMarks[id] = r.revision;
        try { localStorage.setItem(key('read'), JSON.stringify(readMarks)); } catch {}
        $('detail').innerHTML = `<h2>${esc(r.title)}</h2><div class="metadata">회의일 ${esc(r.date)} · 작성자 ${esc(r.authorName)}<br>마지막 수정 ${millis(r.updatedAt) ? esc(new Date(millis(r.updatedAt)).toLocaleString('ko-KR')) : '저장 중'} · ${esc(r.updatedByName || r.authorName)}</div><div class="body-text">${esc(r.body)}</div>`;
        $('edit').hidden = $('pin').hidden = !writer;
        $('pin').textContent = r.pinned ? '고정 해제' : '상단 고정';
        render(); if (!$('reader').open) $('reader').showModal();
    }
    function openEditor(r = null, isDraft = false) {
        if (!session || !writer || busy) return;
        $('reader').close(); clearTimeout(timer);
        if (isDraft) editing = { ...r };
        else if (r) editing = { ...(drafts.find(d => d.id === r.id) || { id: r.id, title: r.title, body: r.body, date: r.date, baseRevision: r.revision }) };
        else editing = { id: teamRef().collection('meetings').doc().id, title: '', body: '', date: today(), baseRevision: 0 };
        // Only the draft fields enter the persisted draft, never copied publication metadata.
        for (const k of ['title', 'body', 'date']) $(k).value = editing[k] || '';
        $('author').value = session.nickname;
        $('editor-title').textContent = editing.baseRevision ? '회의록 수정' : '회의록 작성';
        $('save-state').textContent = '작성 중인 내용은 자동 임시저장됩니다.';
        dirty = isDraft && recovery?.id === editing.id; version++; $('editor').showModal();
    }
    function saveDraft() {
        clearTimeout(timer);
        if (!editing || !session || !writer) return Promise.resolve(true);
        const values = fields();
        if (!values.title.trim() && !values.body.trim() && !editing.baseRevision && !dirty) return Promise.resolve(true);
        const id = editing.id, current = session, stamp = version, gen = generation;
        const data = { ...values, authorUid: session.uid, authorName: session.nickname, baseRevision: editing.baseRevision || 0, updatedAt: now() };
        backup();
        const ref = draftRef(id);
        const task = pending.then(async () => {
            if (session !== current || gen !== generation || !writer) return false;
            try {
                await ref.set(data);
                if (session === current && editing?.id === id && version === stamp) { dirty = false; clearBackup(); $('save-state').textContent = '임시저장됨 · ' + new Date().toLocaleTimeString('ko-KR'); }
                return true;
            } catch (error) { if (session === current) { dirty = true; $('save-state').textContent = fail(error); } return false; }
        });
        pending = task.catch(() => false); return task;
    }
    async function closeEditor() {
        if (busy) return;
        setBusy(true);
        const ok = await saveDraft();
        setBusy(false);
        if (ok) { $('editor').close(); editing = null; dirty = false; render(); }
        else toast('임시저장이 완료되지 않았습니다. 내용을 복사하거나 저장을 다시 시도해 주세요.');
    }
    function setBusy(value) { busy = value; $('form').querySelectorAll('button,input,textarea').forEach(el => el.disabled = value); }
    async function publish(event) {
        event.preventDefault(); if (!session || !writer || !editing || busy) return;
        const values = fields();
        if (!values.title.trim() || !values.body.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) { toast('제목, 회의 날짜와 내용을 입력해 주세요.'); return; }
        if (values.body.length > 100000) { toast('회의 내용은 100,000자까지 저장할 수 있습니다.'); return; }
        setBusy(true); const current = session, edit = { ...editing }, ref = pubRef(editing.id), draft = draftRef(editing.id);
        try {
            if (!await saveDraft() || session !== current) return;
            await db.runTransaction(async tx => {
                const snap = await tx.get(ref), old = snap.exists ? snap.data() : null;
                if ((old?.revision || 0) !== (edit.baseRevision || 0)) throw new Error('meeting-conflict');
                tx.set(ref, { title: values.title.trim(), body: values.body.trim(), date: values.date, authorUid: old?.authorUid || current.uid, authorName: old?.authorName || current.nickname, createdAt: old?.createdAt || now(), updatedAt: now(), updatedByUid: current.uid, updatedByName: current.nickname, revision: (old?.revision || 0) + 1, pinned: !!old?.pinned });
                tx.delete(draft);
            });
            if (session !== current) return;
            clearBackup(); editing = null; dirty = false; $('editor').close(); tab = 'published'; $('query').value = $('from').value = $('to').value = ''; render(); toast('회의록을 게시했습니다.');
        } catch (error) { if (session === current) { dirty = false; toast(fail(error)); $('save-state').textContent = fail(error);
                if (error?.message === 'meeting-conflict') {
                    try { const latest = await ref.get();
                        if (session === current && latest.exists && confirm('다른 사람이 저장한 최신 내용입니다.\n\n' + latest.data().body.slice(0, 2000) + (latest.data().body.length > 2000 ? '\n(이후 내용 생략)' : '') + '\n\n최신 글을 확인했으며, 내 수정본으로 교체할 준비를 하시겠습니까? 확인 후 게시하기를 다시 눌러야 반영됩니다.')) { editing.baseRevision = latest.data().revision; dirty = true; await saveDraft(); }
                    } catch { toast('최신 회의록을 불러오지 못했습니다. 다시 시도해 주세요.'); }
                } } }
        finally { setBusy(false); }
    }
    async function pin() {
        if (!session || !writer || !selected || busy) return;
        const ref = pubRef(selected), current = session;
        $('pin').disabled = true;
        try { await db.runTransaction(async tx => { const snap = await tx.get(ref); if (!snap.exists) throw Error('missing'); tx.update(ref, { pinned: !snap.data().pinned }); }); if (session === current) toast('상단 고정을 변경했습니다.'); }
        catch (error) { toast(fail(error)); } finally { $('pin').disabled = false; }
    }
    function permissionFromTeam(data) {
        const member = Array.isArray(data.members) && data.members.includes(session.email);
        manager = member && (data.owner === session.email || (data.admins || []).includes(session.email) || session.email === 'idong2300@naver.com');
        writer = member && (manager || (data.meetingAdmins || []).includes(session.email));
        return member;
    }
    function listenDrafts() {
        if (draftUnsubscribe) { draftUnsubscribe(); draftUnsubscribe = null; }
        drafts = [];
        if (!session || !writer) return;
        const current = session;
        draftUnsubscribe = teamRef().collection('meetingDrafts').doc(session.uid).collection('items').onSnapshot(snapshot => {
            if (session !== current) return;
            drafts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })); render();
        }, error => { if (session === current) { $('save-state').textContent = fail(error); toast('임시저장 목록을 불러오지 못했습니다. 권한과 연결을 확인해 주세요.'); } });
    }
    function stop() {
        backup(); generation++; clearTimeout(timer);
        unsubscribers.forEach(fn => fn()); unsubscribers = [];
        if (draftUnsubscribe) draftUnsubscribe(); draftUnsubscribe = null;
        session = null; writer = manager = false; records = drafts = []; recordsReady = false; recordsError = ''; recovery = null; readMarks = {}; tab = 'published';
        $('reader').close(); $('editor').close(); $('detail').textContent = ''; $('form').reset(); editing = null; dirty = false; pending = Promise.resolve(); setBusy(false); render();
    }
    function start(context) {
        stop(); session = { ...context }; const current = session;
        try { readMarks = JSON.parse(localStorage.getItem(key('read')) || '{}') || {}; recovery = JSON.parse(localStorage.getItem(key('recovery')) || 'null'); } catch { readMarks = {}; recovery = null; }
        if (recovery && (typeof recovery.id !== 'string' || recovery.id.includes('/') || typeof recovery.body !== 'string' || typeof recovery.title !== 'string' || !Number.isInteger(recovery.baseRevision) || recovery.baseRevision < 0)) recovery = null;
        unsubscribers.push(teamRef().onSnapshot(snapshot => {
            if (session !== current) return;
            const previous = writer;
            if (!snapshot.exists || !permissionFromTeam(snapshot.data())) { stop(); return; }
            if (previous !== writer) {
                listenDrafts();
                if (!writer) { backup(); clearTimeout(timer); $('editor').close(); editing = null; dirty = false; tab = 'published'; }
            }
            if ($('reader').open && selected) openRecord(selected); else render();
        }, () => { if (session === current) { stop(); toast('회의록 권한을 불러오지 못했습니다. 다시 로그인해 주세요.'); } }));
        unsubscribers.push(teamRef().collection('meetings').onSnapshot(snapshot => {
            if (session !== current) return;
            records = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })); recordsReady = true; recordsError = '';
            if ($('reader').open && selected) { if (records.some(r => r.id === selected)) openRecord(selected); else $('reader').close(); }
            render();
        }, error => { if (session === current) { recordsReady = true; records = []; $('reader').close(); $('detail').textContent = ''; recordsError = error?.code === 'permission-denied' ? '회의록 접근 권한을 확인해 주세요.' : '회의록을 불러오지 못했습니다. 연결 상태를 확인한 후 새로고침해 주세요.'; render(); } }));
        render();
    }
    $('new').onclick = () => openEditor(); $('close-editor').onclick = closeEditor; $('save-draft').onclick = closeEditor;
    $('editor').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
    $('form').addEventListener('input', () => { if (!editing) return; dirty = true; version++; backup(); clearTimeout(timer); $('save-state').textContent = '저장 중…'; timer = setTimeout(saveDraft, 800); });
    $('form').onsubmit = publish; $('pin').onclick = pin; $('edit').onclick = () => openEditor(records.find(r => r.id === selected));
    $('copy').onclick = async () => { const r = records.find(item => item.id === selected); if (!r) return; const text = `${r.title}\n회의일: ${r.date}\n작성자: ${r.authorName}\n\n${r.body}`; try { await navigator.clipboard.writeText(text); toast('회의록 내용을 복사했습니다.'); } catch { toast('본문을 선택해 복사해 주세요.'); } };
    for (const id of ['query', 'from', 'to']) $(id).addEventListener('input', render);
    $('clear').onclick = () => { $('query').value = $('from').value = $('to').value = ''; render(); };
    $('tabs').onclick = event => { if (event.target.dataset.tab) { tab = writer ? event.target.dataset.tab : 'published'; render(); } };
    $('show-all').onclick = () => showPage('meetings', document.querySelector('[data-erp-page="meetings"]'));
    document.getElementById('btnMeetingPerm').onclick = () => { if (manager) openPermModal('meetings'); };
    document.addEventListener('click', event => {
        const open = event.target.closest('[data-meeting-open]');
        if (open) { if (open.dataset.meetingDraft) { const d = drafts.find(r => r.id === open.dataset.meetingOpen); if (d) openEditor(d, true); } else openRecord(open.dataset.meetingOpen); }
        const close = event.target.closest('[data-close="meeting-reader"]'); if (close) $('reader').close();
    });
    window.addEventListener('beforeunload', event => { if (editing && (dirty || busy)) { backup(); event.preventDefault(); event.returnValue = ''; } });
    window.KimmoksuMeetings = { start, stop, refreshPermissions: render, prepareLogout: async () => { if (busy) { toast('저장 중입니다. 잠시 후 다시 시도해 주세요.'); return false; } return saveDraft(); } };
    render();
})();
