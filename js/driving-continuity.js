// =====================================================
// 김목수이야기 ERP - driving-continuity.js
// 이전 도착지와 다음 출발지의 공간적 단절을 검증하고
// 원본 Timeline JSON에서 누락 가능 활동을 찾아 복구
// =====================================================

const DRIVING_CONTINUITY_WARN_METERS = 1000;
let drivingRawSemanticSegments = [];
let drivingIgnoredGapKeys = new Set();
let continuityModalGap = null;
let continuityObserver = null;

function continuityDistanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371000;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function continuityParseLatLng(text) {
    if (!text || typeof text !== 'string') return null;
    const parts = text.replace(/°/g, '').split(',').map(v => Number(v.trim()));
    if (parts.length !== 2 || parts.some(v => !Number.isFinite(v))) return null;
    return { lat: parts[0], lng: parts[1] };
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
        if (!prev?.end || !next?.start) continue;

        const distanceMeters = continuityDistanceMeters(prev.end, next.start);
        if (!Number.isFinite(distanceMeters) || distanceMeters < DRIVING_CONTINUITY_WARN_METERS) continue;

        const key = continuityGapKey(prev, next);
        if (drivingIgnoredGapKeys.has(key)) continue;

        const prevEnd = new Date(prev.endISO).getTime();
        const nextStart = new Date(next.startISO).getTime();
        const gapMinutes = Number.isFinite(prevEnd) && Number.isFinite(nextStart)
            ? Math.max(0, (nextStart - prevEnd) / 60000)
            : null;

        gaps.push({
            key,
            beforeIndex: i - 1,
            afterIndex: i,
            prev,
            next,
            distanceMeters,
            gapMinutes
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
        segment,
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

    return drivingRawSemanticSegments
        .map((segment, idx) => normalizeRawActivity(segment, idx))
        .filter(Boolean)
        .filter(item => item.endMs >= gapStart - 5 * 60000 && item.startMs <= gapEnd + 5 * 60000)
        .filter(item => item.distanceKm >= 0.3 || continuityDistanceMeters(item.start, item.end) >= 300)
        .map(item => {
            const startGap = continuityDistanceMeters(gap.prev.end, item.start);
            const endGap = continuityDistanceMeters(item.end, gap.next.start);
            return {
                ...item,
                startGapMeters: startGap,
                endGapMeters: endGap,
                connectionScore: startGap + endGap
            };
        })
        .sort((a, b) => a.connectionScore - b.connectionScore || a.startMs - b.startMs);
}

function continuityTypeLabel(type) {
    const labels = {
        IN_PASSENGER_VEHICLE: '승용차',
        IN_TAXI: '택시',
        IN_BUS: '버스',
        IN_TRAIN: '기차',
        MOTORCYCLING: '오토바이',
        CYCLING: '자전거',
        WALKING: '도보',
        RUNNING: '달리기',
        UNKNOWN_ACTIVITY_TYPE: '분류 불명'
    };
    return labels[type] || type;
}

function continuityLocalTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
    const gaps = getDrivingContinuityGaps();
    const summary = ensureContinuitySummary();

    if (summary) {
        if (!gaps.length) {
            summary.innerHTML = '<div class="small text-success"><i class="bi bi-check-circle me-1"></i>운행 위치 연속성 이상 없음</div>';
        } else {
            summary.innerHTML = `<div class="alert alert-warning py-2 px-3 mb-2"><i class="bi bi-exclamation-triangle-fill me-2"></i><b>이동 누락 의심 ${gaps.length}건</b> · 이전 도착지와 다음 출발지가 1km 이상 떨어져 있습니다. 최종 저장 전에 확인해주세요.</div>`;
        }
    }

    const tbody = document.getElementById('drivingBody');
    if (!tbody) return;

    tbody.querySelectorAll('.continuity-warning-row').forEach(el => el.remove());

    const normalRows = [...tbody.querySelectorAll('tr')].filter(tr => tr.querySelector('.trip-check'));

    gaps.slice().reverse().forEach(gap => {
        const targetRow = normalRows[gap.afterIndex];
        if (!targetRow) return;

        const tr = document.createElement('tr');
        tr.className = 'continuity-warning-row';

        const gapKm = (gap.distanceMeters / 1000).toFixed(1);
        const minutes = gap.gapMinutes == null ? '-' : Math.round(gap.gapMinutes);
        const candidates = findRawActivitiesForGap(gap);

        tr.innerHTML = `
            <td colspan="9" style="background:rgba(245,158,11,.12);border-left:4px solid #f59e0b;">
                <div class="d-flex flex-wrap align-items-center gap-2 py-2 px-2">
                    <i class="bi bi-exclamation-triangle-fill text-warning"></i>
                    <b class="text-warning">이동 누락 의심</b>
                    <span>이전 도착지 → 다음 출발지 직선거리 약 <b>${gapKm}km</b></span>
                    <span class="text-secondary">· 시간 공백 ${minutes}분</span>
                    <span class="badge text-bg-secondary">원본 후보 ${candidates.length}건</span>
                    <button type="button" class="btn btn-sm btn-warning ms-lg-auto js-continuity-open"><i class="bi bi-search me-1"></i>누락 이동 확인</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary js-continuity-ignore">이상 없음</button>
                </div>
            </td>`;

        tr.querySelector('.js-continuity-open').addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openContinuityGap(gap.key);
        });

        tr.querySelector('.js-continuity-ignore').addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            ignoreContinuityGap(gap.key);
        });

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
                        <div>
                            <h5 class="modal-title fw-bold"><i class="bi bi-exclamation-triangle text-warning me-2"></i>누락 이동 확인</h5>
                            <div id="continuityModalSubtitle" class="small text-secondary"></div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="continuityCandidateList"></div>
                        <hr class="border-secondary">
                        <div class="small text-secondary">원본 JSON에 적절한 활동이 없다면 자동으로 거리를 추정해서 넣지 않습니다. 잘못된 회사차량 주행거리가 생성되는 것을 막기 위한 장치입니다.</div>
                    </div>
                </div>
            </div>
        </div>`;

    document.body.appendChild(wrap.firstElementChild);
}

function openContinuityGap(key) {
    try {
        const gap = getDrivingContinuityGaps().find(item => item.key === key);
        if (!gap) {
            alert('해당 누락 구간을 찾지 못했습니다. 운행 목록이 변경되었다면 다시 분석해주세요.');
            return;
        }

        continuityModalGap = gap;
        ensureContinuityModal();

        const candidates = findRawActivitiesForGap(gap);
        const subtitle = document.getElementById('continuityModalSubtitle');
        subtitle.textContent = `${continuityLocalTime(gap.prev.endISO)} 이후 ~ ${continuityLocalTime(gap.next.startISO)} 이전 · 위치 단절 ${(gap.distanceMeters / 1000).toFixed(1)}km`;

        const list = document.getElementById('continuityCandidateList');

        if (!candidates.length) {
            list.innerHTML = '<div class="alert alert-secondary mb-0"><b>원본 이동 후보가 없습니다.</b><br><span class="small">이 시간대의 Google Timeline JSON 자체에 이동 세그먼트가 빠졌거나 좌표 정보가 없는 활동만 존재할 수 있습니다.</span></div>';
        } else {
            list.innerHTML = candidates.map((item, idx) => {
                const likely = item.startGapMeters <= 3000 && item.endGapMeters <= 3000;
                return `
                    <div class="border border-secondary rounded p-3 mb-2 ${likely ? 'border-warning' : ''}">
                        <div class="d-flex flex-wrap gap-2 align-items-center">
                            <b>${continuityTypeLabel(item.type)}</b>
                            <span>${continuityLocalTime(item.startISO)} → ${continuityLocalTime(item.endISO)}</span>
                            <span class="badge text-bg-secondary">${item.distanceKm.toFixed(1)} km</span>
                            ${likely ? '<span class="badge text-bg-warning">연결 가능성 높음</span>' : ''}
                            <button type="button" class="btn btn-sm btn-outline-warning ms-lg-auto js-continuity-recover" data-candidate-index="${idx}">차량운행으로 복구</button>
                        </div>
                        <div class="small text-secondary mt-2">이전 도착지와 시작점 차이 ${(item.startGapMeters / 1000).toFixed(1)}km · 종료점과 다음 출발지 차이 ${(item.endGapMeters / 1000).toFixed(1)}km</div>
                    </div>`;
            }).join('');

            list.querySelectorAll('.js-continuity-recover').forEach(button => {
                button.addEventListener('click', () => recoverContinuityCandidate(Number(button.dataset.candidateIndex)));
            });
        }

        continuityModalGap.candidates = candidates;

        if (!window.bootstrap?.Modal) {
            alert('누락 이동 팝업을 열 수 없습니다. Bootstrap 스크립트 로드를 확인해주세요.');
            return;
        }

        bootstrap.Modal.getOrCreateInstance(document.getElementById('continuityModal')).show();
    } catch (err) {
        console.error('누락 이동 확인 팝업 오류:', err);
        alert('누락 이동 확인 창을 여는 중 오류가 발생했습니다. F12 콘솔의 오류를 확인해주세요.');
    }
}

function recoverContinuityCandidate(candidateIndex) {
    const gap = continuityModalGap;
    const item = gap?.candidates?.[candidateIndex];
    if (!gap || !item) return;

    const label = continuityTypeLabel(item.type);
    if (!confirm(`${label}로 분류된 ${item.distanceKm.toFixed(1)}km 이동을 회사 차량 운행으로 복구할까요?`)) return;

    snapshotRows();

    const parts = typeof toLocalParts === 'function'
        ? toLocalParts(item.startISO)
        : { date: '', time: continuityLocalTime(item.startISO) };

    const endParts = typeof toLocalParts === 'function'
        ? toLocalParts(item.endISO)
        : { time: continuityLocalTime(item.endISO) };

    const recovered = {
        id: `recovered_${item.rawIndex}_${Date.now()}`,
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
        startName: '',
        endName: '',
        startAddress: '',
        endAddress: '',
        isMerged: false,
        isPersonal: false,
        isRecovered: true,
        recoveredOriginalType: item.type,
        hiddenParts: null
    };

    drivingRows.splice(gap.afterIndex, 0, recovered);
    drivingRows.sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

    if (typeof applyDrivingPlaceCacheToRows === 'function') {
        applyDrivingPlaceCacheToRows();
    }

    renderDrivingRows();
    bootstrap.Modal.getInstance(document.getElementById('continuityModal'))?.hide();
    setTimeout(renderContinuityWarnings, 0);
}

function ignoreContinuityGap(key) {
    drivingIgnoredGapKeys.add(key);
    renderContinuityWarnings();
}

async function readRawTimelineForContinuity() {
    const input = document.getElementById('timelineFile');
    const file = input?.files?.[0];

    if (!file) {
        drivingRawSemanticSegments = [];
        return;
    }

    try {
        const json = JSON.parse(await file.text());
        drivingRawSemanticSegments = Array.isArray(json.semanticSegments) ? json.semanticSegments : [];
    } catch (err) {
        console.error('연속성 검사용 JSON 재읽기 실패:', err);
        drivingRawSemanticSegments = [];
    }
}

function mutationContainsNormalTripRows(mutations) {
    return mutations.some(mutation => {
        const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
        return nodes.some(node => {
            if (node.nodeType !== 1) return false;
            if (node.classList?.contains('continuity-warning-row')) return false;
            if (node.matches?.('tr') && node.querySelector?.('.trip-check')) return true;
            return !!node.querySelector?.('.trip-check');
        });
    });
}

(function installContinuityValidation() {
    const originalLoadTimelineFile = window.loadTimelineFile;

    if (typeof originalLoadTimelineFile === 'function') {
        window.loadTimelineFile = async function(...args) {
            drivingIgnoredGapKeys = new Set();
            await readRawTimelineForContinuity();
            await originalLoadTimelineFile.apply(this, args);
            setTimeout(renderContinuityWarnings, 30);
        };
    }

    const body = document.getElementById('drivingBody');
    if (body) {
        continuityObserver = new MutationObserver(mutations => {
            // 경고 행 자체를 추가/삭제한 변화는 무시한다.
            // 실제 운행 행이 다시 렌더링된 경우에만 경고를 갱신한다.
            if (!mutationContainsNormalTripRows(mutations)) return;

            clearTimeout(window.__drivingContinuityTimer);
            window.__drivingContinuityTimer = setTimeout(renderContinuityWarnings, 30);
        });

        continuityObserver.observe(body, { childList: true, subtree: false });
    }
})();

window.openContinuityGap = openContinuityGap;
window.recoverContinuityCandidate = recoverContinuityCandidate;
window.ignoreContinuityGap = ignoreContinuityGap;
window.renderContinuityWarnings = renderContinuityWarnings;
window.getDrivingContinuityGaps = getDrivingContinuityGaps;
