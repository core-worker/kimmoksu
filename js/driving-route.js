// =====================================================
// 김목수이야기 ERP - Timeline 실제 이동 경로 보기
// Google Timeline JSON의 timelinePath를 브라우저 메모리에서 읽어
// Kakao Map Polyline으로 표시한다. 서버/Firebase에는 저장하지 않는다.
// =====================================================

let drivingTimelinePathPoints = null;
let drivingTimelinePathFileStamp = '';
let drivingRouteMap = null;
let drivingRoutePolyline = null;
let drivingRouteStartMarker = null;
let drivingRouteEndMarker = null;

function parseDrivingTimelinePoint(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.replace(/°/g, '').trim();
    const parts = cleaned.split(',').map(value => Number(value.trim()));
    if (parts.length !== 2 || parts.some(value => !Number.isFinite(value))) return null;
    return { lat: parts[0], lng: parts[1] };
}

function timelineFileStamp(file) {
    if (!file) return '';
    return `${file.name}|${file.size}|${file.lastModified}`;
}

async function ensureDrivingTimelinePathPoints() {
    const input = document.getElementById('timelineFile');
    const file = input?.files?.[0];
    if (!file) throw new Error('Google 타임라인 JSON 파일을 다시 선택해주세요.');

    const stamp = timelineFileStamp(file);
    if (Array.isArray(drivingTimelinePathPoints) && drivingTimelinePathFileStamp === stamp) {
        return drivingTimelinePathPoints;
    }

    const json = JSON.parse(await file.text());
    const segments = Array.isArray(json.semanticSegments) ? json.semanticSegments : [];
    const points = [];

    segments.forEach(segment => {
        const path = Array.isArray(segment.timelinePath) ? segment.timelinePath : [];
        path.forEach(item => {
            const point = parseDrivingTimelinePoint(item?.point);
            const timeMs = new Date(item?.time || '').getTime();
            if (!point || !Number.isFinite(timeMs)) return;
            points.push({ ...point, timeMs, time: item.time });
        });
    });

    points.sort((a, b) => a.timeMs - b.timeMs);
    drivingTimelinePathPoints = points;
    drivingTimelinePathFileStamp = stamp;
    return points;
}

function getDrivingRouteIntervals(row) {
    if (!row) return [];

    const leafParts = typeof window.flattenDrivingMergedParts === 'function'
        ? window.flattenDrivingMergedParts(row, [])
        : [row];

    const intervals = leafParts
        .map(part => ({
            startMs: new Date(part?.startISO || '').getTime(),
            endMs: new Date(part?.endISO || '').getTime()
        }))
        .filter(interval => Number.isFinite(interval.startMs) && Number.isFinite(interval.endMs) && interval.endMs >= interval.startMs)
        .sort((a, b) => a.startMs - b.startMs);

    return intervals.length ? intervals : [{
        startMs: new Date(row.startISO || '').getTime(),
        endMs: new Date(row.endISO || '').getTime()
    }].filter(interval => Number.isFinite(interval.startMs) && Number.isFinite(interval.endMs));
}

function pointInsideRouteIntervals(point, intervals) {
    return intervals.some(interval => point.timeMs >= interval.startMs && point.timeMs <= interval.endMs);
}

