// 💡 V31 FIX: PWA 기본 캐싱 전략 구현 (오프라인 대응) 💡
// - 핵심 파일을 캐시에 저장해두고, 네트워크 실패 시 캐시에서 응답
// - Firebase 통신은 캐싱하지 않음 (실시간 DB 보호)

const CACHE_NAME = 'kimmoksu-v31';
const CORE_ASSETS = [
    './',
    './index.html',
    './calendar.html',
    './leave.html',
    './style.css',
    './firebase-config.js',
    './manifest.json',
    './favicon.png',
    './kimmoksu_main_logo.png'
];

// 설치 시 핵심 파일 캐싱
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS).catch(err => console.warn('일부 파일 캐싱 실패:', err)))
            .then(() => self.skipWaiting())
    );
});

// 활성화 시 이전 캐시 정리
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// fetch: Network-first 전략 (최신 데이터 우선, 실패 시 캐시)
self.addEventListener('fetch', event => {
    // Firebase/Firestore 요청은 절대 가로채지 않음 (실시간 DB 동기화 보호)
    if (event.request.url.includes('firestore') || 
        event.request.url.includes('firebaseio') ||
        event.request.url.includes('googleapis')) {
        return;
    }
    
    // GET 요청만 캐싱 대상
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // 성공 시 캐시에 저장 (동일 출처만)
                if (response && response.status === 200 && event.request.url.startsWith(self.location.origin)) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))  // 네트워크 실패 시 캐시
    );
});
