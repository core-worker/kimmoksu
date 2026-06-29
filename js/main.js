// =====================================================
// 김목수이야기 ERP - main.js
// 역할: 메인 화면 전환, 공통 상태, 테마, 초기화, 공통 유틸
// =====================================================

let myEmail, myTeamId, userNickname = "관리자";
let isLoginMode = true;
let myRole = "member";
let globalEmailToNick = {};
let siteModal, ganttModal, permModalInst;

let globalNoticeAdmins = [];
let globalStatusAdmins = [];
let globalWorklogAdmins = [];
let globalLeaveAdmins = [];
let currentPermType = "";

let worklogCollapsedStates = {};

const DEFAULT_WORKLOG_TEAMS = ["목수", "도장", "전기", "필름"];

function createDefaultTeamData() {
    return DEFAULT_WORKLOG_TEAMS.map(teamName => ({ teamName, workers: [] }));
}

function normalizeTeamData(source) {
    const safeSource = Array.isArray(source) ? source : [];

    if (safeSource.length === 0) {
        return createDefaultTeamData();
    }

    return safeSource
        .filter(team => team && team.teamName)
        .map(team => ({
            teamName: team.teamName,
            workers: Array.isArray(team.workers) ? team.workers : []
        }));
}
let teamData = createDefaultTeamData();

document.addEventListener("DOMContentLoaded", function () {
    siteModal = new bootstrap.Modal(document.getElementById("siteModal"));
    ganttModal = new bootstrap.Modal(document.getElementById("ganttCreateModal"));
    permModalInst = new bootstrap.Modal(document.getElementById("permModal"));

    const savedTheme = localStorage.getItem("kimmoksu_theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-mode");
        updateThemeUI(true);
    } else {
        updateThemeUI(false);
    }

    if (typeof renderAllTeams === "function") {
        resetWorklogForm();
    }

    const logMonth = document.getElementById("logMonth");
    if (logMonth) {
        logMonth.onchange = function () {
            if (typeof renderAllTeams === "function") renderAllTeams();
        };
        logMonth.value = new Date().toISOString().substring(0, 7);
    }
});

function toggleTheme() {
    const isLight = document.body.classList.toggle("light-mode");
    localStorage.setItem("kimmoksu_theme", isLight ? "light" : "dark");
    updateThemeUI(isLight);
}

function updateThemeUI(isLight) {
    const btn = document.getElementById("themeToggleBtn");
    if (!btn) return;

    if (isLight) {
        btn.innerHTML = '<i class="bi bi-moon-fill"></i> <span>블랙 모드로 전환</span>';
        btn.classList.replace("btn-outline-secondary", "btn-outline-dark");
    } else {
        btn.innerHTML = '<i class="bi bi-brightness-high-fill"></i> <span>화이트 모드로 전환</span>';
        btn.classList.replace("btn-outline-dark", "btn-outline-secondary");
    }
}

function showPage(pageId, el, pushState = true, options = {}) {
    const preserveState = !!(options && options.preserveState);

    if (!preserveState) resetVolatilePageState(pageId);

    document.querySelectorAll(".page-section").forEach(p => p.classList.remove("active"));

    const targetPage = document.getElementById("page-" + pageId);
    if (targetPage) targetPage.classList.add("active");

    if (el) {
        document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
        el.classList.add("active");
    }

    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (sidebar) sidebar.classList.remove("active");
    if (overlay) overlay.classList.remove("active");

    if (pushState) history.pushState({ page: pageId }, "", "#" + pageId);

    if (pageId === "team") checkTeamUI();

    if (pageId === "profile") {
        document.getElementById("editNickname").value = userNickname;
        document.getElementById("editEmail").value = myEmail;
    }

    if (pageId === "worklog") {
        if (!preserveState) resetWorklogForm();
        renderAllTeams();
    }

    if (pageId === "gantt" && !preserveState) resetGanttForm();
    if (pageId === "t5" && !preserveState) resetT5Form();

    if (pageId === "punch") {
        loadPunchSummaryCards();
    }
}

function resetVolatilePageState(nextPageId) {
    try { if (typeof siteEditingId !== "undefined") siteEditingId = null; } catch (e) {}
    try { if (typeof editingId !== "undefined") editingId = null; } catch (e) {}
    try { if (typeof currentGanttId !== "undefined") currentGanttId = null; } catch (e) {}
    try { if (typeof t5EditingId !== "undefined") t5EditingId = null; } catch (e) {}
    try { if (typeof editingMemoId !== "undefined") editingMemoId = null; } catch (e) {}
    try { if (typeof currentGanttMemoKey !== "undefined") currentGanttMemoKey = null; } catch (e) {}
    try { if (typeof calculatedData !== "undefined") calculatedData = null; } catch (e) {}

    resetSiteForm();
    resetGanttForm();
    resetT5Form();

    if (nextPageId !== "punch") {
        try {
            if (typeof punchDetailListener !== "undefined" && punchDetailListener) punchDetailListener();
            if (typeof currentSite !== "undefined") currentSite = "";

            const viewList = document.getElementById("view-list");
            const viewDetail = document.getElementById("view-detail");

            if (viewList && viewDetail) {
                viewList.style.display = "block";
                viewDetail.style.display = "none";
            }
        } catch (e) {}
    }
}

function resetSiteForm() {
    const form = document.getElementById("siteForm");
    if (form) form.querySelectorAll("input, textarea").forEach(i => i.value = "");

    const status = document.getElementById("f_status");
    if (status) status.value = "ongoing";

    try {
        if (typeof toggleSiteFormFields === "function") toggleSiteFormFields("ongoing");
    } catch (e) {}
}

