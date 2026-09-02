// =====================================================
// 김목수이야기 ERP - driving-ui.js
// Shift 범위 선택 / 모든 주소 지도 확인 / 주소 직접 수정 / 장소 기억
// =====================================================

let drivingLastCheckedIndex = null;

function setPlaceAddress(index, side, value) {
    const row = drivingRows[index];
    if (!row || row.usageType === 'personal' || row.isPersonal) return;
    const key = side === 'start' ? 'startAddress' : 'endAddress';
    row[key] = String(value || '').trim();
}

function decorateDrivingRows() {
    const tbody = document.getElementById('drivingBody');
    if (!tbody) return;

    [...tbody.querySelectorAll('tr')].forEach((tr, rowIndex) => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 7) return;

        const checkbox = tr.querySelector('.trip-check');
        if (checkbox && !checkbox.dataset.shiftBound) {
            checkbox.dataset.shiftBound = '1';
            checkbox.addEventListener('click', event => {
                const currentIndex = Number(checkbox.dataset.index);
                if (event.shiftKey && drivingLastCheckedIndex !== null) {
                    const start = Math.min(drivingLastCheckedIndex, currentIndex);
                    const end = Math.max(drivingLastCheckedIndex, currentIndex);
                    document.querySelectorAll('.trip-check').forEach(box => {
                        const idx = Number(box.dataset.index);
                        if (idx >= start && idx <= end) box.checked = checkbox.checked;
                    });
                }
                drivingLastCheckedIndex = currentIndex;
            });
        }

        const row = drivingRows[rowIndex];
        if (!row || row.usageType === 'personal' || row.isPersonal) return;

        [
            { cell: cells[5], side: 'start' },
            { cell: cells[6], side: 'end' }
        ].forEach(({ cell, side }) => {
            if (!cell) return;
            const addressKey = side === 'start' ? 'startAddress' : 'endAddress';
            const cacheHitKey = side === 'start' ? 'startCacheHit' : 'endCacheHit';
            const cacheDistanceKey = side === 'start' ? 'startCacheDistanceMeters' : 'endCacheDistanceMeters';
            const address = row[addressKey] || '';

            const sub = cell.querySelector('.place-sub');
            if (sub && !cell.querySelector('.driving-address-edit')) {
                sub.style.display = 'none';
                const addressInput = document.createElement('input');
                addressInput.type = 'text';
                addressInput.className = 'form-control form-control-sm input-dark mt-1 driving-address-edit';
                addressInput.value = address === '도로명 주소 없음' ? '' : address;
                addressInput.placeholder = '도로명 주소 직접 입력/수정';
                addressInput.addEventListener('change', () => setPlaceAddress(rowIndex, side, addressInput.value));
                cell.appendChild(addressInput);
            }

            if (!cell.querySelector('.driving-place-actions')) {
                const actions = document.createElement('div');
                actions.className = 'driving-place-actions d-flex flex-wrap gap-1 mt-1';

                const mapBtn = document.createElement('button');
                mapBtn.type = 'button';
                mapBtn.className = 'btn btn-sm btn-outline-info';
                mapBtn.innerHTML = '<i class="bi bi-map me-1"></i>지도 수정';
                mapBtn.addEventListener('click', () => openDrivingMapReview(rowIndex, side));
                actions.appendChild(mapBtn);

                const rememberBtn = document.createElement('button');
                rememberBtn.type = 'button';
                rememberBtn.className = 'btn btn-sm btn-outline-secondary';
                rememberBtn.innerHTML = '<i class="bi bi-bookmark-plus me-1"></i>장소 기억';
                rememberBtn.addEventListener('click', () => rememberDrivingPlace(rowIndex, side));
                actions.appendChild(rememberBtn);

                if (row[cacheHitKey]) {
                    const badge = document.createElement('span');
                    badge.className = 'badge text-bg-secondary align-self-center';
                    badge.textContent = `저장 장소 · ${row[cacheDistanceKey] ?? 0}m`;
                    actions.appendChild(badge);
                }

                cell.appendChild(actions);
            }
        });
    });
}

window.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => decorateDrivingRows());
    const body = document.getElementById('drivingBody');
    if (body) observer.observe(body, { childList: true, subtree: true });
    decorateDrivingRows();
});

window.setPlaceAddress = setPlaceAddress;
window.decorateDrivingRows = decorateDrivingRows;
