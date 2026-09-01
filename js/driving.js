// =====================================================
// 김목수이야기 ERP - driving.js
// 역할: Google Timeline JSON 파싱, 운행 묶기/개인사용,
//       Kakao 좌표->주소 변환, 운행 미리보기
// =====================================================

let drivingRows = [];
let drivingHistory = [];
let kakaoGeocoder = null;
let kakaoReady = false;

function parseLatLng(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.replace(/°/g, '').trim();
    const parts = cleaned.split(',').map(v => Number(v.trim()));
    if (parts.length !== 2 || parts.some(v => !Number.isFinite(v))) return null;
    return { lat: parts[0], lng: parts[1] };
}

function toLocalParts(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: '', time: '' };
    return {
        date: d.toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' }).replace(/\. /g,'-').replace('.',''),
        time: d.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit', hour12:false })
    };
}

function normalizeVehicleSegment(segment, idx) {
    const act = segment && segment.activity;
    if (!act) return null;
    const topType = act.topCandidate && act.topCandidate.type;
    if (topType !== 'IN_PASSENGER_VEHICLE') return null;

    const start = parseLatLng(act.start && act.start.latLng);
    const end = parseLatLng(act.end && act.end.latLng);
    if (!start || !end) return null;

    const startParts = toLocalParts(segment.startTime);
    const endParts = toLocalParts(segment.endTime);

    return {
        id: `trip_${idx}_${Date.now()}`,
        originalIds: [`segment_${idx}`],
        startISO: segment.startTime,
        endISO: segment.endTime,
        date: startParts.date,
        startTime: startParts.time,
        endTime: endParts.time,
        start,
        end,
        distanceKm: Number(((Number(act.distanceMeters) || 0) / 1000).toFixed(1)),
        usageType: 'business',
        startName: '',
        endName: '',
        startAddress: '',
        endAddress: '',
        isMerged: false,
        isPersonal: false,
        hiddenParts: null
    };
}

async function loadTimelineFile() {
    const input = document.getElementById('timelineFile');
    const file = input && input.files && input.files[0];
    if (!file) {
        alert('Google 타임라인 JSON 파일을 선택해주세요.');
        return;
    }

    try {
        const text = await file.text();
        const json = JSON.parse(text);
        const segments = Array.isArray(json.semanticSegments) ? json.semanticSegments : [];

        const rows = segments
            .map((segment, idx) => normalizeVehicleSegment(segment, idx))
            .filter(Boolean)
            .sort((a,b) => new Date(a.startISO) - new Date(b.startISO));

        if (!rows.length) {
            alert('IN_PASSENGER_VEHICLE 차량 운행을 찾지 못했습니다.');
            return;
        }

        drivingRows = rows;
        drivingHistory = [];
        renderDrivingRows();
        alert(`차량 운행 ${rows.length}건을 찾았습니다.`);
    } catch (err) {
        console.error(err);
        alert('JSON 분석 중 오류가 발생했습니다. 올바른 Google Timeline 파일인지 확인해주세요.');
    }
}

function snapshotRows() {
    drivingHistory.push(JSON.stringify(drivingRows));
    if (drivingHistory.length > 20) drivingHistory.shift();
}

function selectedIndexes() {
    return [...document.querySelectorAll('.trip-check:checked')]
        .map(el => Number(el.dataset.index))
        .filter(Number.isInteger)
        .sort((a,b) => a-b);
}

function mergeSelected(asPersonal) {
    const indexes = selectedIndexes();
    if (indexes.length < 2) {
        alert('묶을 운행을 2건 이상 선택해주세요.');
        return;
    }

    // 연속된 행만 묶기 허용
    for (let i=1; i<indexes.length; i++) {
        if (indexes[i] !== indexes[i-1] + 1) {
            alert('연속된 운행만 하나로 묶을 수 있습니다.');
            return;
        }
    }

    snapshotRows();
    const parts = indexes.map(i => drivingRows[i]);
    const first = parts[0];
    const last = parts[parts.length - 1];
    const totalDistance = Number(parts.reduce((sum, r) => sum + (Number(r.distanceKm)||0), 0).toFixed(1));

    const merged = {
        id: `merged_${Date.now()}`,
        originalIds: parts.flatMap(r => r.originalIds || [r.id]),
        startISO: first.startISO,
        endISO: last.endISO,
        date: first.date,
        startTime: first.startTime,
        endTime: last.endTime,
        start: first.start,
        end: last.end,
        distanceKm: totalDistance,
        usageType: asPersonal ? 'personal' : first.usageType,
        startName: asPersonal ? '개인사용' : first.startName,
        endName: asPersonal ? '개인사용' : last.endName,
        startAddress: asPersonal ? '' : first.startAddress,
        endAddress: asPersonal ? '' : last.endAddress,
        isMerged: true,
        isPersonal: !!asPersonal,
        hiddenParts: parts
    };

    drivingRows.splice(indexes[0], indexes.length, merged);
    renderDrivingRows();
}

