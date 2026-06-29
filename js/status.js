    let siteEditingId = null;
    let globalStatusData = [];

let isStatusEditMode = false;

function toggleStatusEditMode() {
    if (!canUseIntegratedEditMode()) {
        alert("편집 권한이 없습니다.");
        return;
    }

    isStatusEditMode = !isStatusEditMode;

    const btn = document.getElementById('btnEditStatus');
    if (btn) btn.classList.toggle('active', isStatusEditMode);

    renderAllSections(globalStatusData);
    renderBoardMemos();
}

function loadAllStatusData() {
    db.collection("site_status").where("teamId", "==", myTeamId).onSnapshot(ss => {
        globalStatusData = ss.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => {
            const aOrder = (a.order !== undefined && a.order !== null) ? a.order : a.createdAt;
            const bOrder = (b.order !== undefined && b.order !== null) ? b.order : b.createdAt;
            return aOrder - bOrder;
        });

        renderAllSections(globalStatusData);
    });
}

let statusSortables = {};

function renderAllSections(data) {
    let isSuper = (myRole === 'owner' || myRole === 'admin');
    let canEditStatus = isSuper || globalStatusAdmins.includes(myEmail);

    const sections = [
        { key: 'ongoing', icon: 'bi-tools', title: '공사 진행 중', h: '<tr><th style="width:18%;">현장명</th><th style="width:12%;">착공일</th><th style="width:12%;">예정준공일</th><th style="width:12%;">소장</th><th style="width:12%;">디자이너</th><th style="width:12%;">싸인</th><th style="width:15%;">비고</th><th class="status-manage-col" style="width:90px; min-width:90px; text-align:center;">관리</th></tr>' },
        { key: 'scheduled', icon: 'bi-calendar-event', title: '공사 착공 예정', h: '<tr><th style="width:20%;">상호명</th><th style="width:15%;">착공예정</th><th style="width:15%;">준공예정</th><th style="width:15%;">예상소장</th><th style="width:20%;">비고</th><th class="status-manage-col" style="width:90px; min-width:90px; text-align:center;">관리</th></tr>' },
        { key: 'designing', icon: 'bi-palette', title: '디자인 진행 중', h: '<tr><th style="width:20%;">상호명</th><th style="width:15%;">디자인마감</th><th style="width:15%;">착공예정</th><th style="width:15%;">디자이너</th><th style="width:20%;">비고</th><th class="status-manage-col" style="width:90px; min-width:90px; text-align:center;">관리</th></tr>' },
        { key: 'pre-design', icon: 'bi-pencil-square', title: '디자인 예정', h: '<tr><th style="width:25%;">상호명</th><th style="width:20%;">마감시기</th><th style="width:40%;">비고</th><th class="status-manage-col" style="width:90px; min-width:90px; text-align:center;">관리</th></tr>' }
    ];

    const container = document.getElementById('all-status-containers');
    if (!container) return;

    container.innerHTML = sections.map(sec => {
        const items = data.filter(d => d.status === sec.key);

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
                    <td class="text-nowrap status-manage-col" style="padding:0 5px;">
                        ${canEditStatus ? `<button class="btn btn-sm btn-outline-primary py-0 px-2 me-1" onclick="openSiteEditModal('${item.id}')"><i class="bi bi-pencil-square"></i></button>` : ''}
                        ${(canEditStatus && isStatusEditMode) ? `<button class="btn btn-sm btn-danger py-0 px-2" onclick="deleteSite('${item.id}')">삭제</button>` : ''}
                    </td>
                </tr>`;
            }).join('');

        let cards = items.length === 0
            ? `<p class="text-center text-secondary py-3 small" style="background:#1e222d; border-radius:12px;">등록된 데이터가 없습니다.</p>`
            : items.map((item) => {
                let dragHandle = (isStatusEditMode && canEditStatus)
                    ? `<i class="bi bi-grip-vertical drag-handle fs-5 me-2 text-secondary"></i>`
                    : '';

                const btnHTML = `
                    <div class="d-flex gap-1 align-items-center flex-shrink-0 status-capture-hide">
                        ${canEditStatus ? `<button class="btn btn-sm btn-outline-primary px-2 py-0" onclick="openSiteEditModal('${item.id}')"><i class="bi bi-pencil-square"></i> 수정</button>` : ''}
                        ${(canEditStatus && isStatusEditMode) ? `<button class="btn btn-sm btn-danger px-2 py-0" onclick="deleteSite('${item.id}')">삭제</button>` : ''}
                    </div>`;

                let etcHTML = '';
                if (item.etc) {
                    if (sec.key === 'pre-design') {
                        etcHTML = `<div class="text-secondary small mt-2 text-truncate">${item.etc}</div>`;
                    } else {
                        const cid = `etc-${item.id}`;
                        etcHTML = `<div class="text-secondary small mt-2 cursor-pointer" data-bs-toggle="collapse" data-bs-target="#${cid}"><i class="bi bi-chat-square-text"></i> 메모 보기 <i class="bi bi-chevron-down"></i></div><div class="collapse" id="${cid}"><div class="mt-2 text-secondary small bg-dark p-2 rounded">${item.etc}</div></div>`;
                    }
                }

                let dateStr = "";
                if (sec.key === 'ongoing') dateStr = `${item.date1 || '-'} ~ ${item.date2 || '-'}`;
                else if (sec.key === 'scheduled') dateStr = `착공: ${item.date1 || '-'} | 준공: ${item.date2 || '-'}`;
                else if (sec.key === 'designing') dateStr = `디자인: ${item.date1 || '-'} | 착공: ${item.date2 || '-'}`;
                else dateStr = `마감: ${item.date1 || '-'}`;

                let gridHTML = "";
                if (sec.key === 'ongoing') {
                    gridHTML = `<div class="mobile-grid-3"><div><div class="mobile-grid-label">담당소장</div><div class="mobile-grid-val">${item.site_manager || '-'}</div></div><div><div class="mobile-grid-label">디자이너</div><div class="mobile-grid-val">${item.designer || '-'}</div></div><div><div class="mobile-grid-label">싸인담당</div><div class="mobile-grid-val">${item.designer_sign || '-'}</div></div></div>`;
                } else if (sec.key === 'scheduled') {
                    gridHTML = `<div class="mobile-grid-3" style="grid-template-columns:1fr;"><div class="text-start ps-2"><span class="mobile-grid-label me-2">예상소장:</span><span class="mobile-grid-val">${item.site_manager || '-'}</span></div></div>`;
                } else if (sec.key === 'designing') {
                    gridHTML = `<div class="mobile-grid-3" style="grid-template-columns:1fr;"><div class="text-start ps-2"><span class="mobile-grid-label me-2">디자이너:</span><span class="mobile-grid-val">${item.designer || '-'}</span></div></div>`;
                }

                return `<div class="mobile-site-card" data-id="${item.id}"><div class="d-flex align-items-center">${dragHandle}<div class="flex-grow-1 overflow-hidden" style="min-width: 0;"><h6 class="mobile-card-title text-truncate">${item.siteName}</h6><div class="mobile-card-subtitle"><span class="mobile-card-date flex-grow-1 text-truncate pe-2" style="min-width: 0;">${dateStr}</span>${btnHTML}</div>${gridHTML}${etcHTML}</div></div></div>`;
            }).join('');

        return `<div class="mb-5">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="fw-bold m-0"><i class="bi ${sec.icon} me-2 text-primary"></i>${sec.title} <span class="badge rounded-pill bg-dark ms-2" style="font-size:0.7rem;">${items.length}건</span></h5>
                <button class="btn btn-sm btn-outline-success px-3 fw-bold status-capture-hide" onclick="openSiteAddModal('${sec.key}')">+ 추가</button>
            </div>
            <div class="d-none d-md-block t5-card p-0 overflow-hidden">
                <table class="status-table" id="status-table-${sec.key}"><thead>${sec.h}</thead><tbody id="status-tbody-${sec.key}">${tableRows}</tbody></table>
            </div>
            <div class="d-md-none" id="status-cards-${sec.key}">${cards}</div>
        </div>`;
    }).join('');

    requestAnimationFrame(() => {
        initStatusSortables(data, isStatusEditMode && canEditStatus);
    });
}

function initStatusSortables(data, enable) {
    Object.keys(statusSortables).forEach(k => {
        try { statusSortables[k].destroy(); } catch (e) {}
    });

    statusSortables = {};

    if (!enable) return;

    const sectionKeys = ['ongoing', 'scheduled', 'designing', 'pre-design'];

    sectionKeys.forEach(secKey => {
        const items = data.filter(d => d.status === secKey);
        if (items.length === 0) return;

        const tbody = document.getElementById(`status-tbody-${secKey}`);
        if (tbody) {
            statusSortables[`table-${secKey}`] = Sortable.create(tbody, {
                handle: '.drag-handle',
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                onEnd: async function(evt) {
                    if (evt.oldIndex !== evt.newIndex) await saveStatusOrder(secKey);
                }
            });
        }

        const cards = document.getElementById(`status-cards-${secKey}`);
        if (cards) {
            statusSortables[`cards-${secKey}`] = Sortable.create(cards, {
                handle: '.drag-handle',
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                onEnd: async function(evt) {
                    if (evt.oldIndex !== evt.newIndex) await saveStatusOrder(secKey);
                }
            });
        }
    });
}

async function saveStatusOrder(secKey) {
    const batch = db.batch();
    const seenIds = new Set();

    const rows = document.querySelectorAll(`#status-tbody-${secKey} tr[data-id]`);
    let idx = 0;

    rows.forEach(row => {
        const id = row.getAttribute('data-id');
        if (id && !seenIds.has(id)) {
            seenIds.add(id);
            batch.update(db.collection("site_status").doc(id), { order: idx++ });
        }
    });

    if (seenIds.size === 0) {
        const cards = document.querySelectorAll(`#status-cards-${secKey} [data-id]`);
        cards.forEach(card => {
            const id = card.getAttribute('data-id');
            if (id && !seenIds.has(id)) {
                seenIds.add(id);
                batch.update(db.collection("site_status").doc(id), { order: idx++ });
            }
        });
    }

    if (seenIds.size > 0) {
        try {
            await batch.commit();
        } catch (e) {
            console.error('순서 저장 실패:', e);
            alert('순서 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
}

function openSiteAddModal(targetStatus = 'ongoing') {
    siteEditingId = null;

    document.getElementById('modalTitle').innerText = "신규 현장 등록";
    document.getElementById('siteForm').querySelectorAll('input, textarea').forEach(i => i.value = '');
    document.getElementById('f_status').value = targetStatus;

    toggleSiteFormFields(targetStatus);

    siteModal.show();
}

async function openSiteEditModal(id) {
    siteEditingId = id;

    document.getElementById('modalTitle').innerText = "데이터 수정 및 단계 변경";

    const d = (await db.collection("site_status").doc(id).get()).data();

    document.getElementById('f_status').value = d.status;
    document.getElementById('f_siteName').value = d.siteName;
    document.getElementById('f_date1').value = d.date1 || '';
    document.getElementById('f_date2').value = d.date2 || '';
    document.getElementById('f_site_manager').value = d.site_manager || '';
    document.getElementById('f_designer').value = d.designer || '';
    document.getElementById('f_designer_sign').value = d.designer_sign || '';
    document.getElementById('f_etc').value = d.etc || '';

    toggleSiteFormFields(d.status);

    siteModal.show();
}

function handleStatusChange(val) {
    document.getElementById('f_date1').value = '';
    document.getElementById('f_date2').value = '';
    document.getElementById('f_site_manager').value = '';
    document.getElementById('f_designer').value = '';
    document.getElementById('f_designer_sign').value = '';

    toggleSiteFormFields(val);
}

function toggleSiteFormFields(val) {
    const d1 = document.getElementById('f_date1');
    const d2 = document.getElementById('f_date2');
    const siteM = document.getElementById('f_site_manager');
    const desM = document.getElementById('f_designer');
    const signM = document.getElementById('ongoing_only');

    if (!d1 || !d2 || !siteM || !desM || !signM) return;

    d2.style.display = '';
    d2.parentElement.style.display = '';

    siteM.parentElement.style.display = 'none';
    desM.parentElement.style.display = 'none';
    signM.style.display = 'none';

    if (val === 'ongoing') {
        d1.placeholder = "착공일";
        d2.placeholder = "준공예정일";
        siteM.parentElement.style.display = '';
        desM.parentElement.style.display = '';
        signM.style.display = '';
    } else if (val === 'scheduled') {
        d1.placeholder = "착공예정";
        d2.placeholder = "준공예정";
        siteM.parentElement.style.display = '';
    } else if (val === 'designing') {
        d1.placeholder = "디자인마감";
        d2.placeholder = "착공예정";
        desM.parentElement.style.display = '';
    } else {
        d1.placeholder = "마감시기 (예: 4월 말)";
        d2.value = '';
        d2.style.display = 'none';
        d2.parentElement.style.display = 'none';
    }
}

async function saveSiteData() {
    const data = {
        teamId: myTeamId,
        status: document.getElementById('f_status').value,
        siteName: document.getElementById('f_siteName').value.trim(),
        date1: document.getElementById('f_date1').value,
        date2: document.getElementById('f_date2').value,
        site_manager: document.getElementById('f_site_manager').value,
        designer: document.getElementById('f_designer').value,
        designer_sign: document.getElementById('f_designer_sign').value,
        etc: document.getElementById('f_etc').value,
        updatedAt: Date.now()
    };

    if (!data.siteName) return alert("현장명을 입력해주세요.");

    if (siteEditingId) {
        await db.collection("site_status").doc(siteEditingId).update(data);
    } else {
        await db.collection("site_status").add({
            ...data,
            createdAt: Date.now(),
            order: Date.now()
        });
    }

    siteModal.hide();
}

async function deleteSite(id) {
    if (confirm("이 현장을 삭제하시겠습니까?")) {
        await db.collection("site_status").doc(id).delete();
    }
}

async function captureStatusBoardPng() {
    const target = document.getElementById('page-status');
    const mainContainer = document.querySelector('.main-container');

    if (!target) {
        alert("종합 상황판 영역을 찾을 수 없습니다.");
        return;
    }

    if (typeof html2canvas === 'undefined') {
        alert("캡쳐 라이브러리를 불러오지 못했습니다.");
        return;
    }

    const originalWindowScrollY = window.scrollY;
    const originalMainScrollTop = mainContainer ? mainContainer.scrollTop : 0;

    try {
        document.body.classList.add('status-capture-mode');

        window.scrollTo(0, 0);
        if (mainContainer) mainContainer.scrollTop = 0;

        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await html2canvas(target, {
            scale: 2,
            useCORS: true,
            backgroundColor: document.body.classList.contains('light-mode') ? '#f4f6f8' : '#131722',
            logging: false,
            width: target.scrollWidth,
            height: target.scrollHeight,
            windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
            windowHeight: Math.max(document.documentElement.clientHeight, target.scrollHeight),
            scrollX: 0,
            scrollY: 0
        });

        const today = new Date().toISOString().slice(0, 10);
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `종합상황판_${today}.png`;
        link.click();

    } catch (error) {
        console.error("종합 상황판 PNG 저장 오류:", error);
        alert("PNG 저장 중 오류가 발생했습니다.");
    } finally {
        document.body.classList.remove('status-capture-mode');

        if (mainContainer) mainContainer.scrollTop = originalMainScrollTop;
        window.scrollTo(0, originalWindowScrollY);
    }
}

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
window.captureStatusBoardPng = captureStatusBoardPng;
