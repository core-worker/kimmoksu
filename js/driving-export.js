// =====================================================
// 김목수이야기 ERP - driving-export.js
// 기초 누적거리 기반 주행 전/후 계산 + ExcelJS XLSX 내보내기
// =====================================================

function getDrivingExportMeta() {
    return {
        companyName: document.getElementById('drivingCompanyName')?.value.trim() || '',
        vehicleNumber: document.getElementById('drivingVehicleNumber')?.value.trim() || '',
        driverName: document.getElementById('drivingDriverName')?.value.trim() || '',
        baseOdometer: Number(document.getElementById('drivingBaseOdometer')?.value || 0),
        rangeStart: document.getElementById('rangeStart')?.value || '',
        rangeEnd: document.getElementById('rangeEnd')?.value || ''
    };
}

function calculateDrivingOdometerRows() {
    const meta = getDrivingExportMeta();
    let current = Number.isFinite(meta.baseOdometer) ? meta.baseOdometer : 0;

    return drivingRows.map((row, index) => {
        const distance = Math.max(0, Number(row.distanceKm) || 0);
        const beforeKm = current;
        const afterKm = beforeKm + distance;
        current = afterKm;

        const personal = row.usageType === 'personal' || row.isPersonal;
        const businessKm = personal ? 0 : distance;

        return {
            index: index + 1,
            row,
            beforeKm: Number(beforeKm.toFixed(1)),
            afterKm: Number(afterKm.toFixed(1)),
            distanceKm: Number(distance.toFixed(1)),
            businessKm: Number(businessKm.toFixed(1)),
            personal
        };
    });
}

function updateDrivingEndingOdometer() {
    const el = document.getElementById('drivingEndingOdometer');
    if (!el) return;
    const meta = getDrivingExportMeta();
    const base = meta.baseOdometer;
    if (!Number.isFinite(base) || base < 0 || !document.getElementById('drivingBaseOdometer')?.value) {
        el.textContent = '-';
        return;
    }
    const total = drivingRows.reduce((sum, row) => sum + (Number(row.distanceKm) || 0), 0);
    el.textContent = `${(base + total).toFixed(1)} km`;
}

function drivingUsageLabel(row) {
    if (row.usageType === 'personal' || row.isPersonal) return '개인사용';
    if (row.usageType === 'commute') return '출/퇴근';
    return '업무';
}

function drivingPlaceForExport(row, side) {
    if (row.usageType === 'personal' || row.isPersonal) return '개인사용';
    const name = side === 'start' ? row.startName : row.endName;
    const address = side === 'start' ? row.startAddress : row.endAddress;
    return String(name || address || '').trim();
}

function drivingExportNote(row) {
    const notes = [];
    if (row.isManual) notes.push('수동 추가');
    if (row.isRecovered) notes.push('누락 이동 복구');
    if (row.isMerged) notes.push('운행 묶음');
    if (row.distanceEdited) notes.push('거리 수정');
    return notes.join(', ');
}