function excludeSelected() {
    const indexes = selectedIndexes();
    if (!indexes.length) {
        alert('제외할 운행을 선택해주세요.');
        return;
    }
    snapshotRows();
    const set = new Set(indexes);
    drivingRows = drivingRows.filter((_, idx) => !set.has(idx));
    renderDrivingRows();
}

function undoLastAction() {
    if (!drivingHistory.length) {
        alert('되돌릴 작업이 없습니다.');
        return;
    }
    drivingRows = JSON.parse(drivingHistory.pop());
    renderDrivingRows();
}

function toggleAllRows(checked) {
    document.querySelectorAll('.trip-check').forEach(el => el.checked = checked);
}

function usageOptions(selected) {
    const options = [
        ['business','업무'],
        ['commute','출/퇴근'],
        ['personal','개인사용']
    ];
    return options.map(([v,t]) => `<option value="${v}" ${v===selected?'selected':''}>${t}</option>`).join('');
}

function setUsageType(index, value) {
    const row = drivingRows[index];
    if (!row) return;
    snapshotRows();
    row.usageType = value;
    row.isPersonal = value === 'personal';
    if (row.isPersonal) {
        row.startName = '개인사용';
        row.endName = '개인사용';
        row.startAddress = '';
        row.endAddress = '';
    }
    renderDrivingRows();
}

function renderDrivingRows() {
    const body = document.getElementById('drivingBody');
    const all = document.getElementById('checkAll');
    if (all) all.checked = false;

    if (!drivingRows.length) {
        body.innerHTML = '<tr><td colspan="9" class="text-center text-secondary py-5">표시할 운행이 없습니다.</td></tr>';
        updateSummary();
        return;
    }

    body.innerHTML = drivingRows.map((r, idx) => {
        const personal = r.isPersonal || r.usageType === 'personal';
        const startTitle = personal ? '개인사용' : (r.startName || '주소 미변환');
        const endTitle = personal ? '개인사용' : (r.endName || '주소 미변환');
        const status = r.isMerged ? `<span class="badge badge-soft">${r.originalIds.length}건 묶음</span>` : '<span class="text-secondary">일반</span>';
        return `<tr class="${personal?'personal-row':''} ${r.isMerged?'merged-row':''}">
            <td><input class="trip-check" type="checkbox" data-index="${idx}"></td>
            <td>${idx+1}</td>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.startTime)} → ${escapeHtml(r.endTime)}</td>
            <td>
                <select class="form-select form-select-sm input-dark" onchange="setUsageType(${idx}, this.value)" ${personal && r.isMerged ? 'disabled' : ''}>
                    ${usageOptions(r.usageType)}
                </select>
            </td>
            <td>
                <div class="place-main">${escapeHtml(startTitle)}</div>
                <div class="place-sub">${personal?'':escapeHtml(r.startAddress || `${r.start.lat.toFixed(6)}, ${r.start.lng.toFixed(6)}`)}</div>
            </td>
            <td>
                <div class="place-main">${escapeHtml(endTitle)}</div>
                <div class="place-sub">${personal?'':escapeHtml(r.endAddress || `${r.end.lat.toFixed(6)}, ${r.end.lng.toFixed(6)}`)}</div>
            </td>
            <td class="text-end fw-bold">${r.distanceKm.toFixed(1)} km</td>
            <td>${status}</td>
        </tr>`;
    }).join('');

    updateSummary();
}

