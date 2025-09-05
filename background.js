// background.js - 주가 모니터 익스텐션 백그라운드 스크립트 (Offscreen 버전)

let stockData = {};
const ALARM_NAME = 'stock-update-alarm';

// 기본 설정
chrome.runtime.onInstalled.addListener(() => {
  // 기본 설정 저장
  chrome.storage.local.set({
    stocks: [{ code: '005930', name: '삼성전자', enabled: true }],
    updateInterval: 2,
    position: 'top-left',
    showVolume: true,
    showChange: true
  });
});

// Offscreen document 관리
let offscreenDocumentExists = false;

// Offscreen document 생성/확인
async function ensureOffscreenDocument() {
  if (!offscreenDocumentExists) {
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_SCRAPING'],
        justification: '네이버 증권에서 주식 데이터를 크롤링하기 위한 DOM 작업'
      });
      offscreenDocumentExists = true;
      console.log('✅ Offscreen document created successfully');
    } catch (error) {
      if (error.message.includes('Only a single offscreen')) {
        // 이미 존재하는 경우
        offscreenDocumentExists = true;
        console.log('ℹ️ Offscreen document already exists');
      } else {
        console.error('❌ Failed to create offscreen document:', error);
        throw error;
      }
    }
  }
}

// Offscreen document 닫기
async function closeOffscreenDocument() {
  try {
    if (offscreenDocumentExists) {
      await chrome.offscreen.closeDocument();
      offscreenDocumentExists = false;
      console.log('🗑️ Offscreen document closed');
    }
  } catch (error) {
    console.warn('⚠️ Failed to close offscreen document:', error);
  }
}

// 재시도 가능한 주식 데이터 가져오기 함수
async function fetchStockData(stockCode, retryCount = 0) {
  const maxRetries = 2; // 최대 2번 재시도 (총 3번 시도)

  try {
    console.log(`주식 데이터 요청: ${stockCode} (시도 ${retryCount + 1}/${maxRetries + 1})`);

    const result = await fetchStockDataInternal(stockCode);

    // 성공적으로 데이터를 가져왔고 가격이 유효한 경우
    if (result && result.price && result.price !== '0') {
      console.log(`✅ 데이터 수집 성공: ${stockCode}`);
      return result;
    }

    // 데이터가 유효하지 않은 경우 재시도
    if (retryCount < maxRetries) {
      console.log(`⚠️ 데이터가 유효하지 않음. 재시도 중... (${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기
      return await fetchStockData(stockCode, retryCount + 1);
    }

    throw new Error('최대 재시도 횟수 초과 - 유효한 데이터를 가져올 수 없음');

  } catch (error) {
    console.error(`주식 데이터 가져오기 실패 (${stockCode}, 시도 ${retryCount + 1}):`, error);

    // 재시도 가능한 에러인지 확인
    const isRetryableError = error.message.includes('시간 초과') ||
                            error.message.includes('로드 실패') ||
                            error.message.includes('접근 거부') ||
                            error.message.includes('Offscreen');

    if (retryCount < maxRetries && isRetryableError) {
      console.log(`🔄 재시도 가능한 에러. 재시도 중... (${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기
      return await fetchStockData(stockCode, retryCount + 1);
    }

    // 최종 실패
    return {
      code: stockCode,
      name: `주식 ${stockCode}`,
      price: '0',
      change: '0',
      changeRate: '0',
      volume: '0',
      lastUpdated: new Date().toLocaleTimeString('ko-KR'),
      timestamp: Date.now(),
      error: `${error.message} (${retryCount + 1}/${maxRetries + 1} 시도 후 실패)`
    };
  }
}

// 실제 데이터 가져오기 내부 함수 (Offscreen 사용)
async function fetchStockDataInternal(stockCode) {
  try {
    console.log(`🚀 Fetching stock data using offscreen for: ${stockCode}`);
    
    // Offscreen document 확인/생성
    await ensureOffscreenDocument();
    
    // Offscreen document에 크롤링 요청
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Offscreen 크롤링 시간 초과 (45초)'));
      }, 45000);
      
      chrome.runtime.sendMessage({
        action: 'fetchStock',
        stockCode: stockCode
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          console.error('❌ Runtime error:', chrome.runtime.lastError);
          reject(new Error(`통신 오류: ${chrome.runtime.lastError.message}`));
          return;
        }
        
        if (response && response.success) {
          console.log('✅ Offscreen crawling successful:', response.data);
          resolve(response.data);
        } else {
          console.error('❌ Offscreen crawling failed:', response?.error || 'Unknown error');
          reject(new Error(response?.error || 'Offscreen 크롤링 실패'));
        }
      });
    });
    
  } catch (error) {
    console.error(`❌ Offscreen stock data fetch failed for ${stockCode}:`, error);
    throw error;
  }
}

