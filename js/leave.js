// =====================================================
// 김목수이야기 ERP - leave.js
// 역할: 연차 관리, 신청, 달력, 승인, 잔여 연차 계산
// =====================================================

    
    let teamMembersInfo = {};
    let globalLeaveRecords = [];
    let globalLeaveMembers = [];

function canManageLeave() {
    const leaveAdmins = (typeof globalLeaveAdmins !== 'undefined' && Array.isArray(globalLeaveAdmins))
        ? globalLeaveAdmins
        : [];

    return myRole === "owner" || myRole === "admin" || leaveAdmins.includes(myEmail);
}

function initLeaveCalendarSelects() {
    const yearEl = document.getElementById('calYear');
    const monthEl = document.getElementById('calMonth');

    if (!yearEl || !monthEl) return;

    let yrHtml = '';
    let moHtml = '';
    let ty = new Date().getFullYear();

    for (let y = ty - 1; y <= ty + 5; y++) {
        yrHtml += `<option value="${y}">${y}년</option>`;
    }

    for (let m = 1; m <= 12; m++) {
        moHtml += `<option value="${m}">${m}월</option>`;
    }

    yearEl.innerHTML = yrHtml;
    monthEl.innerHTML = moHtml;

    let td = new Date();
    yearEl.value = td.getFullYear();
    monthEl.value = td.getMonth() + 1;
}

document.addEventListener("DOMContentLoaded", () => {
    initLeaveCalendarSelects();

    if (window.LEAVE_STANDALONE) {
        let savedTheme = localStorage.getItem('kimmoksu_theme');
        if (savedTheme === 'light') document.body.classList.add('light-mode');
    }
});

        if (window.LEAVE_STANDALONE) {
            window.toggleTheme = function () {
                let isLight = document.body.classList.toggle('light-mode');
                localStorage.setItem('kimmoksu_theme', isLight ? 'light' : 'dark');
            };
        }

if (window.LEAVE_STANDALONE) {
    auth.onAuthStateChanged(async user => {
        if (user) {
            myEmail = user.email; 
            document.getElementById('auth-overlay').style.display = 'none';
            const uDoc = await db.collection("users").doc(myEmail).get(); 
            userNickname = uDoc.exists ? uDoc.data().nickname : "관리자";
            document.getElementById('userNickDisplay').innerText = userNickname;
            
            const q = await db.collection("teams").where("members", "array-contains", myEmail).get();
            if (!q.empty) { 
                const tDoc = q.docs[0];
                myTeamId = tDoc.id;
                const tData = tDoc.data();
                
                if(tData.owner === myEmail || myEmail === "idong2300@naver.com") myRole = "owner";
                else if(tData.admins && tData.admins.includes(myEmail)) myRole = "admin";
                else myRole = "member";
                
                document.getElementById('userRoleDisplay').innerText =
                    myRole === "owner" ? "에디터 (최고권한)" :
                    (myRole === "admin" ? "관리자" : "팀원");

                const members = tData.members || [];
                await Promise.all(members.map(async m => {
                    try {
                        const u = await db.collection("users").doc(m).get();
                        globalEmailToNick[m] = u.exists ? u.data().nickname : m.split('@')[0];
                    } catch(e) {
                        globalEmailToNick[m] = m.split('@')[0];
                    }
                }));

                loadLeaveData(tData);
            }
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
        }
    });
}

