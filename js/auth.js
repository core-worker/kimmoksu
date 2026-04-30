// =====================================================
// 김목수이야기 ERP - auth.js
// 역할: 로그인, 로그아웃, 회원가입, 사용자/팀 정보 로딩, 프로필
// =====================================================

auth.onAuthStateChanged(async user => {
    if (user) {
        myEmail = user.email;
        document.getElementById("auth-overlay").style.display = "none";

        const uDoc = await db.collection("users").doc(myEmail).get();
        userNickname = uDoc.exists ? uDoc.data().nickname : "관리자";
        document.getElementById("userNickDisplay").innerText = userNickname;

        const q = await db.collection("teams").where("members", "array-contains", myEmail).get();

        if (!q.empty) {
            const tDoc = q.docs[0];
            myTeamId = tDoc.id;
            const tData = tDoc.data();

            if (tData.owner === myEmail || myEmail === "idong2300@naver.com") myRole = "owner";
            else if (tData.admins && tData.admins.includes(myEmail)) myRole = "admin";
            else myRole = "member";

            document.getElementById("userRoleDisplay").innerText =
                myRole === "owner" ? "에디터 (최고권한)" :
                myRole === "admin" ? "관리자" :
                "팀원";

            globalNoticeAdmins = tData.noticeAdmins || [];
            globalStatusAdmins = tData.statusAdmins || [];

            applyRoleRestrictions();

            const members = tData.members || [];
            await Promise.all(members.map(async m => {
                try {
                    const u = await db.collection("users").doc(m).get();
                    globalEmailToNick[m] = u.exists ? u.data().nickname : m.split("@")[0];
                } catch (e) {
                    globalEmailToNick[m] = m.split("@")[0];
                }
            }));

            loadBoardMemos();
            loadAllStatusData();
            loadGanttList();
            loadWorklogs();
            loadPunchSummaryCards();
            loadT5History();
            loadMemos();
        }

        checkTeamUI();
    } else {
        document.getElementById("auth-overlay").style.display = "flex";
    }
});

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById("auth-title").innerText = isLoginMode ? "접속" : "가입";
    document.getElementById("userNick").style.display = isLoginMode ? "none" : "block";
}

async function handleAuth() {
    const e = document.getElementById("userEmail").value;
    const p = document.getElementById("userPw").value;
    const n = document.getElementById("userNick").value;
    const keepAlive = document.getElementById("autoLoginCheck") ? document.getElementById("autoLoginCheck").checked : true;

    try {
        await auth.setPersistence(
            keepAlive
                ? firebase.auth.Auth.Persistence.LOCAL
                : firebase.auth.Auth.Persistence.SESSION
        );

        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(e, p);
        } else {
            await auth.createUserWithEmailAndPassword(e, p);
            await db.collection("users").doc(e).set({
                nickname: n,
                email: e,
                createdAt: Date.now()
            });
        }
    } catch (err) {
        alert(err.message);
    }
}

async function resetPassword() {
    const e = document.getElementById("userEmail").value.trim();

    if (!e) return alert("비밀번호를 찾을 이메일을 먼저 입력해주세요.");

    try {
        await auth.sendPasswordResetEmail(e);
        alert("입력하신 이메일로 비밀번호 재설정 링크를 발송했습니다. 이메일함을 확인해주세요!");
    } catch (err) {
        alert("이메일 발송 실패: " + err.message);
    }
}

async function handleLogout() {
    if (confirm("로그아웃 하시겠습니까?")) {
        await auth.signOut();
        location.reload();
    }
}

async function updateProfile() {
    await db.collection("users").doc(myEmail).update({
        nickname: document.getElementById("editNickname").value
    });
    location.reload();
}

async function changePassword() {
    try {
        await auth.currentUser.updatePassword(document.getElementById("newPasswordInput").value);
        alert("성공");
    } catch (e) {
        alert(e.message);
    }
}

window.toggleAuthMode = toggleAuthMode;
window.handleAuth = handleAuth;
window.resetPassword = resetPassword;
window.handleLogout = handleLogout;
window.updateProfile = updateProfile;
window.changePassword = changePassword;
