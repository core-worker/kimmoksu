// =====================================================
// 김목수이야기 ERP - driving-consent.js
// Google Timeline 분석 전 개인정보/위치정보 사용 동의 확인
// =====================================================

(function installDrivingPrivacyConsent() {
    const originalLoadTimelineFile = window.loadTimelineFile;
    if (typeof originalLoadTimelineFile !== 'function') return;

    window.loadTimelineFile = async function(...args) {
        const consent = document.getElementById('timelinePrivacyConsent');
        if (!consent?.checked) {
            alert('운행 분석 전에 개인정보 및 위치정보 사용 동의에 체크해주세요.');
            consent?.focus();
            return;
        }
        return originalLoadTimelineFile.apply(this, args);
    };
})();