if (window.LEAVE_STANDALONE) {
    window.handleAuth = async function () {
        const e = document.getElementById('userEmail').value;
        const p = document.getElementById('userPw').value;
        const keepAlive = document.getElementById('autoLoginCheck') ? document.getElementById('autoLoginCheck').checked : true;

        try {
            await auth.setPersistence(
                keepAlive
                    ? firebase.auth.Auth.Persistence.LOCAL
                    : firebase.auth.Auth.Persistence.SESSION
            );
            await auth.signInWithEmailAndPassword(e, p);
        } catch(err) {
            alert(err.message);
        }
    };

    window.resetPassword = async function () {
        const e = document.getElementById('userEmail').value.trim();

        if (!e) return alert("비밀번호를 찾을 이메일을 먼저 입력해주세요.");

        try {
            await auth.sendPasswordResetEmail(e);
            alert("입력하신 이메일로 비밀번호 재설정 링크를 발송했습니다.");
        } catch(err) {
            alert("이메일 발송 실패: " + err.message);
        }
    };
}

    // ============================================================
    // 💡 V1.4.1: 연차 자동 계산 핵심 함수 (회계연도 = 매년 1월 1일 기준) 💡
    // ============================================================
    // [입력] joinDateStr: 'YYYY-MM-DD' 형식
    // [출력] { base: 기본일수, bonus: 가산일수, total: 총합, yearsOfService: 근속년수, label: 설명 }
    //
    // 규칙:
    //  · 1년차 미만(입사 후 1년 X): 1개월 개근 시 1일씩 (최대 11일)
    //  · 2년차 이상(입사 후 1년 이상): 기본 15일
    //  · 근속 가산: 기존 방식대로 3년차부터 가산, 최대 25일
    function emptyLeaveCalc(label = '입사일 미입력') {
        return {
            base: 0,
            bonus: 0,
            total: 0,
            yearsOfService: 0,
            label: label,
            isValid: false
        };
    }

    function escapeLeaveHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeLeaveJs(value) {
        return String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    function parseHireDateSafely(hireDate) {
        if(!hireDate) return null;

        if(hireDate instanceof Date) {
            if(isNaN(hireDate.getTime())) return null;
            return new Date(hireDate.getFullYear(), hireDate.getMonth(), hireDate.getDate());
        }

        let raw = String(hireDate).trim();
        if(!raw) return null;

        if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const parts = raw.split('-').map(Number);
            const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
            if(parsed.getFullYear() === parts[0] && parsed.getMonth() === parts[1] - 1 && parsed.getDate() === parts[2]) return parsed;
            return null;
        }

        if(/^\d{4}[./]\d{1,2}[./]\d{1,2}$/.test(raw)) {
            const parts = raw.replace(/\./g, '/').split('/').map(Number);
            const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
            if(parsed.getFullYear() === parts[0] && parsed.getMonth() === parts[1] - 1 && parsed.getDate() === parts[2]) return parsed;
            return null;
        }

        const digits = raw.replace(/[^0-9]/g, '');
        if(digits.length === 8) {
            const y = Number(digits.substring(0, 4));
            const m = Number(digits.substring(4, 6));
            const d = Number(digits.substring(6, 8));
            const parsed = new Date(y, m - 1, d);
            if(parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d) return parsed;
            return null;
        }

        const parsed = new Date(raw);
        if(isNaN(parsed.getTime())) return null;
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    function formatDateForInput(hireDate) {
        const parsed = parseHireDateSafely(hireDate);
        if(!parsed) return '';
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getMemberJoinDate(memberInfo) {
        if(!memberInfo || typeof memberInfo !== 'object') return '';
        return memberInfo.joinDate || memberInfo.hireDate || memberInfo.hire_date || memberInfo.startDate || memberInfo.start_date || '';
    }

    function normalizeAnnualLeaveNumber(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) return 0;
        return parsed;
    }
    
    function formatAnnualLeaveNumber(value) {
        const num = normalizeAnnualLeaveNumber(value);
        return Number.isInteger(num) ? String(num) : String(num).replace(/\.0+$/, '');
    }
    
    function getMemberBonusAnnualLeave(memberInfo) {
        if (!memberInfo || typeof memberInfo !== 'object') return 0;
    
        return normalizeAnnualLeaveNumber(
            memberInfo.bonusAnnualLeave ??
            memberInfo.bonusLeave ??
            memberInfo.manualBonusLeave ??
            0
        );
    }
    
    function mergeAnnualLeaveCalcWithBonus(calc, bonusAnnualLeave) {
        const safeCalc = calc && typeof calc === 'object'
            ? calc
            : { base: 0, bonus: 0, total: 0 };
    
        const base = normalizeAnnualLeaveNumber(safeCalc.base);
        const autoBonus = normalizeAnnualLeaveNumber(safeCalc.bonus);
        const manualBonus = normalizeAnnualLeaveNumber(bonusAnnualLeave);
    
        return {
            base: base,
            autoBonus: autoBonus,
            manualBonus: manualBonus,
            total: base + autoBonus + manualBonus
        };
    }

    // ============================================================
    // 💡 V1.4.1: 연차 자동 계산 핵심 함수 (회계연도 = 매년 1월 1일 기준) 💡
    // ============================================================
    // [입력] hireDate: 'YYYY-MM-DD' 또는 날짜로 해석 가능한 값, targetYear: 계산 기준 연도
    // [출력] { base: 기본일수, bonus: 가산일수, total: 총합, yearsOfService: 근속년수, label: 설명, isValid: 정상 여부 }
    //
    // 규칙:
    //  · 입사일이 없거나 형식이 이상하면 0일 반환하여 관리자 리스트 렌더링 중단 방지
    //  · 1년차 미만(입사 후 1년 X): 1개월 개근 시 1일씩 (최대 11일)
    //  · 2년차 이상(입사 후 1년 이상): 기본 15일
    //  · 근속 가산: 기존 방식대로 3년차부터 가산, 최대 25일
    function calculateAnnualLeave(hireDate, targetYear = new Date().getFullYear()) {
        try {
            const joinDate = parseHireDateSafely(hireDate);
            if(!joinDate) return emptyLeaveCalc('입사일 미입력');
    
            const today = new Date();
            const safeTargetYear = Number.isFinite(Number(targetYear)) ? Number(targetYear) : today.getFullYear();
            const targetDate = safeTargetYear === today.getFullYear()
                ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
                : new Date(safeTargetYear, 11, 31);
    
            if(joinDate > targetDate) return emptyLeaveCalc('입사 예정');
    
            const msPerDay = 1000 * 60 * 60 * 24;
            const daysSinceJoin = Math.max(0, Math.floor((targetDate - joinDate) / msPerDay));
            const yearsOfService = Math.floor(daysSinceJoin / 365);
    
            let base = 0;
            let bonus = 0;
            let label = '';
    
            if(yearsOfService < 1) {
                let monthsCompleted = (targetDate.getFullYear() - joinDate.getFullYear()) * 12 + (targetDate.getMonth() - joinDate.getMonth());
                if(targetDate.getDate() < joinDate.getDate()) monthsCompleted -= 1;
                if(monthsCompleted < 0) monthsCompleted = 0;
    
                base = Math.min(monthsCompleted, 11);
                bonus = 0;
                label = `1년차 미만 (${monthsCompleted}개월 개근)`;
            } else {
                base = 15;
    
                if(yearsOfService >= 2) {
                    bonus = Math.floor((yearsOfService - 2) / 2) + 1;
                } else {
                    bonus = 0;
                }
    
                if(base + bonus > 25) bonus = 25 - base;
                if(bonus < 0) bonus = 0;
    
                label = `${yearsOfService + 1}년차 (근속 ${yearsOfService}년)`;
            }
    
            return {
                base: base,
                bonus: bonus,
                total: base + bonus,
                yearsOfService: yearsOfService,
                label: label,
                isValid: true
            };
        } catch(error) {
            console.error('연차 계산 오류:', error, hireDate, targetYear);
            return emptyLeaveCalc('계산 오류');
        }
    }

    // ============================================================
    // 💡 V1.4.1: 연차 데이터 로드 + 관리자 패널 + 잔여 현황판 (자동 계산) 💡
    // ============================================================
    function loadLeaveData(teamData) {
        const safeTeamData = teamData && typeof teamData === 'object' ? teamData : {};
        const members = Array.isArray(safeTeamData.members) ? safeTeamData.members.filter(Boolean) : [];
        globalLeaveMembers = members;
        
        const targetYearEl = document.getElementById('calYear');
        const targetYear = targetYearEl && targetYearEl.value ? Number(targetYearEl.value) : new Date().getFullYear();
    
        teamMembersInfo = safeTeamData.membersInfo && typeof safeTeamData.membersInfo === 'object'
            ? safeTeamData.membersInfo
            : {};
    
        const adminPanel = document.getElementById('leaveAdminPanel');
        const adminBody = document.getElementById('leaveAdminBody');
        const statusBody = document.getElementById('leaveStatusBody');
    
        if(!statusBody) {
            console.error('leaveStatusBody 컨테이너를 찾을 수 없습니다.');
            return;
        }
    
        if(canManageLeave()) {
            if(adminPanel) adminPanel.style.display = 'block';
    
            if(adminBody) {
                const adminRows = [];
    
                members.forEach(mEmail => {
                    try {
                        const email = String(mEmail || '').trim();
                        if(!email) return;
    
                        const nick = globalEmailToNick[email] || email.split('@')[0] || '이름 없음';
                        const info = teamMembersInfo[email] && typeof teamMembersInfo[email] === 'object' ? teamMembersInfo[email] : {};
                        const joinDateRaw = getMemberJoinDate(info);
                        const joinDateValue = formatDateForInput(joinDateRaw);
                        const calc = calculateAnnualLeave(joinDateRaw, targetYear);
                        const bonusAnnualLeave = getMemberBonusAnnualLeave(info);
                        const leaveTotal = mergeAnnualLeaveCalcWithBonus(calc, bonusAnnualLeave);
    
                        const department = info.department || '';
                        const position = info.position || '';
                        const duty = info.duty || info.task || info.job || info.work || '';
                        
                        const infoPreview = [department, position, duty].filter(Boolean).join(' / ');
                        
                        adminRows.push(`<tr data-email="${escapeLeaveHtml(email)}">
                            <td class="fw-bold">
                                <div class="d-flex justify-content-between align-items-center gap-2">
                                    <div class="text-start" style="min-width:0;">
                                        <div class="fw-bold text-truncate">${escapeLeaveHtml(nick)}</div>
                                        ${infoPreview ? `<div class="small text-secondary text-truncate">${escapeLeaveHtml(infoPreview)}</div>` : `<div class="small text-secondary">출력 정보 미입력</div>`}
                                    </div>
                                    <button type="button"
                                            class="btn btn-sm btn-outline-info text-nowrap"
                                            onclick="openLeaveMemberEditModal('${escapeLeaveJs(email)}')">
                                        편집
                                    </button>
                                </div>
                            </td>
                            <td>
                                <input type="date" class="form-control input-dark leave-join" data-email="${escapeLeaveHtml(email)}"
                                       value="${escapeLeaveHtml(joinDateValue)}"
                                       onchange="recalcLeavePreview('${escapeLeaveJs(email)}')">
                            </td>
                            <td class="text-info fw-bold leave-calc-base">${formatAnnualLeaveNumber(leaveTotal.base)}</td>
                            <td class="text-warning fw-bold leave-calc-bonus">${formatAnnualLeaveNumber(leaveTotal.autoBonus)}</td>
                            <td>
                                <input type="number"
                                       min="0"
                                       step="0.5"
                                       class="form-control input-dark text-center fw-bold leave-bonus-manual"
                                       data-email="${escapeLeaveHtml(email)}"
                                       value="${escapeLeaveHtml(formatAnnualLeaveNumber(leaveTotal.manualBonus))}"
                                       onchange="recalcLeavePreview('${escapeLeaveJs(email)}')">
                            </td>
                            <td class="text-success fw-bold leave-calc-total">${formatAnnualLeaveNumber(leaveTotal.total)} 일</td>
                        </tr>`);
                    } catch(error) {
                        console.error('관리자 연차 행 렌더링 오류:', error, mEmail);
                        const email = String(mEmail || '').trim();
                        const nick = globalEmailToNick[email] || email.split('@')[0] || '알 수 없음';
    
                        adminRows.push(`<tr class="table-danger">
                            <td class="fw-bold">${escapeLeaveHtml(nick)}</td>
                            <td colspan="5" class="text-danger small text-start">
                                이 직원의 입사일 데이터에 오류가 있어 기본값 0일로 표시했습니다.
                            </td>
                        </tr>`);
                    }
                });
    
                adminBody.innerHTML = adminRows.join('') || `<tr>
                    <td colspan="6" class="text-secondary py-4">등록된 팀원이 없습니다.</td>
                </tr>`;
                bindLeaveAdminEvents();
            } else {
                console.error('leaveAdminBody 컨테이너를 찾을 수 없습니다.');
            }
        }
    
        db.collection("leave_records").where("teamId", "==", myTeamId).onSnapshot(ss => {
            const used = {};
            globalLeaveRecords = [];
    
            ss.docs.forEach(doc => {
                try {
                    const d = doc.data() || {};
                    d.id = doc.id;
    
                    const email = String(d.userEmail || '').trim();
                    const amount = Number(d.amount || 0);
    
                    if(d.approved && email) used[email] = (used[email] || 0) + amount;
                    globalLeaveRecords.push(d);
                } catch(error) {
                    console.error('연차 사용 기록 파싱 오류:', error, doc.id);
                }
            });
    
            const statusRows = [];
    
            members.forEach(mEmail => {
                try {
                    const email = String(mEmail || '').trim();
                    if(!email) return;
    
                    const nick = globalEmailToNick[email] || email.split('@')[0] || '이름 없음';
                    const info = teamMembersInfo[email] && typeof teamMembersInfo[email] === 'object' ? teamMembersInfo[email] : {};
                    const joinDateRaw = getMemberJoinDate(info);
                    const displayDate = formatDateForInput(joinDateRaw) || '-';
                    const calc = calculateAnnualLeave(joinDateRaw, targetYear);
                    const bonusAnnualLeave = getMemberBonusAnnualLeave(info);
                    const leaveTotal = mergeAnnualLeaveCalcWithBonus(calc, bonusAnnualLeave);
    
                    const usedAmt = Number(used[email] || 0);
                    const remainAmt = leaveTotal.total - usedAmt;
    
                    if(!formatDateForInput(joinDateRaw)) {
                        statusRows.push(`<tr>
                            <td class="fw-bold fs-6">${escapeLeaveHtml(nick)}</td>
                            <td class="text-secondary">미입력</td>
                            <td colspan="3" class="text-secondary small">관리자 패널에서 입사일을 등록해주세요</td>
                        </tr>`);
                        return;
                    }
    
                    statusRows.push(`<tr>
                        <td class="fw-bold fs-6">${escapeLeaveHtml(nick)}</td>
                        <td class="text-secondary">${escapeLeaveHtml(displayDate)}<br><span class="small">${escapeLeaveHtml(calc.label)}</span></td>
                        <td class="text-info">${formatAnnualLeaveNumber(leaveTotal.total)} <span class="small text-secondary">(기본 ${formatAnnualLeaveNumber(leaveTotal.base)} + 가산 ${formatAnnualLeaveNumber(leaveTotal.autoBonus)} + 보너스 ${formatAnnualLeaveNumber(leaveTotal.manualBonus)})</span></td>
                        <td class="text-danger fw-bold">${usedAmt} 일</td>
                        <td class="${remainAmt < 0 ? 'text-danger' : 'text-success'} fw-bold fs-5">${formatAnnualLeaveNumber(remainAmt)} 일</td>
                    </tr>`);
                } catch(error) {
                    console.error('잔여 연차 행 렌더링 오류:', error, mEmail);
                    const email = String(mEmail || '').trim();
                    const nick = globalEmailToNick[email] || email.split('@')[0] || '알 수 없음';
    
                    statusRows.push(`<tr class="table-danger">
                        <td class="fw-bold fs-6">${escapeLeaveHtml(nick)}</td>
                        <td colspan="4" class="text-danger small text-start">
                            이 직원의 연차 데이터를 표시하는 중 오류가 발생했습니다. 다른 직원 목록은 계속 표시됩니다.
                        </td>
                    </tr>`);
                }
            });
    
            statusBody.innerHTML = statusRows.join('') || `<tr>
                <td colspan="5" class="text-secondary py-4">등록된 팀원이 없습니다.</td>
            </tr>`;
    
            try {
                renderLeaveCalendar();
            } catch(error) {
                console.error('연차 달력 렌더링 오류:', error);
            }
        }, error => {
            console.error('연차 기록 구독 오류:', error);
            statusBody.innerHTML = `<tr>
                <td colspan="5" class="text-danger py-4">연차 기록을 불러오는 중 오류가 발생했습니다.</td>
            </tr>`;
        });
    }

    function loadTeamMembersLeave(teamData) {
        return loadLeaveData(teamData);
    }

    // 💡 V1.4.1: 관리자 패널 입력/저장 이벤트 안전 바인딩 💡
    function bindLeaveAdminEvents() {
        const adminBody = document.getElementById('leaveAdminBody');
        if(!adminBody || adminBody.dataset.bound === 'true') return;
    
        adminBody.dataset.bound = 'true';
        adminBody.addEventListener('change', (event) => {
            const target = event.target;
            if(!target || !target.classList) return;
    
            if(
                target.classList.contains('leave-join') ||
                target.classList.contains('leave-bonus-manual')
            ) {
                recalcLeavePreview(target.getAttribute('data-email'));
            }
        });
    
        adminBody.addEventListener('input', (event) => {
            const target = event.target;
            if(!target || !target.classList) return;
    
            if(
                target.classList.contains('leave-join') ||
                target.classList.contains('leave-bonus-manual')
            ) {
                recalcLeavePreview(target.getAttribute('data-email'));
            }
        });
    }

    // 💡 V1.4.1: 관리자 패널에서 입사일 변경 시 즉시 미리보기 갱신 💡
    function recalcLeavePreview(mEmail) {
        try {
            const email = String(mEmail || '').trim();
            const safeEmail = window.CSS && CSS.escape ? CSS.escape(email) : email.replace(/"/g, '\\"');
            const row = document.querySelector(`#leaveAdminBody tr[data-email="${safeEmail}"]`);
            if(!row) return;
    
            const dateInput = row.querySelector('.leave-join');
            const bonusInput = row.querySelector('.leave-bonus-manual');
    
            const newDate = dateInput ? dateInput.value : '';
            const bonusAnnualLeave = bonusInput ? normalizeAnnualLeaveNumber(bonusInput.value) : 0;
    
            const targetYearEl = document.getElementById('calYear');
            const targetYear = targetYearEl && targetYearEl.value ? Number(targetYearEl.value) : new Date().getFullYear();
            const calc = calculateAnnualLeave(newDate, targetYear);
            const leaveTotal = mergeAnnualLeaveCalcWithBonus(calc, bonusAnnualLeave);
    
            const baseCell = row.querySelector('.leave-calc-base');
            const bonusCell = row.querySelector('.leave-calc-bonus');
            const totalCell = row.querySelector('.leave-calc-total');
    
            if(baseCell) baseCell.innerText = formatAnnualLeaveNumber(leaveTotal.base);
            if(bonusCell) bonusCell.innerText = formatAnnualLeaveNumber(leaveTotal.autoBonus);
    
            if(bonusInput && Number(bonusInput.value) < 0) {
                bonusInput.value = 0;
            }
    
            if(totalCell) totalCell.innerText = formatAnnualLeaveNumber(leaveTotal.total) + ' 일';
        } catch(error) {
            console.error('연차 미리보기 갱신 오류:', error, mEmail);
        }
    }

    // 💡 연차 전용 달력 렌더링 💡
    function renderLeaveCalendar() {
        let year = parseInt(document.getElementById('calYear').value);
        let month = parseInt(document.getElementById('calMonth').value) - 1;
        let firstDay = new Date(year, month, 1).getDay();
        let daysInMonth = new Date(year, month + 1, 0).getDate();
        
        let html = '<div class="d-grid" style="grid-template-columns: repeat(7, 1fr); gap: 6px;">';
        const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
        weekDays.forEach((w, i) => html += `<div class="fw-bold pb-2 border-bottom border-secondary border-opacity-25 ${i===0?'text-danger':i===6?'text-primary':'text-secondary'}">${w}</div>`);
        
        for(let i=0; i<firstDay; i++) html += `<div></div>`;
        
        let monthlyListData = [];

        for(let i=1; i<=daysInMonth; i++) {
            let dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            let matchRecs = globalLeaveRecords.filter(r => r.date === dateStr);
            
            let barHtml = `<div class="cal-bar-container">` + matchRecs.map(r => {
                monthlyListData.push(r); 
                let colorClass = r.approved ? 'bar-approved' : 'bar-pending';
                let typeClass = r.amount === 1 ? 'bar-full' : (r.type === 'am' ? 'bar-am' : 'bar-pm');
                return `<div class="cal-bar ${colorClass} ${typeClass}"></div>`;
            }).join('') + `</div>`;

            let dw = new Date(year, month, i).getDay();
            html += `<div class="cal-day-box" onclick="toggleCalAccordion('${dateStr}')">
                        <div class="cal-date-num" style="color:${dw===0?'#e03131':dw===6?'#5c7cfa':'#94a3b8'}">${i}</div>
                        ${barHtml}
                    </div>`;
        }
        document.getElementById('leaveCalendar').innerHTML = html + '</div>';

        renderMonthlyLeaveList(monthlyListData);
    }

    // 💡 하단 월간 내역 리스트 💡
    function renderMonthlyLeaveList(records) {
        let listContainer = document.getElementById('monthlyLeaveList');
        if(records.length === 0) {
            listContainer.innerHTML = '<p class="text-secondary text-center m-0 py-3">이번 달은 등록된 연차 현황이 없습니다.</p>';
            return;
        }

        records.sort((a,b) => a.date.localeCompare(b.date)); 
        
        let listHtml = records.map(r => {
            let nick = globalEmailToNick[r.userEmail] || r.userEmail.split('@')[0];
            let typeStr = r.amount === 1 ? '종일 연차' : (r.type === 'am' ? '오전 반차' : '오후 반차');
            let reasonStr = r.reason ? `<br><span class="small text-secondary"><i class="bi bi-chat-quote"></i> ${r.reason}</span>` : '';
            let canManage = canManageLeave();
            let canDelete = r.approved ? canManage : (canManage || r.userEmail === myEmail);
            let rowClass = r.approved ? 'approved-row' : '';
            let canPrint = r.approved && (canManage || r.userEmail === myEmail);
            let printBtn = canPrint ? `<button class="btn btn-outline-primary px-3 py-1 fw-bold" onclick="printLeaveForm('${r.id}')"><i class="bi bi-printer me-1"></i>출력</button>` : '';
            

            return `<div class="leave-detail-item ${rowClass}">
                        <div class="d-flex flex-column">
                            <span class="text-secondary small mb-1">${r.date}</span>
                            <span class="fw-bold fs-6 text-white">${nick} <span class="badge bg-secondary ms-2">${typeStr}</span>${reasonStr}</span>
                        </div>
                        <div class="d-flex align-items-center gap-3">
                            <label class="m-0 d-flex align-items-center gap-2 cursor-pointer">
                                <input type="checkbox" class="form-check-input m-0" style="width:20px; height:20px;" ${r.approved?'checked':''} ${canManage?'':'disabled'} onchange="toggleLeaveApprove('${r.id}', ${r.approved||false})">
                                ${r.approved ? '<span class="text-success fw-bold">승인 완료</span>' : '<span class="text-warning fw-bold">결재 대기</span>'}
                            </label>
                            ${printBtn}
                            ${canDelete ? `<button class="btn btn-outline-danger px-3 py-1 fw-bold" onclick="deleteLeaveRecord('${r.id}', '${r.userEmail}', ${r.approved||false})">취소/삭제</button>` : ''}
                        </div>
                    </div>`;
        }).join('');

        listContainer.innerHTML = listHtml;
    }

    // 💡 날짜 클릭 시 아코디언 (상세보기 및 신청) 💡
    function toggleCalAccordion(dateStr) {
        const area = document.getElementById('calAccordionArea'); 
        const content = document.getElementById('calAccordionContent');
        let matchRecs = globalLeaveRecords.filter(r => r.date === dateStr);
        
        let listHtml = matchRecs.map(r => {
            let txt = r.amount === 1 ? '종일 연차' : (r.type === 'am' ? '오전 반차' : '오후 반차');
            let nick = globalEmailToNick[r.userEmail] || r.userEmail.split('@')[0];
            let canManage = canManageLeave();
            let canDelete = r.approved ? canManage : (canManage || r.userEmail === myEmail);
            let rowClass = r.approved ? 'approved-row' : '';
            let canPrint = r.approved && (canManage || r.userEmail === myEmail);
            let printBtn = canPrint ? `<button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="printLeaveForm('${r.id}')"><i class="bi bi-printer"></i></button>` : '';
            return `<div class="leave-detail-item ${rowClass}">
                        <div class="fw-bold text-white">${nick} <span class="badge bg-secondary ms-2">${txt}</span> ${r.reason ? `<span class="small text-secondary ms-2">(${r.reason})</span>` : ''}</div>
                        <div class="d-flex align-items-center gap-3">
                            <label class="m-0 d-flex align-items-center gap-1 small cursor-pointer">
                                <input type="checkbox" class="form-check-input m-0" ${r.approved?'checked':''} ${canManage?'':'disabled'} onchange="toggleLeaveApprove('${r.id}', ${r.approved||false})">
                                ${r.approved ? '<span class="text-success fw-bold">승인 완료</span>' : '<span class="text-warning">대기중</span>'}
                            </label>
                            ${printBtn}
                            ${canDelete ? `<button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="deleteLeaveRecord('${r.id}', '${r.userEmail}', ${r.approved||false})"><i class="bi bi-trash"></i></button>` : ''}
                        </div>
                    </div>`;
        }).join('');
        
        if(!listHtml) listHtml = `<p class="text-secondary small text-center m-0 py-3">해당 일자에 신청 내역이 없습니다.</p>`;
        
        content.innerHTML = `<h5 class="fw-bold text-primary mb-3">${dateStr}</h5>${listHtml}<button class="btn btn-primary w-100 mt-4 py-3 fw-bold fs-6" onclick="openLeaveModal('${dateStr}')">+ 이 날짜로 나의 휴가 신청하기</button>`;
        area.style.display = 'block'; 
        area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function toggleLeaveApprove(id, current) {
        if (!canManageLeave()) {
            return alert("연차관리 권한이 없습니다.");
        }
    
        const nextApproved = !current;
    
        const updateData = {
            approved: nextApproved
        };
    
        if (nextApproved) {
            updateData.approvedAt = Date.now();
            updateData.approvedBy = myEmail;
        } else {
            updateData.approvedAt = null;
            updateData.approvedBy = null;
        }
    
        await db.collection("leave_records").doc(id).update(updateData);
    }
    
    async function deleteLeaveRecord(id, email, approved) {
        let canManage = canManageLeave();
        if (approved && !canManage) return alert("이미 승인된 연차는 연차관리 담당자만 삭제(취소) 가능합니다.");
        if (!approved && !canManage && email !== myEmail) return alert("본인의 신청 내역만 삭제할 수 있습니다.");
        if (confirm("정말 이 휴가 신청을 취소/삭제하시겠습니까?")) { 
            await db.collection("leave_records").doc(id).delete(); 
            document.getElementById('calAccordionArea').style.display = 'none'; 
        }
    }
    
    function openLeaveModal(d) { 
        document.getElementById('applyLeaveDate').value = d; 
        document.getElementById('applyLeaveReason').value = '';
        document.getElementById('leaveApplyModal').style.display = 'flex';
    }
    
    async function submitLeaveRequest() {
        let d = document.getElementById('applyLeaveDate').value; 
        let tVal = document.getElementById('applyLeaveType').value;
        let reason = document.getElementById('applyLeaveReason').value.trim();

        await db.collection("leave_records").add({ 
            teamId: myTeamId, 
            userEmail: myEmail, 
            date: d, 
            amount: tVal === '1' ? 1 : 0.5, 
            type: tVal === '1' ? 'full' : (tVal === '0.5_am' ? 'am' : 'pm'), 
            reason: reason, 
            approved: false, // 처음 신청 시 무조건 대기 상태
            createdAt: Date.now() 
        }); 
        
        document.getElementById('leaveApplyModal').style.display = 'none'; 
        document.getElementById('calAccordionArea').style.display = 'none';
        alert("휴가 신청이 완료되었습니다. 관리자 승인을 기다려주세요.");
    }

    function formatKoreanDateParts(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) {
            const now = new Date();
            return {
                year: now.getFullYear(),
                yy: String(now.getFullYear()).slice(2),
                month: now.getMonth() + 1,
                day: now.getDate()
            };
        }
    
        return {
            year: d.getFullYear(),
            yy: String(d.getFullYear()).slice(2),
            month: d.getMonth() + 1,
            day: d.getDate()
        };
    }
    
    function getLeaveTypeText(record) {
        if (!record) return "";
        if (Number(record.amount) === 1) return "종일 연차";
        if (record.type === "am") return "오전 반차";
        if (record.type === "pm") return "오후 반차";
        return "반차";
    }
    
    function getLeaveUsedDaysByEmail(email) {
        return globalLeaveRecords
            .filter(r => r.approved && r.userEmail === email)
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    }
    
    function getLeaveRemainDays(email, record) {
        const targetYearEl = document.getElementById('calYear');
        const targetYear = targetYearEl && targetYearEl.value ? Number(targetYearEl.value) : new Date().getFullYear();
    
        const info = teamMembersInfo[email] && typeof teamMembersInfo[email] === 'object'
            ? teamMembersInfo[email]
            : {};
    
        const joinDateRaw = getMemberJoinDate(info);
        const calc = calculateAnnualLeave(joinDateRaw, targetYear);
    
        const usedDays = getLeaveUsedDaysByEmail(email);
        const currentAmount = Number(record && record.amount ? record.amount : 0);
    
        // 이미 승인된 기록이므로 usedDays에 현재 신청 건도 포함되어 있음.
        // 신청서의 잔여일수는 해당 연차 사용 후 잔여 기준으로 표시.
        return calc.total - usedDays;
    }
    
    function loadLeaveTemplateImage() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = "annual_leave_template.png";
        });
    }
    
    function drawCenteredText(ctx, textValue, x, y, options = {}) {
        const size = options.size || 30;
        const weight = options.weight || "600";
        const color = options.color || "#1f2937";
        const align = options.align || "center";
    
        ctx.save();
        ctx.font = `${weight} ${size}px Pretendard, NanumGothic, Malgun Gothic, sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillText(String(textValue ?? ""), x, y);
        ctx.restore();
    }
    
    function drawWrappedText(ctx, textValue, x, y, maxWidth, lineHeight, options = {}) {
        const size = options.size || 30;
        const weight = options.weight || "500";
        const color = options.color || "#1f2937";
    
        ctx.save();
        ctx.font = `${weight} ${size}px Pretendard, NanumGothic, Malgun Gothic, sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
    
        const raw = String(textValue || "");
        const lines = [];
    
        raw.split("\n").forEach(paragraph => {
            let line = "";
            for (const ch of paragraph) {
                const testLine = line + ch;
                if (ctx.measureText(testLine).width > maxWidth && line) {
                    lines.push(line);
                    line = ch;
                } else {
                    line = testLine;
                }
            }
            if (line) lines.push(line);
        });
    
        lines.slice(0, 9).forEach((line, idx) => {
            ctx.fillText(line, x, y + idx * lineHeight);
        });
    
        ctx.restore();
    }
    
    async function printLeaveForm(recordId) {
        const record = globalLeaveRecords.find(r => r.id === recordId);
    
        if (!record) {
            return alert("출력할 연차 기록을 찾을 수 없습니다.");
        }
    
        if (!record.approved) {
            return alert("승인 완료된 연차만 출력할 수 있습니다.");
        }
    
        const canManage = canManageLeave();
        
        if (!canManage && record.userEmail !== myEmail) {
            return alert("본인의 승인 완료 연차만 출력할 수 있습니다.");
        }
    
        if (!window.jspdf || !window.jspdf.jsPDF) {
            return alert("PDF 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.");
        }
    
        try {
            const template = await loadLeaveTemplateImage();
    
            const canvas = document.createElement("canvas");
            canvas.width = template.naturalWidth || template.width;
            canvas.height = template.naturalHeight || template.height;
    
            const ctx = canvas.getContext("2d");
            ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
    
            const email = record.userEmail;
            const info = teamMembersInfo[email] && typeof teamMembersInfo[email] === 'object'
                ? teamMembersInfo[email]
                : {};
    
            const applicantName = globalEmailToNick[email] || email.split("@")[0] || "";
            const department = info.department || info.dept || "";
            const position = info.position || info.rank || "";
            const duty = info.duty || info.task || info.job || info.work || "";
            const substitute = record.substitute || info.substitute || "";
            const emergencyPhone = record.emergencyPhone || info.phone || info.contact || "";
            const reason = record.reason || "";
    
            const leaveDate = formatKoreanDateParts(record.date);
            const applyDate = formatKoreanDateParts(record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : record.date);
            const leaveDays = Number(record.amount || 0);
            const remainDays = getLeaveRemainDays(email, record);
            const leaveTypeText = getLeaveTypeText(record);
    
            // 템플릿 기준 좌표. 실제 출력 결과 보고 5~20px씩 조정 가능.
            const P = {
                name: [330, 235],
                department: [760, 235],
                position: [330, 325],
                duty: [760, 325],
            
                leavePeriod: [400, 435],
                requestDays: [400, 510],
                remainDays: [400, 590],
            
                reason: [95, 790],
                substitute: [255, 1150],
                emergencyPhone: [255, 1215],
            
                statement: [543, 1280],
                applyDate: [543, 1320],
                applicant: [870, 1415]
            };
    
            drawCenteredText(ctx, applicantName, ...P.name, { size: 18 });
            drawCenteredText(ctx, department, ...P.department, { size: 18 });
            drawCenteredText(ctx, position, ...P.position, { size: 18 });
            drawCenteredText(ctx, duty, ...P.duty, { size: 18 });
    
            const leavePeriodText = `${leaveDate.year}년 ${leaveDate.month}월 ${leaveDate.day}일 ~ ${leaveDate.year}년 ${leaveDate.month}월 ${leaveDate.day}일`;
            drawCenteredText(ctx, leavePeriodText, ...P.leavePeriod, { size: 20, align: "left" });
            
            drawCenteredText(ctx, `${leaveDays}일`, ...P.requestDays, { size: 18 });
            drawCenteredText(ctx, `${remainDays}일`, ...P.remainDays, { size: 18 });
    
            const reasonText = leaveTypeText
                ? `${leaveTypeText}${reason ? " / " + reason : ""}`
                : reason;
    
            drawWrappedText(ctx, reasonText, P.reason[0], P.reason[1], 900, 30, { size: 20 });
            
            drawCenteredText(ctx, substitute, ...P.substitute, { size: 18, align: "left" });
            drawCenteredText(ctx, emergencyPhone, ...P.emergencyPhone, { size: 18, align: "left" });
            
            const statementText = `상기 본인은 위와 같이 ${leaveDate.year}년도 연차유급 휴가를 신청하오니 처리하여 주시기 바랍니다.`;
            drawCenteredText(ctx, statementText, ...P.statement, { size: 18 });
            
            const applyDateText = `${applyDate.year}년 ${applyDate.month}월 ${applyDate.day}일`;
            drawCenteredText(ctx, applyDateText, ...P.applyDate, { size: 18 });
            
            drawCenteredText(ctx, `신청인  ${applicantName}  (인)`, ...P.applicant, { size: 18 });
    
            const imgData = canvas.toDataURL("image/png");
            const { jsPDF } = window.jspdf;
    
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "px",
                format: [canvas.width, canvas.height]
            });
    
            pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
    
            const safeName = applicantName.replace(/[\\/:*?"<>|]/g, "_");
            const fileName = `연차휴가신청서_${safeName}_${record.date}.pdf`;
    
            pdf.save(fileName);
        } catch (error) {
            console.error("연차신청서 PDF 생성 오류:", error);
            alert("PDF 생성 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
        }
    }

    // 💡 V1.4.1: 저장은 입사일만 (기본/가산은 매 로드 시 자동 계산) 💡
    async function saveLeaveSettings() {
        if (!myTeamId) {
            alert("팀 정보를 먼저 불러온 뒤 저장할 수 있습니다.");
            return;
        }
    
        if (!canManageLeave()) {
            alert("연차관리 권한이 없습니다.");
            return;
        }
    
        const saveBtn = document.querySelector('button[onclick="saveLeaveSettings()"]');
        const originalText = saveBtn ? saveBtn.innerHTML : "";
    
        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>저장 중';
            }
    
            const tDoc = await db.collection("teams").doc(myTeamId).get();
            const teamData = tDoc.exists ? tDoc.data() : {};
            const existingInfo =
                teamData && teamData.membersInfo && typeof teamData.membersInfo === "object"
                    ? { ...teamData.membersInfo }
                    : {};
    
            document.querySelectorAll("#leaveAdminBody tr[data-email]").forEach(row => {
                const email = String(row.getAttribute("data-email") || "").trim();
                if (!email) return;
    
                if (!existingInfo[email] || typeof existingInfo[email] !== "object") {
                    existingInfo[email] = {};
                }
    
                const joinInput = row.querySelector(".leave-join");
                const bonusInput = row.querySelector(".leave-bonus-manual");
    
                existingInfo[email].joinDate = joinInput ? (joinInput.value || "") : "";
                existingInfo[email].bonusAnnualLeave = normalizeAnnualLeaveNumber(bonusInput ? bonusInput.value : 0);
            });
    
            await db.collection("teams").doc(myTeamId).update({
                membersInfo: existingInfo
            });
    
            teamMembersInfo = existingInfo;
    
            alert("입사일과 보너스 연차가 저장되었습니다.\n자동 계산된 연차가 화면에 반영됩니다.");
    
            const refreshedDoc = await db.collection("teams").doc(myTeamId).get();
            if (refreshedDoc.exists) {
                loadTeamMembersLeave(refreshedDoc.data());
            }
        } catch (error) {
            console.error("연차 설정 저장 오류:", error);
            alert("연차 정보를 저장하는 중 오류가 발생했습니다.\n" + (error.message || error));
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText || "입사일/보너스 저장";
            }
        }
    }

    function openLeaveMemberEditModal(email) {
        const safeEmail = String(email || '').trim();
        if (!safeEmail) return;

        const info = teamMembersInfo[safeEmail] && typeof teamMembersInfo[safeEmail] === 'object'
            ? teamMembersInfo[safeEmail]
            : {};

        const nick = globalEmailToNick[safeEmail] || safeEmail.split('@')[0] || '';

        const emailEl = document.getElementById('leaveEditEmail');
        const nameEl = document.getElementById('leaveEditName');
        const departmentEl = document.getElementById('leaveEditDepartment');
        const positionEl = document.getElementById('leaveEditPosition');
        const dutyEl = document.getElementById('leaveEditDuty');
        const modalEl = document.getElementById('leaveMemberEditModal');

        if (!emailEl || !nameEl || !departmentEl || !positionEl || !dutyEl || !modalEl) {
            alert('연차 직원 정보 편집 모달을 찾을 수 없습니다.');
            return;
        }

        emailEl.value = safeEmail;
        nameEl.value = nick;
        departmentEl.value = info.department || info.dept || '';
        positionEl.value = info.position || info.rank || '';
        dutyEl.value = info.duty || info.task || info.job || info.work || '';

        modalEl.style.display = 'flex';
    }

    function closeLeaveMemberEditModal() {
        const modalEl = document.getElementById('leaveMemberEditModal');
        if (modalEl) modalEl.style.display = 'none';

        const emailEl = document.getElementById('leaveEditEmail');
        const nameEl = document.getElementById('leaveEditName');
        const departmentEl = document.getElementById('leaveEditDepartment');
        const positionEl = document.getElementById('leaveEditPosition');
        const dutyEl = document.getElementById('leaveEditDuty');

        if (emailEl) emailEl.value = '';
        if (nameEl) nameEl.value = '';
        if (departmentEl) departmentEl.value = '';
        if (positionEl) positionEl.value = '';
        if (dutyEl) dutyEl.value = '';
    }

    async function saveLeaveMemberInfo() {
        if (!myTeamId) {
            alert('팀 정보를 먼저 불러온 뒤 저장할 수 있습니다.');
            return;
        }

        if (!canManageLeave()) {
            alert('연차관리 권한이 없습니다.');
            return;
        }

        const email = String(document.getElementById('leaveEditEmail')?.value || '').trim();
        if (!email) {
            alert('저장할 직원을 찾을 수 없습니다.');
            return;
        }

        const department = document.getElementById('leaveEditDepartment')?.value.trim() || '';
        const position = document.getElementById('leaveEditPosition')?.value.trim() || '';
        const duty = document.getElementById('leaveEditDuty')?.value.trim() || '';

        try {
            const tDoc = await db.collection("teams").doc(myTeamId).get();
            const tData = tDoc.exists ? tDoc.data() : {};
            const existingInfo = (tData.membersInfo && typeof tData.membersInfo === 'object')
                ? { ...tData.membersInfo }
                : {};

            if (!existingInfo[email] || typeof existingInfo[email] !== 'object') {
                existingInfo[email] = {};
            }

            existingInfo[email] = {
                ...existingInfo[email],
                department,
                position,
                duty
            };

            await db.collection("teams").doc(myTeamId).update({
                membersInfo: existingInfo
            });

            teamMembersInfo = existingInfo;

            closeLeaveMemberEditModal();

            alert('직원 출력 정보가 저장되었습니다.');

            const refreshedDoc = await db.collection("teams").doc(myTeamId).get();
            if (refreshedDoc.exists) {
                loadTeamMembersLeave(refreshedDoc.data());
            }
        } catch (error) {
            console.error('연차 직원 정보 저장 오류:', error);
            alert('직원 정보를 저장하는 중 오류가 발생했습니다.\n' + (error.message || error));
        }
    }
    function openManualLeaveModal() {
    if (!canManageLeave()) {
        alert("과거 연차 기록 등록 권한이 없습니다.");
        return;
    }

    const modalEl = document.getElementById("manualLeaveModal");
    const userEl = document.getElementById("manualLeaveUser");
    const dateEl = document.getElementById("manualLeaveDate");
    const typeEl = document.getElementById("manualLeaveType");
    const reasonEl = document.getElementById("manualLeaveReason");

    if (!modalEl || !userEl || !dateEl || !typeEl || !reasonEl) {
        alert("과거 연차 등록 모달을 찾을 수 없습니다.");
        return;
    }

    const members = Array.isArray(globalLeaveMembers) ? globalLeaveMembers : [];

    userEl.innerHTML = members.map(email => {
        const nick = globalEmailToNick[email] || email.split("@")[0] || email;
        return `<option value="${escapeLeaveHtml(email)}">${escapeLeaveHtml(nick)} (${escapeLeaveHtml(email)})</option>`;
    }).join("");

    if (!userEl.innerHTML) {
        userEl.innerHTML = `<option value="">등록 가능한 팀원이 없습니다</option>`;
    }

    const today = new Date();
    dateEl.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    typeEl.value = "1";
    reasonEl.value = "과거 사용분 등록";

    modalEl.style.display = "flex";
}

