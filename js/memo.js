    // 메모장
    let currentMemoTab = 'private';
    // 💡 이전버전: 메모 수정 모드 상태 + 색상 선택 💡
    let editingMemoId = null;
    let selectedMemoColor = '#fff9db'; // 기본 노란색
    // 💡 이전버전: loadMemos - 카드별 색상 + 수정 버튼 + 구버전 데이터 방어 💡
    function loadMemos() {
        db.collection("team_memos").where("teamId", "==", myTeamId).onSnapshot(ss => {
            let memos = ss.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b)=>b.createdAt-a.createdAt);
            const filtered = memos.filter(m => m.type === currentMemoTab && (m.type === 'shared' || m.writer === myEmail));

            if(filtered.length === 0) {
                document.getElementById('memoContainer').innerHTML = '<p class="text-secondary small">메모가 없습니다.</p>';
                return;
            }

            document.getElementById('memoContainer').innerHTML = filtered.map(m => {
                // 방어 로직: 색상/날짜/내용 누락 시 기본값
                const safeText = (m.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const safeDate = m.dateStr || '';
                // 구버전 데이터 호환: color 없으면 노랑 기본
                const bgColor = m.color || '#fff9db';
                // 공유 메모는 좌측 보더만 유지 (배경색은 사용자 선택대로)
                const sharedClass = m.type === 'shared' ? 'shared' : '';

                return `<div class="memo-card ${sharedClass}" style="background-color: ${bgColor};">
                    <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom border-secondary border-opacity-10">
                        <span class="small text-secondary">${safeDate}</span>
                        <div class="memo-card-actions">
                            <i class="bi bi-pencil-square memo-edit-btn" onclick="editMemo('${m.id}')" title="수정"></i>
                            <i class="bi bi-x-lg memo-del-btn" onclick="delMemo('${m.id}')" title="삭제"></i>
                        </div>
                    </div>
                    <div style="white-space:pre-wrap; font-size:0.9rem;">${safeText}</div>
                </div>`;
            }).join('');
        });
    }
    // 💡 V36 FIX: switchMemoTab - event 없이 호출돼도 안전하게 동작 💡
    function switchMemoTab(tab, btnEl) {
        currentMemoTab = tab;
        document.querySelectorAll('#memoTabs .nav-link').forEach(l => l.classList.remove('active'));
        let target = btnEl || (typeof event !== 'undefined' && event && event.target) || null;
        if(!target) target = document.querySelector(`#memoTabs .nav-link[onclick*="'${tab}'"]`);
        if(target && target.classList) target.classList.add('active');
        loadMemos();
    }
    
    // 💡 이전버전: 메모 저장 - 신규작성 또는 수정 (editingMemoId 분기) 💡
    async function saveNewMemo() {
        let title = document.getElementById('memoTitleInput').value.trim();
        let text = document.getElementById('memoTextInput').value.trim();
        let isShared = document.getElementById('memoSharedCheck').checked;
        if(!text) return alert("내용을 입력하세요.");

        let fullText = title ? `[${title}]\n${text}` : text;
        let type = isShared ? 'shared' : 'private';

        // 선택된 색상 가져오기 (라디오 버튼)
        const colorRadio = document.querySelector('input[name="memoColor"]:checked');
        const memoColor = colorRadio ? colorRadio.value : '#fff9db';

        try {
            if(editingMemoId) {
                // 💡 수정 모드: 기존 문서 업데이트 (writer, createdAt, dateStr은 보존)
                await db.collection("team_memos").doc(editingMemoId).update({
                    type, text: fullText, color: memoColor, updatedAt: Date.now()
                });
            } else {
                // 💡 신규 작성 모드
                let dStr = new Date().toISOString().split('T')[0];
                await db.collection("team_memos").add({
                    teamId: myTeamId, type, text: fullText, color: memoColor,
                    writer: myEmail, dateStr: dStr, createdAt: Date.now()
                });
            }
            switchMemoTab(type);
        } catch(e) {
            console.error('메모 저장 오류:', e);
            alert('메모 저장 중 오류가 발생했습니다: ' + e.message);
        } finally {
            // finally - 저장 성공/실패 무관하게 항상 모달 닫기 + 초기화
            closeMemoCreateModal();
        }
    }

    // 💡 이전버전: 메모 수정 모드 진입 - 기존 데이터 폼에 채우고 모달 열기 💡
    async function editMemo(id) {
        try {
            const doc = await db.collection("team_memos").doc(id).get();
            if(!doc.exists) return alert("메모를 찾을 수 없습니다.");
            const m = doc.data();

            editingMemoId = id;

            // 제목/내용 분리 복원: [제목]\n내용 형식이면 분리, 아니면 전부 내용으로
            let title = '';
            let text = m.text || '';
            const titleMatch = text.match(/^\[([^\]]+)\]\n([\s\S]*)$/);
            if(titleMatch) {
                title = titleMatch[1];
                text = titleMatch[2];
            }

            document.getElementById('memoTitleInput').value = title;
            document.getElementById('memoTextInput').value = text;
            document.getElementById('memoSharedCheck').checked = (m.type === 'shared');

            // 색상 라디오 선택 복원 (없으면 노랑)
            const targetColor = m.color || '#fff9db';
            const radio = document.querySelector(`input[name="memoColor"][value="${targetColor}"]`);
            if(radio) radio.checked = true;
            else {
                const yellow = document.querySelector('input[name="memoColor"][value="#fff9db"]');
                if(yellow) yellow.checked = true;
            }

            // 모달 제목 + 저장 버튼 텍스트를 수정 모드로 변경
            const titleEl = document.getElementById('memoModalTitle');
            const saveBtn = document.getElementById('memoSaveBtn');
            if(titleEl) titleEl.innerText = '메모 수정';
            if(saveBtn) saveBtn.innerText = '수정 완료';

            document.getElementById('memoCreateModal').style.display = 'flex';
        } catch(e) {
            console.error('메모 불러오기 오류:', e);
            alert('메모를 불러올 수 없습니다.');
        }
    }

    // 💡 이전버전: 메모 작성 모달 열기 (신규 모드, 항상 깨끗한 상태) 💡
    function openMemoCreateModal() {
        editingMemoId = null;  // 신규 모드 보장
        document.getElementById('memoTitleInput').value = '';
        document.getElementById('memoTextInput').value = '';
        document.getElementById('memoSharedCheck').checked = false;

        // 색상 기본값(노랑)으로 리셋
        const yellow = document.querySelector('input[name="memoColor"][value="#fff9db"]');
        if(yellow) yellow.checked = true;

        // 모달 제목 + 버튼 텍스트 신규 모드로 복귀
        const titleEl = document.getElementById('memoModalTitle');
        const saveBtn = document.getElementById('memoSaveBtn');
        if(titleEl) titleEl.innerText = '새 메모 작성';
        if(saveBtn) saveBtn.innerText = '작성 완료';

        document.getElementById('memoCreateModal').style.display = 'flex';
    }

    // 💡 이전버전: 메모 작성 모달 닫기 + editingMemoId 초기화 필수 💡
    function closeMemoCreateModal() {
        document.getElementById('memoCreateModal').style.display = 'none';
        document.getElementById('memoTitleInput').value = '';
        document.getElementById('memoTextInput').value = '';
        document.getElementById('memoSharedCheck').checked = false;

        // 색상 라디오 노랑으로 리셋
        const yellow = document.querySelector('input[name="memoColor"][value="#fff9db"]');
        if(yellow) yellow.checked = true;

        // 모달 제목 + 버튼 텍스트 신규 모드로 복귀
        const titleEl = document.getElementById('memoModalTitle');
        const saveBtn = document.getElementById('memoSaveBtn');
        if(titleEl) titleEl.innerText = '새 메모 작성';
        if(saveBtn) saveBtn.innerText = '작성 완료';

        editingMemoId = null;  // ⚠️ 반드시 초기화 (수정 모드 잔재 제거)
    }
    async function delMemo(id) { if(confirm("삭제하시겠습니까?")) await db.collection("team_memos").doc(id).delete(); }

window.loadMemos = loadMemos;
window.switchMemoTab = switchMemoTab;
window.saveNewMemo = saveNewMemo;
window.editMemo = editMemo;
window.openMemoCreateModal = openMemoCreateModal;
window.closeMemoCreateModal = closeMemoCreateModal;
window.delMemo = delMemo;