// 모든 등록된 주식의 데이터를 업데이트
async function updateAllStocks() {
  try {
    console.log('=== 전체 주식 데이터 업데이트 시작 ===');
    
    const data = await chrome.storage.local.get(['stocks']);
    const stocks = data.stocks || [];
    
    console.log(`업데이트할 주식 수: ${stocks.length}개`);
    
    // 활성화된 주식만 필터링
    const enabledStocks = stocks.filter(stock => stock.enabled !== false);
    console.log(`활성화된 주식: ${enabledStocks.length}개`);
    
    if (enabledStocks.length === 0) {
      console.log('⚠️ 활성화된 주식이 없습니다.');
      return;
    }
    
    // 각 주식 데이터 순차적으로 가져오기 (서버 부하 방지)
    for (const stock of enabledStocks) {
      try {
        console.log(`📈 주식 데이터 가져오기: ${stock.name} (${stock.code})`);
        const data = await fetchStockData(stock.code);
        
        if (data) {
          // 업데이트 시간 추가
          stockData[stock.code] = {
            ...data,
            lastUpdated: new Date().toISOString(),
            updateTime: new Date().toLocaleTimeString('ko-KR')
          };
          console.log(`✅ ${stock.name} 데이터 업데이트 완료 - ${stockData[stock.code].updateTime}`);
        }
        
        // 요청 간 간격 (1초)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ ${stock.name} 데이터 가져오기 실패:`, error);
      }
    }
    
    console.log('=== 전체 주식 데이터 업데이트 완료 ===');
    console.log('현재 주식 데이터:', Object.keys(stockData));
    
    // 🔍 유효한 활성화된 주식 데이터가 있는 경우에만 업데이트 알림 전송
    const validStockData = {};
    let hasValidData = false;
    
    // localStorage에서 현재 설정 확인
    const storageData = await chrome.storage.local.get(['stocks']);
    const currentStocks = storageData.stocks || [];
    const activeStockCodes = currentStocks
      .filter(stock => stock.enabled)
      .map(stock => stock.code);
    
    console.log('활성화된 종목 코드:', activeStockCodes);
    
    // 활성화된 종목의 데이터만 추출 (설정 정보와 합쳐서)
    currentStocks.forEach(stock => {
      if (stock.enabled && stockData[stock.code]) {
        // 크롤링 데이터와 설정 정보 합치기
        validStockData[stock.code] = {
          ...stockData[stock.code], // 크롤링한 가격 데이터
          name: stock.name,          // 종목명
          order: stock.order || 0,   // 순서
          enabled: stock.enabled     // 활성화 상태
        };
        hasValidData = true;
      }
    });
    
    console.log('유효한 데이터:', Object.keys(validStockData));
    console.log('유효한 데이터 존재 여부:', hasValidData);
    console.log('🎯 전송할 데이터 순서 확인:', Object.values(validStockData).map(s => `${s.order || 0}: ${s.name}(${s.code})`));
    
    // 유효한 데이터가 있을 때만 업데이트 알림 전송
    if (hasValidData) {
      console.log('✅ 유효한 데이터로 업데이트 알림 전송');
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateDisplay',
            data: validStockData
          }).catch(() => {
            // 메시지 전송 실패는 무시 (content script가 없는 탭들)
          });
        });
      });
    } else {
      console.log('⚠️ 유효한 데이터가 없어 업데이트 알림 전송 생략');
    }
    
  } catch (error) {
    console.error('❌ 주식 데이터 업데이트 중 오류 발생:', error);
  }
}

// 주기적 업데이트 시작
function startPeriodicUpdate() {
  chrome.storage.local.get(['updateInterval'], (data) => {
    const minutes = data.updateInterval || 2;
    
    console.log(`⏰ 주기적 업데이트 시작: ${minutes}분마다`);
    
    // 기존 알람 정리
    chrome.alarms.clear(ALARM_NAME);
    
    // 즉시 한 번 실행
    updateAllStocks();
    
    // 주기적 실행을 위한 알람 생성
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: minutes,
      periodInMinutes: minutes
    });
    
    console.log(`✅ 알람 설정 완료: ${minutes}분마다 업데이트`);
  });
}

