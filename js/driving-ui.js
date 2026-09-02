// =====================================================
// 김목수이야기 ERP - driving-ui.js
// Shift 범위 선택 / 주소 직접 수정 / 지도 수정 / 장소 기억
// 빈칸 추가 / 수동 행 편집 / 거리 직접 수정
// =====================================================

let drivingLastCheckedIndex = null;

function setPlaceAddress(index, side, value) {
    const row = drivingRows[index];
    if (!row || row.usageType === 'personal' || row.isPersonal) return;
    const key = side === 'start' ? 'startAddress' : 'endAddress';
    const next = String(value || '').trim();
    if (row[key] === next) return;
    snapshotRows();
    row[key] = next;
}

function setDrivingDistance(index, value) {
    const row = drivingRows[index];
    if (!row) return;
    const next = Math.max(0, Number(value) || 0);
    if (Number(row.distanceKm) === next) return;
    snapshotRows();
    row.distanceKm = Number(next.toFixed(1));
    row.distanceEdited = true;
    updateSummary();
}

function updateManualTripDateTime(index, field, value) {
    const row = drivingRows[index];
    if (!row || !row.isManual) return;
    const next = String(value || '').trim();
    if (row[field] === next) return;
    snapshotRows();
    row[field] = next;

    if (row.date && row.startTime) row.startISO = `${row.date}T${row.startTime}:00`;
    else row.startISO = '';

    if (row.date && row.endTime) row.endISO = `${row.date}T${row.endTime}:00`;
    else row.endISO = '';
}

function addBlankDrivingRow() {
    const indexes = selectedIndexes();
    if (indexes.length !== 1) {
        alert('빈칸을 추가할 기준 운행 1건만 선택해주세요.');
        return;
    }

    const baseIndex = indexes[0];
    const base = drivingRows[baseIndex];
    snapshotRows();

    const manualRow = {
        id: `manual_${Date.now()}`,
        originalIds: [],
        startISO: '',
        endISO: '',
        date: base?.date || '',
        startTime: '',
        endTime: '',
        start: null,
        end: null,
        distanceKm: 0,
        usageType: 'business',
        startName: '',
        endName: '',
        startAddress: '',
        endAddress: '',
        isMerged: false,
        isPersonal: false,
        isManual: true,
        hiddenParts: null
    };

    drivingRows.splice(baseIndex + 1, 0, manualRow);
    renderDrivingRows();
}

function bindShiftSelection(checkbox) {
    if (!checkbox || checkbox.dataset.shiftBound) return;
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

function decorateManualCells(tr, row, rowIndex, cells) {
    if (!row.isManual) return;

    tr.classList.add('manual-row');
    tr.style.boxShadow = 'inset 3px 0 0 #22c55e';

    if (!cells[2].querySelector('.manual-date-input')) {
        cells[2].innerHTML = `<input type="date" class="form-control form-control-sm input-dark manual-date-input" value="${escapeHtml(row.date || '')}">`;
        cells[2].querySelector('input').addEventListener('change', e => updateManualTripDateTime(rowIndex, 'date', e.target.value));
    }

    if (!cells[3].querySelector('.manual-start-time')) {
        cells[3].innerHTML = `
            <div class="d-flex align-items-center gap-1">
                <input type="time" class="form-control form-control-sm input-dark manual-start-time" value="${escapeHtml(row.startTime || '')}">
                <span>→</span>
                <input type="time" class="form-control form-control-sm input-dark manual-end-time" value="${escapeHtml(row.endTime || '')}">
            </div>`;
        cells[3].querySelector('.manual-start-time').addEventListener('change', e => updateManualTripDateTime(rowIndex, 'startTime', e.target.value));
        cells[3].querySelector('.manual-end-time').addEventListener('change', e => updateManualTripDateTime(rowIndex, 'endTime', e.target.value));
    }

    if (cells[8]) {
        cells[8].innerHTML = '<span class="badge text-bg-success">수동 추가</span>';
    }
}

function decorateDistanceCell(cell, row, rowIndex) {
    if (!cell || cell.querySelector('.driving-distance-edit')) return;
    cell.innerHTML = `
        <div class="input-group input-group-sm" style="min-width:105px">
            <input type="number" min="0" step="0.1" class="form-control input-dark text-end driving-distance-edit" value="${Number(row.distanceKm || 0).toFixed(1)}">
            <span class="input-group-text bg-dark text-light border-secondary">km</span>
        </div>`;
    cell.querySelector('input').addEventListener('change', e => setDrivingDistance(rowIndex, e.target.value));
}

function decoratePlaceCell(cell, row, rowIndex, side) {
    if (!cell) return;

    const addressKey = side === 'start' ? 'startAddress' : 'endAddress';
    const pointKey = side === 'start' ? 'start' : 'end';
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

    if (cell.querySelector('.driving-place-actions')) return;

    const actions = document.createElement('div');
    actions.className = 'driving-place-actions d-flex flex-wrap gap-1 mt-1';

    // 수동 추가 행은 GPS 좌표가 없으므로 지도/장소기억 기능을 제공하지 않는다.
    if (row[pointKey]) {
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
    }

    if (row[cacheHitKey]) {
        const badge = document.createElement('span');
        badge.className = 'badge text-bg-secondary align-self-center';
        badge.textContent = `저장 장소 · ${row[cacheDistanceKey] ?? 0}m`;
        actions.appendChild(badge);
    }

    if (actions.childNodes.length) cell.appendChild(actions);
}

function decorateDrivingRows() {
    const tbody = document.getElementById('drivingBody');
    if (!tbody) return;

    const normalRows = [...tbody.querySelectorAll('tr')].filter(tr => tr.querySelector('.trip-check'));

    normalRows.forEach((tr, rowIndex) => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 9) return;

        const checkbox = tr.querySelector('.trip-check');
        bindShiftSelection(checkbox);

        const row = drivingRows[rowIndex];
        if (!row) return;

        decorateManualCells(tr, row, rowIndex, cells);
        decorateDistanceCell(cells[7], row, rowIndex);

        if (row.isRecovered && cells[8] && !row.isMerged && !row.isManual) {
            cells[8].innerHTML = '<span class="badge text-bg-warning">복구</span>';
        }

        if (row.usageType === 'personal' || row.isPersonal) return;

        decoratePlaceCell(cells[5], row, rowIndex, 'start');
        decoratePlaceCell(cells[6], row, rowIndex, 'end');
    });
}

window.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => decorateDrivingRows());
    const body = document.getElementById('drivingBody');
    if (body) observer.observe(body, { childList: true, subtree: true });
    decorateDrivingRows();
});

window.setPlaceAddress = setPlaceAddress;
window.setDrivingDistance = setDrivingDistance;
window.updateManualTripDateTime = updateManualTripDateTime;
window.addBlankDrivingRow = addBlankDrivingRow;
window.decorateDrivingRows = decorateDrivingRows;