function safeExcelFileName(value) {
    return String(value || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

async function exportDrivingExcel() {
    if (!Array.isArray(drivingRows) || !drivingRows.length) {
        alert('먼저 운행 데이터를 분석해주세요.');
        return;
    }

    if (!window.ExcelJS) {
        alert('엑셀 생성 모듈을 불러오지 못했습니다. 인터넷 연결 후 새로고침해주세요.');
        return;
    }

    const meta = getDrivingExportMeta();
    if (!meta.vehicleNumber) {
        alert('차량번호를 입력해주세요.');
        return;
    }
    if (!meta.driverName) {
        alert('사용자를 입력해주세요.');
        return;
    }
    if (!document.getElementById('drivingBaseOdometer')?.value || !Number.isFinite(meta.baseOdometer) || meta.baseOdometer < 0) {
        alert('기초 누적거리를 올바르게 입력해주세요.');
        return;
    }

    const continuityGaps = typeof window.getDrivingContinuityGaps === 'function'
        ? window.getDrivingContinuityGaps()
        : [];
    if (continuityGaps.length) {
        const proceed = confirm(`아직 이동 누락 의심 ${continuityGaps.length}건이 남아 있습니다.\n그래도 엑셀을 생성할까요?`);
        if (!proceed) return;
    }

    const calculatedRows = calculateDrivingOdometerRows();
    const totalDistance = calculatedRows.reduce((s, item) => s + item.distanceKm, 0);
    const businessDistance = calculatedRows.reduce((s, item) => s + item.businessKm, 0);
    const personalDistance = totalDistance - businessDistance;
    const endingOdometer = calculatedRows.length ? calculatedRows[calculatedRows.length - 1].afterKm : meta.baseOdometer;
    const businessRate = totalDistance > 0 ? businessDistance / totalDistance : 0;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '김목수이야기 ERP';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('운행기록부', {
        pageSetup: {
            paperSize: 9,
            orientation: 'landscape',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
        }
    });

    sheet.views = [{ state: 'frozen', ySplit: 7 }];
    sheet.properties.defaultRowHeight = 20;

    const widths = [7, 13, 13, 13, 26, 26, 14, 14, 14, 14, 24];
    widths.forEach((width, idx) => { sheet.getColumn(idx + 1).width = width; });

    sheet.mergeCells('A1:K2');
    const title = sheet.getCell('A1');
    title.value = '업무용승용차 운행기록부';
    title.font = { name: '맑은 고딕', size: 18, bold: true };
    title.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.getCell('A3').value = '업체명';
    sheet.mergeCells('B3:C3');
    sheet.getCell('B3').value = meta.companyName;
    sheet.getCell('D3').value = '차량번호';
    sheet.mergeCells('E3:F3');
    sheet.getCell('E3').value = meta.vehicleNumber;
    sheet.getCell('G3').value = '사용자';
    sheet.mergeCells('H3:I3');
    sheet.getCell('H3').value = meta.driverName;
    sheet.getCell('J3').value = '기초거리';
    sheet.getCell('K3').value = meta.baseOdometer;

    sheet.getCell('A4').value = '작성기간';
    sheet.mergeCells('B4:F4');
    sheet.getCell('B4').value = `${meta.rangeStart || '-'} ~ ${meta.rangeEnd || '-'}`;
    sheet.getCell('G4').value = '최종거리';
    sheet.mergeCells('H4:I4');
    sheet.getCell('H4').value = endingOdometer;
    sheet.getCell('J4').value = '업무사용률';
    sheet.getCell('K4').value = businessRate;

    sheet.getCell('A5').value = '※ 개인사용 운행은 누적 주행거리에는 포함되지만 업무용 주행거리에는 포함되지 않습니다.';
    sheet.mergeCells('A5:K5');
    sheet.getCell('A5').font = { name: '맑은 고딕', size: 9, italic: true, color: { argb: 'FF666666' } };

    const headerRow = 7;
    const headers = ['순번', '일자', '사용구분', '시간', '출발지', '도착지', '주행 전(km)', '주행 후(km)', '총거리(km)', '업무용(km)', '비고'];
    sheet.getRow(headerRow).values = headers;
    sheet.getRow(headerRow).height = 28;

    calculatedRows.forEach((item, idx) => {
        const excelRow = headerRow + 1 + idx;
        const row = item.row;
        sheet.getRow(excelRow).values = [
            item.index,
            row.date || '',
            drivingUsageLabel(row),
            `${row.startTime || ''}${row.endTime ? ` ~ ${row.endTime}` : ''}`,
            drivingPlaceForExport(row, 'start'),
            drivingPlaceForExport(row, 'end'),
            item.beforeKm,
            item.afterKm,
            item.distanceKm,
            item.businessKm,
            drivingExportNote(row)
        ];
        sheet.getRow(excelRow).height = 24;
    });

    const totalRow = headerRow + 1 + calculatedRows.length + 1;
    sheet.mergeCells(`A${totalRow}:F${totalRow}`);
    sheet.getCell(`A${totalRow}`).value = '합계';
    sheet.getCell(`G${totalRow}`).value = meta.baseOdometer;
    sheet.getCell(`H${totalRow}`).value = endingOdometer;
    sheet.getCell(`I${totalRow}`).value = totalDistance;
    sheet.getCell(`J${totalRow}`).value = businessDistance;
    sheet.getCell(`K${totalRow}`).value = `개인사용 ${personalDistance.toFixed(1)} km`;

    const rateRow = totalRow + 1;
    sheet.mergeCells(`A${rateRow}:H${rateRow}`);
    sheet.getCell(`A${rateRow}`).value = '업무사용 비율';
    sheet.mergeCells(`I${rateRow}:K${rateRow}`);
    sheet.getCell(`I${rateRow}`).value = businessRate;

    const labelFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
    const border = {
        top: { style: 'thin', color: { argb: 'FF808080' } },
        left: { style: 'thin', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'thin', color: { argb: 'FF808080' } }
    };

    ['A3','D3','G3','J3','A4','G4','J4'].forEach(addr => {
        const cell = sheet.getCell(addr);
        cell.fill = labelFill;
        cell.font = { name: '맑은 고딕', bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    sheet.getRow(headerRow).eachCell(cell => {
        cell.fill = headerFill;
        cell.font = { name: '맑은 고딕', color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = border;
    });

    for (let r = 3; r <= 4; r++) {
        for (let c = 1; c <= 11; c++) {
            const cell = sheet.getCell(r, c);
            cell.border = border;
            cell.alignment = { vertical: 'middle', horizontal: c >= 10 ? 'center' : 'left' };
            cell.font = { ...(cell.font || {}), name: '맑은 고딕', size: 10 };
        }
    }

    for (let r = headerRow + 1; r < totalRow; r++) {
        for (let c = 1; c <= 11; c++) {
            const cell = sheet.getCell(r, c);
            cell.border = border;
            cell.font = { name: '맑은 고딕', size: 9 };
            cell.alignment = {
                vertical: 'middle',
                horizontal: [1,2,3,4,7,8,9,10].includes(c) ? 'center' : 'left',
                wrapText: true
            };
        }
    }

    for (let c = 1; c <= 11; c++) {
        sheet.getCell(totalRow, c).fill = totalFill;
        sheet.getCell(totalRow, c).border = border;
        sheet.getCell(totalRow, c).font = { name: '맑은 고딕', bold: true };
        sheet.getCell(rateRow, c).border = border;
        sheet.getCell(rateRow, c).font = { name: '맑은 고딕', bold: true };
    }

    sheet.getCell(`A${totalRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(`A${rateRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(`I${rateRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.getColumn(7).numFmt = '#,##0.0';
    sheet.getColumn(8).numFmt = '#,##0.0';
    sheet.getColumn(9).numFmt = '#,##0.0';
    sheet.getColumn(10).numFmt = '#,##0.0';
    sheet.getCell('K3').numFmt = '#,##0.0';
    sheet.getCell('H4').numFmt = '#,##0.0';
    sheet.getCell('K4').numFmt = '0.0%';
    sheet.getCell(`I${rateRow}`).numFmt = '0.0%';

    sheet.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow + calculatedRows.length, column: 11 }
    };

    sheet.pageSetup.printArea = `A1:K${rateRow}`;
    sheet.headerFooter.oddFooter = '&C김목수이야기 ERP 자동작성 운행기록부';

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const period = meta.rangeStart && meta.rangeEnd
        ? `${meta.rangeStart.replaceAll('-', '')}-${meta.rangeEnd.replaceAll('-', '')}`
        : '운행기록';
    a.download = `${safeExcelFileName(meta.vehicleNumber)}_${period}_운행기록부.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function decorateOdometerPreview() {
    updateDrivingEndingOdometer();
    const body = document.getElementById('drivingBody');
    if (!body || !Array.isArray(drivingRows) || !drivingRows.length) return;

    const baseInput = document.getElementById('drivingBaseOdometer');
    if (!baseInput?.value) {
        body.querySelectorAll('.odometer-mini').forEach(el => el.remove());
        return;
    }

    const calculated = calculateDrivingOdometerRows();
    const trList = [...body.querySelectorAll('tr')].filter(tr => tr.querySelector('.trip-check'));
    trList.forEach((tr, idx) => {
        const distanceCell = tr.querySelectorAll('td')[7];
        if (!distanceCell || !calculated[idx]) return;
        let preview = distanceCell.querySelector('.odometer-mini');
        if (!preview) {
            preview = document.createElement('div');
            preview.className = 'odometer-mini';
            distanceCell.appendChild(preview);
        }
        preview.textContent = `${calculated[idx].beforeKm.toFixed(1)} → ${calculated[idx].afterKm.toFixed(1)}`;
    });
}

window.addEventListener('DOMContentLoaded', () => {
    const base = document.getElementById('drivingBaseOdometer');
    if (base) base.addEventListener('input', decorateOdometerPreview);

    ['drivingCompanyName', 'drivingVehicleNumber', 'drivingDriverName', 'drivingBaseOdometer'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const saved = localStorage.getItem(`kimmoksu_${id}`);
        if (saved !== null) el.value = saved;
        el.addEventListener('change', () => localStorage.setItem(`kimmoksu_${id}`, el.value));
    });

    const body = document.getElementById('drivingBody');
    if (body) {
        const observer = new MutationObserver(() => setTimeout(decorateOdometerPreview, 0));
        observer.observe(body, { childList: true, subtree: false });
    }

    decorateOdometerPreview();
});

window.exportDrivingExcel = exportDrivingExcel;
window.calculateDrivingOdometerRows = calculateDrivingOdometerRows;
window.updateDrivingEndingOdometer = updateDrivingEndingOdometer;
window.decorateOdometerPreview = decorateOdometerPreview;
