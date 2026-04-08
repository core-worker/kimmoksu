// 준호님의 파이어베이스 설정값
const firebaseConfig = {
    apiKey: "AIzaSyDjvv8ezS7OJgfwEfEh8Xwou9_bW7jzJ3w",
    authDomain: "kimmoksu-35d62.firebaseapp.com",
    projectId: "kimmoksu-35d62",
    storageBucket: "kimmoksu-35d62.firebasestorage.app",
    messagingSenderId: "104444016578",
    appId: "1:104444016578:web:09f9feeb61bf78ef23c85b",
    measurementId: "G-W7QBSQTX3J"
};

// 파이어베이스 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 로그인 체크 함수 (로그인 안 되어 있으면 메인으로 보냄)
function authCheck() {
    const teamId = localStorage.getItem('teamId');
    if (!teamId) {
        alert("로그인이 필요합니다.");
        location.href = 'index.html';
    }
    return teamId;
}
