// =====================================================
// 김목수이야기 ERP - driving-map.js
// 도로명 주소가 없는 운행 좌표를 지도에서 확인/보정
// =====================================================

let drivingMapInstance = null;
let drivingMapMarker = null;
let drivingMapTarget = null;
let drivingMapSelectedPoint = null;

function ensureDrivingMapModal() {
    if (document.getElementById('drivingMapModal')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div class="modal fade" id="drivingMapModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-centered">
                <div class="modal-content bg-dark text-light border-secondary">
                    <div class="modal-header border-secondary">
                        <div>
                            <h5 class="modal-title fw-bold"><i class="bi bi-map me-2"></i>지도에서 위치 확인</h5>
                            <div class="small text-secondary mt-1">원래 GPS 위치를 확인하고, 필요하면 지도를 클릭해 보정 위치를 선택하세요.</div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div id="drivingMapCanvas" style="width:100%;height:520px;border-radius:12px;overflow:hidden;background:#111827;"></div>
                        <div class="row g-2 mt-3">
                            <div class="col-12 col-lg-7">
                                <div class="p-3 rounded bg-black bg-opacity-25 h-100">
                                    <div class="small text-secondary">선택 좌표</div>
                                    <div id="drivingMapCoords" class="fw-bold mt-1">-</div>
                                    <div id="drivingMapResult" class="small text-secondary mt-2">지도를 클릭하면 해당 위치의 도로명 주소를 확인할 수 있습니다.</div>
                                </div>
                            </div>
                            <div class="col-12 col-lg-5 d-flex gap-2 align-items-stretch">
                                <button id="btnDrivingMapReset" class="btn btn-outline-secondary flex-fill"><i class="bi bi-crosshair me-1"></i>원위치</button>
                                <button id="btnDrivingMapApply" class="btn btn-success flex-fill" disabled><i class="bi bi-check2-circle me-1"></i>이 위치 적용</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(wrap.firstElementChild);

    document.getElementById('btnDrivingMapReset').addEventListener('click', resetDrivingMapPoint);
    document.getElementById('btnDrivingMapApply').addEventListener('click', applyDrivingMapPoint);
}

function injectMapReviewButtons() {
    const tbody = document.getElementById('drivingBody');
    if (!tbody) return;

    [...tbody.querySelectorAll('tr')].forEach((tr, rowIndex) => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;

        [
            { cell: cells[5], side: 'start' },
            { cell: cells[6], side: 'end' }
        ].forEach(({ cell, side }) => {
            if (!cell || cell.querySelector('.btn-map-review')) return;
            const sub = cell.querySelector('.place-sub');
            if (!sub) return;

            const text = (sub.textContent || '').trim();
            if (text !== '도로명 주소 없음') return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-info mt-1 btn-map-review';
            btn.innerHTML = '<i class="bi bi-map me-1"></i>지도 확인';
            btn.addEventListener('click', () => openDrivingMapReview(rowIndex, side));
            cell.appendChild(btn);
        });
    });
}

