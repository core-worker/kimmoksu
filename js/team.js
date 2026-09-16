// =====================================================
// 김목수이야기 ERP - team.js
// 역할: 팀 관리, 초대코드, 팀원 권한, 담당자 설정
// =====================================================

function checkTeamUI() {
    const noTeamSection = document.getElementById('no-team-section');
    const hasTeamSection = document.getElementById('has-team-section');

    if (!noTeamSection || !hasTeamSection) return;

    if (myTeamId) {
        noTeamSection.style.display = 'none';
        hasTeamSection.style.display = 'block';
        loadTeamMembers();
    } else {
        noTeamSection.style.display = 'block';
        hasTeamSection.style.display = 'none';
    }
}

async function loadTeamMembers() {
    if (!myTeamId) return;

    const tDoc = await db.collection("teams").doc(myTeamId).get();
    const tData = tDoc.data() || {};
    const members = tData.members || [];

    const btnRegenCode = document.getElementById('btnRegenCode');
    if (btnRegenCode) {
        btnRegenCode.style.display =
            (myRole === "owner" || myRole === "admin") ? 'inline-block' : 'none';
    }

    const displayTeamId = document.getElementById('displayTeamId');
    if (displayTeamId) {
        displayTeamId.value = tData.inviteCode || '발급필요';
    }

    const memberList = document.getElementById('member-list');
    if (!memberList) return;

    memberList.innerHTML = members.map(m => {
        const nick = globalEmailToNick[m] || m.split('@')[0];

        let badge = "";
        let actionBtn = "";

        const isOwner = (tData.owner === m || m === "idong2300@naver.com");
        const isAdmin = (tData.admins && tData.admins.includes(m));

        if (isOwner) {
            badge = `<span class="badge bg-warning text-dark">에디터</span>`;
        } else if (isAdmin) {
            badge = `<span class="badge bg-primary">관리자</span>`;

            if (myRole === "owner") {
                actionBtn = `
                    <button class="btn btn-sm btn-outline-secondary py-0 me-2"
                            onclick="toggleAdmin('${m}', false)">
                        관리자 해제
                    </button>
                    <button class="btn btn-sm btn-outline-danger py-0"
                            onclick="kickMember('${m}')">
                        삭제
                    </button>
                `;
            }
        } else {
            badge = `<span class="badge bg-secondary">팀원</span>`;

            if (myRole === "owner") {
                actionBtn = `
                    <button class="btn btn-sm btn-outline-info py-0 me-2"
                            onclick="toggleAdmin('${m}', true)">
                        관리자 임명
                    </button>
                    <button class="btn btn-sm btn-outline-danger py-0"
                            onclick="kickMember('${m}')">
                        삭제
                    </button>
                `;
            } else if (myRole === "admin") {
                actionBtn = `
                    <button class="btn btn-sm btn-outline-danger py-0"
                            onclick="kickMember('${m}')">
                        삭제
                    </button>
                `;
            }
        }

        return `
            <div class="list-group-item bg-transparent text-white border-secondary border-opacity-25 py-3 d-flex flex-column gap-2 flex-md-row justify-content-md-between align-items-md-center">
                <div class="d-flex align-items-center flex-wrap gap-2">
                    ${badge}
                    <span class="fw-bold">${nick}</span>
                    <span class="small text-secondary">(${m})</span>
                </div>
                <div class="text-end">
                    ${actionBtn}
                </div>
            </div>
        `;
    }).join('');
    await loadTeamJoinRequests();
}

