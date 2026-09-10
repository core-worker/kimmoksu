// 김목수이야기 운행기록부 공용 설정
// Kakao JavaScript 키는 웹 클라이언트용 키이며,
// Kakao Developers의 JavaScript SDK 도메인 제한과 함께 사용합니다.

window.KIMMOKSU_DRIVING_CONFIG = {
    kakaoJavaScriptKey: "26238d87788a8fa90483fc9f8a73e601"
};

function offsetDrivingPoint(point, distanceMeters, bearingDeg) {
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

function coord2AddressOnce(point) {
    return new Promise((resolve, reject) => {
        if (typeof kakaoGeocoder === 'undefined' || !kakaoGeocoder) {
            reject(new Error('Kakao Geocoder not ready'));
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

function roadAddressFromHit(hit, nearbyDistanceMeters = 0) {
    const road = hit && hit.road_address;
    if (!road || !road.address_name) return null;

    const buildingName = String(road.building_name || '').trim();
    return {
        name: buildingName || road.address_name,
        address: road.address_name,
        nearbyDistanceMeters
    };
}

async function findNearestRoadAddress(point) {
    const exactHit = await coord2AddressOnce(point);
    const exactRoad = roadAddressFromHit(exactHit, 0);
    if (exactRoad) return exactRoad;

    const radii = [15, 30, 60, 100];
    const bearings = [0, 45, 90, 135, 180, 225, 270, 315];

    for (const radius of radii) {
        const probePoints = bearings.map(bearing => offsetDrivingPoint(point, radius, bearing));
        const hits = await Promise.all(probePoints.map(p => coord2AddressOnce(p).catch(() => null)));

        const candidates = hits
            .map(hit => roadAddressFromHit(hit, radius))
            .filter(Boolean);

        if (candidates.length) {
            candidates.sort((a, b) => {
                const aHasBuilding = a.name !== a.address ? 1 : 0;
                const bHasBuilding = b.name !== b.address ? 1 : 0;
                return bHasBuilding - aHasBuilding;
            });
            return candidates[0];
        }
    }

    return {
        name: '도로명 주소 없음',
        address: '도로명 주소 없음',
        nearbyDistanceMeters: null
    };
}

window.addEventListener('DOMContentLoaded', () => {
    const key = String(window.KIMMOKSU_DRIVING_CONFIG?.kakaoJavaScriptKey || '').trim();
    const status = document.getElementById('kakaoStatus');

    // 실제 키가 비어 있거나 명시적인 placeholder일 때만 설정 필요로 판단한다.
    if (!key || key === 'YOUR_KAKAO_JAVASCRIPT_KEY') {
        if (status) {
            status.innerHTML = '<i class="bi bi-circle-fill" style="font-size:.5rem"></i> 주소 서비스 설정 필요';
            status.className = 'api-status text-danger';
        }
        return;
    }

    let hiddenInput = document.getElementById('kakaoKeyInput');
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'kakaoKeyInput';
        document.body.appendChild(hiddenInput);
    }
    hiddenInput.value = key;

    setTimeout(() => {
        if (typeof window.reverseGeocode === 'function') {
            window.reverseGeocode = findNearestRoadAddress;
        }

        if (typeof window.setKakaoStatus === 'function') {
            const originalSetKakaoStatus = window.setKakaoStatus;
            window.setKakaoStatus = function(text, ok) {
                if (text === '카카오 주소 API 연결 완료') {
                    const el = document.getElementById('kakaoStatus');
                    if (el) {
                        el.innerHTML = '<i class="bi bi-circle-fill" style="font-size:.5rem"></i> 주소 서비스 연결됨';
                        el.className = 'api-status text-success';
                    }
                    return;
                }
                originalSetKakaoStatus(text, ok);
            };
        }

        if (typeof window.connectKakaoMaps === 'function') {
            window.connectKakaoMaps();
        } else if (status) {
            status.innerHTML = '<i class="bi bi-circle-fill" style="font-size:.5rem"></i> 주소 서비스 초기화 실패';
            status.className = 'api-status text-danger';
        }
    }, 0);
});