// 주기적 업데이트 중지
function stopPeriodicUpdate() {
  chrome.alarms.clear(ALARM_NAME);
  console.log('⏹️ 주기적 업데이트가 중지되었습니다.');
}

// 알람 이벤트 리스너
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('🔔 알람 트리거: 주식 데이터 업데이트 시작');
    updateAllStocks();
  }
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📩 Background received message:', message);
  
  switch (message.action) {
    case 'startUpdate':
      updateAllStocks().then(() => sendResponse({ success: true }));
      break;
      
    case 'stopUpdate':
      stopPeriodicUpdate();
      sendResponse({ success: true });
      break;
      
    case 'getStockData':
      sendResponse({ data: stockData });
      break;
      
    case 'updateSettings':
      if (message.settings) {
        console.log('🔄 설정 업데이트 수신:', message.settings);
        
        // forceRefresh 플래그가 있으면 즉시 새로운 데이터로 업데이트
        if (message.forceRefresh) {
          console.log('🚀 Force refresh 요청 - 즉시 새로운 데이터로 업데이트...');
          
          // 기존 알람 취소 후 새로운 설정으로 재시작
          chrome.alarms.clear('stockUpdate');
          
          // 즉시 업데이트 실행
          updateAllStocks()
            .then(() => {
              console.log('✅ Force refresh 완료');
              startPeriodicUpdate(); // 주기적 업데이트 재시작
            })
            .catch((error) => {
              console.error('❌ Force refresh 실패:', error);
              startPeriodicUpdate(); // 실패해도 주기적 업데이트는 재시작
            });
        } else {
          startPeriodicUpdate(); // 일반적인 설정 변경 시 업데이트 재시작
        }
      }
      sendResponse({ success: true });
      break;
      
    case 'openTab':
      // 새 탭에서 URL 열기
      if (message.url) {
        chrome.tabs.create({ url: message.url, active: true })
          .then(() => {
            console.log('✅ 새 탭 열기 성공:', message.url);
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error('❌ 새 탭 열기 실패:', error);
            sendResponse({ success: false, error: error.message });
          });
      } else {
        sendResponse({ success: false, error: 'URL이 제공되지 않았습니다' });
      }
      break;
  }
  
  return true; // 비동기 응답을 위해
});

// Service Worker 생명주기 이벤트
chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Extension startup - initializing...');
  startPeriodicUpdate();
});

// 탭 변경 감지 (필요시 업데이트)
chrome.tabs.onActivated.addListener(async () => {
  // 활성 탭에 현재 데이터 전송 (유효한 데이터가 있을 때만)
  try {
    // localStorage에서 활성화된 종목 확인
    const storageData = await chrome.storage.local.get(['stocks']);
    const currentStocks = storageData.stocks || [];
    const activeStockCodes = currentStocks
      .filter(stock => stock.enabled)
      .map(stock => stock.code);
    
    // 활성화된 종목의 유효한 데이터만 추출
    const validStockData = {};
    let hasValidData = false;
    
    // 활성화된 종목의 데이터만 추출 (설정 정보와 합쳐서)
    currentStocks.forEach(stock => {
      if (stock.enabled && stockData[stock.code]) {
        // 크롤링 데이터와 설정 정보 합치기
        validStockData[stock.code] = {
          ...stockData[stock.code], // 크롤링한 가격 데이터
          name: stock.name,          // 종목명
          order: stock.order || 0,   // 순서
          enabled: stock.enabled     // 활성화 상태
        };
        hasValidData = true;
      }
    });
    
    if (hasValidData) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateDisplay',
            data: validStockData
          }).catch(() => {
            // 메시지 전송 실패는 무시
          });
        }
      });
    }
  } catch (error) {
    console.error('❌ 탭 활성화 시 데이터 전송 오류:', error);
  }
});

// 익스텐션 시작 시 초기화
console.log('=== 주가 모니터 익스텐션 시작 (Offscreen 모드) ===');

// 초기 설정 로드 및 상태 출력
chrome.storage.local.get(['stocks', 'updateInterval'], (data) => {
  console.log('📊 현재 설정:');
  console.log(`- 업데이트 주기: ${data.updateInterval || 2}분`);
  console.log(`- 등록된 주식 수: ${(data.stocks || []).length}개`);
  
  if (data.stocks && data.stocks.length > 0) {
    console.log('📈 등록된 주식:');
    data.stocks.forEach(stock => {
      console.log(`- ${stock.name} (${stock.code}) ${stock.enabled ? '✓' : '✗'}`);
    });
  }
});

// 주기적 업데이트 시작
startPeriodicUpdate();
