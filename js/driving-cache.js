// =====================================================
// 김목수이야기 ERP - driving-cache.js
// 사용자가 확정한 업무/출퇴근 장소를 브라우저에 기억하고
// 다음 JSON 분석 시 API 호출보다 먼저 좌표 반경으로 재사용
// =====================================================

const DRIVING_PLACE_CACHE_KEY = 'kimmoksu_driving_place_cache_v1';
const DRIVING_PLACE_CACHE_RADIUS_METERS = 40;

function loadDrivingPlaceCache() {
    try {
        const raw = localStorage.getItem(DRIVING_PLACE_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('운행 장소 캐시 읽기 실패:', err);
        return [];
    }
}

function saveDrivingPlaceCache(items) {
    localStorage.setItem(DRIVING_PLACE_CACHE_KEY, JSON.stringify(items));
}

function drivingDistanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371000;
    const lat1 = Number(a.lat) * Math.PI / 180;
    const lat2 = Number(b.lat) * Math.PI / 180;
    const dLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
    const dLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function findCachedDrivingPlace(point, maxMeters = DRIVING_PLACE_CACHE_RADIUS_METERS) {
    const candidates = loadDrivingPlaceCache()
        .map(item => ({ item, distance: drivingDistanceMeters(point, item) }))
        .filter(entry => entry.distance <= (Number(entry.item.radiusMeters) || maxMeters))
        .sort((a, b) => a.distance - b.distance);

    if (!candidates.length) return null;
    return { ...candidates[0].item, matchDistanceMeters: candidates[0].distance };
}

async function rememberDrivingPlace(rowIndex, side, silent = false) {
    const row = drivingRows[rowIndex];
    if (!row || row.usageType === 'personal' || row.isPersonal) return false;

    const point = side === 'start' ? row.start : row.end;
    const name = String(side === 'start' ? (row.startName || '') : (row.endName || '')).trim();
    const address = String(side === 'start' ? (row.startAddress || '') : (row.endAddress || '')).trim();
    if (!point || (!name && !address)) return false;

    let items = loadDrivingPlaceCache();
    const existingIndex = items.findIndex(item => drivingDistanceMeters(point, item) <= DRIVING_PLACE_CACHE_RADIUS_METERS);
    const saved = {
        lat: Number(point.lat),
        lng: Number(point.lng),
        name: name || address,
        address,
        radiusMeters: DRIVING_PLACE_CACHE_RADIUS_METERS,
        updatedAt: Date.now()
    };

    if (existingIndex >= 0) items[existingIndex] = saved;
    else items.push(saved);

    items = items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 500);
    saveDrivingPlaceCache(items);

    if (!silent) alert(`장소를 기억했습니다.\n${saved.name}\n다음부터 약 ${DRIVING_PLACE_CACHE_RADIUS_METERS}m 이내 좌표에 자동 적용됩니다.`);
    return true;
}

function applyDrivingPlaceCacheToRows() {
    if (!Array.isArray(drivingRows)) return 0;
    let hits = 0;

    drivingRows.forEach(row => {
        if (row.usageType === 'personal' || row.isPersonal) return;

        const startHit = findCachedDrivingPlace(row.start);
        if (startHit) {
            row.startName = startHit.name || startHit.address || '';
            row.startAddress = startHit.address || '';
            row.startCacheHit = true;
            row.startCacheDistanceMeters = Number(startHit.matchDistanceMeters.toFixed(1));
            hits++;
        }

        const endHit = findCachedDrivingPlace(row.end);
        if (endHit) {
            row.endName = endHit.name || endHit.address || '';
            row.endAddress = endHit.address || '';
            row.endCacheHit = true;
            row.endCacheDistanceMeters = Number(endHit.matchDistanceMeters.toFixed(1));
            hits++;
        }
    });

    return hits;
}

(function installDrivingCacheAfterTimelineLoad() {
    const originalLoadTimelineFile = window.loadTimelineFile;
    if (typeof originalLoadTimelineFile !== 'function') return;

    window.loadTimelineFile = async function(...args) {
        await originalLoadTimelineFile.apply(this, args);
        if (!Array.isArray(drivingRows) || !drivingRows.length) return;

        const hits = applyDrivingPlaceCacheToRows();
        if (hits > 0) {
            renderDrivingRows();
            console.info(`[운행기록부] 저장 장소 자동 적용 ${hits}건`);
        }
    };
})();

window.loadDrivingPlaceCache = loadDrivingPlaceCache;
window.findCachedDrivingPlace = findCachedDrivingPlace;
window.rememberDrivingPlace = rememberDrivingPlace;
window.applyDrivingPlaceCacheToRows = applyDrivingPlaceCacheToRows;