async function joinTeam() {
    const codeInput = document.getElementById('joinTeamId');
    if (!codeInput) return;

    const c = codeInput.value.trim().toUpperCase();
    if (!c) return;

    try {
        const q = await db.collection("teams")
            .where("inviteCode", "==", c)
            .get();

        if (q.empty) {
            alert("유효하지 않은 코드입니다.");
            return;
        }

        const tid = q.docs[0].id;
        const teamData = q.docs[0].data();
        const members = teamData.members || [];

        if (!members.includes(myEmail)) {
            await db.collection("teams").doc(tid).collection("joinRequests").doc(auth.currentUser.uid).set({
                email: myEmail,
                nickname: userNickname,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("팀 가입 요청을 보냈습니다. 관리자 승인 후 다시 로그인해 주세요.");
        } else {
            alert("이미 소속된 팀입니다.");
        }
    } catch (e) {
        alert(e.message);
    }
}

async function createTeam() {
    if (!confirm("개설하시겠습니까?")) return;

    const c = Math.random().toString(36).substring(2, 8).toUpperCase();

    await db.collection("teams").add({
        createdAt: Date.now(),
        members: [myEmail],
        owner: myEmail,
        admins: [],
        noticeAdmins: [],
        statusAdmins: [],
        worklogAdmins: [],
        leaveAdmins: [],
        meetingAdmins: [],
        inviteCode: c
    });

    alert("팀이 성공적으로 개설되었습니다!");
    location.reload();
}

async function regenerateInviteCode() {
    if (!confirm("기존 코드는 즉시 무효화됩니다. 계속하시겠습니까?")) return;

    const c = Math.random().toString(36).substring(2, 8).toUpperCase();

    await db.collection("teams").doc(myTeamId).update({
        inviteCode: c
    });

    const displayTeamId = document.getElementById('displayTeamId');
    if (displayTeamId) {
        displayTeamId.value = c;
    }

    alert("발급되었습니다!");
}

async function kickMember(tEmail) {
    if (!confirm("팀에서 내보내시겠습니까?")) return;

    const tDoc = await db.collection("teams").doc(myTeamId).get();
    const data = tDoc.data() || {};

    const members = (data.members || []).filter(x => x !== tEmail);
    const admins = (data.admins || []).filter(x => x !== tEmail);
    const noticeAdmins = (data.noticeAdmins || []).filter(x => x !== tEmail);
    const statusAdmins = (data.statusAdmins || []).filter(x => x !== tEmail);
    const worklogAdmins = (data.worklogAdmins || []).filter(x => x !== tEmail);
    const leaveAdmins = (data.leaveAdmins || []).filter(x => x !== tEmail);
    const meetingAdmins = (data.meetingAdmins || []).filter(x => x !== tEmail);

    await db.collection("teams").doc(myTeamId).update({
        members: members,
        admins: admins,
        noticeAdmins: noticeAdmins,
        statusAdmins: statusAdmins,
        worklogAdmins: worklogAdmins,
        leaveAdmins: leaveAdmins,
        meetingAdmins: meetingAdmins
    });

    loadTeamMembers();
    alert("팀원이 삭제되었습니다.");
}

async function toggleAdmin(tEmail, isPro) {
    const tDoc = await db.collection("teams").doc(myTeamId).get();
    const data = tDoc.data() || {};
    let admins = data.admins || [];

    if (isPro) {
        if (!admins.includes(tEmail)) {
            admins.push(tEmail);
        }
    } else {
        admins = admins.filter(x => x !== tEmail);
    }

    await db.collection("teams").doc(myTeamId).update({
        admins: admins
    });

    loadTeamMembers();
}

const permissionFields = Object.freeze({ notice: 'noticeAdmins', status: 'statusAdmins', worklog: 'worklogAdmins', leave: 'leaveAdmins', meetings: 'meetingAdmins' });
let permissionContext = null;
let permissionSaving = false;
let permissionOpenVersion = 0;

function permissionMessage(message, error = false) {
    const el = document.getElementById('permSaveStatus');
    if (el) { el.textContent = message; el.className = 'small mb-3 ' + (error ? 'text-danger' : 'text-secondary'); }
}
function canManageTeamPermissions(data, email) {
    return (data.members || []).includes(email) && (data.owner === email || (data.admins || []).includes(email) || email === 'idong2300@naver.com');
}
function permissionError(error) {
    const code = String(error?.code || '');
    if (code.endsWith('permission-denied')) return 'Firebase에서 권한 저장을 거부했습니다. 현재 관리자 권한과 게시된 Firestore 규칙을 확인해 주세요. (permission-denied)';
    if (code.endsWith('unavailable') || code.endsWith('deadline-exceeded')) return '서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 저장해 주세요. (' + code + ')';
    return error?.message || '권한을 저장하지 못했습니다. 다시 시도해 주세요.';
}
async function openPermModal(type) {
    if (permissionSaving) return;
    const version = ++permissionOpenVersion;
    permissionContext = null;
    const saveButton = document.getElementById('btnSavePerms');
    if (saveButton) saveButton.disabled = true;
    const titles = { notice: '공지사항 담당자 설정', status: '종합 상황판 담당자 설정', worklog: '작업일보 완료 담당자 설정', leave: '연차관리 담당자 설정', meetings: '회의록 담당자 설정' };
    const list = document.getElementById('permMemberList');
    list.replaceChildren();
    document.getElementById('permModalTitle').textContent = titles[type] || '담당자 설정';
    permModalInst.show();
    permissionMessage('현재 담당자와 관리자 권한을 확인하고 있습니다.');
    try {
        if (!Object.hasOwn(permissionFields, type)) throw new Error('설정 항목을 확인할 수 없습니다. 창을 닫고 다시 열어 주세요.');
        const user = auth.currentUser;
        if (!user || !myTeamId) throw new Error('로그인 또는 팀 정보를 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.');
        const context = { type, field: permissionFields[type], teamId: myTeamId, uid: user.uid, email: user.email };
        const snapshot = await db.collection('teams').doc(context.teamId).get();
        if (version !== permissionOpenVersion) return;
        if (auth.currentUser?.uid !== context.uid || myTeamId !== context.teamId) throw new Error('로그인 또는 팀이 변경되었습니다. 다시 열어 주세요.');
        if (!snapshot.exists || !canManageTeamPermissions(snapshot.data(), context.email)) throw new Error('팀 소유자 또는 관리자만 담당자를 설정할 수 있습니다.');
        const data = snapshot.data(), active = data[context.field] || [];
        for (const email of data.members || []) {
            const label = document.createElement('label'); label.className = 'd-flex align-items-center gap-2 p-3 rounded perm-item-box cursor-pointer';
            const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'form-check-input perm-check'; check.value = email; check.checked = active.includes(email); check.style.width = '20px'; check.style.height = '20px';
            const text = document.createElement('span'); text.className = 'fw-bold'; text.textContent = (globalEmailToNick[email] || email) + ' (' + email + ')';
            label.append(check, text); list.append(label);
        }
        currentPermType = type;
        permissionContext = context;
        permissionMessage('담당자를 선택하고 권한 저장을 눌러 주세요.');
        if (saveButton) saveButton.disabled = false;
    } catch (error) { console.error('[permissions] open failed', error); permissionMessage(permissionError(error), true); }
}
async function savePerms() {
    if (permissionSaving) return;
    const context = permissionContext;
    if (!context) { permissionMessage('담당자 정보를 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.', true); return; }
    if (auth.currentUser?.uid !== context.uid || myTeamId !== context.teamId) { permissionMessage('로그인 또는 팀이 변경되었습니다. 다시 열어 주세요.', true); return; }
    const selected = [...new Set(Array.from(document.querySelectorAll('#permMemberList .perm-check:checked'), cb => cb.value))];
    const button = document.getElementById('btnSavePerms');
    const checks = document.querySelectorAll('#permMemberList .perm-check');
    permissionSaving = true;
    if (button) { button.disabled = true; button.textContent = '저장 중…'; }
    checks.forEach(cb => cb.disabled = true);
    permissionMessage('담당자 권한을 저장하고 있습니다.');
    const slow = setTimeout(() => permissionMessage('서버 응답을 기다리고 있습니다. 아직 저장 완료가 아니므로 잠시 기다려 주세요.'), 10000);
    try {
        const ref = db.collection('teams').doc(context.teamId);
        await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref);
            if (auth.currentUser?.uid !== context.uid || myTeamId !== context.teamId) throw new Error('로그인 또는 팀이 변경되었습니다.');
            if (!snapshot.exists || !canManageTeamPermissions(snapshot.data(), context.email)) throw new Error('관리자 권한이 변경되어 저장할 수 없습니다.');
            if (selected.some(email => !(snapshot.data().members || []).includes(email))) throw new Error('팀원 목록이 변경되었습니다. 창을 닫고 다시 선택해 주세요.');
            tx.update(ref, { [context.field]: selected });
        });
        permissionMessage('담당자 권한이 저장되었습니다.');
        alert('담당자 권한이 저장되었습니다. 최신 권한을 반영하기 위해 새로고침합니다.');
        location.reload();
    } catch (error) {
        console.error('[permissions] save failed', error);
        permissionMessage(permissionError(error), true);
    } finally {
        clearTimeout(slow); permissionSaving = false;
        if (button) { button.disabled = false; button.textContent = '권한 저장'; }
        checks.forEach(cb => cb.disabled = false);
    }
}

