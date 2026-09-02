// =====================================================
// 김목수이야기 ERP - driving-continuity.js
// 운행 위치 단절 검증 / 원본 후보 확인 / 다중 선택 복구
// =====================================================

const DRIVING_CONTINUITY_WARN_METERS = 1000;
let drivingRawSemanticSegments = [];
let drivingIgnoredGapKeys = new Set();
let continuityModalGap = null;
let continuityObserver = null;

function continuityDistanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dp = (b.lat - a.lat) * Math.PI / 180;
    const dl = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function continuityParseLatLng(text) {
    if (!text || typeof text !== 'string') return null;
    const p = text.replace(/°/g, '').split(',').map(v => Number(v.trim()));
    return p.length === 2 && p.every(Number.isFinite) ? { lat: p[0], lng: p[1] } : null;
}

function continuityGapKey(prev, next) {
    return `${prev.id || prev.endISO}|${next.id || next.startISO}`;
}

function getDrivingContinuityGaps() {
    if (!Array.isArray(drivingRows) || drivingRows.length < 2) return [];
    const gaps = [];

    for (let i = 1; i < drivingRows.length; i++) {
        const prev = drivingRows[i - 1];
        const next = drivingRows[i];

        // 수동 입력 행은 GPS 좌표가 없으므로 위치 연속성 검사 기준에서 제외한다.
        if (!prev?.end || !next?.start) continue;

        const distanceMeters = continuityDistanceMeters(prev.end, next.start);
        if (!Number.isFinite(distanceMeters) || distanceMeters < DRIVING_CONTINUITY_WARN_METERS) continue;

        const key = continuityGapKey(prev, next);
        if (drivingIgnoredGapKeys.has(key)) continue;

        const prevEnd = new Date(prev.endISO).getTime();
        const nextStart = new Date(next.startISO).getTime();
        gaps.push({
            key,
            beforeIndex: i - 1,
            afterIndex: i,
            prev,
            next,
            distanceMeters,
            gapMinutes: Number.isFinite(prevEnd) && Number.isFinite(nextStart) ? Math.max(0, (nextStart - prevEnd) / 60000) : null
        });
    }
    return gaps;
}

function normalizeRawActivity(segment, rawIndex) {
    const act = segment?.activity;
    if (!act) return null;
    const start = continuityParseLatLng(act.start?.latLng);
    const end = continuityParseLatLng(act.end?.latLng);
    if (!start || !end || !segment.startTime || !segment.endTime) return null;

    const startMs = new Date(segment.startTime).getTime();
    const endMs = new Date(segment.endTime).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

    return {
        rawIndex,
        start,
        end,
        startISO: segment.startTime,
        endISO: segment.endTime,
        startMs,
        endMs,
        type: act.topCandidate?.type || 'UNKNOWN_ACTIVITY_TYPE',
        distanceKm: Number(((Number(act.distanceMeters) || 0) / 1000).toFixed(1))
    };
}

function findRawActivitiesForGap(gap) {
    const gapStart = new Date(gap.prev.endISO).getTime();
    const gapEnd = new Date(gap.next.startISO).getTime();
    if (!Number.isFinite(gapStart) || !Number.isFinite(gapEnd)) return [];

    const existingRawIds = new Set(
        drivingRows.flatMap(row => row.originalIds || [])
            .filter(id => /^raw_\d+$/.test(id))
    );

    return drivingRawSemanticSegments
        .map((segment, idx) => normalizeRawActivity(segment, idx))
        .filter(Boolean)
        .filter(item => !existingRawIds.has(`raw_${item.rawIndex}`))
        .filter(item => item.endMs >= gapStart - 5 * 60000 && item.startMs <= gapEnd + 5 * 60000)
        .filter(item => item.distanceKm >= 0.3 || continuityDistanceMeters(item.start, item.end) >= 300)
        .map(item => ({
            ...item,
            startGapMeters: continuityDistanceMeters(gap.prev.end, item.start),
            endGapMeters: continuityDistanceMeters(item.end, gap.next.start)
        }))
        .sort((a, b) => a.startMs - b.startMs);
}

function continuityTypeLabel(type) {
    return ({
        IN_PASSENGER_VEHICLE: '승용차', IN_TAXI: '택시', IN_BUS: '버스', IN_TRAIN: '기차',
        MOTORCYCLING: '오토바이', CYCLING: '자전거', WALKING: '도보', RUNNING: '달리기',
        UNKNOWN_ACTIVITY_TYPE: '분류 불명'
    })[type] || type;
}

