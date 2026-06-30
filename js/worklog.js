    // 작업일보 (V30: 우측 정렬 + 아코디언 상태 보존 로직 추가)
    let editingId = null;
    let activeWorklogFilter = "mine";
    let cachedWorklogs = [];
    let isWorklogListEditMode = false;
    let worklogInputMode = "monthly";
    let selectedWorklogDay = new Date().getDate();
    let dailyVisibleWorkerKeys = {};

    function canCompleteWorklog() {
        return myRole === "owner" || myRole === "admin" || globalWorklogAdmins.includes(myEmail);
    }

    function getSelectedWorklogMonthInfo() {
        const logMonthEl = document.getElementById('logMonth');
        const fallback = new Date().toISOString().substring(0, 7);
        const raw = (logMonthEl && logMonthEl.value) ? logMonthEl.value : fallback;
        const [year, month] = raw.split('-').map(Number);
        const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
        const safeMonth = Number.isFinite(month) ? month : new Date().getMonth() + 1;
        const lastDay = new Date(safeYear, safeMonth, 0).getDate();
    
        if (!Number.isFinite(selectedWorklogDay) || selectedWorklogDay < 1) selectedWorklogDay = 1;
        if (selectedWorklogDay > lastDay) selectedWorklogDay = lastDay;
    
        return {
            year: safeYear,
            month: safeMonth,
            lastDay,
            key: `${safeYear}-${String(safeMonth).padStart(2, '0')}`
        };
    }
    
    function formatWorklogDayLabel(year, month, day) {
        const weekNames = ['일', '월', '화', '수', '목', '금', '토'];
        const week = weekNames[new Date(year, month - 1, day).getDay()];
        return `${year}년 ${month}월 ${day}일 (${week})`;
    }

    function getDailyVisibleKey(day = selectedWorklogDay) {
        const info = getSelectedWorklogMonthInfo();
        return `${info.key || `${info.year}-${String(info.month).padStart(2, '0')}`}-${String(day).padStart(2, '0')}`;
    }
    
    function getWorkerKey(tIdx, wIdx) {
        return `${tIdx}_${wIdx}`;
    }
    
    function hasWorklogValue(value) {
        return Number(parseFloat(value || 0)) > 0;
    }
    
    function getDailyVisibleSet(day = selectedWorklogDay) {
        const key = getDailyVisibleKey(day);
        if (!dailyVisibleWorkerKeys[key]) dailyVisibleWorkerKeys[key] = new Set();
        return dailyVisibleWorkerKeys[key];
    }
    
    function markDailyWorkerVisible(tIdx, wIdx, day = selectedWorklogDay) {
        getDailyVisibleSet(day).add(getWorkerKey(tIdx, wIdx));
    }
    
    function shouldShowDailyWorker(tIdx, wIdx, worker, day = selectedWorklogDay) {
        const days = worker && worker.days && typeof worker.days === 'object' ? worker.days : {};
        return hasWorklogValue(days[day]) || getDailyVisibleSet(day).has(getWorkerKey(tIdx, wIdx));
    }
    
    function copyPreviousDayWorkers() {
        if (selectedWorklogDay <= 1) {
            alert('1일은 전일 작업자를 불러올 수 없습니다.');
            return;
        }
    
        const prevDay = selectedWorklogDay - 1;
        let copiedCount = 0;
    
        teamData.forEach((team, tIdx) => {
            const workers = Array.isArray(team.workers) ? team.workers : [];
    
            workers.forEach((worker, wIdx) => {
                const days = worker && worker.days && typeof worker.days === 'object' ? worker.days : {};
    
                if (hasWorklogValue(days[prevDay])) {
                    markDailyWorkerVisible(tIdx, wIdx, selectedWorklogDay);
                    copiedCount++;
                }
            });
        });
    
        if (copiedCount === 0) {
            alert('전일 공수가 입력된 작업자가 없습니다.');
            return;
        }
    
        renderAllTeams();
    }
    
    function ensureWorklogModeControls() {
        const container = document.getElementById('team-container');
        if (!container) return;
    
        let controls = document.getElementById('worklog-mode-controls');
        if (!controls) {
            controls = document.createElement('div');
            controls.id = 'worklog-mode-controls';
            controls.className = 't5-card p-3 mb-3';
            container.parentNode.insertBefore(controls, container);
        }
    
        const { year, month, lastDay } = getSelectedWorklogMonthInfo();
    
        const dayOptions = Array.from({ length: lastDay }, (_, i) => {
            const day = i + 1;
            return `<option value="${day}" ${day === selectedWorklogDay ? 'selected' : ''}>${day}일</option>`;
        }).join('');
    
        controls.innerHTML = `
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                    <div class="small text-secondary fw-bold mb-1">작업일보 수정 방식</div>
                    <div class="btn-group" role="group">
                        <button type="button" class="btn btn-sm ${worklogInputMode === 'monthly' ? 'btn-primary' : 'btn-outline-secondary'} fw-bold" onclick="switchWorklogInputMode('monthly')">월별 수정</button>
                        <button type="button" class="btn btn-sm ${worklogInputMode === 'daily' ? 'btn-primary' : 'btn-outline-secondary'} fw-bold" onclick="switchWorklogInputMode('daily')">일별 수정</button>
                    </div>
                </div>
    
                <div class="${worklogInputMode === 'daily' ? 'd-flex' : 'd-none'} align-items-center gap-2 flex-wrap">
                    <button type="button" class="btn btn-sm btn-outline-secondary fw-bold" onclick="changeDailyWorklogDay(-1)" ${selectedWorklogDay <= 1 ? 'disabled' : ''}>
                        <i class="bi bi-chevron-left"></i> 전일
                    </button>
                    <select class="form-select form-select-sm input-dark fw-bold" style="width:auto; min-width:90px;" onchange="setDailyWorklogDay(this.value)">
                        ${dayOptions}
                    </select>
                    <button type="button" class="btn btn-sm btn-outline-secondary fw-bold" onclick="changeDailyWorklogDay(1)" ${selectedWorklogDay >= lastDay ? 'disabled' : ''}>
                        다음일 <i class="bi bi-chevron-right"></i>
                    </button>
                    <button type="button"
                            class="btn btn-sm btn-outline-info fw-bold"
                            onclick="copyPreviousDayWorkers()"
                            ${selectedWorklogDay <= 1 ? 'disabled' : ''}>
                        <i class="bi bi-arrow-down-square"></i> 전일 작업자 불러오기
                    </button>
                </div>
            </div>
    
            ${worklogInputMode === 'daily' ? `
                <div class="small text-secondary mt-3">
                    <i class="bi bi-info-circle me-1"></i>${formatWorklogDayLabel(year, month, selectedWorklogDay)} 기준으로 전 공정 작업자의 공수를 입력합니다.
                </div>
            ` : ''}
        `;
    }
    
    function switchWorklogInputMode(mode) {
        worklogInputMode = mode === 'daily' ? 'daily' : 'monthly';
        renderAllTeams();
    }
    
    function changeDailyWorklogDay(diff) {
        const { lastDay } = getSelectedWorklogMonthInfo();
        selectedWorklogDay = Math.min(lastDay, Math.max(1, selectedWorklogDay + Number(diff || 0)));
        renderAllTeams();
    }
    
    function setDailyWorklogDay(dayValue) {
        const { lastDay } = getSelectedWorklogMonthInfo();
        const nextDay = parseInt(dayValue, 10);
        if (!Number.isFinite(nextDay)) return;
    
        selectedWorklogDay = Math.min(lastDay, Math.max(1, nextDay));
        renderAllTeams();
    }
    
    function getDailyWorklogSummary(day) {
        let total = 0;
        const teamTotals = [];
    
        teamData.forEach(team => {
            let teamTotal = 0;
            const workers = Array.isArray(team.workers) ? team.workers : [];
    
            workers.forEach(worker => {
                const days = worker && worker.days ? worker.days : {};
                const value = parseFloat(days[day] || 0) || 0;
                teamTotal += value;
                total += value;
            });
    
            teamTotals.push({ teamName: team.teamName, total: teamTotal });
        });
    
        return { total, teamTotals };
    }
    
    function updateDailyWorklogSummary() {
        const summary = getDailyWorklogSummary(selectedWorklogDay);
        const totalEl = document.getElementById('dailyWorklogTotal');
        const detailEl = document.getElementById('dailyWorklogTeamTotals');
    
        if (totalEl) totalEl.innerText = `${summary.total} 공수`;
    
        if (detailEl) {
            const visibleTotals = summary.teamTotals.filter(t => t.total > 0);
            detailEl.innerHTML = visibleTotals.length
                ? visibleTotals.map(t => `<span class="badge bg-dark text-white border border-secondary border-opacity-25 me-1 mb-1">${t.teamName} ${t.total}</span>`).join('')
                : '<span class="text-secondary small">입력된 공수가 없습니다.</span>';
        }
    }
    
    function updateDailyWorkerValue(tIdx, wIdx, value) {
        if (!teamData[tIdx] || !teamData[tIdx].workers || !teamData[tIdx].workers[wIdx]) return;
    
        if (!teamData[tIdx].workers[wIdx].days || typeof teamData[tIdx].workers[wIdx].days !== 'object') {
            teamData[tIdx].workers[wIdx].days = {};
        }
    
        const cleanValue = String(value || '').trim();
    
        if (cleanValue === '') {
            delete teamData[tIdx].workers[wIdx].days[selectedWorklogDay];
        } else {
            teamData[tIdx].workers[wIdx].days[selectedWorklogDay] = cleanValue;
            markDailyWorkerVisible(tIdx, wIdx, selectedWorklogDay);
        }
    
        updateDailyWorklogSummary();
    }
    
    function addWorkerFromDailyMode(tIdx) {
        if (!teamData[tIdx]) return;
        if (!Array.isArray(teamData[tIdx].workers)) teamData[tIdx].workers = [];
    
        teamData[tIdx].workers.push({ name: "", days: {} });
        markDailyWorkerVisible(tIdx, teamData[tIdx].workers.length - 1, selectedWorklogDay);
        worklogInputMode = 'daily';
        renderAllTeams();
    }
    
    function renderDailyWorklogEditor(year, month) {
        const container = document.getElementById('team-container');
        if (!container) return;
    
        const summary = getDailyWorklogSummary(selectedWorklogDay);
        const dayLabel = formatWorklogDayLabel(year, month, selectedWorklogDay);
    
        const teamSections = teamData.map((team, tIdx) => {
        const workers = Array.isArray(team.workers) ? team.workers : [];
        const visibleWorkers = workers
            .map((worker, wIdx) => ({ worker, wIdx }))
            .filter(({ worker, wIdx }) => shouldShowDailyWorker(tIdx, wIdx, worker, selectedWorklogDay));
        
        const teamTotal = summary.teamTotals[tIdx] ? summary.teamTotals[tIdx].total : 0;
        
        const workerRows = visibleWorkers.length
            ? `<div class="row g-2">` + visibleWorkers.map(({ worker, wIdx }) => {
                const workerName = worker.name || '';
                const days = worker.days && typeof worker.days === 'object' ? worker.days : {};
                const value = days[selectedWorklogDay] || '';
        
                return `
                    <div class="col-12 col-md-6">
                        <div class="d-flex align-items-center gap-2 p-2 rounded border border-secondary border-opacity-10 bg-dark bg-opacity-25">
                            <div class="flex-grow-1" style="min-width:0;">
                                <input type="text"
                                       class="form-control input-dark fw-bold"
                                       value="${workerName}"
                                       placeholder="작업자 이름"
                                       onchange="teamData[${tIdx}].workers[${wIdx}].name=this.value">
                            </div>
        
                            <div style="width:90px;">
                                <input type="number"
                                       step="0.5"
                                       min="0"
                                       class="form-control input-dark text-center fw-bold"
                                       value="${value}"
                                       placeholder="공수"
                                       oninput="updateDailyWorkerValue(${tIdx}, ${wIdx}, this.value)">
                            </div>
        
                            <button type="button"
                                    class="btn btn-sm btn-outline-danger flex-shrink-0"
                                    onclick="removeWorker(${tIdx}, ${wIdx}); worklogInputMode='daily'; renderAllTeams();">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('') + `</div>`
            : `<div class="text-secondary small py-3 text-center">표시할 작업자가 없습니다. 전일 작업자 불러오기를 누르거나 작업자를 추가해주세요.</div>`;
    
            return `
                <div class="t5-card p-3 mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2 gap-2">
                        <div>
                            <h6 class="fw-bold m-0">${team.teamName}</h6>
                            <div class="small text-secondary">${dayLabel}</div>
                        </div>
                        <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                            <button type="button" class="btn btn-sm btn-outline-danger fw-bold" onclick="removeTeam(${tIdx})">공정삭제</button>
                            <span class="badge bg-primary px-3 py-2">${teamTotal} 공수</span>
                            <button type="button" class="t5-btn-small fw-bold" onclick="addWorkerFromDailyMode(${tIdx})">작업자추가</button>
                        </div>
                    </div>
                    ${workerRows}
                </div>
            `;
        }).join('');
    
        const teamTotalBadges = summary.teamTotals
            .filter(t => t.total > 0)
            .map(t => `<span class="badge bg-dark text-white border border-secondary border-opacity-25 me-1 mb-1">${t.teamName} ${t.total}</span>`)
            .join('');
    
        container.innerHTML = `
            <div class="t5-card border border-primary border-opacity-25 bg-primary bg-opacity-10">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                        <div class="small text-secondary fw-bold">일별 총 공수</div>
                        <h4 class="fw-bold text-white m-0">${dayLabel}</h4>
                    </div>
                    <div class="text-end">
                        <div id="dailyWorklogTotal" class="fw-bold text-warning fs-3">${summary.total} 공수</div>
                        <div id="dailyWorklogTeamTotals" class="mt-1">
                            ${teamTotalBadges || '<span class="text-secondary small">입력된 공수가 없습니다.</span>'}
                        </div>
                    </div>
                </div>
            </div>
    
            ${teamSections}
        `;
    }

    function switchWorklogFilter(filter, btn) {
        activeWorklogFilter = filter;
    
        document.querySelectorAll('.worklog-filter-btn').forEach(b => {
            b.classList.remove('btn-primary', 'btn-success', 'btn-outline-secondary', 'btn-outline-success');
            b.classList.add('btn-outline-secondary');
        });
    
        if (btn) {
            btn.classList.remove('btn-outline-secondary', 'btn-outline-success');
    
            if (filter === 'done') {
                btn.classList.add('btn-success');
            } else {
                btn.classList.add('btn-primary');
            }
        }
    
        renderWorklogHistory();
    }

    function toggleWorklogListEditMode() {
        isWorklogListEditMode = !isWorklogListEditMode;
    
        const btn = document.getElementById('btnWorklogListEdit');
        if (btn) {
            btn.classList.toggle('btn-warning', isWorklogListEditMode);
            btn.classList.toggle('btn-outline-warning', !isWorklogListEditMode);
            btn.innerText = isWorklogListEditMode ? '편집 종료' : '편집';
        }
    
        renderWorklogHistory();
    }
    
    function renderAllTeams() {
        const container = document.getElementById('team-container');
        if (!container) return;
    
        ensureWorklogModeControls();
    
        const { year, month, lastDay } = getSelectedWorklogMonthInfo();
    
        if (worklogInputMode === 'daily') {
            renderDailyWorklogEditor(year, month);
            return;
        }
    
        
        container.innerHTML = teamData.map((team, tIdx) => {
            let teamTotal = 0; 
            const tables = team.workers.map((w, wIdx) => {
                let pSum = 0; Object.values(w.days).forEach(v => pSum += parseFloat(v||0)); teamTotal += pSum;
                return `<table class="excel-table"><tr class="date-row"><td rowspan="4" class="name-cell"><input type="text" class="name-input" value="${w.name}" onchange="teamData[${tIdx}].workers[${wIdx}].name=this.value"><br><button onclick="removeWorker(${tIdx}, ${wIdx})" class="btn btn-danger btn-sm p-0 px-2 mt-2" style="font-size:0.6rem;">삭제</button></td>${loopDays(year, month, 1, 16, 'date')}</tr><tr>${loopDays(year, month, 1, 16, 'input', tIdx, wIdx)}</tr><tr class="date-row">${loopDays(year, month, 17, 31, 'date', 0, 0, lastDay)}<td style="background:#1e222d;">계</td></tr><tr>${loopDays(year, month, 17, 31, 'input', tIdx, wIdx, lastDay)}<td class="fw-bold text-primary">${pSum}</td></tr></table>`;
            }).join('');
            
            let colId = `team-col-${tIdx}`;
            
            // 💡 V30: 아코디언 상태 확인 및 클래스 적용 💡
            let showClass = worklogCollapsedStates[colId] === true ? '' : 'show';

            // 💡 V32: 작업일보 헤더 레이아웃 변경 [▽] [팀명] ---- [공수] [+] 💡
            return `<div class="mb-4 t5-card p-3" style="background: rgba(0,0,0,0.1); border: 1px solid rgba(255,255,255,0.05);">
                <div class="d-flex align-items-center gap-2 mb-1">
                    <div class="cursor-pointer text-secondary flex-shrink-0" data-bs-toggle="collapse" data-bs-target="#${colId}" style="width:28px; text-align:center;">
                        <i class="bi bi-chevron-down fs-5"></i>
                    </div>
                    <div class="flex-grow-1 cursor-pointer" data-bs-toggle="collapse" data-bs-target="#${colId}">
                        <h6 class="m-0 fw-bold">${team.teamName}</h6>
                    </div>
                    <button onclick="event.stopPropagation(); removeTeam(${tIdx})" class="btn btn-sm btn-outline-danger fw-bold px-2 py-1 flex-shrink-0" style="font-size:0.75rem;">공정삭제</button>
                    <span class="badge bg-primary px-3 py-2 flex-shrink-0" style="font-size:0.85rem;">총 ${teamTotal} 공수</span>
                    <button onclick="event.stopPropagation(); addWorker(${tIdx})" class="t5-btn-small fw-bold px-2 py-1 flex-shrink-0" style="font-size:0.85rem;">작업자추가</button>
                </div>
                <div class="collapse ${showClass} mt-3" id="${colId}">
                    ${tables}
                </div>
            </div>`;
        }).join(''); 
        bindLongPress();
        
        // 💡 V31 FIX: 아코디언 상태 저장 (이벤트 위임으로 한 번만 실행) 💡
        document.querySelectorAll('#team-container .collapse').forEach(el => {
            el.addEventListener('shown.bs.collapse', function() { worklogCollapsedStates[this.id] = false; });
            el.addEventListener('hidden.bs.collapse', function() { worklogCollapsedStates[this.id] = true; });
        });
    }
    
    function loopDays(y, m, s, e, type, tIdx, wIdx, max=31) { 
        let html=""; 
        for(let d=s; d<=e; d++){ 
            if(d>max) html+=`<td></td>`; 
            else if(type==='date') { let textCol = new Date(y,m-1,d).getDay()===0 ? 'color:#ef4444;' : (new Date(y,m-1,d).getDay()===6 ? 'color:#5c7cfa;' : ''); html+=`<td style="${textCol}">${d}</td>`; } 
            else { let val = teamData[tIdx].workers[wIdx].days[d]||''; let bgClass = val ? (parseFloat(val) > 2 ? 'g-red' : (parseFloat(val) > 1 ? 'g-yellow' : 'g-green')) : ''; html+=`<td class="gongsu-cell ${bgClass}" data-t="${tIdx}" data-w="${wIdx}" data-d="${d}" onclick="handleCellClick(this)">${val}</td>`; }
        } 
        return html; 
    }
    // 💡 V31 FIX: 공수 클릭 시 전체 재렌더링 대신 해당 셀만 업데이트 (성능 개선) 💡
    function handleCellClick(el) { 
        const { t, w, d } = el.dataset; 
        let newVal = teamData[t].workers[w].days[d]==1?'':1; 
        teamData[t].workers[w].days[d] = newVal; 
        
        // 해당 셀만 부분 업데이트
        el.innerText = newVal;
        let bgClass = newVal ? (parseFloat(newVal) > 2 ? 'g-red' : (parseFloat(newVal) > 1 ? 'g-yellow' : 'g-green')) : '';
        el.className = `gongsu-cell ${bgClass}`;
        
        // 팀 합계만 갱신 (전체 재렌더링 X)
        updateTeamTotals();
    }
    
    // 팀 합계 배지만 갱신 (전체 DOM 재생성 없이)
    function updateTeamTotals() {
        teamData.forEach((team, tIdx) => {
            let teamTotal = 0;
            team.workers.forEach((w, wIdx) => {
                let pSum = 0;
                Object.values(w.days).forEach(v => pSum += parseFloat(v||0));
                teamTotal += pSum;
                // 각 worker의 계 셀 찾아서 업데이트
                let tables = document.querySelectorAll(`#team-col-${tIdx} .excel-table`);
                if(tables[wIdx]) {
                    let sumCell = tables[wIdx].querySelector('tr:last-child td:last-child');
                    if(sumCell) sumCell.innerText = pSum;
                }
            });
            // 팀 전체 배지 업데이트
            let badge = document.querySelectorAll('#team-container .badge.bg-primary')[tIdx];
            if(badge) badge.innerText = `총 ${teamTotal} 공수`;
        });
    }
    function bindLongPress() { document.querySelectorAll('.gongsu-cell').forEach(cell => { let timer; cell.onmousedown=cell.ontouchstart=()=>timer=setTimeout(()=>{ const { t, w, d } = cell.dataset; const input = prompt("공수", teamData[t].workers[w].days[d]); if(input!==null){ teamData[t].workers[w].days[d]=input; renderAllTeams(); } }, 600); cell.onmouseup=cell.ontouchend=()=>clearTimeout(timer); }); }
    function addTeam() {
        const n = prompt("공정명");
    
        if (n && n.trim()) {
            teamData.push({
                teamName: n.trim(),
                workers: []
            });
    
            renderAllTeams();
        }
    }
    
    function removeTeam(tIdx) {
        if (!teamData[tIdx]) return;
    
        const teamName = teamData[tIdx].teamName || "이 공정";
        const workers = Array.isArray(teamData[tIdx].workers) ? teamData[tIdx].workers : [];
    
        let totalGongsu = 0;
        workers.forEach(worker => {
            const days = worker.days && typeof worker.days === "object" ? worker.days : {};
            Object.values(days).forEach(v => {
                totalGongsu += parseFloat(v || 0) || 0;
            });
        });
    
        const msg = totalGongsu > 0
            ? `[${teamName}] 공정에 입력된 공수 ${totalGongsu}가 있습니다.\n정말 공정 전체를 삭제하시겠습니까?`
            : `[${teamName}] 공정을 삭제하시겠습니까?`;
    
        if (!confirm(msg)) return;
    
        teamData.splice(tIdx, 1);
    
        worklogCollapsedStates = {};
        renderAllTeams();
    }
    
    function addWorker(t) {
        if (!teamData[t]) return;
        if (!Array.isArray(teamData[t].workers)) teamData[t].workers = [];
    
        teamData[t].workers.push({
            name: "",
            days: {}
        });
    
        renderAllTeams();
    }
    
    function removeWorker(t, w) {
        if (confirm("삭제하시겠습니까?")) {
            teamData[t].workers.splice(w, 1);
            renderAllTeams();
        }
    }

    async function saveMonthlyLog() {
        const m = document.getElementById('logMonth').value;
        const s = document.getElementById('siteName').value;
    
        if (!s) return;
    
        const d = {
            teamId: myTeamId,
            month: m,
            site: s,
            teamData: teamData,
            updatedAt: Date.now(),
            lastModifier: userNickname,
            lastModifierEmail: myEmail
        };
    
        if (editingId) {
            await db.collection("monthly_logs").doc(editingId).update(d);
        } else {
            await db.collection("monthly_logs").add({
                ...d,
                originalWriter: userNickname,
                writerEmail: myEmail,
                isCompleted: false,
                completedAt: null,
                completedBy: null
            });
        }
    
        alert("저장 완료");
        location.reload();
    }

    function loadWorklogs() {
        db.collection("monthly_logs")
            .where("teamId", "==", myTeamId)
            .orderBy("updatedAt", "desc")
            .limit(50)
            .onSnapshot(ss => {
                cachedWorklogs = ss.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
    
                renderWorklogHistory();
            });
    }
    
    function renderWorklogHistory() {
        const historyList = document.getElementById('history-list');
        if (!historyList) return;
    
        let list = cachedWorklogs;
    
        if (activeWorklogFilter === "mine") {
            list = cachedWorklogs.filter(log =>
                !log.isCompleted &&
                (log.writerEmail === myEmail || log.originalWriter === userNickname)
            );
        } else if (activeWorklogFilter === "all") {
            list = cachedWorklogs.filter(log => !log.isCompleted);
        } else if (activeWorklogFilter === "done") {
            list = cachedWorklogs.filter(log => log.isCompleted);
        }
    
        if (list.length === 0) {
            historyList.innerHTML = `
                <div class="col-12">
                    <div class="t5-card p-4 text-center text-secondary">
                        표시할 작업일보가 없습니다.
                    </div>
                </div>
            `;
            return;
        }
    
        historyList.innerHTML = list.map(d => {
            const canDelete = myRole !== 'member';
            const canComplete = canCompleteWorklog();
    
            let delBtnHtml = canDelete
                ? `<button class="t5-btn-small bg-danger text-white" onclick="deleteLog('${d.id}')">삭제</button>`
                : '';
    
            let completeBtnHtml = '';
    
            if (canComplete && !d.isCompleted) {
                completeBtnHtml = `<button class="t5-btn-small bg-warning text-dark" onclick="completeWorklog('${d.id}')">완료 처리</button>`;
            } else if (canComplete && d.isCompleted) {
                completeBtnHtml = `<button class="t5-btn-small bg-info text-white" onclick="reopenWorklog('${d.id}')">완료 해제</button>`;
            }
    
            const completedBadge = d.isCompleted
                ? `<span class="badge bg-success ms-2">완료</span>`
                : '';
    
            const completedInfo = d.isCompleted
                ? `<br><span class="small text-success">완료자: ${d.completedBy || '-'}</span>`
                : '';
    
            let normalBtnHtml = `
                <button class="t5-btn-small bg-secondary text-white" onclick="editLog('${d.id}')">수정</button>
                <button class="t5-btn-small bg-primary text-white" onclick="copyLog('${d.id}')">복사</button>
                <button class="t5-btn-small bg-success text-white" onclick="exportToExcel('${d.id}')">엑셀</button>
                ${delBtnHtml}
            `;
            
            let completeModeBtnHtml = completeBtnHtml || `
                <span class="small text-secondary px-2">완료 권한 없음</span>
            `;
            
            let btnHtml = isWorklogListEditMode ? completeModeBtnHtml : normalBtnHtml;
    
            return `
                <div class="col-md-6">
                    <div class="t5-card p-3 m-0 d-flex justify-content-between align-items-center">
                        <div>
                            <b class="text-primary">${d.month}</b>${completedBadge}<br>
                            ${d.site}<br>
                            <span class="small text-secondary">
                                작성: ${d.originalWriter || '관리자'}
                                ${d.lastModifier ? `/ 수정: ${d.lastModifier}` : ''}
                            </span>
                            ${completedInfo}
                        </div>
                        <div class="d-flex gap-1 flex-wrap justify-content-end" style="max-width: 60%;">
                            ${btnHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }


    async function editLog(id) { const d = (await db.collection("monthly_logs").doc(id).get()).data(); editingId = id; document.getElementById('logMonth').value = d.month; document.getElementById('siteName').value = d.site; teamData = normalizeTeamData(d.teamData || []); showPage('worklog', null, true, { preserveState: true }); renderAllTeams(); window.scrollTo(0,0); }
    async function copyLog(id) { const d = (await db.collection("monthly_logs").doc(id).get()).data(); editingId = null; document.getElementById('logMonth').value = d.month; document.getElementById('siteName').value = d.site + " (복사)"; teamData = normalizeTeamData(d.teamData || []); showPage('worklog', null, true, { preserveState: true }); renderAllTeams(); alert("데이터가 복사되었습니다."); window.scrollTo(0,0); }
    async function deleteLog(id) { if(confirm("이 작업일보를 완전히 삭제하시겠습니까?")) { await db.collection("monthly_logs").doc(id).delete(); } }

    async function completeWorklog(id) {
        if (!canCompleteWorklog()) return alert("완료 처리 권한이 없습니다.");
        if (!confirm("이 작업일보를 완료 처리하시겠습니까?")) return;
    
        await db.collection("monthly_logs").doc(id).update({
            isCompleted: true,
            completedAt: Date.now(),
            completedBy: myEmail
        });
    }
    
    async function reopenWorklog(id) {
        if (!canCompleteWorklog()) return alert("완료 해제 권한이 없습니다.");
        if (!confirm("이 작업일보의 완료 상태를 해제하시겠습니까?")) return;
    
        await db.collection("monthly_logs").doc(id).update({
            isCompleted: false,
            completedAt: null,
            completedBy: null
        });
    }

    async function exportToExcel(id) { 
        const d_raw = (await db.collection("monthly_logs").doc(id).get()).data(); const [year, monthNum] = d_raw.month.split('-'); const lastDayNum = new Date(year, monthNum, 0).getDate(); 
        const wb = XLSX.utils.book_new(); 
        // 💡 V31 FIX: 엑셀 행 번호 정확히 계산 - wsData 초기화 후 헤더 push 방식으로 통일 💡
        const wsData = [];
        wsData.push([`${year}년 ${monthNum}월 현장 작업 일보 (김목수이야기)`]);  // 1행
        wsData.push([`현장명: ${d_raw.site}`]);                                     // 2행
        wsData.push([]);                                                            // 3행 (공백)
        wsData.push(["NO", "공정", "이 름", ...Array.from({length:31},(_,i)=>i+1), "계", "비고"]);  // 4행 (헤더)
        
        let totalNo = 1; 
        d_raw.teamData.forEach(team => { 
            let startR = wsData.length + 1;  // 팀 시작 행 (엑셀 1-based)
            team.workers.forEach(w => { 
                let currentExcelRow = wsData.length + 1;  // 현재 worker 행
                wsData.push([totalNo++, team.teamName, w.name, ...Array.from({length:31},(_,i)=>parseFloat(w.days[i+1]||0)|| ""), {t:'n', f:`SUM(D${currentExcelRow}:AH${currentExcelRow})`}]); 
            }); 
            let endR = wsData.length;  // 팀 종료 행
            wsData.push(["", team.teamName, "공정소계", ...Array(31).fill(""), {t:'n', f:`SUM(AI${startR}:AI${endR})`}]); 
            wsData.push([]);  // 팀 구분 공백행
        }); 
        const ws = XLSX.utils.aoa_to_sheet(wsData); XLSX.utils.book_append_sheet(wb, ws, "근무현황"); XLSX.writeFile(wb, `${d_raw.site}_${monthNum}월.xlsx`); 
    }

window.renderAllTeams = renderAllTeams;
window.loopDays = loopDays;
window.handleCellClick = handleCellClick;
window.updateTeamTotals = updateTeamTotals;
window.bindLongPress = bindLongPress;
window.addTeam = addTeam;
window.removeTeam = removeTeam;
window.addWorker = addWorker;
window.removeWorker = removeWorker;
window.saveMonthlyLog = saveMonthlyLog;
window.loadWorklogs = loadWorklogs;
window.editLog = editLog;
window.copyLog = copyLog;
window.deleteLog = deleteLog;
window.exportToExcel = exportToExcel;
window.canCompleteWorklog = canCompleteWorklog;
window.switchWorklogFilter = switchWorklogFilter;
window.toggleWorklogListEditMode = toggleWorklogListEditMode;
window.renderWorklogHistory = renderWorklogHistory;
window.completeWorklog = completeWorklog;
window.reopenWorklog = reopenWorklog;
window.switchWorklogInputMode = switchWorklogInputMode;
window.changeDailyWorklogDay = changeDailyWorklogDay;
window.setDailyWorklogDay = setDailyWorklogDay;
window.updateDailyWorkerValue = updateDailyWorkerValue;
window.updateDailyWorklogSummary = updateDailyWorklogSummary;
window.addWorkerFromDailyMode = addWorkerFromDailyMode;
window.copyPreviousDayWorkers = copyPreviousDayWorkers;
