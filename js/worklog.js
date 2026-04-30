    // 작업일보 (V30: 우측 정렬 + 아코디언 상태 보존 로직 추가)
    let editingId = null; 
    
    function renderAllTeams() {
        const container = document.getElementById('team-container'); 
        const [year, month] = (document.getElementById('logMonth').value||"2026-04").split('-').map(Number); 
        const lastDay = new Date(year, month, 0).getDate();
        
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
                    <span class="badge bg-primary px-3 py-2 flex-shrink-0" style="font-size:0.85rem;">총 ${teamTotal} 공수</span>
                    <button onclick="event.stopPropagation(); addWorker(${tIdx})" class="t5-btn-small fw-bold px-2 py-1 flex-shrink-0" style="font-size:0.9rem;">[+]</button>
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
    function addTeam() { const n = prompt("공정명"); if(n){ teamData.push({teamName:n, workers:[]}); renderAllTeams(); } }
    function addWorker(t) { teamData[t].workers.push({name:"", days:{}}); renderAllTeams(); }
    function removeWorker(t, w) { if(confirm("삭제하시겠습니까?")){ teamData[t].workers.splice(w,1); renderAllTeams(); } }
    async function saveMonthlyLog() { const m = document.getElementById('logMonth').value, s = document.getElementById('siteName').value; if(!s) return; const d = { teamId:myTeamId, month:m, site:s, teamData:teamData, updatedAt:Date.now(), lastModifier:userNickname }; if(editingId) await db.collection("monthly_logs").doc(editingId).update(d); else await db.collection("monthly_logs").add({...d, originalWriter:userNickname}); alert("저장 완료"); location.reload(); }
    function loadWorklogs() { db.collection("monthly_logs").where("teamId","==",myTeamId).orderBy("updatedAt","desc").limit(10).onSnapshot(ss => { document.getElementById('history-list').innerHTML = ss.docs.map(doc => { const d = doc.data(); 
        let delBtnHtml = (myRole !== 'member') ? `<button class="t5-btn-small bg-danger text-white" onclick="deleteLog('${doc.id}')">삭제</button>` : '';
        let btnHtml = `<button class="t5-btn-small bg-secondary text-white" onclick="editLog('${doc.id}')">수정</button><button class="t5-btn-small bg-primary text-white" onclick="copyLog('${doc.id}')">복사</button><button class="t5-btn-small bg-success text-white" onclick="exportToExcel('${doc.id}')">엑셀</button>${delBtnHtml}`; 
        return `<div class="col-md-6"><div class="t5-card p-3 m-0 d-flex justify-content-between align-items-center"><div><b class="text-primary">${d.month}</b><br>${d.site}<br><span class="small text-secondary">작성: ${d.originalWriter||'관리자'} ${d.lastModifier?`/ 수정: ${d.lastModifier}`:''}</span></div><div class="d-flex gap-1 flex-wrap justify-content-end" style="max-width: 60%;">${btnHtml}</div></div></div>`; }).join(''); }); }
    async function editLog(id) { const d = (await db.collection("monthly_logs").doc(id).get()).data(); editingId = id; document.getElementById('logMonth').value = d.month; document.getElementById('siteName').value = d.site; teamData = d.teamData || []; showPage('worklog', null, true, { preserveState: true }); renderAllTeams(); window.scrollTo(0,0); }
    async function copyLog(id) { const d = (await db.collection("monthly_logs").doc(id).get()).data(); editingId = null; document.getElementById('logMonth').value = d.month; document.getElementById('siteName').value = d.site + " (복사)"; teamData = d.teamData || []; showPage('worklog', null, true, { preserveState: true }); renderAllTeams(); alert("데이터가 복사되었습니다."); window.scrollTo(0,0); }
    async function deleteLog(id) { if(confirm("이 작업일보를 완전히 삭제하시겠습니까?")) { await db.collection("monthly_logs").doc(id).delete(); } }
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
window.addWorker = addWorker;
window.removeWorker = removeWorker;
window.saveMonthlyLog = saveMonthlyLog;
window.loadWorklogs = loadWorklogs;
window.editLog = editLog;
window.copyLog = copyLog;
window.deleteLog = deleteLog;
window.exportToExcel = exportToExcel;