function updateSummary() {
    const total = drivingRows.reduce((s,r)=>s+(Number(r.distanceKm)||0),0);
    const personal = drivingRows.filter(r=>r.usageType==='personal' || r.isPersonal).reduce((s,r)=>s+(Number(r.distanceKm)||0),0);
    const business = total - personal;
    document.getElementById('sumCount').textContent = `${drivingRows.length}건`;
    document.getElementById('sumDistance').textContent = `${total.toFixed(1)} km`;
    document.getElementById('sumBusiness').textContent = `${business.toFixed(1)} km`;
    document.getElementById('sumPersonal').textContent = `${personal.toFixed(1)} km`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function connectKakaoMaps() {
    const keyInput = document.getElementById('kakaoKeyInput');
    const key = (keyInput.value || localStorage.getItem('kimmoksu_kakao_js_key') || '').trim();
    if (!key) {
        alert('Kakao JavaScript 키를 입력해주세요.');
        return;
    }
    localStorage.setItem('kimmoksu_kakao_js_key', key);

    if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
        initKakaoGeocoder();
        return;
    }

    const old = document.getElementById('kakaoMapsSdk');
    if (old) old.remove();
    const script = document.createElement('script');
    script.id = 'kakaoMapsSdk';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
    script.onload = () => {
        if (!window.kakao || !window.kakao.maps) {
            setKakaoStatus('카카오 SDK를 불러왔지만 초기화에 실패했습니다.', false);
            return;
        }
        window.kakao.maps.load(initKakaoGeocoder);
    };
    script.onerror = () => setKakaoStatus('카카오 SDK 로드 실패: JavaScript 키와 SDK 도메인을 확인하세요.', false);
    document.head.appendChild(script);
}

function initKakaoGeocoder() {
    try {
        kakaoGeocoder = new kakao.maps.services.Geocoder();
        kakaoReady = true;
        setKakaoStatus('카카오 주소 API 연결 완료', true);
    } catch (err) {
        console.error(err);
        kakaoReady = false;
        setKakaoStatus('카카오 Geocoder 초기화 실패', false);
    }
}

function setKakaoStatus(text, ok) {
    const el = document.getElementById('kakaoStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `step-note mt-2 ${ok ? 'text-success' : 'text-danger'}`;
}

function reverseGeocode(point) {
    return new Promise((resolve, reject) => {
        if (!kakaoReady || !kakaoGeocoder) return reject(new Error('Kakao API not ready'));
        kakaoGeocoder.coord2Address(point.lng, point.lat, (result, status) => {
            if (status !== kakao.maps.services.Status.OK || !result || !result.length) {
                resolve({ name:'주소 확인 불가', address:'' });
                return;
            }
            const hit = result[0];
            const road = hit.road_address && hit.road_address.address_name;
            const jibun = hit.address && hit.address.address_name;
            const address = road || jibun || '';
            const building = hit.road_address && hit.road_address.building_name;
            resolve({ name: building || address || '주소 확인', address });
        });
    });
}

async function resolveAllAddresses() {
    if (!drivingRows.length) {
        alert('먼저 타임라인 JSON을 분석해주세요.');
        return;
    }
    if (!kakaoReady) {
        alert('먼저 카카오 주소 API를 연결해주세요.');
        return;
    }

    const targets = [];
    drivingRows.forEach((r, idx) => {
        if (r.usageType === 'personal' || r.isPersonal) return;
        if (!r.startAddress) targets.push({ idx, side:'start', point:r.start });
        if (!r.endAddress) targets.push({ idx, side:'end', point:r.end });
    });

    if (!targets.length) {
        alert('변환할 주소가 없습니다.');
        return;
    }

    if (!confirm(`업무/출퇴근 운행의 주소 ${targets.length}건을 카카오 API로 변환할까요?`)) return;

    const status = document.getElementById('kakaoStatus');
    for (let i=0; i<targets.length; i++) {
        const t = targets[i];
        if (status) status.textContent = `주소 변환 중 ${i+1}/${targets.length}`;
        try {
            const found = await reverseGeocode(t.point);
            const row = drivingRows[t.idx];
            if (!row) continue;
            if (t.side === 'start') {
                row.startName = found.name;
                row.startAddress = found.address;
            } else {
                row.endName = found.name;
                row.endAddress = found.address;
            }
            await sleep(40);
        } catch (err) {
            console.error(err);
        }
    }
    setKakaoStatus(`주소 변환 완료 (${targets.length}건)`, true);
    renderDrivingRows();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('kimmoksu_kakao_js_key');
    const input = document.getElementById('kakaoKeyInput');
    if (saved && input) input.value = saved;
    renderDrivingRows();
});

window.loadTimelineFile = loadTimelineFile;
window.mergeSelected = mergeSelected;
window.excludeSelected = excludeSelected;
window.undoLastAction = undoLastAction;
window.toggleAllRows = toggleAllRows;
window.setUsageType = setUsageType;
window.connectKakaoMaps = connectKakaoMaps;
window.resolveAllAddresses = resolveAllAddresses;
