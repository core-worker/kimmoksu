// =====================================================
// 김목수이야기 ERP - driving-map.js
// 모든 업무/출퇴근 주소를 지도에서 확인하고 수동 보정
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
                            <h5 class="modal-title fw-bold"><i class="bi bi-map me-2"></i>지도에서 위치/주소 수정</h5>
                            <div class="small text-secondary mt-1">GPS 마커를 확인하고 필요하면 지도를 클릭해 위치를 옮긴 뒤 현장명과 주소를 직접 수정할 수 있습니다.</div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div id="drivingMapCanvas" style="width:100%;height:500px;border-radius:12px;overflow:hidden;background:#111827;"></div>

                        <div class="row g-3 mt-2">
                            <div class="col-12 col-lg-4">
                                <label class="form-label small text-secondary">선택 좌표</label>
                                <div id="drivingMapCoords" class="fw-bold">-</div>
                                <div id="drivingMapResult" class="small text-secondary mt-2">지도를 클릭하면 해당 위치의 도로명 주소를 다시 확인합니다.</div>
                            </div>
                            <div class="col-12 col-lg-4">
                                <label class="form-label small text-secondary">현장명 / 장소명</label>
                                <input id="drivingMapName" class="form-control input-dark" placeholder="예: 센텀 A현장">
                            </div>
                            <div class="col-12 col-lg-4">
                                <label class="form-label small text-secondary">도로명 주소</label>
                                <input id="drivingMapAddress" class="form-control input-dark" placeholder="주소를 직접 수정할 수 있습니다">
                            </div>
                        </div>

                        <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
                            <div class="form-check me-auto">
                                <input class="form-check-input" type="checkbox" id="drivingMapRemember">
                                <label class="form-check-label" for="drivingMapRemember">이 장소 기억 (반경 40m)</label>
                            </div>
                            <button id="btnDrivingMapReset" class="btn btn-outline-secondary"><i class="bi bi-crosshair me-1"></i>원위치</button>
                            <button id="btnDrivingMapApply" class="btn btn-success"><i class="bi bi-check2-circle me-1"></i>이 위치 적용</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(wrap.firstElementChild);

    document.getElementById('btnDrivingMapReset').addEventListener('click', resetDrivingMapPoint);
    document.getElementById('btnDrivingMapApply').addEventListener('click', applyDrivingMapPoint);
}