function setWorklogDefaultMonth() {
    const logMonth = document.getElementById("logMonth");
    if (!logMonth) return;

    const today = new Date();
    logMonth.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function resetWorklogForm() {
    if (typeof editingId !== "undefined") editingId = null;

    const siteInput = document.getElementById("siteName");
    if (siteInput) siteInput.value = "";

    setWorklogDefaultMonth();
    teamData = createDefaultTeamData();
    worklogCollapsedStates = {};

    if (document.getElementById("team-container") && typeof renderAllTeams === "function") {
        renderAllTeams();
    }
}

function resetGanttForm() {
    if (typeof currentGanttId !== "undefined") currentGanttId = null;
    if (typeof currentGanttMemoKey !== "undefined") currentGanttMemoKey = null;

    const nameInput = document.getElementById("ganttSiteName");
    if (nameInput) nameInput.value = "";

    const dashboard = document.getElementById("ganttDashboard");
    if (dashboard) dashboard.style.display = "none";

    const extraBody = document.getElementById("extraCostBody");
    if (extraBody) extraBody.innerHTML = "";

    try { if (typeof ganttState !== "undefined") ganttState = {}; } catch (e) {}
    try { if (typeof ganttMemos !== "undefined") ganttMemos = {}; } catch (e) {}
    try { if (typeof ganttDates !== "undefined") ganttDates = []; } catch (e) {}
}

function resetT5Form() {
    if (typeof t5EditingId !== "undefined") t5EditingId = null;
    if (typeof calculatedData !== "undefined") calculatedData = null;

    const title = document.getElementById("t5-site-title");
    if (title) title.value = "";

    const container = document.getElementById("t5-input-container");
    if (container) {
        container.innerHTML = `<div class="row g-2 mb-2 t5-row-item">
                        <div class="col-6"><input type="text" class="form-control input-dark t5-section-name" placeholder="구간 (예: 거실)"></div>
                        <div class="col-6"><input type="number" class="form-control input-dark t5-length-val" placeholder="길이 (mm)"></div>
                    </div>`;
    }

    const result = document.getElementById("t5-temp-result");
    if (result) result.style.display = "none";

    const saveBtn = document.getElementById("t5-save-btn");
    if (saveBtn) saveBtn.style.display = "none";

    const resultList = document.getElementById("res-list-container");
    if (resultList) resultList.innerHTML = "";

    const total = document.getElementById("res-total-summary");
    if (total) total.innerText = "";
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    if (sidebar) sidebar.classList.toggle("active");
    if (overlay) overlay.classList.toggle("active");
}

window.onload = () => {
    const hash = window.location.hash.replace("#", "");

    if (hash && document.getElementById("page-" + hash)) {
        const targetLink = document.querySelector(`.nav-link[onclick*="'${hash}'"]`);
        showPage(hash, targetLink, false);
    } else if (!history.state) {
        history.replaceState({ page: "home" }, "", "#home");
    }
};

window.addEventListener("popstate", e => {
    if (
        typeof currentSite !== "undefined" &&
        currentSite !== "" &&
        document.getElementById("view-detail").style.display === "block"
    ) {
        goBackToPunchList(false);
    } else if (e.state && e.state.page) {
        const targetLink = document.querySelector(`.nav-link[onclick*="'${e.state.page}'"]`);
        showPage(e.state.page, targetLink, false);
    } else {
        showPage("home", document.querySelector(".nav-link"), false);
    }
});

function applyRoleRestrictions() {
    const isSuper = myRole === "owner" || myRole === "admin";
    const canUseEditMode = canUseIntegratedEditMode();

    document.getElementById("btnNoticePerm").style.display = isSuper ? "inline-block" : "none";
    document.getElementById("btnStatusPerm").style.display = isSuper ? "inline-block" : "none";

    const btnWorklogPerm = document.getElementById("btnWorklogPerm");
    if (btnWorklogPerm) btnWorklogPerm.style.display = isSuper ? "inline-block" : "none";

    const btnLeavePerm = document.getElementById("btnLeavePerm");
    if (btnLeavePerm) btnLeavePerm.style.display = isSuper ? "inline-block" : "none";
    
    document.getElementById("btnEditStatus").style.display = canUseEditMode ? "inline-block" : "none";
    document.getElementById("btnDeleteGantt").style.display = isSuper ? "inline-block" : "none";

    if (!canUseEditMode && isStatusEditMode) isStatusEditMode = false;
    if (globalStatusData.length > 0) renderAllSections(globalStatusData);

    renderBoardMemos();
    loadBoardMemos();
}

function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(t).then(() => alert("복사됨")).catch(() => fallbackCopy(t));
    } else {
        fallbackCopy(t);
    }
}

function fallbackCopy(t) {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.opacity = "0";

    document.body.appendChild(ta);
    ta.select();

    try {
        document.execCommand("copy");
        alert("복사됨");
    } catch (e) {
        alert("복사 실패: 수동으로 복사해주세요.");
    }

    document.body.removeChild(ta);
}

window.createDefaultTeamData = createDefaultTeamData;
window.normalizeTeamData = normalizeTeamData;
window.toggleTheme = toggleTheme;
window.updateThemeUI = updateThemeUI;
window.showPage = showPage;
window.resetVolatilePageState = resetVolatilePageState;
window.resetSiteForm = resetSiteForm;
window.setWorklogDefaultMonth = setWorklogDefaultMonth;
window.resetWorklogForm = resetWorklogForm;
window.resetGanttForm = resetGanttForm;
window.resetT5Form = resetT5Form;
window.toggleSidebar = toggleSidebar;
window.applyRoleRestrictions = applyRoleRestrictions;
window.copyText = copyText;
window.fallbackCopy = fallbackCopy;
