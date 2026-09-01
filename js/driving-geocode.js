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

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(angular) +
        Math.cos(lat1) * Math.sin(angular) * Math.cos(brng)
    );
    const lng2 = lng1 + Math.atan2(
        Math.sin(brng) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
        lat: lat2 * 180 / Math.PI,
        lng: lng2 * 180 / Math.PI
    };
}

function drivingCoord2Address(point) {
    return new Promise((resolve, reject) => {
        if (!kakaoReady || !kakaoGeocoder) {
            reject(new Error('Kakao API not ready'));
            return;
        }

        kakaoGeocoder.coord2Address(point.lng, point.lat, (result, status) => {
            if (status !== kakao.maps.services.Status.OK || !result || !result.length) {
                resolve(null);
                return;
            }
            resolve(result[0]);
        });
    });
}

function drivingRoadResult(hit, distanceMeters = 0) {
    const road = hit && hit.road_address;
    if (!road || !road.address_name) return null;

    const building = String(road.building_name || '').trim();
    return {
        name: building || road.address_name,
        address: road.address_name,
        nearbyDistanceMeters: distanceMeters,
        hasBuildingName: !!building
    };
}

async function drivingFindNearestRoadAddress(point) {
    // 1. 원래 GPS 좌표에서 도로명주소 확인
    const exact = await drivingCoord2Address(point);
    const exactRoad = drivingRoadResult(exact, 0);
    if (exactRoad) return exactRoad;

    // 2. 원 좌표에 도로명주소가 없을 때만 주변 탐색
    // 가까운 반경부터 탐색하며 첫 성공 반경에서 종료한다.
    const radii = [15, 30, 60, 100];
    const bearings = [0, 45, 90, 135, 180, 225, 270, 315];

    for (const radius of radii) {
        const probes = bearings.map(bearing => drivingOffsetPoint(point, radius, bearing));
        const hits = await Promise.all(
            probes.map(probe => drivingCoord2Address(probe).catch(() => null))
        );

        const candidates = hits
            .map(hit => drivingRoadResult(hit, radius))
            .filter(Boolean);

        if (candidates.length) {
            // 동일 반경에서는 건물명이 붙은 결과를 우선한다.
            candidates.sort((a, b) => Number(b.hasBuildingName) - Number(a.hasBuildingName));
            return candidates[0];
        }
    }

    // 지번 주소로 대체하지 않는다.
    return {
        name: '도로명 주소 없음',
        address: '도로명 주소 없음',
        nearbyDistanceMeters: null,
        hasBuildingName: false
    };
}

async function resolveAllAddressesRoadOnly() {
    if (!drivingRows.length) {
        alert('먼저 타임라인 JSON을 분석해주세요.');
        return;
    }
    if (!kakaoReady) {
        alert('주소 서비스가 아직 연결되지 않았습니다.');
        return;
    }

    const targets = [];
    drivingRows.forEach((r, idx) => {
        if (r.usageType === 'personal' || r.isPersonal) return;
        if (!r.startAddress) targets.push({ idx, side: 'start', point: r.start });
        if (!r.endAddress) targets.push({ idx, side: 'end', point: r.end });
    });

    if (!targets.length) {
        alert('변환할 주소가 없습니다.');
        return;
    }

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
            if (!row) continue;

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

// 기존 버튼이 호출하는 함수를 도로명주소 우선 버전으로 교체한다.
window.resolveAllAddresses = resolveAllAddressesRoadOnly;