function closeManualLeaveModal() {
    const modalEl = document.getElementById("manualLeaveModal");
    if (modalEl) modalEl.style.display = "none";

    const userEl = document.getElementById("manualLeaveUser");
    const dateEl = document.getElementById("manualLeaveDate");
    const typeEl = document.getElementById("manualLeaveType");
    const reasonEl = document.getElementById("manualLeaveReason");

    if (userEl) userEl.innerHTML = "";
    if (dateEl) dateEl.value = "";
    if (typeEl) typeEl.value = "1";
    if (reasonEl) reasonEl.value = "";
}

async function saveManualLeaveRecord() {
    if (!myTeamId) {
        alert("팀 정보를 먼저 불러온 뒤 등록할 수 있습니다.");
        return;
    }

    if (!canManageLeave()) {
        alert("과거 연차 기록 등록 권한이 없습니다.");
        return;
    }

    const userEmail = String(document.getElementById("manualLeaveUser")?.value || "").trim();
    const date = document.getElementById("manualLeaveDate")?.value || "";
    const typeValue = document.getElementById("manualLeaveType")?.value || "1";
    const reason = document.getElementById("manualLeaveReason")?.value.trim() || "과거 사용분 등록";

    if (!userEmail) {
        alert("직원을 선택해주세요.");
        return;
    }

    if (!date) {
        alert("사용 날짜를 선택해주세요.");
        return;
    }

    const amount = typeValue === "1" ? 1 : 0.5;
    const type = typeValue === "1" ? "full" : (typeValue === "0.5_am" ? "am" : "pm");

    const nick = globalEmailToNick[userEmail] || userEmail.split("@")[0] || userEmail;
    const typeText = amount === 1 ? "종일 연차" : (type === "am" ? "오전 반차" : "오후 반차");

    if (!confirm(`${nick}님의 ${date} ${typeText} 기록을 등록하시겠습니까?\n\n등록 즉시 승인 완료 상태로 반영됩니다.`)) {
        return;
    }

    try {
        await db.collection("leave_records").add({
            teamId: myTeamId,
            userEmail: userEmail,
            date: date,
            amount: amount,
            type: type,
            reason: reason,
            approved: true,

            manualEntry: true,
            manualEntryLabel: "권한자 과거 연차 등록",
            createdBy: myEmail,
            createdByName: userNickname,
            createdAt: Date.now(),

            approvedAt: Date.now(),
            approvedBy: myEmail
        });

        closeManualLeaveModal();
        alert("과거 연차 사용 기록이 등록되었습니다.");
    } catch (error) {
        console.error("과거 연차 기록 등록 오류:", error);
        alert("과거 연차 기록 등록 중 오류가 발생했습니다.\n" + (error.message || error));
    }
}