async function openDrivingMapReview(rowIndex, side) {
    if (!window.kakao || !kakao.maps) {
        alert('주소 서비스가 아직 연결되지 않았습니다.');
        return;
    }
    const row = drivingRows[rowIndex];
    if (!row) return;

    const point = side === 'start' ? row.start : row.end;
    if (!point) return;

    ensureDrivingMapModal();
    drivingMapTarget = { rowIndex, side, originalPoint: { ...point } };
    drivingMapSelectedPoint = { ...point };

    const modalEl = document.getElementById('drivingMapModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    modalEl.addEventListener('shown.bs.modal', initDrivingMapCanvas, { once: true });
}

function initDrivingMapCanvas() {
    const canvas = document.getElementById('drivingMapCanvas');
    if (!canvas || !drivingMapSelectedPoint) return;

    const center = new kakao.maps.LatLng(drivingMapSelectedPoint.lat, drivingMapSelectedPoint.lng);
    drivingMapInstance = new kakao.maps.Map(canvas, {
        center,
        level: 3
    });

    drivingMapMarker = new kakao.maps.Marker({
        position: center,
        map: drivingMapInstance
    });

    kakao.maps.event.addListener(drivingMapInstance, 'click', function(mouseEvent) {
        const latLng = mouseEvent.latLng;
        setDrivingMapPoint({ lat: latLng.getLat(), lng: latLng.getLng() }, true);
    });

    setDrivingMapPoint(drivingMapSelectedPoint, false);
    setTimeout(() => drivingMapInstance.relayout(), 50);
}

async function setDrivingMapPoint(point, moveCenter) {
    drivingMapSelectedPoint = { ...point };
    const pos = new kakao.maps.LatLng(point.lat, point.lng);

    if (drivingMapMarker) drivingMapMarker.setPosition(pos);
    if (moveCenter && drivingMapInstance) drivingMapInstance.panTo(pos);

    const coordsEl = document.getElementById('drivingMapCoords');
    const resultEl = document.getElementById('drivingMapResult');
    const applyBtn = document.getElementById('btnDrivingMapApply');
    if (coordsEl) coordsEl.textContent = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    if (resultEl) resultEl.textContent = '도로명 주소 확인 중...';
    if (applyBtn) applyBtn.disabled = true;

    try {
        const found = typeof window.findNearestRoadAddress === 'function'
            ? await window.findNearestRoadAddress(point)
            : await mapCoord2RoadAddress(point);

        drivingMapSelectedPoint.found = found;
        if (found && found.address && found.address !== '도로명 주소 없음') {
            const distanceText = found.nearbyDistanceMeters
                ? ` · 약 ${found.nearbyDistanceMeters}m 주변 도로명 주소`
                : '';
            if (resultEl) resultEl.innerHTML = `<span class="text-success fw-bold">${escapeMapHtml(found.name || found.address)}</span><br>${escapeMapHtml(found.address)}${distanceText}`;
            if (applyBtn) applyBtn.disabled = false;
        } else {
            if (resultEl) resultEl.innerHTML = '<span class="text-warning">이 위치에서도 도로명 주소를 찾지 못했습니다. 지도를 클릭해 위치를 조금 조정해보세요.</span>';
        }
    } catch (err) {
        console.error(err);
        if (resultEl) resultEl.textContent = '주소 확인 중 오류가 발생했습니다.';
    }
}

function mapCoord2RoadAddress(point) {
    return new Promise((resolve, reject) => {
        if (!kakaoGeocoder) return reject(new Error('Kakao Geocoder not ready'));
        kakaoGeocoder.coord2Address(point.lng, point.lat, (result, status) => {
            if (status !== kakao.maps.services.Status.OK || !result?.length) {
                resolve({ name: '도로명 주소 없음', address: '도로명 주소 없음', nearbyDistanceMeters: null });
                return;
            }
            const road = result[0].road_address;
            if (!road?.address_name) {
                resolve({ name: '도로명 주소 없음', address: '도로명 주소 없음', nearbyDistanceMeters: null });
                return;
            }
            resolve({
                name: road.building_name || road.address_name,
                address: road.address_name,
                nearbyDistanceMeters: 0
            });
        });
    });
}

function resetDrivingMapPoint() {
    if (!drivingMapTarget) return;
    setDrivingMapPoint(drivingMapTarget.originalPoint, true);
}

function applyDrivingMapPoint() {
    if (!drivingMapTarget || !drivingMapSelectedPoint?.found) return;
    const found = drivingMapSelectedPoint.found;
    if (!found.address || found.address === '도로명 주소 없음') return;

    const row = drivingRows[drivingMapTarget.rowIndex];
    if (!row) return;

    snapshotRows();
    const point = {
        lat: drivingMapSelectedPoint.lat,
        lng: drivingMapSelectedPoint.lng
    };

    if (drivingMapTarget.side === 'start') {
        row.start = point;
        row.startName = found.name || found.address;
        row.startAddress = found.address;
    } else {
        row.end = point;
        row.endName = found.name || found.address;
        row.endAddress = found.address;
    }

    renderDrivingRows();
    bootstrap.Modal.getInstance(document.getElementById('drivingMapModal'))?.hide();
}

function escapeMapHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.addEventListener('DOMContentLoaded', () => {
    ensureDrivingMapModal();

    // 기존 렌더 함수 뒤에 지도 확인 버튼 주입
    const originalRender = window.renderDrivingRows;
    if (typeof originalRender === 'function') {
        window.renderDrivingRows = function(...args) {
            const result = originalRender.apply(this, args);
            setTimeout(injectMapReviewButtons, 0);
            return result;
        };
    }

    const observer = new MutationObserver(() => injectMapReviewButtons());
    const body = document.getElementById('drivingBody');
    if (body) observer.observe(body, { childList: true, subtree: true });
    injectMapReviewButtons();
});

window.openDrivingMapReview = openDrivingMapReview;