async function openDrivingMapReview(rowIndex, side) {
    if (!window.kakao || !kakao.maps) {
        alert('주소 서비스가 아직 연결되지 않았습니다.');
        return;
    }

    const row = drivingRows[rowIndex];
    if (!row || row.usageType === 'personal' || row.isPersonal) return;

    const point = side === 'start' ? row.start : row.end;
    if (!point) return;

    const name = side === 'start' ? row.startName : row.endName;
    const address = side === 'start' ? row.startAddress : row.endAddress;

    ensureDrivingMapModal();
    drivingMapTarget = {
        rowIndex,
        side,
        originalPoint: { ...point },
        originalName: name || '',
        originalAddress: address && address !== '도로명 주소 없음' ? address : ''
    };
    drivingMapSelectedPoint = { ...point };

    document.getElementById('drivingMapName').value = name && name !== '도로명 주소 없음' ? name : '';
    document.getElementById('drivingMapAddress').value = address && address !== '도로명 주소 없음' ? address : '';
    document.getElementById('drivingMapRemember').checked = false;
    document.getElementById('drivingMapResult').textContent = '현재 GPS 위치를 표시했습니다. 위치가 다르면 지도를 클릭해 마커를 옮겨주세요.';

    const modalEl = document.getElementById('drivingMapModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
    modalEl.addEventListener('shown.bs.modal', initDrivingMapCanvas, { once: true });
}

function initDrivingMapCanvas() {
    const canvas = document.getElementById('drivingMapCanvas');
    if (!canvas || !drivingMapSelectedPoint) return;

    const center = new kakao.maps.LatLng(drivingMapSelectedPoint.lat, drivingMapSelectedPoint.lng);
    drivingMapInstance = new kakao.maps.Map(canvas, { center, level: 3 });
    drivingMapMarker = new kakao.maps.Marker({ position: center, map: drivingMapInstance });

    kakao.maps.event.addListener(drivingMapInstance, 'click', function(mouseEvent) {
        const latLng = mouseEvent.latLng;
        setDrivingMapPoint({ lat: latLng.getLat(), lng: latLng.getLng() }, true, true);
    });

    setDrivingMapPoint(drivingMapSelectedPoint, false, false);
    setTimeout(() => drivingMapInstance.relayout(), 50);
}

async function setDrivingMapPoint(point, moveCenter, lookupAddress) {
    drivingMapSelectedPoint = { ...point };
    const pos = new kakao.maps.LatLng(point.lat, point.lng);

    if (drivingMapMarker) drivingMapMarker.setPosition(pos);
    if (moveCenter && drivingMapInstance) drivingMapInstance.panTo(pos);

    const coordsEl = document.getElementById('drivingMapCoords');
    const resultEl = document.getElementById('drivingMapResult');
    if (coordsEl) coordsEl.textContent = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;

    if (!lookupAddress) return;

    if (resultEl) resultEl.textContent = '선택한 위치의 도로명 주소 확인 중...';

    try {
        const found = await mapCoord2RoadAddress(point);
        if (found?.address) {
            document.getElementById('drivingMapAddress').value = found.address;
            if (found.name) document.getElementById('drivingMapName').value = found.name;
            if (resultEl) resultEl.innerHTML = `<span class="text-success fw-bold">주소 확인됨</span> · ${escapeMapHtml(found.address)}`;
        } else if (resultEl) {
            resultEl.innerHTML = '<span class="text-warning">도로명 주소를 찾지 못했습니다. 주소를 직접 입력해도 됩니다.</span>';
        }
    } catch (err) {
        console.error(err);
        if (resultEl) resultEl.textContent = '주소 확인 중 오류가 발생했습니다. 주소를 직접 입력해도 됩니다.';
    }
}

function mapCoord2RoadAddress(point) {
    return new Promise((resolve, reject) => {
        if (!kakaoGeocoder) return reject(new Error('Kakao Geocoder not ready'));
        kakaoGeocoder.coord2Address(point.lng, point.lat, (result, status) => {
            if (status !== kakao.maps.services.Status.OK || !result?.length) {
                resolve(null);
                return;
            }
            const road = result[0].road_address;
            if (!road?.address_name) {
                resolve(null);
                return;
            }
            resolve({ name: road.building_name || road.address_name, address: road.address_name });
        });
    });
}

function resetDrivingMapPoint() {
    if (!drivingMapTarget) return;
    document.getElementById('drivingMapName').value = drivingMapTarget.originalName || '';
    document.getElementById('drivingMapAddress').value = drivingMapTarget.originalAddress || '';
    document.getElementById('drivingMapRemember').checked = false;
    document.getElementById('drivingMapResult').textContent = '원래 GPS 위치로 되돌렸습니다.';
    setDrivingMapPoint(drivingMapTarget.originalPoint, true, false);
}

async function applyDrivingMapPoint() {
    if (!drivingMapTarget || !drivingMapSelectedPoint) return;

    const row = drivingRows[drivingMapTarget.rowIndex];
    if (!row) return;

    const name = document.getElementById('drivingMapName').value.trim();
    const address = document.getElementById('drivingMapAddress').value.trim();
    if (!name && !address) {
        alert('현장명 또는 주소 중 하나는 입력해주세요.');
        return;
    }

    snapshotRows();
    const point = { lat: drivingMapSelectedPoint.lat, lng: drivingMapSelectedPoint.lng };

    if (drivingMapTarget.side === 'start') {
        row.start = point;
        row.startName = name || address;
        row.startAddress = address;
        row.startCacheHit = false;
    } else {
        row.end = point;
        row.endName = name || address;
        row.endAddress = address;
        row.endCacheHit = false;
    }

    renderDrivingRows();

    if (document.getElementById('drivingMapRemember').checked && typeof window.rememberDrivingPlace === 'function') {
        await window.rememberDrivingPlace(drivingMapTarget.rowIndex, drivingMapTarget.side, true);
    }

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

window.addEventListener('DOMContentLoaded', ensureDrivingMapModal);
window.openDrivingMapReview = openDrivingMapReview;
