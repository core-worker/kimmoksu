// =====================================================
// 김목수이야기 ERP - 운행기록 수동 분류 / 연속 출발지 연동
// 구분 클릭 순환, 직전 목적지 연동, 묶음 운행 상세보기
// =====================================================

(function installDrivingManualWorkflow() {
    const LEGACY_COMMUTE_BASE_KEY = 'kimmoksu_driving_commute_bases_v1';

    function removeLegacyCommuteSettings() {
        localStorage.removeItem(LEGACY_COMMUTE_BASE_KEY);

        document.querySelectorAll('.card-dark').forEach(card => {
            const title = card.querySelector('h5')?.textContent?.trim() || '';
            if (title.includes('출퇴근 기준 장소')) card.remove();
        });
    }

    function installWorkflowStyles() {
        if (document.getElementById('drivingWorkflowStyles')) return;
        const style = document.createElement('style');
        style.id = 'drivingWorkflowStyles';
        style.textContent = `
            .driving-table tr.driving-date-break > td {
                border-top: 4px solid #64748b !important;
            }
            .driving-usage-cycle {
                min-width: 88px;
                font-weight: 800;
                cursor: pointer;
                user-select: none;
            }
            .driving-usage-business { border-color:#3b82f6!important; color:#93c5fd!important; }
            .driving-usage-commute { border-color:#f59e0b!important; color:#fcd34d!important; }
            .driving-usage-personal { border-color:#ef4444!important; color:#fca5a5!important; }
            .driving-merged-detail-btn { cursor:pointer; border:0; }
            .driving-merged-detail-table td,
            .driving-merged-detail-table th { vertical-align:middle; }
            .driving-merged-place-name { font-weight:700; }
            .driving-merged-place-address { color:#94a3b8; font-size:.74rem; margin-top:2px; }
        `;
        document.head.appendChild(style);
    }

    function isPersonalRow(row) {
        return !!row && (row.isPersonal || row.usageType === 'personal');
    }

    // 화면/엑셀에서 사용하는 논리 위치.
    // 2번째 운행부터 직전 운행이 업무/출퇴근일 때만 그 목적지를 출발지로 참조한다.
    // 직전 운행이 개인사용이면 연동을 끊고 현재 운행의 원본 start를 독립 출발지로 사용한다.
    // 현재 행의 원본 start 좌표는 항상 보존되어 누락 이동 검증에는 원본 GPS가 유지된다.
    function getDrivingPlaceTarget(rowIndex, side) {
        const current = drivingRows?.[rowIndex];
        if (!current) return null;

        if (side === 'start' && rowIndex > 0) {
            const previous = drivingRows[rowIndex - 1];
            if (previous && !isPersonalRow(previous)) {
                return {
                    displayRowIndex: rowIndex,
                    displaySide: side,
                    rowIndex: rowIndex - 1,
                    side: 'end',
                    row: previous,
                    linked: true
                };
            }
        }

        return {
            displayRowIndex: rowIndex,
            displaySide: side,
            rowIndex,
            side,
            row: current,
            linked: false
        };
    }

    function getDrivingDisplayPlace(rowIndex, side) {
        const current = drivingRows?.[rowIndex];
        if (!current) return null;
        if (isPersonalRow(current)) {
            return { personal: true, name: '개인사용', address: '', point: null };
        }

        const target = getDrivingPlaceTarget(rowIndex, side);
        if (!target?.row) return null;
        if (isPersonalRow(target.row)) {
            return { personal: true, name: '개인사용', address: '', point: null, target };
        }

        const isStart = target.side === 'start';
        return {
            personal: false,
            name: isStart ? (target.row.startName || '') : (target.row.endName || ''),
            address: isStart ? (target.row.startAddress || '') : (target.row.endAddress || ''),
            point: isStart ? (target.row.start || null) : (target.row.end || null),
            cacheHit: isStart ? !!target.row.startCacheHit : !!target.row.endCacheHit,
            cacheDistanceMeters: isStart ? target.row.startCacheDistanceMeters : target.row.endCacheDistanceMeters,
            target
        };
    }

    function usageLabel(value) {
        if (value === 'commute') return '출/퇴근';
        if (value === 'personal') return '개인사용';
        return '업무';
    }

    function usageClass(value) {
        if (value === 'commute') return 'driving-usage-commute';
        if (value === 'personal') return 'driving-usage-personal';
        return 'driving-usage-business';
    }

    function backupNonPersonalPlaces(row) {
        if (!row || row._nonPersonalPlaceBackup) return;
        row._nonPersonalPlaceBackup = {
            startName: row.startName || '',
            endName: row.endName || '',
            startAddress: row.startAddress || '',
            endAddress: row.endAddress || ''
        };
    }

    function restoreNonPersonalPlaces(row) {
        if (!row) return;
        const backup = row._nonPersonalPlaceBackup;
        if (backup) {
            row.startName = backup.startName || '';
            row.endName = backup.endName || '';
            row.startAddress = backup.startAddress || '';
            row.endAddress = backup.endAddress || '';
            return;
        }

        if (Array.isArray(row.hiddenParts) && row.hiddenParts.length) {
            const first = row.hiddenParts[0];
            const last = row.hiddenParts[row.hiddenParts.length - 1];
            if (row.startName === '개인사용') row.startName = first?.startName || '';
            if (row.endName === '개인사용') row.endName = last?.endName || '';
            if (!row.startAddress) row.startAddress = first?.startAddress || '';
            if (!row.endAddress) row.endAddress = last?.endAddress || '';
        } else {
            if (row.startName === '개인사용') row.startName = '';
            if (row.endName === '개인사용') row.endName = '';
        }
    }

    function setManualUsageType(index, value) {
        const row = drivingRows?.[index];
        if (!row) return;
        const next = ['business', 'commute', 'personal'].includes(value) ? value : 'business';
        if (row.usageType === next && row.isPersonal === (next === 'personal')) return;

        snapshotRows();

        if (next === 'personal') {
            backupNonPersonalPlaces(row);
            row.usageType = 'personal';
            row.isPersonal = true;
        } else {
            const wasPersonal = isPersonalRow(row);
            row.usageType = next;
            row.isPersonal = false;
            if (wasPersonal) restoreNonPersonalPlaces(row);
        }

        delete row.autoCommute;
        delete row.commuteDirection;
        delete row.commuteBaseLabel;
        delete row.usageManual;

        renderDrivingRows();
    }

    function cycleDrivingUsage(index) {
        const row = drivingRows?.[index];
        if (!row) return;
        const current = isPersonalRow(row) ? 'personal' : (row.usageType === 'commute' ? 'commute' : 'business');
        const next = current === 'business' ? 'commute' : current === 'commute' ? 'personal' : 'business';
        setManualUsageType(index, next);
    }

    function setLinkedPlaceName(index, side, value) {
        const target = getDrivingPlaceTarget(index, side);
        if (!target?.row || isPersonalRow(drivingRows[index]) || isPersonalRow(target.row)) return;
        const key = target.side === 'start' ? 'startName' : 'endName';
        const next = String(value || '').trim();
        if (target.row[key] === next) return;
        snapshotRows();
        target.row[key] = next;
        renderDrivingRows();
    }

    function setLinkedPlaceAddress(index, side, value) {
        const target = getDrivingPlaceTarget(index, side);
        if (!target?.row || isPersonalRow(drivingRows[index]) || isPersonalRow(target.row)) return;
        const key = target.side === 'start' ? 'startAddress' : 'endAddress';
        const next = String(value || '').trim();
        if (target.row[key] === next) return;
        snapshotRows();
        target.row[key] = next;
        renderDrivingRows();
    }

    function renderLinkedPlaceCell(row, index, side, personal) {
        if (personal) return '<div class="place-main">개인사용</div>';

        const place = getDrivingDisplayPlace(index, side);
        if (!place || place.personal) return '<div class="place-main">개인사용</div>';

        const fallback = place.point ? `${place.point.lat.toFixed(6)}, ${place.point.lng.toFixed(6)}` : '';
        return `
            <input type="text"
                   class="form-control form-control-sm input-dark mb-1"
                   value="${escapeHtml(place.name)}"
                   placeholder="현장명 / 장소명 입력"
                   onchange="setPlaceName(${index}, '${side}', this.value)">
            <div class="place-sub">${escapeHtml(place.address || fallback)}</div>
        `;
    }

    function mergedStatusHtml(row, index, personal) {
        const count = Math.max(1, Array.isArray(row.originalIds) ? row.originalIds.length : 1);
        const routeButton = !personal && !row.isManual
            ? `<button type="button" class="btn btn-sm btn-outline-info py-0 px-2 ms-1" onclick="openDrivingRoute(${index})" title="Timeline 실제 이동 경로 보기"><i class="bi bi-sign-turn-right me-1"></i>경로</button>`
            : '';

        if (!row.isMerged) return `<span class="text-secondary">일반</span>${routeButton}`;
        if (personal) return `<span class="badge badge-soft">${count}건 묶음</span>`;
        return `<button type="button" class="badge badge-soft driving-merged-detail-btn" onclick="openMergedTripDetails(${index})" title="묶인 운행 상세보기">${count}건 묶음 · 보기</button>${routeButton}`;
    }

    function renderWorkflowRows() {
        const body = document.getElementById('drivingBody');
        const all = document.getElementById('checkAll');
        if (!body) return;
        if (all) all.checked = false;

        if (!Array.isArray(drivingRows) || !drivingRows.length) {
            body.innerHTML = '<tr><td colspan="9" class="text-center text-secondary py-5">표시할 운행이 없습니다.</td></tr>';
            updateSummary();
            return;
        }

        body.innerHTML = drivingRows.map((r, idx) => {
            const personal = isPersonalRow(r);
            const dateBreak = idx > 0 && String(drivingRows[idx - 1]?.date || '') !== String(r.date || '');
            const status = mergedStatusHtml(r, idx, personal);
            const currentUsage = personal ? 'personal' : (r.usageType === 'commute' ? 'commute' : 'business');

            return `<tr class="${personal ? 'personal-row' : ''} ${r.isMerged ? 'merged-row' : ''} ${dateBreak ? 'driving-date-break' : ''}">
                <td><input class="trip-check" type="checkbox" data-index="${idx}"></td>
                <td>${idx + 1}</td>
                <td>${escapeHtml(r.date)}</td>
                <td>${escapeHtml(r.startTime)} → ${escapeHtml(r.endTime)}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-secondary driving-usage-cycle ${usageClass(currentUsage)}" onclick="cycleDrivingUsage(${idx})" title="클릭: 업무 → 출/퇴근 → 개인사용">
                        ${usageLabel(currentUsage)}
                    </button>
                </td>
                <td>${renderLinkedPlaceCell(r, idx, 'start', personal)}</td>
                <td>${renderLinkedPlaceCell(r, idx, 'end', personal)}</td>
                <td class="text-end fw-bold">${Number(r.distanceKm || 0).toFixed(1)} km</td>
                <td>${status}</td>
            </tr>`;
        }).join('');

        updateSummary();
    }

    function decorateLinkedPlaceCell(cell, row, rowIndex, side) {
        if (!cell) return;
        const current = drivingRows[rowIndex];
        const target = getDrivingPlaceTarget(rowIndex, side);
        const place = getDrivingDisplayPlace(rowIndex, side);
        if (!current || !target?.row || !place || place.personal || isPersonalRow(current)) return;

        const sub = cell.querySelector('.place-sub');
        if (sub && !cell.querySelector('.driving-address-edit')) {
            sub.style.display = 'none';
            const addressInput = document.createElement('input');
            addressInput.type = 'text';
            addressInput.className = 'form-control form-control-sm input-dark mt-1 driving-address-edit';
            addressInput.value = place.address === '도로명 주소 없음' ? '' : (place.address || '');
            addressInput.placeholder = '도로명 주소 직접 입력/수정';
            addressInput.addEventListener('change', () => setLinkedPlaceAddress(rowIndex, side, addressInput.value));
            cell.appendChild(addressInput);
        }

        if (cell.querySelector('.driving-place-actions')) return;
        const actions = document.createElement('div');
        actions.className = 'driving-place-actions d-flex flex-wrap gap-1 mt-1';

        if (place.point) {
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
            rememberBtn.addEventListener('click', () => rememberDrivingPlace(target.rowIndex, target.side));
            actions.appendChild(rememberBtn);
        }

        if (place.cacheHit) {
            const badge = document.createElement('span');
            badge.className = 'badge text-bg-secondary align-self-center';
            badge.textContent = `저장 장소 · ${place.cacheDistanceMeters ?? 0}m`;
            actions.appendChild(badge);
        }

        if (actions.childNodes.length) cell.appendChild(actions);
    }

    function flattenMergedParts(row, output = []) {
        if (!row) return output;
        if (Array.isArray(row.hiddenParts) && row.hiddenParts.length) {
            row.hiddenParts.forEach(part => flattenMergedParts(part, output));
        } else {
            output.push(row);
        }
        return output;
    }

    function getPartPlaceData(part, side) {
        if (!part || isPersonalRow(part)) return { name: '개인사용', address: '' };
        const isStart = side === 'start';
        return {
            name: isStart ? (part.startName || '') : (part.endName || ''),
            address: isStart ? (part.startAddress || '') : (part.endAddress || ''),
            point: isStart ? (part.start || null) : (part.end || null)
        };
    }

    async function resolveMergedPartSide(part, side, resolvedPointCache) {
        const data = getPartPlaceData(part, side);
        if (!data.point || isPersonalRow(part)) return;
        if (data.address && data.address !== '도로명 주소 없음') return;

        const pointKey = `${Number(data.point.lat).toFixed(6)},${Number(data.point.lng).toFixed(6)}`;
        let found = resolvedPointCache.get(pointKey) || null;

        if (!found && typeof window.findCachedDrivingPlace === 'function') {
            const cached = window.findCachedDrivingPlace(data.point);
            if (cached) found = { name: cached.name || cached.address || '', address: cached.address || '' };
        }

        if (!found && window.kakaoReady !== false && typeof window.drivingFindNearestRoadAddress === 'function') {
            try {
                found = await window.drivingFindNearestRoadAddress(data.point);
            } catch (err) {
                console.warn('묶음 운행 주소 변환 실패:', err);
            }
        }

        if (!found?.address || found.address === '도로명 주소 없음') return;
        resolvedPointCache.set(pointKey, found);

        if (side === 'start') {
            part.startName = found.name || found.address;
            part.startAddress = found.address;
        } else {
            part.endName = found.name || found.address;
            part.endAddress = found.address;
        }
    }

    async function resolveMergedPartAddresses(parts) {
        const resolvedPointCache = new Map();
        for (const part of parts) {
            await resolveMergedPartSide(part, 'start', resolvedPointCache);
            await resolveMergedPartSide(part, 'end', resolvedPointCache);
        }
    }

    function mergedPartPlaceHtml(part, side) {
        const data = getPartPlaceData(part, side);
        if (isPersonalRow(part)) return '<span class="text-secondary">개인사용</span>';

        const name = String(data.name || '').trim();
        const address = String(data.address || '').trim();
        if (!name && !address) return '<span class="text-warning">주소 확인 불가</span>';

        if (!name || name === address) {
            return `<div class="driving-merged-place-name">${escapeHtml(address || name)}</div>`;
        }

        return `
            <div class="driving-merged-place-name">${escapeHtml(name)}</div>
            ${address ? `<div class="driving-merged-place-address">${escapeHtml(address)}</div>` : ''}
        `;
    }

    function ensureMergedTripModal() {
        if (document.getElementById('drivingMergedDetailModal')) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal fade" id="drivingMergedDetailModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content bg-dark text-light border-secondary">
                        <div class="modal-header border-secondary">
                            <div>
                                <h5 class="modal-title fw-bold"><i class="bi bi-layers me-2"></i>묶인 운행 상세보기</h5>
                                <div id="drivingMergedDetailSummary" class="small text-secondary mt-1"></div>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div id="drivingMergedDetailLoading" class="small text-warning mb-2 d-none">원본 운행의 주소를 확인하고 있습니다...</div>
                            <div class="table-responsive">
                                <table class="table table-dark table-bordered driving-merged-detail-table mb-0">
                                    <thead><tr><th>#</th><th>일자</th><th>시간</th><th>출발</th><th>도착</th><th class="text-end">거리</th></tr></thead>
                                    <tbody id="drivingMergedDetailBody"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(wrap.firstElementChild);
    }

    function renderMergedPartRows(parts) {
        const body = document.getElementById('drivingMergedDetailBody');
        if (!body) return;
        body.innerHTML = parts.map((part, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(part.date || '')}</td>
                <td>${escapeHtml(part.startTime || '')} → ${escapeHtml(part.endTime || '')}</td>
                <td>${mergedPartPlaceHtml(part, 'start')}</td>
                <td>${mergedPartPlaceHtml(part, 'end')}</td>
                <td class="text-end fw-bold">${Number(part.distanceKm || 0).toFixed(1)} km</td>
            </tr>`).join('');
    }

    async function openMergedTripDetails(index) {
        const row = drivingRows?.[index];
        if (!row || !row.isMerged || isPersonalRow(row)) return;
        const parts = flattenMergedParts(row, []);
        if (!parts.length) return;

        ensureMergedTripModal();
        const summary = document.getElementById('drivingMergedDetailSummary');
        const loading = document.getElementById('drivingMergedDetailLoading');
        const total = parts.reduce((sum, part) => sum + (Number(part.distanceKm) || 0), 0);

        if (summary) summary.textContent = `${parts.length}개 원본 운행 · 합계 ${total.toFixed(1)} km`;
        if (loading) loading.classList.remove('d-none');
        renderMergedPartRows(parts);

        bootstrap.Modal.getOrCreateInstance(document.getElementById('drivingMergedDetailModal')).show();

        await resolveMergedPartAddresses(parts);
        renderMergedPartRows(parts);
        if (loading) loading.classList.add('d-none');
    }

    async function openLinkedDrivingMapReview(rowIndex, side) {
        if (!window.kakao || !kakao.maps) {
            alert('주소 서비스가 아직 연결되지 않았습니다.');
            return;
        }

        const current = drivingRows?.[rowIndex];
        const target = getDrivingPlaceTarget(rowIndex, side);
        if (!current || !target?.row || isPersonalRow(current) || isPersonalRow(target.row)) return;

        const sourceRow = target.row;
        const point = target.side === 'start' ? sourceRow.start : sourceRow.end;
        if (!point) return;

        const name = target.side === 'start' ? sourceRow.startName : sourceRow.endName;
        const address = target.side === 'start' ? sourceRow.startAddress : sourceRow.endAddress;

        ensureDrivingMapModal();
        drivingMapTarget = {
            rowIndex: target.rowIndex,
            side: target.side,
            originalPoint: { ...point },
            originalName: name || '',
            originalAddress: address && address !== '도로명 주소 없음' ? address : ''
        };
        drivingMapSelectedPoint = { ...point };

        document.getElementById('drivingMapName').value = name && name !== '도로명 주소 없음' ? name : '';
        document.getElementById('drivingMapAddress').value = address && address !== '도로명 주소 없음' ? address : '';
        document.getElementById('drivingMapRemember').checked = false;
        document.getElementById('drivingMapResult').textContent = target.linked
            ? '직전 운행 목적지와 같은 위치입니다. 수정 내용은 다음 운행 출발지에도 함께 반영됩니다.'
            : '현재 GPS 위치를 표시했습니다. 위치가 다르면 지도를 클릭해 마커를 옮겨주세요.';

        const modalEl = document.getElementById('drivingMapModal');
        modalEl.addEventListener('shown.bs.modal', initDrivingMapCanvas, { once: true });
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    window.decoratePlaceCell = decorateLinkedPlaceCell;
    window.setPlaceAddress = setLinkedPlaceAddress;
    window.setPlaceName = setLinkedPlaceName;
    window.setUsageType = setManualUsageType;
    window.cycleDrivingUsage = cycleDrivingUsage;
    window.renderPlaceCell = renderLinkedPlaceCell;
    window.renderDrivingRows = renderWorkflowRows;
    window.openDrivingMapReview = openLinkedDrivingMapReview;
    window.openMergedTripDetails = openMergedTripDetails;
    window.getDrivingPlaceTarget = getDrivingPlaceTarget;
    window.getDrivingDisplayPlace = getDrivingDisplayPlace;
    window.flattenDrivingMergedParts = flattenMergedParts;

    window.drivingUsageLabel = function(row) {
        return usageLabel(isPersonalRow(row) ? 'personal' : row?.usageType);
    };

    window.drivingPlaceForExport = function(row, side) {
        const index = Array.isArray(drivingRows) ? drivingRows.indexOf(row) : -1;
        if (index < 0 || isPersonalRow(row)) return isPersonalRow(row) ? '개인사용' : '';
        const place = getDrivingDisplayPlace(index, side);
        if (!place || place.personal) return '개인사용';
        return String(place.name || place.address || '').trim();
    };

    // 삭제된 자동 출퇴근 API 이름을 다른 오래된 코드가 호출해도 오류가 나지 않게 no-op으로 유지한다.
    window.applyCommuteAutoClassification = () => false;
    window.registerDrivingCommuteBase = () => {};
    window.clearDrivingCommuteBase = () => {};

    installWorkflowStyles();
    removeLegacyCommuteSettings();

    window.addEventListener('DOMContentLoaded', () => {
        installWorkflowStyles();
        removeLegacyCommuteSettings();
        ensureMergedTripModal();
    });
})();
