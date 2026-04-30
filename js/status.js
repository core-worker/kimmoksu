    let isStatusEditMode = false;

    function toggleStatusEditMode() {
        if(!canUseIntegratedEditMode()) {
            alert("편집 권한이 없습니다.");
            return;
        }
        isStatusEditMode = !isStatusEditMode;
        const btn = document.getElementById('btnEditStatus');
        if(btn) btn.classList.toggle('active', isStatusEditMode);
        renderAllSections(globalStatusData);
        renderBoardMemos();
    }

    function loadAllStatusData() {
        db.collection("site_status").where("teamId", "==", myTeamId).onSnapshot(ss => {
            // 💡 V34 FIX: Falsy 함정 해결 - order=0 일 때 createdAt으로 튕겨나가는 버그 수정 💡
            // (a.order || a.createdAt) → 0이 falsy로 처리되어 0번째 자리 이동 시 맨 아래로 튕김
            // !== undefined 로 명시적 체크하여 0도 유효한 순서값으로 인식
            globalStatusData = ss.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => {
                const aOrder = (a.order !== undefined && a.order !== null) ? a.order : a.createdAt;
                const bOrder = (b.order !== undefined && b.order !== null) ? b.order : b.createdAt;
                return aOrder - bOrder;
            });
            renderAllSections(globalStatusData);
        });
    }
    
    // 💡 V32: 상황판 렌더링 - 드래그앤드롭 방식으로 전면 교체 💡
    let statusSortables = {};

    function renderAllSections(data) {
        let isSuper = (myRole === 'owner' || myRole === 'admin');
        let canEditStatus = isSuper || globalStatusAdmins.includes(myEmail);

const sections = [
            { key: 'ongoing', icon: 'bi-tools', title: '공사 진행 중', h: '<tr><th style="width:18%;">현장명</th><th style="width:12%;">착공일</th><th style="width:12%;">예정준공일</th><th style="width:12%;">소장</th><th style="width:12%;">디자이너</th><th style="width:12%;">싸인</th><th style="width:15%;">비고</th><th style="width:90px; min-width:90px; text-align:center;">관리</th></tr>' }, 
            { key: 'scheduled', icon: 'bi-calendar-event', title: '공사 착공 예정', h: '<tr><th style="width:20%;">상호명</th><th style="width:15%;">착공예정</th><th style="width:15%;">준공예정</th><th style="width:15%;">예상소장</th><th style="width:20%;">비고</th><th style="width:90px; min-width:90px; text-align:center;">관리</th></tr>' }, 
            { key: 'designing', icon: 'bi-palette', title: '디자인 진행 중', h: '<tr><th style="width:20%;">상호명</th><th style="width:15%;">디자인마감</th><th style="width:15%;">착공예정</th><th style="width:15%;">디자이너</th><th style="width:20%;">비고</th><th style="width:90px; min-width:90px; text-align:center;">관리</th></tr>' }, 
            { key: 'pre-design', icon: 'bi-pencil-square', title: '디자인 예정', h: '<tr><th style="width:25%;">상호명</th><th style="width:20%;">마감시기</th><th style="width:40%;">비고</th><th style="width:90px; min-width:90px; text-align:center;">관리</th></tr>' }
        ];
        
        document.getElementById('all-status-containers').innerHTML = sections.map(sec => {
            const items = data.filter(d => d.status === sec.key);
            
            // PC 테이블 행 (드래그 핸들 포함)
            let tableRows = items.length === 0 
                ? `<tr><td colspan="10" class="text-secondary py-4">등록된 데이터가 없습니다.</td></tr>` 
                : items.map((item) => {
                    let dragHandle = (isStatusEditMode && canEditStatus) 
                        ? `<i class="bi bi-grip-vertical drag-handle text-secondary me-1" style="font-size:0.85rem; vertical-align:middle;"></i>` 
                        : '';
                    return `<tr data-id="${item.id}">
                        <td class="fw-bold" style="color:var(--primary-accent);">${dragHandle}${item.siteName}</td>
                        <td>${item.date1 || '-'}</td>
                        ${sec.key !== 'pre-design' ? `<td>${item.date2 || '-'}</td>` : ''}
                        ${sec.key === 'ongoing' ? `<td>${item.site_manager || '-'}</td><td>${item.designer || '-'}</td><td>${item.designer_sign || '-'}</td>` : ''}
                        ${sec.key === 'scheduled' ? `<td>${item.site_manager || '-'}</td>` : ''}
                        ${sec.key === 'designing' ? `<td>${item.designer || '-'}</td>` : ''}
                        <td class="text-secondary text-start ps-3">${item.etc || '-'}</td>
                        <td class="text-nowrap" style="padding:0 5px;">
                            ${canEditStatus ? `<button class="btn btn-sm btn-outline-primary py-0 px-2 me-1" onclick="openSiteEditModal('${item.id}')"><i class="bi bi-pencil-square"></i></button>` : ''}
                            ${(canEditStatus && isStatusEditMode) ? `<button class="btn btn-sm btn-danger py-0 px-2" onclick="deleteSite('${item.id}')">삭제</button>` : ''}
                        </td>
                    </tr>`;
                }).join('');
            
            // 모바일 카드
            let cards = items.length === 0 
                ? `<p class="text-center text-secondary py-3 small" style="background:#1e222d; border-radius:12px;">등록된 데이터가 없습니다.</p>` 
                : items.map((item) => {
                    let dragHandle = (isStatusEditMode && canEditStatus) 
                        ? `<i class="bi bi-grip-vertical drag-handle fs-5 me-2 text-secondary"></i>` : '';
                    const btnHTML = `
                        <div class="d-flex gap-1 align-items-center flex-shrink-0">
                            ${canEditStatus ? `<button class="btn btn-sm btn-outline-primary px-2 py-0" onclick="openSiteEditModal('${item.id}')"><i class="bi bi-pencil-square"></i> 수정</button>` : ''}
                            ${(canEditStatus && isStatusEditMode) ? `<button class="btn btn-sm btn-danger px-2 py-0" onclick="deleteSite('${item.id}')">삭제</button>` : ''}
                        </div>`;
                    let etcHTML = ''; 
                    if(item.etc) { 
                        if(sec.key === 'pre-design') etcHTML = `<div class="text-secondary small mt-2 text-truncate">${item.etc}</div>`; 
                        else { const cid = `etc-${item.id}`; etcHTML = `<div class="text-secondary small mt-2 cursor-pointer" data-bs-toggle="collapse" data-bs-target="#${cid}"><i class="bi bi-chat-square-text"></i> 메모 보기 <i class="bi bi-chevron-down"></i></div><div class="collapse" id="${cid}"><div class="mt-2 text-secondary small bg-dark p-2 rounded">${item.etc}</div></div>`; } 
                    }
                    let dateStr = "";
                    if(sec.key === 'ongoing') dateStr = `${item.date1 || '-'} ~ ${item.date2 || '-'}`;
                    else if(sec.key === 'scheduled') dateStr = `착공: ${item.date1 || '-'} | 준공: ${item.date2 || '-'}`;
                    else if(sec.key === 'designing') dateStr = `디자인: ${item.date1 || '-'} | 착공: ${item.date2 || '-'}`;
                    else dateStr = `마감: ${item.date1 || '-'}`;
                    let gridHTML = "";
                    if(sec.key === 'ongoing') gridHTML = `<div class="mobile-grid-3"><div><div class="mobile-grid-label">담당소장</div><div class="mobile-grid-val">${item.site_manager || '-'}</div></div><div><div class="mobile-grid-label">디자이너</div><div class="mobile-grid-val">${item.designer || '-'}</div></div><div><div class="mobile-grid-label">싸인담당</div><div class="mobile-grid-val">${item.designer_sign || '-'}</div></div></div>`;
                    else if(sec.key === 'scheduled') gridHTML = `<div class="mobile-grid-3" style="grid-template-columns:1fr;"><div class="text-start ps-2"><span class="mobile-grid-label me-2">예상소장:</span><span class="mobile-grid-val">${item.site_manager || '-'}</span></div></div>`;
                    else if(sec.key === 'designing') gridHTML = `<div class="mobile-grid-3" style="grid-template-columns:1fr;"><div class="text-start ps-2"><span class="mobile-grid-label me-2">디자이너:</span><span class="mobile-grid-val">${item.designer || '-'}</span></div></div>`;
                    return `<div class="mobile-site-card" data-id="${item.id}"><div class="d-flex align-items-center">${dragHandle}<div class="flex-grow-1 overflow-hidden" style="min-width: 0;"><h6 class="mobile-card-title text-truncate">${item.siteName}</h6><div class="mobile-card-subtitle"><span class="mobile-card-date flex-grow-1 text-truncate pe-2" style="min-width: 0;">${dateStr}</span>${btnHTML}</div>${gridHTML}${etcHTML}</div></div></div>`;
                }).join('');
            
            return `<div class="mb-5">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="fw-bold m-0"><i class="bi ${sec.icon} me-2 text-primary"></i>${sec.title} <span class="badge rounded-pill bg-dark ms-2" style="font-size:0.7rem;">${items.length}건</span></h5>
                    <button class="btn btn-sm btn-outline-success px-3 fw-bold" onclick="openSiteAddModal('${sec.key}')">+ 추가</button>
                </div>
                <div class="d-none d-md-block t5-card p-0 overflow-hidden">
                    <table class="status-table" id="status-table-${sec.key}"><thead>${sec.h}</thead><tbody id="status-tbody-${sec.key}">${tableRows}</tbody></table>
                </div>
                <div class="d-md-none" id="status-cards-${sec.key}">${cards}</div>
            </div>`;
        }).join('');

        // 💡 V33 FIX: 렌더링 끝난 직후 Sortable 재초기화 - 깜빡임 방지 + 매번 보장 💡
        // requestAnimationFrame으로 DOM 그리기 완료 후 실행
        requestAnimationFrame(() => {
            initStatusSortables(data, isStatusEditMode && canEditStatus);
        });
    }

    // 💡 V33 FIX: Sortable 인스턴스 재초기화 전용 함수 (파괴 → 재건축 사이클) 💡
    function initStatusSortables(data, enable) {
        // STEP 1: 기존 인스턴스 무조건 전부 파괴 (먹통 방지의 핵심!)
        Object.keys(statusSortables).forEach(k => {
            try { statusSortables[k].destroy(); } catch(e) { /* 이미 파괴됐으면 무시 */ }
        });
        statusSortables = {};

        // STEP 2: 편집 모드 OFF일 때는 종료 (파괴만 하고 재생성 안 함)
        if(!enable) return;

        // STEP 3: 편집 모드 ON일 때만 새로 바인딩
        const sectionKeys = ['ongoing', 'scheduled', 'designing', 'pre-design'];
        sectionKeys.forEach(secKey => {
            const items = data.filter(d => d.status === secKey);
            if(items.length === 0) return;

            // PC 테이블 Sortable 재생성
            const tbody = document.getElementById(`status-tbody-${secKey}`);
            if(tbody) {
                statusSortables[`table-${secKey}`] = Sortable.create(tbody, {
                    handle: '.drag-handle',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    dragClass: 'sortable-drag',
                    onEnd: async function(evt) {
                        // 순서가 실제로 바뀐 경우에만 DB 업데이트
                        if(evt.oldIndex !== evt.newIndex) {
                            await saveStatusOrder(secKey);
                        }
                    }
                });
            }

            // 모바일 카드 Sortable 재생성
            const cards = document.getElementById(`status-cards-${secKey}`);
            if(cards) {
                statusSortables[`cards-${secKey}`] = Sortable.create(cards, {
                    handle: '.drag-handle',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    dragClass: 'sortable-drag',
                    onEnd: async function(evt) {
                        if(evt.oldIndex !== evt.newIndex) {
                            await saveStatusOrder(secKey);
                        }
                    }
                });
            }
        });
    }

    // 💡 V32: Sortable 순서 Firebase 저장 💡
    // 💡 V33 FIX: 순서 저장 - 화면에 보이는 영역 기준으로 우선 저장 (PC/모바일 자동 분기) 💡
    async function saveStatusOrder(secKey) {
        const batch = db.batch();
        const seenIds = new Set();  // 중복 방지

        // PC 테이블에서 먼저 수집
        const rows = document.querySelectorAll(`#status-tbody-${secKey} tr[data-id]`);
        let idx = 0;
        rows.forEach(row => {
            const id = row.getAttribute('data-id');
            if(id && !seenIds.has(id)) {
                seenIds.add(id);
                batch.update(db.collection("site_status").doc(id), { order: idx++ });
            }
        });

        // 모바일 카드도 별도로 수집 (PC가 비어있는 모바일 환경 대응)
        if(seenIds.size === 0) {
            const cards = document.querySelectorAll(`#status-cards-${secKey} [data-id]`);
            cards.forEach(card => {
                const id = card.getAttribute('data-id');
                if(id && !seenIds.has(id)) {
                    seenIds.add(id);
                    batch.update(db.collection("site_status").doc(id), { order: idx++ });
                }
            });
        }

        if(seenIds.size > 0) {
            try {
                await batch.commit();
            } catch(e) {
                console.error('순서 저장 실패:', e);
                alert('순서 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
            }
        }
    }

        // 💡 V32: changeStatusOrder 제거 - 드래그앤드롭(saveStatusOrder)으로 대체됨 💡
    
    function openSiteAddModal(targetStatus = 'ongoing') { siteEditingId = null; document.getElementById('modalTitle').innerText = "신규 현장 등록"; document.getElementById('siteForm').querySelectorAll('input, textarea').forEach(i => i.value = ''); document.getElementById('f_status').value = targetStatus; toggleSiteFormFields(targetStatus); siteModal.show(); }
    async function openSiteEditModal(id) { siteEditingId = id; document.getElementById('modalTitle').innerText = "데이터 수정 및 단계 변경"; const d = (await db.collection("site_status").doc(id).get()).data(); document.getElementById('f_status').value = d.status; document.getElementById('f_siteName').value = d.siteName; document.getElementById('f_date1').value = d.date1 || ''; document.getElementById('f_date2').value = d.date2 || ''; document.getElementById('f_site_manager').value = d.site_manager || ''; document.getElementById('f_designer').value = d.designer || ''; document.getElementById('f_designer_sign').value = d.designer_sign || ''; document.getElementById('f_etc').value = d.etc || ''; toggleSiteFormFields(d.status); siteModal.show(); }
    function handleStatusChange(val) { document.getElementById('f_date1').value = ''; document.getElementById('f_date2').value = ''; document.getElementById('f_site_manager').value = ''; document.getElementById('f_designer').value = ''; document.getElementById('f_designer_sign').value = ''; toggleSiteFormFields(val); }
    function toggleSiteFormFields(val) { const d1 = document.getElementById('f_date1'), d2 = document.getElementById('f_date2'), siteM = document.getElementById('f_site_manager'), desM = document.getElementById('f_designer'), signM = document.getElementById('ongoing_only'); if(val === 'ongoing') { d1.placeholder = "착공일"; d2.placeholder = "준공예정일"; siteM.parentElement.style.display = 'block'; desM.parentElement.style.display = 'block'; signM.style.display = 'block'; } else if(val === 'scheduled') { d1.placeholder = "착공예정"; d2.placeholder = "준공예정"; siteM.parentElement.style.display = 'block'; desM.parentElement.style.display = 'none'; signM.style.display = 'none'; } else if(val === 'designing') { d1.placeholder = "디자인마감"; d2.placeholder = "착공예정"; siteM.parentElement.style.display = 'none'; desM.parentElement.style.display = 'block'; signM.style.display = 'none'; } else { d1.placeholder = "마감시기 (예: 4월 말)"; d2.style.display = 'none'; siteM.parentElement.style.display = 'none'; desM.parentElement.style.display = 'none'; signM.style.display = 'none'; } }
    async function saveSiteData() { const data = { teamId: myTeamId, status: document.getElementById('f_status').value, siteName: document.getElementById('f_siteName').value.trim(), date1: document.getElementById('f_date1').value, date2: document.getElementById('f_date2').value, site_manager: document.getElementById('f_site_manager').value, designer: document.getElementById('f_designer').value, designer_sign: document.getElementById('f_designer_sign').value, etc: document.getElementById('f_etc').value, updatedAt: Date.now() }; if(!data.siteName) return alert("현장명을 입력해주세요."); if(siteEditingId) await db.collection("site_status").doc(siteEditingId).update(data); else await db.collection("site_status").add({ ...data, createdAt: Date.now(), order: Date.now() }); siteModal.hide(); }
    async function deleteSite(id) { if(confirm("이 현장을 삭제하시겠습니까?")) await db.collection("site_status").doc(id).delete(); }

window.toggleStatusEditMode = toggleStatusEditMode;
window.loadAllStatusData = loadAllStatusData;
window.renderAllSections = renderAllSections;
window.initStatusSortables = initStatusSortables;
window.saveStatusOrder = saveStatusOrder;
window.openSiteAddModal = openSiteAddModal;
window.openSiteEditModal = openSiteEditModal;
window.handleStatusChange = handleStatusChange;
window.toggleSiteFormFields = toggleSiteFormFields;
window.saveSiteData = saveSiteData;
window.deleteSite = deleteSite;
