// 김목수이야기 운행기록부 공용 설정
// Kakao JavaScript 키는 웹 클라이언트용 키이며,
// Kakao Developers의 JavaScript SDK 도메인 제한과 함께 사용합니다.

window.KIMMOKSU_DRIVING_CONFIG = {
    kakaoJavaScriptKey: "YOUR_KAKAO_JAVASCRIPT_KEY"
};

window.addEventListener('DOMContentLoaded', () => {
    const key = String(window.KIMMOKSU_DRIVING_CONFIG?.kakaoJavaScriptKey || '').trim();
    const status = document.getElementById('kakaoStatus');

    if (!key || key === '26238d87788a8fa90483fc9f8a73e601') {
        if (status) {
            status.innerHTML = '<i class="bi bi-circle-fill" style="font-size:.5rem"></i> 주소 서비스 설정 필요';
            status.className = 'api-status text-danger';
        }
        return;
    }

    // 기존 driving.js 호환용 숨김 입력값 생성
    let hiddenInput = document.getElementById('kakaoKeyInput');
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'kakaoKeyInput';
        document.body.appendChild(hiddenInput);
    }
    hiddenInput.value = key;

    // driving.js 로드 완료 후 자동 연결
    setTimeout(() => {
        if (typeof window.connectKakaoMaps === 'function') {
            window.connectKakaoMaps();
        } else if (status) {
            status.innerHTML = '<i class="bi bi-circle-fill" style="font-size:.5rem"></i> 주소 서비스 초기화 실패';
            status.className = 'api-status text-danger';
        }
    }, 0);
});