window.initLeaveCalendarSelects = initLeaveCalendarSelects;
window.loadLeaveData = loadLeaveData;
window.loadTeamMembersLeave = loadTeamMembersLeave;
window.renderLeaveCalendar = renderLeaveCalendar;
window.renderMonthlyLeaveList = renderMonthlyLeaveList;
window.toggleCalAccordion = toggleCalAccordion;
window.openLeaveModal = openLeaveModal;
window.submitLeaveRequest = submitLeaveRequest;
window.toggleLeaveApprove = toggleLeaveApprove;
window.deleteLeaveRecord = deleteLeaveRecord;
window.saveLeaveSettings = saveLeaveSettings;
window.recalcLeavePreview = recalcLeavePreview;
window.calculateAnnualLeave = calculateAnnualLeave;
window.printLeaveForm = printLeaveForm;
window.canManageLeave = canManageLeave;
window.openLeaveMemberEditModal = openLeaveMemberEditModal;
window.closeLeaveMemberEditModal = closeLeaveMemberEditModal;
window.saveLeaveMemberInfo = saveLeaveMemberInfo;
window.openManualLeaveModal = openManualLeaveModal;
window.closeManualLeaveModal = closeManualLeaveModal;
window.saveManualLeaveRecord = saveManualLeaveRecord;
