// =====================================================
// 김목수이야기 ERP - driving-commute.js
// 운행기록부 출발지=직전 목적지 연동
// 자택/숙소 기준 출근·퇴근 자동 인식
// =====================================================

const DRIVING_COMMUTE_BASE_KEY = 'kimmoksu_driving_commute_bases_v1';
const DRIVING_COMMUTE_RADIUS_METERS = 100;

function loadDrivingCommuteBases() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DRIVING_COMMUTE_BASE_KEY) || '{}');
        return {
            home: parsed?.home || null,
            lodging: parsed?.lodging || null
        };
    } catch (_) {
        return { home: null, lodging: null };
    }
}

function saveDrivingCommuteBases(bases) {
    localStorage.setItem(DRIVING_COMMUTE_BASE_KEY, JSON.stringify(bases || {}));
}

function drivingCommuteDistanceMeters(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Infinity;
    const R = 6371000;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isDrivingPersonalRow(row) {
    return !!row && (row.isPersonal || row.usageType === 'personal');
}

function getDrivingLogicalPlace(rowIndex, side) {
    const row = drivingRows?.[rowIndex];
    if (!row) return null;

    // 2번째 운행부터 출발지는 직전 운행의 목적지를 그대로 사용한다.
    // 현재 행의 원본 start 좌표는 건드리지 않아 연속성/누락 검증에 계속 사용한다.
    if (side === 'start' && rowIndex > 0) {
        const prev = drivingRows[rowIndex - 1];
        if (!prev) return null;
        const personal = isDrivingPersonalRow(prev);
        return {
            sourceIndex: rowIndex - 1,
            sourceSide: 'end',
            linked: true,
            personal,
            point: prev.end || null,
            name: personal ? '개인사용' : (prev.endName || ''),
            address: personal ? '' : (prev.endAddress || '')
        };
    }

    const personal = isDrivingPersonalRow(row);
    const isStart = side === 'start';
    return {
        sourceIndex: rowIndex,
        sourceSide: side,
        linked: false,
        personal,
        point: isStart ? (row.start || null) : (row.end || null),
        name: personal ? '개인사용' : (isStart ? (row.startName || '') : (row.endName || '')),
        address: personal ? '' : (isStart ? (row.startAddress || '') : (row.endAddress || ''))
    };
}

function getDrivingPlaceEditTarget(rowIndex, side) {
    const logical = getDrivingLogicalPlace(rowIndex, side);
    if (!logical) return null;
    return {
        rowIndex: logical.sourceIndex,
        side: logical.sourceSide,
        row: drivingRows[logical.sourceIndex],
        logical
    };
}

function findDrivingCommuteBase(point) {
    if (!point) return null;
    const bases = loadDrivingCommuteBases();
    const candidates = [
        ['home', '자택', bases.home],
        ['lodging', '숙소', bases.lodging]
    ]
        .filter(([, , base]) => base?.point)
        .map(([key, label, base]) => ({
            key,
            label,
            base,
            distanceMeters: drivingCommuteDistanceMeters(point, base.point)
        }))
        .filter(item => item.distanceMeters <= DRIVING_COMMUTE_RADIUS_METERS)
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return candidates[0] || null;
}

function drivingUsageDisplayLabel(row) {
    if (!row) return '업무';
    if (row.usageType === 'personal' || row.isPersonal) return '개인사용';
    if (row.usageType !== 'commute') return '업무';
    if (row.commuteDirection === 'to_work') return '출근';
    if (row.commuteDirection === 'from_work') return '퇴근';
    return '출/퇴근';
}

function applyCommuteAutoClassification() {
    if (!Array.isArray(drivingRows) || !drivingRows.length) return false;
    let changed = false;

    drivingRows.forEach((row, index) => {
        if (!row || isDrivingPersonalRow(row) || row.usageManual === true) return;

        const startPlace = getDrivingLogicalPlace(index, 'start');
        const endPlace = getDrivingLogicalPlace(index, 'end');
        const startBase = findDrivingCommuteBase(startPlace?.point);
        const endBase = findDrivingCommuteBase(endPlace?.point);

        let direction = '';
        let matchedBaseLabel = '';

        if (startBase && !endBase) {
            direction = 'to_work';
            matchedBaseLabel = startBase.label;
        } else if (endBase && !startBase) {
            direction = 'from_work';
            matchedBaseLabel = endBase.label;
        } else if (startBase && endBase) {
            // 자택↔숙소처럼 양쪽 모두 기준 장소인 경우는 방향을 단정하지 않는다.
            direction = 'commute';
            matchedBaseLabel = `${startBase.label}↔${endBase.label}`;
        }

        if (direction) {
            if (row.usageType !== 'commute' || row.commuteDirection !== direction || !row.autoCommute) changed = true;
            row.usageType = 'commute';
            row.isPersonal = false;
            row.commuteDirection = direction;
            row.autoCommute = true;
            row.commuteBaseLabel = matchedBaseLabel;
        } else if (row.autoCommute) {
            row.usageType = 'business';
            row.commuteDirection = '';
            row.autoCommute = false;
            row.commuteBaseLabel = '';
            changed = true;
        }
    });

    return changed;
}

function drivingCommuteBaseLabel(type) {
    return type === 'home' ? '자택' : '숙소';
}

function registerDrivingCommuteBase(type, side) {
    const indexes = typeof selectedIndexes === 'function' ? selectedIndexes() : [];
    if (indexes.length !== 1) {
        alert(`${drivingCommuteBaseLabel(type)}으로 등록할 기준 운행 1건만 선택해주세요.`);
        return;
    }

    const logical = getDrivingLogicalPlace(indexes[0], side);
    if (!logical?.point) {
        alert('선택한 위치에 GPS 좌표가 없어 등록할 수 없습니다.');
        return;
    }

    const label = drivingCommuteBaseLabel(type);
    const referenceName = logical.personal ? '' : (logical.name || logical.address || '');
    if (!confirm(`${side === 'start' ? '출발지' : '목적지'}를 ${label} 기준 장소로 등록할까요?\n앞으로 이 위치 반경 ${DRIVING_COMMUTE_RADIUS_METERS}m를 ${label}으로 인식합니다.`)) return;

    const bases = loadDrivingCommuteBases();
    bases[type] = {
        type,
        label,
        point: { lat: logical.point.lat, lng: logical.point.lng },
        name: referenceName || label,
        address: logical.personal ? '' : (logical.address || ''),
        updatedAt: new Date().toISOString()
    };
    saveDrivingCommuteBases(bases);
    renderDrivingCommuteBaseSettings();
    applyCommuteAutoClassification();
    renderDrivingRows();
}

function clearDrivingCommuteBase(type) {
    const label = drivingCommuteBaseLabel(type);
    const bases = loadDrivingCommuteBases();
    if (!bases[type]) return;
    if (!confirm(`${label} 기준 장소 설정을 해제할까요?`)) return;
    bases[type] = null;
    saveDrivingCommuteBases(bases);
    renderDrivingCommuteBaseSettings();
    applyCommuteAutoClassification();
    renderDrivingRows();
}

function commuteBaseSummary(base, label) {
    if (!base?.point) return `<span class="text-secondary">${label} 미설정</span>`;
    const title = base.name && base.name !== label ? `${label} · ${base.name}` : label;
    const address = base.address ? `<div class="small text-secondary mt-1">${escapeHtml(base.address)}</div>` : '';
    return `<b>${escapeHtml(title)}</b>${address}<div class="small text-secondary">GPS 기준 반경 ${DRIVING_COMMUTE_RADIUS_METERS}m</div>`;
}

function renderDrivingCommuteBaseSettings() {
    const bases = loadDrivingCommuteBases();
    const home = document.getElementById('drivingHomeBaseSummary');
    const lodging = document.getElementById('drivingLodgingBaseSummary');
    if (home) home.innerHTML = commuteBaseSummary(bases.home, '자택');
    if (lodging) lodging.innerHTML = commuteBaseSummary(bases.lodging, '숙소');
}

window.addEventListener('DOMContentLoaded', renderDrivingCommuteBaseSettings);

window.getDrivingLogicalPlace = getDrivingLogicalPlace;
window.getDrivingPlaceEditTarget = getDrivingPlaceEditTarget;
window.findDrivingCommuteBase = findDrivingCommuteBase;
window.applyCommuteAutoClassification = applyCommuteAutoClassification;
window.drivingUsageDisplayLabel = drivingUsageDisplayLabel;
window.registerDrivingCommuteBase = registerDrivingCommuteBase;
window.clearDrivingCommuteBase = clearDrivingCommuteBase;
window.renderDrivingCommuteBaseSettings = renderDrivingCommuteBaseSettings;