function continuityLocalTime(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ensureContinuitySummary() {
    let el = document.getElementById('drivingContinuitySummary');
    if (el) return el;
    const tableCard = document.querySelector('.card-dark.p-3');
    if (!tableCard) return null;
    el = document.createElement('div');
    el.id = 'drivingContinuitySummary';
    el.className = 'mb-2';
    tableCard.prepend(el);
    return el;
}

function renderContinuityWarnings() {
    const tbody = document.getElementById('drivingBody');
    if (!tbody) return;

    // 항상 기존 경고행을 먼저 전부 제거한다. 복구 후 중복 경고가 남는 것을 방지한다.
    tbody.querySelectorAll('.continuity-warning-row').forEach(el => el.remove());

    const gaps = getDrivingContinuityGaps();
    const summary = ensureContinuitySummary();
    if (summary) {
        summary.innerHTML = gaps.length
            ? `<div class="alert alert-warning py-2 px-3 mb-2"><i class="bi bi-exclamation-triangle-fill me-2"></i><b>이동 누락 의심 ${gaps.length}건</b> · 현재 남아 있는 위치 단절만 표시합니다.</div>`
            : '<div class="small text-success"><i class="bi bi-check-circle me-1"></i>운행 위치 연속성 이상 없음</div>';
    }

    const normalRows = [...tbody.querySelectorAll('tr')].filter(tr => tr.querySelector('.trip-check'));
    gaps.slice().reverse().forEach(gap => {
        const targetRow = normalRows[gap.afterIndex];
        if (!targetRow) return;

        const candidates = findRawActivitiesForGap(gap);
        const tr = document.createElement('tr');
        tr.className = 'continuity-warning-row';
        tr.dataset.gapKey = gap.key;
        tr.innerHTML = `
            <td colspan="9" style="background:rgba(245,158,11,.12);border-left:4px solid #f59e0b;">
                <div class="d-flex flex-wrap align-items-center gap-2 py-2 px-2">
                    <i class="bi bi-exclamation-triangle-fill text-warning"></i>
                    <b class="text-warning">이동 누락 의심</b>
                    <span>위치 단절 약 <b>${(gap.distanceMeters / 1000).toFixed(1)}km</b></span>
                    <span class="text-secondary">· 시간 공백 ${gap.gapMinutes == null ? '-' : Math.round(gap.gapMinutes)}분</span>
                    <span class="badge text-bg-secondary">원본 후보 ${candidates.length}건</span>
                    <button type="button" class="btn btn-sm btn-warning ms-lg-auto js-continuity-open"><i class="bi bi-search me-1"></i>누락 이동 확인</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary js-continuity-ignore">이상 없음</button>
                </div>
            </td>`;

        tr.querySelector('.js-continuity-open').addEventListener('click', () => openContinuityGap(gap.key));
        tr.querySelector('.js-continuity-ignore').addEventListener('click', () => ignoreContinuityGap(gap.key));
        targetRow.parentNode.insertBefore(tr, targetRow);
    });
}

function ensureContinuityModal() {
    if (document.getElementById('continuityModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div class="modal fade" id="continuityModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content bg-dark text-light border-secondary">
                    <div class="modal-header border-secondary">
                        <div><h5 class="modal-title fw-bold"><i class="bi bi-exclamation-triangle text-warning me-2"></i>누락 이동 확인</h5><div id="continuityModalSubtitle" class="small text-secondary"></div></div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="continuityCandidateList"></div>
                        <div id="continuityRecoveryActions" class="d-flex justify-content-end gap-2 mt-3"></div>
                        <hr class="border-secondary">
                        <div class="small text-secondary">복구할 이동만 체크하세요. 선택한 후보는 시간 순서대로 운행 목록에 삽입됩니다.</div>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(wrap.firstElementChild);
}

function openContinuityGap(key) {
    const gap = getDrivingContinuityGaps().find(item => item.key === key);
    if (!gap) return alert('해당 누락 구간을 찾지 못했습니다. 목록을 다시 확인해주세요.');

    continuityModalGap = gap;
    ensureContinuityModal();
    const candidates = findRawActivitiesForGap(gap);
    continuityModalGap.candidates = candidates;

    document.getElementById('continuityModalSubtitle').textContent = `${continuityLocalTime(gap.prev.endISO)} ~ ${continuityLocalTime(gap.next.startISO)} · 위치 단절 ${(gap.distanceMeters / 1000).toFixed(1)}km`;
    const list = document.getElementById('continuityCandidateList');
    const actions = document.getElementById('continuityRecoveryActions');

    if (!candidates.length) {
        list.innerHTML = '<div class="alert alert-secondary mb-0"><b>원본 이동 후보가 없습니다.</b><br><span class="small">Google Timeline JSON 자체에 이동 데이터가 빠졌을 가능성이 있습니다. 필요하면 빈칸 추가로 수동 작성해주세요.</span></div>';
        actions.innerHTML = '';
    } else {
        list.innerHTML = candidates.map((item, idx) => `
            <label class="d-block border border-secondary rounded p-3 mb-2" style="cursor:pointer">
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <input class="form-check-input continuity-candidate-check" type="checkbox" value="${idx}">
                    <b>${continuityTypeLabel(item.type)}</b>
                    <span>${continuityLocalTime(item.startISO)} → ${continuityLocalTime(item.endISO)}</span>
                    <span class="badge text-bg-secondary">${item.distanceKm.toFixed(1)} km</span>
                </div>
                <div class="small text-secondary mt-2">이전 도착지→후보 시작 ${(item.startGapMeters / 1000).toFixed(1)}km · 후보 종료→다음 출발지 ${(item.endGapMeters / 1000).toFixed(1)}km</div>
            </label>`).join('');
        actions.innerHTML = '<button type="button" class="btn btn-warning" id="btnRecoverSelectedContinuity"><i class="bi bi-arrow-return-left me-1"></i>선택 복구</button>';
        document.getElementById('btnRecoverSelectedContinuity').addEventListener('click', recoverSelectedContinuityCandidates);
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('continuityModal')).show();
}

function createRecoveredRow(item) {
    const parts = toLocalParts(item.startISO);
    const endParts = toLocalParts(item.endISO);
    return {
        id: `recovered_${item.rawIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        originalIds: [`raw_${item.rawIndex}`],
        startISO: item.startISO,
        endISO: item.endISO,
        date: parts.date,
        startTime: parts.time,
        endTime: endParts.time,
        start: item.start,
        end: item.end,
        distanceKm: item.distanceKm,
        usageType: 'business',
        startName: '', endName: '', startAddress: '', endAddress: '',
        isMerged: false, isPersonal: false, isRecovered: true,
        recoveredOriginalType: item.type, hiddenParts: null
    };
}

function recoverSelectedContinuityCandidates() {
    const gap = continuityModalGap;
    if (!gap) return;
    const indexes = [...document.querySelectorAll('.continuity-candidate-check:checked')].map(el => Number(el.value));
    if (!indexes.length) return alert('복구할 이동 후보를 하나 이상 선택해주세요.');

    const selected = indexes.map(i => gap.candidates[i]).filter(Boolean).sort((a, b) => a.startMs - b.startMs);
    if (!confirm(`선택한 ${selected.length}건을 차량 운행으로 복구할까요?`)) return;

    snapshotRows();
    const recoveredRows = selected.map(createRecoveredRow);
    drivingRows.splice(gap.afterIndex, 0, ...recoveredRows);
    drivingRows.sort((a, b) => {
        const at = new Date(a.startISO || '9999-12-31').getTime();
        const bt = new Date(b.startISO || '9999-12-31').getTime();
        return at - bt;
    });

    if (typeof applyDrivingPlaceCacheToRows === 'function') applyDrivingPlaceCacheToRows();
    bootstrap.Modal.getInstance(document.getElementById('continuityModal'))?.hide();
    renderDrivingRows();

    // 렌더 완료 후 기존 경고행을 전부 폐기하고 현재 남은 단절만 계산한다.
    setTimeout(() => {
        document.querySelectorAll('.continuity-warning-row').forEach(el => el.remove());
        renderContinuityWarnings();
    }, 50);
}

function ignoreContinuityGap(key) {
    drivingIgnoredGapKeys.add(key);
    renderContinuityWarnings();
}

async function readRawTimelineForContinuity() {
    const file = document.getElementById('timelineFile')?.files?.[0];
    if (!file) return drivingRawSemanticSegments = [];
    try {
        const json = JSON.parse(await file.text());
        drivingRawSemanticSegments = Array.isArray(json.semanticSegments) ? json.semanticSegments : [];
    } catch (err) {
        console.error('연속성 검사용 JSON 읽기 실패:', err);
        drivingRawSemanticSegments = [];
    }
}

function mutationContainsNormalTripRows(mutations) {
    return mutations.some(m => [...m.addedNodes, ...m.removedNodes].some(node => {
        if (node.nodeType !== 1 || node.classList?.contains('continuity-warning-row')) return false;
        return (node.matches?.('tr') && node.querySelector?.('.trip-check')) || !!node.querySelector?.('.trip-check');
    }));
}

(function installContinuityValidation() {
    const originalLoadTimelineFile = window.loadTimelineFile;
    if (typeof originalLoadTimelineFile === 'function') {
        window.loadTimelineFile = async function(...args) {
            drivingIgnoredGapKeys = new Set();
            await readRawTimelineForContinuity();
            await originalLoadTimelineFile.apply(this, args);
            setTimeout(renderContinuityWarnings, 50);
        };
    }

    const body = document.getElementById('drivingBody');
    if (body) {
        continuityObserver = new MutationObserver(mutations => {
            if (!mutationContainsNormalTripRows(mutations)) return;
            clearTimeout(window.__drivingContinuityTimer);
            window.__drivingContinuityTimer = setTimeout(renderContinuityWarnings, 50);
        });
        continuityObserver.observe(body, { childList: true, subtree: false });
    }
})();

window.openContinuityGap = openContinuityGap;
window.recoverSelectedContinuityCandidates = recoverSelectedContinuityCandidates;
window.ignoreContinuityGap = ignoreContinuityGap;
window.renderContinuityWarnings = renderContinuityWarnings;
window.getDrivingContinuityGaps = getDrivingContinuityGaps;