window.checkTeamUI = checkTeamUI;
window.loadTeamMembers = loadTeamMembers;
window.joinTeam = joinTeam;
window.createTeam = createTeam;
window.regenerateInviteCode = regenerateInviteCode;
window.kickMember = kickMember;
window.toggleAdmin = toggleAdmin;
window.openPermModal = openPermModal;
window.savePerms = savePerms;

// Membership approval prevents self-joining from bypassing meeting access rules.
async function loadTeamJoinRequests() {
    const host = document.getElementById('member-list');
    if (!host || !myTeamId) return;
    let panel = document.getElementById('team-join-requests');
    if (!panel) { panel = document.createElement('div'); panel.id = 'team-join-requests'; host.after(panel); }
    panel.replaceChildren();
    if (!['owner', 'admin'].includes(myRole)) return;
    const targetTeam = myTeamId;
    try {
        const snapshot = await db.collection('teams').doc(targetTeam).collection('joinRequests').get();
        if (targetTeam !== myTeamId || snapshot.empty) return;
        const heading = document.createElement('h6'); heading.className = 'mt-4 mb-3'; heading.textContent = '팀 가입 요청'; panel.append(heading);
        snapshot.forEach(doc => {
            const data = doc.data(), row = document.createElement('div'); row.className = 'd-flex flex-wrap gap-2 align-items-center mb-2';
            const text = document.createElement('span'); text.className = 'flex-grow-1'; text.textContent = `${data.nickname} (${data.email})`; row.append(text);
            for (const [label, approve] of [['승인', true], ['거절', false]]) {
                const button = document.createElement('button'); button.className = 'btn btn-sm ' + (approve ? 'btn-primary' : 'btn-outline-secondary'); button.textContent = label;
                button.onclick = async () => {
                    if (!confirm(`${data.email}님의 가입 요청을 ${label}하시겠습니까?`)) return;
                    row.querySelectorAll('button').forEach(b => b.disabled = true);
                    try {
                        const teamRef = db.collection('teams').doc(targetTeam), requestRef = teamRef.collection('joinRequests').doc(doc.id);
                        await db.runTransaction(async tx => {
                            const team = await tx.get(teamRef), request = await tx.get(requestRef);
                            if (!team.exists || !request.exists) throw new Error('이미 처리되었거나 없는 요청입니다.');
                            if (approve) tx.update(teamRef, { members: Array.from(new Set([...(team.data().members || []), request.data().email])) });
                            tx.delete(requestRef);
                        });
                        await loadTeamMembers();
                    } catch (error) { alert('요청 처리 실패: ' + error.message); row.querySelectorAll('button').forEach(b => b.disabled = false); }
                };
                row.append(button);
            }
            panel.append(row);
        });
    } catch (error) { panel.textContent = '가입 요청을 불러오지 못했습니다. 관리자에게 Firebase 규칙 적용 여부를 확인해 주세요.'; }
}
