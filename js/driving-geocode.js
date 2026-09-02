// =====================================================
// 김목수이야기 ERP - 운행기록부 도로명주소 보정
// 정확 좌표에서 도로명주소 우선, 없으면 주변 도로명주소 탐색
// =====================================================

function drivingOffsetPoint(point, distanceMeters, bearingDeg) {
    const R = 6371000;
    const brng = bearingDeg * Math.PI / 180;
    const lat1 = point.lat * Math.PI / 180;
    const lng1 = point.lng * Math.PI / 180;
    const angular = distanceMeters / R;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(brng));
    const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
}

function drivingCoord2Address(point) {
    return new Promise((resolve, reject) => {
        if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return resolve(null);
        if (!kakaoReady || !kakaoGeocoder) return reject(new Error('Kakao API not ready'));
        kakaoGeocoder.coord2Address(point.lng, point.lat, (result, status) => {
            if (status !== kakao.maps.services.Status.OK || !result?.length) return resolve(null);
            resolve(result[0]);
        });
    });
}

function drivingRoadResult(hit, distanceMeters = 0) {
    const road = hit?.road_address;
    if (!road?.address_name) return null;
    const building = String(road.building_name || '').trim();
    return {
        name: building || road.address_name,
        address: road.address_name,
        nearbyDistanceMeters: distanceMeters,
        hasBuildingName: !!building
    };
}

async function drivingFindNearestRoadAddress(point) {
    if (!point) return null;
    const exact = await drivingCoord2Address(point);
    const exactRoad = drivingRoadResult(exact, 0);
    if (exactRoad) return exactRoad;

    const radii = [15, 30, 60, 100];
    const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
    for (const radius of radii) {
        const probes = bearings.map(bearing => drivingOffsetPoint(point, radius, bearing));
        const hits = await Promise.all(probes.map(probe => drivingCoord2Address(probe).catch(() => null)));
        const candidates = hits.map(hit => drivingRoadResult(hit, radius)).filter(Boolean);
        if (candidates.length) {
            candidates.sort((a, b) => Number(b.hasBuildingName) - Number(a.hasBuildingName));
            return candidates[0];
        }
    }

    return { name: '도로명 주소 없음', address: '도로명 주소 없음', nearbyDistanceMeters: null, hasBuildingName: false };
}

async function resolveAllAddressesRoadOnly() {
    if (!drivingRows.length) return alert('먼저 타임라인 JSON을 분석해주세요.');
    if (!kakaoReady) return alert('주소 서비스가 아직 연결되지 않았습니다.');

    const targets = [];
    drivingRows.forEach((r, idx) => {
        if (r.usageType === 'personal' || r.isPersonal || r.isManual) return;
        if (r.start && !r.startAddress) targets.push({ idx, side: 'start', point: r.start });
        if (r.end && !r.endAddress) targets.push({ idx, side: 'end', point: r.end });
    });

    if (!targets.length) return alert('변환할 주소가 없습니다.');
    if (!confirm(`업무/출퇴근 운행의 도로명 주소 ${targets.length}건을 변환할까요?\n도로명 주소가 없는 좌표는 주변 100m까지 탐색합니다.`)) return;

    const status = document.getElementById('kakaoStatus');
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (status) {
            status.innerHTML = `<i class="bi bi-circle-fill" style="font-size:.5rem"></i> 도로명 주소 변환 중 ${i + 1}/${targets.length}`;
            status.className = 'api-status text-warning';
        }

        try {
            const found = await drivingFindNearestRoadAddress(target.point);
            const row = drivingRows[target.idx];
            if (!row || !found) continue;
            if (target.side === 'start') {
                row.startName = found.name;
                row.startAddress = found.address;
            } else {
                row.endName = found.name;
                row.endAddress = found.address;
            }
            await sleep(35);
        } catch (err) {
            console.error('도로명 주소 변환 실패:', err);
        }
    }

    if (status) {
        status.innerHTML = '<i class="bi bi-circle-fill" style="font-size:.5rem"></i> 주소 서비스 연결됨';
        status.className = 'api-status text-success';
    }
    renderDrivingRows();
}

window.drivingFindNearestRoadAddress = drivingFindNearestRoadAddress;
window.resolveAllAddresses = resolveAllAddressesRoadOnly;