function dedupeDrivingRoutePoints(points) {
    const result = [];
    let lastKey = '';

    points.forEach(point => {
        const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)},${point.timeMs}`;
        if (key === lastKey) return;
        result.push(point);
        lastKey = key;
    });

    return result;
}

function getDrivingRouteEndpoints(rowIndex) {
    const row = drivingRows?.[rowIndex];
    if (!row) return { start: null, end: null };

    const startPlace = typeof window.getDrivingDisplayPlace === 'function'
        ? window.getDrivingDisplayPlace(rowIndex, 'start')
        : null;
    const endPlace = typeof window.getDrivingDisplayPlace === 'function'
        ? window.getDrivingDisplayPlace(rowIndex, 'end')
        : null;

    return {
        start: startPlace?.point || row.start || null,
        end: endPlace?.point || row.end || null
    };
}

function ensureDrivingRouteModal() {
    if (document.getElementById('drivingRouteModal')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div class="modal fade" id="drivingRouteModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-centered">
                <div class="modal-content bg-dark text-light border-secondary">
                    <div class="modal-header border-secondary">
                        <div>
                            <h5 class="modal-title fw-bold"><i class="bi bi-sign-turn-right me-2"></i>실제 이동 경로</h5>
                            <div id="drivingRouteSummary" class="small text-secondary mt-1">Google Timeline에 기록된 위치점을 지도에 연결합니다.</div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div id="drivingRouteCanvas" style="width:100%;height:560px;border-radius:12px;overflow:hidden;background:#111827;"></div>
                        <div class="small text-secondary mt-2">
                            Timeline 위치 기록 간격이 긴 구간은 선이 실제 도로와 다르게 직선으로 보일 수 있습니다. 카카오 길찾기로 재계산한 경로가 아니라 당시 기록된 GPS 위치를 연결한 경로입니다.
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(wrap.firstElementChild);
}

function clearDrivingRouteOverlays() {
    if (drivingRoutePolyline) drivingRoutePolyline.setMap(null);
    if (drivingRouteStartMarker) drivingRouteStartMarker.setMap(null);
    if (drivingRouteEndMarker) drivingRouteEndMarker.setMap(null);
    drivingRoutePolyline = null;
    drivingRouteStartMarker = null;
    drivingRouteEndMarker = null;
}

function drawDrivingRoute(rowIndex, routePoints) {
    const canvas = document.getElementById('drivingRouteCanvas');
    if (!canvas || !window.kakao?.maps) return;

    const endpoints = getDrivingRouteEndpoints(rowIndex);
    const first = routePoints[0] || endpoints.start || endpoints.end;
    if (!first) return;

    const center = new kakao.maps.LatLng(first.lat, first.lng);
    drivingRouteMap = new kakao.maps.Map(canvas, { center, level: 5 });
    clearDrivingRouteOverlays();

    const bounds = new kakao.maps.LatLngBounds();
    const path = routePoints.map(point => {
        const latLng = new kakao.maps.LatLng(point.lat, point.lng);
        bounds.extend(latLng);
        return latLng;
    });

    if (path.length >= 2) {
        drivingRoutePolyline = new kakao.maps.Polyline({
            path,
            strokeWeight: 5,
            strokeColor: '#3b82f6',
            strokeOpacity: 0.9,
            strokeStyle: 'solid'
        });
        drivingRoutePolyline.setMap(drivingRouteMap);
    }

    if (endpoints.start) {
        const startPos = new kakao.maps.LatLng(endpoints.start.lat, endpoints.start.lng);
        drivingRouteStartMarker = new kakao.maps.Marker({ position: startPos, map: drivingRouteMap });
        bounds.extend(startPos);
    }

    if (endpoints.end) {
        const endPos = new kakao.maps.LatLng(endpoints.end.lat, endpoints.end.lng);
        drivingRouteEndMarker = new kakao.maps.Marker({ position: endPos, map: drivingRouteMap });
        bounds.extend(endPos);
    }

    if (!bounds.isEmpty()) drivingRouteMap.setBounds(bounds, 40, 40, 40, 40);
    setTimeout(() => drivingRouteMap?.relayout(), 50);
}

async function openDrivingRoute(rowIndex) {
    const row = drivingRows?.[rowIndex];
    if (!row) return;
    if (row.usageType === 'personal' || row.isPersonal) {
        alert('개인사용 운행은 이동 경로를 표시하지 않습니다.');
        return;
    }
    if (!window.kakao?.maps) {
        alert('주소/지도 서비스가 아직 연결되지 않았습니다.');
        return;
    }

    const intervals = getDrivingRouteIntervals(row);
    if (!intervals.length) {
        alert('이 운행의 시간 정보를 확인할 수 없습니다.');
        return;
    }

    ensureDrivingRouteModal();
    const summary = document.getElementById('drivingRouteSummary');
    if (summary) summary.textContent = 'Timeline 실제 이동 경로를 불러오는 중...';

    const modalEl = document.getElementById('drivingRouteModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    try {
        const allPoints = await ensureDrivingTimelinePathPoints();
        const selected = dedupeDrivingRoutePoints(allPoints.filter(point => pointInsideRouteIntervals(point, intervals)));
        const endpoints = getDrivingRouteEndpoints(rowIndex);

        // timelinePath가 운행 시작/종료 지점을 정확히 포함하지 않는 경우에도
        // 지도에서 전체 이동 범위를 파악할 수 있도록 출발/도착 마커는 별도로 표시한다.
        const countText = selected.length >= 2
            ? `Timeline 위치 ${selected.length}개 · ${row.startTime || ''} → ${row.endTime || ''}`
            : `세부 경로점 부족 · ${row.startTime || ''} → ${row.endTime || ''}`;
        if (summary) summary.textContent = countText;

        modalEl.addEventListener('shown.bs.modal', () => {
            drawDrivingRoute(rowIndex, selected);
            if (selected.length < 2 && !endpoints.start && !endpoints.end) {
                const canvas = document.getElementById('drivingRouteCanvas');
                if (canvas) canvas.innerHTML = '<div class="h-100 d-flex align-items-center justify-content-center text-secondary">표시할 경로 데이터가 없습니다.</div>';
            }
        }, { once: true });

        modal.show();
    } catch (err) {
        console.error('운행 경로 불러오기 실패:', err);
        alert(err?.message || '운행 경로를 불러오지 못했습니다.');
    }
}

window.addEventListener('DOMContentLoaded', ensureDrivingRouteModal);
window.openDrivingRoute = openDrivingRoute;
