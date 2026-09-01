// =====================================================
// 김목수이야기 ERP - driving-automerge.js
// 연속 차량 운행 사이 정차가 20분 이내면 자동으로 한 운행으로 병합
// =====================================================

const DRIVING_AUTO_MERGE_GAP_MINUTES = 20;

function mergeShortStopTrips(rows, maxGapMinutes = DRIVING_AUTO_MERGE_GAP_MINUTES) {
    if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows : [];

    const result = [];
    let group = [rows[0]];

    const flushGroup = () => {
        if (group.length === 1) {
            result.push(group[0]);
            group = [];
            return;
        }

        const first = group[0];
        const last = group[group.length - 1];
        const totalDistance = Number(group.reduce((sum, row) => sum + (Number(row.distanceKm) || 0), 0).toFixed(1));

        result.push({
            id: `auto_merged_${Date.now()}_${result.length}`,
            originalIds: group.flatMap(row => row.originalIds || [row.id]),
            startISO: first.startISO,
            endISO: last.endISO,
            date: first.date,
            startTime: first.startTime,
            endTime: last.endTime,
            start: first.start,
            end: last.end,
            distanceKm: totalDistance,
            usageType: 'business',
            startName: first.startName || '',
            endName: last.endName || '',
            startAddress: first.startAddress || '',
            endAddress: last.endAddress || '',
            isMerged: true,
            isAutoMerged: true,
            isPersonal: false,
            hiddenParts: group,
            stopGapRuleMinutes: maxGapMinutes
        });

        group = [];
    };

    for (let i = 1; i < rows.length; i++) {
        const previous = group[group.length - 1];
        const current = rows[i];

        const previousEnd = new Date(previous.endISO).getTime();
        const currentStart = new Date(current.startISO).getTime();
        const gapMinutes = (currentStart - previousEnd) / 60000;

        // 겹치거나, 정차 공백이 20분 이하인 경우 같은 운행으로 처리
        if (Number.isFinite(gapMinutes) && gapMinutes >= 0 && gapMinutes <= maxGapMinutes) {
            group.push(current);
        } else {
            flushGroup();
            group = [current];
        }
    }

    flushGroup();
    return result;
}

(function installAutomaticTripMerge() {
    const originalLoadTimelineFile = window.loadTimelineFile;
    if (typeof originalLoadTimelineFile !== 'function') return;

    window.loadTimelineFile = async function(...args) {
        await originalLoadTimelineFile.apply(this, args);

        if (!Array.isArray(drivingRows) || drivingRows.length < 2) return;

        const beforeCount = drivingRows.length;
        const mergedRows = mergeShortStopTrips(drivingRows, DRIVING_AUTO_MERGE_GAP_MINUTES);
        const afterCount = mergedRows.length;

        if (afterCount < beforeCount) {
            drivingRows = mergedRows;
            drivingHistory = [];
            renderDrivingRows();

            const mergedCount = beforeCount - afterCount;
            console.info(`[운행기록부] 20분 이하 정차 자동 병합: ${beforeCount}건 → ${afterCount}건 (${mergedCount}건 감소)`);
        }
    };
})();

window.mergeShortStopTrips = mergeShortStopTrips;
