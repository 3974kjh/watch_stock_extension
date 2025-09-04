// Content script - 웹페이지에 주가 정보를 표시하고 데이터 크롤링

let stockDisplayContainer = null;
let isDisplayVisible = true;

// 슬라이드 관련 변수들
let currentStockIndex = 0;
let stockDataArray = [];
let autoSlideInterval = null;
let isSliding = false;

// 로딩 상태 관리 변수들
let isLoadingData = false;
let loadingStartTime = null;

// 주가 표시 컨테이너 생성
function createStockDisplay() {
  if (stockDisplayContainer) return;

  stockDisplayContainer = document.createElement('div');
  stockDisplayContainer.id = 'stock-monitor-display';
  stockDisplayContainer.className = 'stock-monitor-container';
  
  // 기본 스타일 적용
  stockDisplayContainer.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 999999;
    background: linear-gradient(135deg, #1a237e 0%, #4a148c 100%);
    border-radius: 8px;
    padding: 5px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: white;
    width: 220px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.3s ease;
    cursor: move;
    overflow: hidden;
  `;

  document.body.appendChild(stockDisplayContainer);
  makeDraggable(stockDisplayContainer);
  
  // 저장된 위치 설정 적용
  chrome.storage.local.get(['position']).then(data => {
    if (data.position) {
      applyPosition(data.position);
    }
  });
}

// 드래그 기능 추가 (개선된 버전)
function makeDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  let isDragging = false;
  
  // 헤더 영역만 드래그 가능하도록 설정
  const header = element.querySelector('.stock-header');
  if (!header) return;
  
  header.style.cursor = 'move';
  header.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    e.stopPropagation();
    
    // 버튼 클릭이 아닌 경우만 드래그 시작
    if (e.target.classList.contains('toggle-btn') || 
        e.target.classList.contains('refresh-btn')) {
      return;
    }
    
    isDragging = true;
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
    
    // 드래그 시작 시 스타일 변경
    element.style.transition = 'none';
    element.style.opacity = '0.8';
  }
  
  function elementDrag(e) {
    if (!isDragging) return;
    
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    const newTop = element.offsetTop - pos2;
    const newLeft = element.offsetLeft - pos1;
    
    // 화면 경계 체크
    const maxTop = window.innerHeight - element.offsetHeight;
    const maxLeft = window.innerWidth - element.offsetWidth;
    
    element.style.top = Math.max(0, Math.min(newTop, maxTop)) + "px";
    element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + "px";
    
    // 기본 위치 스타일 제거
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }
  
  function closeDragElement() {
    isDragging = false;
    document.onmouseup = null;
    document.onmousemove = null;
    
    // 드래그 종료 시 스타일 복원
    element.style.transition = 'all 0.3s ease';
    element.style.opacity = '1';
    
    // 위치 저장
    const rect = element.getBoundingClientRect();
    chrome.storage.local.set({
      position: 'custom',
      customPosition: {
        top: rect.top,
        left: rect.left
      }
    }).catch(console.error);
  }
}

// 위치 설정 적용
function applyPosition(position) {
  if (!stockDisplayContainer) return;

  const style = stockDisplayContainer.style;
  
  // 기본 위치 초기화
  style.top = 'auto';
  style.bottom = 'auto';
  style.left = 'auto';
  style.right = 'auto';

  switch (position) {
    case 'top-left':
      style.top = '20px';
      style.left = '20px';
      break;
    case 'top-right':
      style.top = '20px';
      style.right = '20px';
      break;
    case 'bottom-left':
      style.bottom = '20px';
      style.left = '20px';
      break;
    case 'bottom-right':
      style.bottom = '20px';
      style.right = '20px';
      break;
    case 'custom':
      chrome.storage.local.get(['customPosition']).then(data => {
        if (data.customPosition) {
          style.top = data.customPosition.top + 'px';
          style.left = data.customPosition.left + 'px';
        }
      });
      break;
  }
}

// 숫자 포맷팅 함수
function formatNumber(num) {
  if (!num || num === '0') return '0';
  return parseInt(num).toLocaleString('ko-KR');
}

// 변화율에 따른 색상 반환 (한국식: 상승=빨강, 하락=파랑)
function getChangeColor(change) {
  if (!change || change === '0') return '#9E9E9E';
  return parseInt(change) >= 0 ? '#F44336' : '#2196F3';
}

// 로딩 상태 설정
function setLoadingState(loading) {
  const previousState = isLoadingData;
  isLoadingData = loading;
  
  console.log(`🔄 로딩 상태 변경: ${previousState} → ${loading}`);
  
  if (loading) {
    loadingStartTime = Date.now();
    console.log('🔄 데이터 로딩 시작');
  } else {
    if (loadingStartTime) {
      const duration = Date.now() - loadingStartTime;
      console.log(`✅ 데이터 로딩 완료 (${duration}ms)`);
    }
    loadingStartTime = null;
  }
  
  // UI 즉시 업데이트
  updateLoadingUI();
}

// 로딩 UI 업데이트
function updateLoadingUI() {
  if (!stockDisplayContainer) return;
  
  const stockCard = stockDisplayContainer.querySelector('.stock-card');
  if (stockCard) {
    if (isLoadingData) {
      stockCard.classList.add('loading');
    } else {
      stockCard.classList.remove('loading');
    }
  }
  
  // 로딩 중이고 데이터가 없으면 전체 UI 업데이트
  if (isLoadingData && stockDataArray.length === 0) {
    showLoadingCard();
  }
}

// 로딩 카드 표시 (간소화 - 헤더 제거)
function showLoadingCard() {
  if (!stockDisplayContainer) return;
  
  console.log('🔄 로딩 카드 표시 중...');
  
  const html = `
    <div class="stock-content" style="position: relative; height: auto;">
      <div class="loading-card-simple">
        <div class="loading-icon">📊</div>
        <div class="loading-text">데이터 로딩 중...</div>
      </div>
    </div>
  `;
  
  stockDisplayContainer.innerHTML = html;
  console.log('✅ 로딩 카드 DOM 적용 완료');
}

// 주식 데이터 표시 업데이트 (슬라이드 방식)
async function updateStockDisplay(stockData) {
  console.log('🎬 updateStockDisplay 함수 호출됨', stockData);
  console.log('현재 isLoadingData 상태:', isLoadingData);
  
  if (!stockDisplayContainer) {
    createStockDisplay();
  }

  // 📋 데이터 유효성 검사 및 정리
  const validStockData = stockData || {};
  const stockArray = Object.values(validStockData);
  
  // 유효한 데이터만 필터링 (빈 데이터나 오류 데이터 제거)
  const filteredStockArray = stockArray.filter(stock => 
    stock && 
    stock.code && 
    stock.price && 
    stock.price !== '0' &&
    stock.name &&
    stock.name.trim() !== ''
  );
  
  stockDataArray = filteredStockArray;
  const hasData = stockDataArray.length > 0;
  const hasMultipleStocks = stockDataArray.length > 1;
  
  console.log('📋 데이터 검증 결과:');
  console.log('  원본 데이터 개수:', stockArray.length);
  console.log('  유효한 데이터 개수:', filteredStockArray.length);
  console.log('  최종 stockDataArray:', stockDataArray.map(s => `${s.name}(${s.code})`));
  console.log('  hasData:', hasData);

  // 실제 데이터가 있으면 로딩 상태 종료
  if (hasData && isLoadingData) {
    console.log('✅ 데이터 로딩 완료 - 로딩 상태 종료');
    setLoadingState(false);
  }
  
  // 📊 데이터 상태에 따른 처리
  if (!hasData) {
    console.log('📭 유효한 데이터가 없음');
    
    if (isLoadingData) {
      console.log('⏳ 로딩 중이므로 로딩 카드 계속 표시');
      showLoadingCard();
    } else {
      console.log('🔍 로딩 완료했지만 데이터가 없음 - 카드 숨기기');
      if (stockDisplayContainer) {
        stockDisplayContainer.style.display = 'none';
      }
    }
    return;
  }
  
  // 로딩 완료 후 실제 카드 표시
  if (!isLoadingData && hasData) {
    console.log('🎯 로딩 완료 - 실제 주가 카드 표시');
  }
  
  // 현재 인덱스가 범위를 벗어나면 조정
  if (currentStockIndex >= stockDataArray.length) {
    currentStockIndex = 0;
  }
  
  console.log('📊 실제 주가 카드 생성 시작');
  
  let html = `
    <div class="stock-header">
      <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">📈 실시간 주가</h3>
      <div style="position: absolute; top: 6px; right: 12px; display: flex; gap: 6px; align-items: center;">
        <div class="toggle-btn" style="cursor: pointer; font-size: 16px; padding: 2px;">−</div>
      </div>
    </div>
    <div class="stock-content" style="position: relative; height: auto;">
  `;
  
  // 데이터가 없는 경우
  if (!hasData) {
    console.log('📭 데이터 없음 - 빈 상태 표시');
    // 설정 안내 표시
    html += `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">모니터링할 종목이 없습니다</div>
        <div class="empty-state-sub">익스텐션 설정에서<br>주식을 추가해주세요</div>
      </div>
    `;
  } else {
    console.log('💰 주가 데이터 있음 - 카드 생성 시작');
    // 현재 표시할 주식 데이터
    const currentStock = stockDataArray[currentStockIndex];
    
    // 변동률 디버깅 로그
    console.log('🐍 Python 로직 기반 주가 데이터:', {
      종목코드: currentStock.code,
      종목명: currentStock.name,
      현재가: currentStock.price + '원',
      전일가: currentStock.yesterdayPrice + '원',
      변동가: currentStock.change + '원',
      변동률: currentStock.changeRate + '%',
      방향: currentStock.trendDirection,
      마지막업데이트: currentStock.lastUpdated
    });
    
    // 🎯 계산된 변동률 사용 (offscreen.js에서 현재가-전일가로 정확히 계산됨)
    let change = 0;
    if (currentStock.change) {
      const changeStr = String(currentStock.change);
      console.log(`🔍 계산된 변동가: "${changeStr}"`);
      
      // 이미 offscreen.js에서 정확히 계산된 값이므로 단순 파싱
      if (changeStr.startsWith('+')) {
        change = parseFloat(changeStr.substring(1));
        console.log('📈 상승 변동가 확인');
      } else if (changeStr.startsWith('-')) {
        change = parseFloat(changeStr.substring(1)) * -1;
        console.log('📉 하락 변동가 확인');
      } else {
        change = parseFloat(changeStr.replace(/[^0-9.]/g, ''));
        // trendDirection으로 부호 결정
        if (currentStock.trendDirection === 'down') {
          change = -change;
        }
      }
      
      console.log(`🎯 최종 변동가: ${change}원 (방향: ${currentStock.trendDirection})`);
    }
    
    console.log('🔍 파싱된 변동률:', change, `(방향: ${currentStock.trendDirection || '정보없음'})`);
    
    const isPositive = change >= 0;
    const changeColor = getChangeColor(change.toString());
    const changeSign = isPositive ? '+' : '';
    const priceFormatted = formatNumber(currentStock.price);
    const changeFormatted = formatNumber(Math.abs(change));
    
    // 에러가 있는 경우 표시
    const errorMsg = currentStock.error ? `<div style="font-size: 9px; color: #FF9800; margin-top: 3px;">⚠️ ${currentStock.error}</div>` : '';
    
    const stockCard = document.createElement('div');
    stockCard.className = 'stock-card';
    stockCard.dataset.stockCode = currentStock.code;
    stockCard.style.borderLeft = `3px solid ${changeColor}`;
    
    // 🖱️ 카드 클릭 이벤트 추가 (2개 이상 종목일 때만)
    if (hasMultipleStocks) {
      stockCard.style.cursor = 'pointer';
      
      // 중복 실행 방지를 위한 debounce 플래그
      let isCardClickProcessing = false;
      
      stockCard.addEventListener('click', (e) => {
        // 네이버 버튼 클릭은 제외 (이미 stopPropagation 적용됨)
        if (!e.target.closest('.stock-naver-btn-fixed')) {
          // 중복 클릭 방지
          if (isCardClickProcessing) {
            console.log('⚠️ 카드 클릭 처리 중 - 중복 클릭 무시');
            return;
          }
          
          isCardClickProcessing = true;
          console.log('🖱️ 카드 클릭 - 수동 슬라이드 시작 (직접 DOM)');
          
          manualNextSlide().then(() => {
            // 처리 완료 후 플래그 해제 (1초 후)
            setTimeout(() => {
              isCardClickProcessing = false;
            }, 1000);
          }).catch((error) => {
            console.error('❌ 수동 슬라이드 실행 실패:', error);
            setTimeout(() => {
              isCardClickProcessing = false;
            }, 1000);
          });
        }
      });
      console.log('✅ 카드 클릭 이벤트 리스너 추가됨 (직접 DOM)');
    }
    
    // 카드 헤더 생성
    const cardHeader = document.createElement('div');
    cardHeader.className = 'stock-card-header';
    
    const cardInfo = document.createElement('div');
    cardInfo.className = 'stock-card-info';
    
    const cardInfoInner = document.createElement('div');
    cardInfoInner.className = 'stock-card-info-inner';
    
    const nameSection = document.createElement('div');
    nameSection.className = 'stock-name-section';
    nameSection.innerHTML = `
      <div>${currentStock.name}</div>
      <div>${currentStock.code}</div>
    `;
    
    cardInfoInner.appendChild(nameSection);
    cardInfo.appendChild(cardInfoInner);
    
    const timeSection = document.createElement('div');
    timeSection.className = 'stock-time-section';
    timeSection.innerHTML = `
      <div>업데이트: ${currentStock.updateTime || currentStock.lastUpdated || '정보 없음'}</div>
      ${hasMultipleStocks ? `<div class="stock-time-counter">${currentStockIndex + 1}/${stockDataArray.length}</div>` : ''}
    `;
    
    cardHeader.appendChild(cardInfo);
    cardHeader.appendChild(timeSection);
    
    // 가격 섹션 생성
    const priceSection = document.createElement('div');
    priceSection.className = 'stock-price-section';
    
    const priceInfo = document.createElement('div');
    priceInfo.className = 'stock-price-info';
    
    const priceMain = document.createElement('div');
    priceMain.className = 'stock-price-main';
    priceMain.textContent = `${priceFormatted}원`;
    
    const priceChange = document.createElement('div');
    priceChange.className = 'stock-price-change';
    priceChange.style.color = changeColor;
    priceChange.textContent = `${changeSign}${changeFormatted}원 (${changeSign}${currentStock.changeRate}%)`;
    
    priceInfo.appendChild(priceMain);
    priceInfo.appendChild(priceChange);
    
    // 에러 메시지 추가
    if (currentStock.error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'stock-error-msg';
      errorDiv.innerHTML = `⚠️ ${currentStock.error}`;
      priceInfo.appendChild(errorDiv);
    }
    
    priceSection.appendChild(priceInfo);
    
    // 네이버 증권 페이지로 이동하는 버튼을 카드 오른쪽 하단에 배치
    const naverBtn = document.createElement('button');
    naverBtn.className = 'stock-naver-btn-fixed';
    naverBtn.title = '네이버 증권에서 보기';
    // 네이버 로고 SVG 아이콘
    naverBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="20" height="20" rx="2" fill="#03C75A"/>
        <path d="M6.5 5.5H8.5V10.5L11.5 5.5H13.5V14.5H11.5V9.5L8.5 14.5H6.5V5.5Z" fill="white"/>
      </svg>
    `;
    naverBtn.dataset.stockCode = currentStock.code;
    
    // 인라인 스타일로 강제 적용
    naverBtn.style.position = 'absolute';
    naverBtn.style.bottom = '6px';
    naverBtn.style.right = '6px';
    naverBtn.style.width = '28px';
    naverBtn.style.height = '28px';
    naverBtn.style.border = 'none';
    naverBtn.style.borderRadius = '6px';
    naverBtn.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.8), rgba(46, 125, 50, 0.6))';
    naverBtn.style.color = 'white';
    naverBtn.style.fontSize = '14px';
    naverBtn.style.cursor = 'pointer';
    naverBtn.style.display = 'flex';
    naverBtn.style.alignItems = 'center';
    naverBtn.style.justifyContent = 'center';
    naverBtn.style.zIndex = '99999';
    naverBtn.style.pointerEvents = 'auto';
    naverBtn.style.opacity = '1';
    naverBtn.style.visibility = 'visible';
    naverBtn.style.transition = 'all 0.2s ease';
    
    console.log('🔗 네이버 버튼 생성 중...', currentStock.code);
    console.log('생성된 버튼 요소:', naverBtn);
    console.log('버튼 아이콘:', '네이버 로고 SVG');
    console.log('버튼 스타일 적용 후:', naverBtn.style.cssText);
    
    
    // 클릭 이벤트 핸들러
    const handleClick = (e) => {
      console.log('🎯 네이버 버튼 클릭 이벤트 시작!', currentStock.code);
      e.preventDefault();
      e.stopPropagation();
      
      const stockCode = currentStock.code;
      const naverUrl = `https://finance.naver.com/item/main.naver?code=${stockCode}`;
      console.log('네이버 버튼 클릭:', stockCode, naverUrl);
      
      // 클릭 시각적 피드백
      naverBtn.style.transform = 'scale(0.9)';
      setTimeout(() => {
        naverBtn.style.transform = '';
      }, 150);
      
      // Chrome Extension에서 안전한 방법으로 새 탭 열기
      try {
        // 먼저 window.open 시도
        const newWindow = window.open(naverUrl, '_blank');
        if (!newWindow) {
          // window.open이 차단된 경우 chrome.tabs API 사용
          chrome.runtime.sendMessage({
            action: 'openTab',
            url: naverUrl
          });
        }
      } catch (error) {
        console.error('새 창 열기 실패:', error);
        // 대안으로 background script를 통해 열기
        chrome.runtime.sendMessage({
          action: 'openTab',
          url: naverUrl
        });
      }
    };
    
    // 이벤트 리스너 추가 (여러 방법으로 시도)
    naverBtn.addEventListener('click', handleClick, true); // capture phase
    naverBtn.addEventListener('click', handleClick, false); // bubble phase
    naverBtn.onclick = handleClick; // fallback

    // stockCard에 position relative 설정 (absolute 버튼의 부모)
    stockCard.style.position = 'relative';
    stockCard.style.overflow = 'visible';
    
    console.log('부모 카드(stockCard) 스타일 설정 완료');
    console.log('stockCard 스타일:', stockCard.style.cssText);
    
    stockCard.appendChild(cardHeader);
    stockCard.appendChild(priceSection);
    stockCard.appendChild(naverBtn);
    
    console.log('✅ 네이버 버튼 DOM에 추가 완료:', naverBtn, '종목:', currentStock.code);
    console.log('버튼 스타일:', naverBtn.style.cssText);
    console.log('버튼 클래스:', naverBtn.className);
    console.log('버튼의 부모 요소:', naverBtn.parentElement);
    console.log('부모 요소의 스타일:', naverBtn.parentElement ? naverBtn.parentElement.style.cssText : 'null');
    
    // DOM에 추가된 후 상태 확인
    setTimeout(() => {
      console.log('🔍 버튼 최종 상태 확인:');
      console.log('- 버튼 위치:', naverBtn.getBoundingClientRect());
      console.log('- 부모 요소:', naverBtn.parentElement);
      console.log('- 버튼 표시 상태:', window.getComputedStyle(naverBtn).display);
      console.log('- 버튼 z-index:', window.getComputedStyle(naverBtn).zIndex);
      console.log('- 버튼 pointer-events:', window.getComputedStyle(naverBtn).pointerEvents);
      
      // 마우스 이벤트 테스트
      naverBtn.addEventListener('mouseenter', () => {
        console.log('🖱️ 마우스 진입 이벤트 작동!');
      });
      naverBtn.addEventListener('mouseleave', () => {
        console.log('🖱️ 마우스 떠남 이벤트 작동!');
      });
    }, 200);
    
    // 전역 디버깅 함수 추가 (개발자 도구에서 사용 가능)
    window.testNaverButton = () => {
      const naverBtns = document.querySelectorAll('.stock-naver-btn-fixed');
      console.log('🔍 전체 네이버 버튼 수:', naverBtns.length);
      naverBtns.forEach((btn, index) => {
        console.log(`버튼 ${index + 1}:`, btn);
        console.log('- 위치:', btn.getBoundingClientRect());
        console.log('- 표시:', window.getComputedStyle(btn).display);
        console.log('- z-index:', window.getComputedStyle(btn).zIndex);
        console.log('- pointer-events:', window.getComputedStyle(btn).pointerEvents);
        
        // 강제 클릭 테스트
        btn.click();
      });
    };
    
    // innerHTML 사용하지 않고 직접 DOM에 카드 추가
    const stockContent = stockDisplayContainer.querySelector('.stock-content');
    if (stockContent) {
      // ✅ 먼저 로딩 카드 요소들 명시적으로 제거
      console.log('🗑️ 기존 로딩 카드 요소 제거 중...');
      const existingLoadingCards = stockContent.querySelectorAll('.loading-card-simple, .loading-card');
      existingLoadingCards.forEach(card => {
        console.log('🗑️ 로딩 카드 요소 제거:', card.className);
        card.remove();
      });
      
      // 기존 카드 제거
      const existingCards = stockContent.querySelectorAll('.stock-card');
      existingCards.forEach(card => card.remove());
      
      // 새 카드 직접 추가
      stockContent.appendChild(stockCard);
      console.log('✅ stockCard가 DOM에 직접 추가됨');
      
      // 🎯 네비게이션 버튼들 추가 (2개 이상일 때만 표시)
      if (hasMultipleStocks) {
        console.log('🎯 다중 종목 감지 - 네비게이션 버튼 추가');
        
        // 기존 네비게이션 제거
        const existingNavigation = stockContent.querySelectorAll('.stock-navigation');
        existingNavigation.forEach(nav => nav.remove());
        
        const navigation = document.createElement('div');
        navigation.className = 'stock-navigation';
        
        const prevBtn = document.createElement('div');
        prevBtn.className = 'nav-btn prev-btn';
        prevBtn.textContent = '‹';
        
        const indicators = document.createElement('div');
        indicators.className = 'stock-indicators';
        
        stockDataArray.forEach((_, index) => {
          const indicator = document.createElement('div');
          indicator.className = `indicator ${index === currentStockIndex ? 'active' : 'inactive'}`;
          indicator.dataset.index = index;
          indicators.appendChild(indicator);
        });
        
        const nextBtn = document.createElement('div');
        nextBtn.className = 'nav-btn next-btn';
        nextBtn.textContent = '›';
        
        navigation.appendChild(prevBtn);
        navigation.appendChild(indicators);
        navigation.appendChild(nextBtn);
        
        stockContent.appendChild(navigation);
        console.log('✅ 네비게이션 버튼들이 DOM에 직접 추가됨');
      }
      
      // 로딩 카드 요소가 남아있는지 확인
      const remainingLoadingCards = stockContent.querySelectorAll('.loading-card-simple, .loading-card');
      if (remainingLoadingCards.length > 0) {
        console.warn('⚠️ 로딩 카드 요소가 여전히 남아있음:', remainingLoadingCards.length);
      } else {
        console.log('✅ 로딩 카드 요소 완전 제거 확인됨');
      }
      
      // 버튼이 실제로 DOM에 있는지 확인
      setTimeout(() => {
        console.log('🔍 DOM 구조 확인:');
        console.log('stockDisplayContainer:', stockDisplayContainer);
        console.log('stockContent:', stockContent);
        console.log('stockCard 자식들:', stockCard.children);
        
        const addedNaverBtn = stockContent.querySelector('.stock-naver-btn-fixed');
        
        console.log('🔍 DOM에서 찾은 네이버 버튼:', addedNaverBtn);
        
        if (addedNaverBtn) {
          console.log('- 찾은 버튼 위치:', addedNaverBtn.getBoundingClientRect());
          console.log('- 찾은 버튼 스타일:', window.getComputedStyle(addedNaverBtn));
        } else {
          console.log('❌ 네이버 버튼을 DOM에서 찾을 수 없음');
        }
        
        // 모든 버튼 검색
        const allButtons = stockContent.querySelectorAll('button');
        console.log('🔍 stockContent 내 모든 버튼:', allButtons.length, allButtons);
      }, 300);
      
      // 🎬 직접 DOM 조작 후 슬라이드 관리 로직 실행 (DOM 안정화 후)
      console.log('🎬 직접 DOM 조작 완료 - 자동 슬라이드 관리 실행');
      
      // DOM이 완전히 안정화된 후 슬라이드 관리 로직 실행
      setTimeout(async () => {
        console.log('🎬 DOM 안정화 후 슬라이드 관리 로직 실행');
        await executeSlideManagementLogic();
      }, 50);
      
      return; // innerHTML 방식 건너뛰기
    }
    
    // fallback: 기존 innerHTML 방식
    const stockContainer = document.createElement('div');
    stockContainer.appendChild(stockCard);
    html = stockContainer.innerHTML;
    
    // 네비게이션 버튼들 (2개 이상일 때만 표시)
    if (hasMultipleStocks) {
      const navigation = document.createElement('div');
      navigation.className = 'stock-navigation';
      
      const prevBtn = document.createElement('div');
      prevBtn.className = 'nav-btn prev-btn';
      prevBtn.textContent = '‹';
      
      const indicators = document.createElement('div');
      indicators.className = 'stock-indicators';
      
      stockDataArray.forEach((_, index) => {
        const indicator = document.createElement('div');
        indicator.className = `indicator ${index === currentStockIndex ? 'active' : 'inactive'}`;
        indicator.dataset.index = index;
        indicators.appendChild(indicator);
      });
      
      const nextBtn = document.createElement('div');
      nextBtn.className = 'nav-btn next-btn';
      nextBtn.textContent = '›';
      
      navigation.appendChild(prevBtn);
      navigation.appendChild(indicators);
      navigation.appendChild(nextBtn);
      
      stockContainer.appendChild(navigation);
      html = stockContainer.innerHTML;
    }
  }

  html += '</div>';
  
  // 특히 로딩 카드 요소들 명시적으로 제거
  const existingLoadingCards = stockDisplayContainer.querySelectorAll('.loading-card-simple, .loading-card');
  existingLoadingCards.forEach(card => {
    card.remove();
  });
  
  // 전체 컨텐츠 제거
  stockDisplayContainer.innerHTML = '';
  
  // 새로운 HTML 적용
  stockDisplayContainer.innerHTML = html;
  
  // 🎬 innerHTML 방식에서도 슬라이드 관리 로직 실행
  await executeSlideManagementLogic();
}

// 표시/숨김 토글 기능 (슬라이드 방식 대응)
function toggleDisplay(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  if (!stockDisplayContainer) return;
  
  const stockContent = stockDisplayContainer.querySelector('.stock-content');
  const toggleBtn = stockDisplayContainer.querySelector('.toggle-btn');
  
  if (!stockContent || !toggleBtn) return;
  
  if (isDisplayVisible) {
    stockContent.style.display = 'none';
    toggleBtn.textContent = '+';
    stockDisplayContainer.style.width = '160px';
    stockDisplayContainer.style.height = 'auto';
    
    // 🎬 숨김 상태에서도 자동 슬라이드는 유지 (2개 이상 종목 시)
  } else {
    stockContent.style.display = 'block';
    toggleBtn.textContent = '−';
    stockDisplayContainer.style.width = '220px';
    stockDisplayContainer.style.height = 'auto';
    
    
    // 🚀 자동 슬라이드 무조건 재시작 (2개 이상 종목이 있을 때)
    if (stockDataArray.length > 1) {
      manageAutoSlide(true).catch(console.error);
    }
  }
  
  isDisplayVisible = !isDisplayVisible;
  
  // 토글 상태 저장
  chrome.storage.local.set({
    displayVisible: isDisplayVisible
  }).catch(console.error);
}

// 🎬 자동 슬라이드 상태 관리 변수
let isAutoSlideInitializing = false;
let currentSlideIntervalMs = 0;

// 🔄 모든 자동 슬라이드 타이머 강제 정리
function clearAllSlideIntervals() {
  console.log('🗑️ 모든 자동 슬라이드 타이머 강제 정리');
  
  if (autoSlideInterval) {
    console.log('  - 기존 autoSlideInterval 정리:', autoSlideInterval);
    clearInterval(autoSlideInterval);
    autoSlideInterval = null;
  }
  
  // 전역 interval 변수들이 더 있을 수 있으므로 추가 정리
  // (혹시 다른 곳에서 생성된 interval들도 정리)
  for (let i = 1; i < 10000; i++) {
    clearInterval(i);
  }
  
  console.log('✅ 모든 타이머 정리 완료');
}

// 자동 슬라이드 관리 - 2개 이상 종목 시 무조건 실행 (중복 생성 방지)
async function manageAutoSlide(hasMultipleStocks) {
  console.log('🎬 자동 슬라이드 관리 요청:', {
    hasMultipleStocks,
    stockDataArrayLength: stockDataArray.length,
    isInitializing: isAutoSlideInitializing,
    currentInterval: autoSlideInterval ? 'EXISTS' : 'NULL'
  });
  
  // 🔒 중복 초기화 방지
  if (isAutoSlideInitializing) {
    console.warn('⚠️ 자동 슬라이드 이미 초기화 중 - 요청 무시');
    return;
  }
  
  isAutoSlideInitializing = true;
  
  try {
    // 🗑️ 모든 기존 타이머 강제 정리
    clearAllSlideIntervals();
    
    // 조건 확인
    if (!hasMultipleStocks || stockDataArray.length < 2) {
      console.log('❌ 자동 슬라이드 조건 미충족 - 타이머 생성 안함');
      return;
    }

    // 📱 localStorage에서 슬라이드 간격 설정 읽기
    const storageData = await chrome.storage.local.get(['slideInterval']);
    const slideIntervalSeconds = storageData.slideInterval || 5; // 기본값 5초
    const slideIntervalMs = slideIntervalSeconds * 1000;
    
    // 🔍 간격 변경 확인
    if (currentSlideIntervalMs !== slideIntervalMs) {
      console.log('🔄 슬라이드 간격 변경 감지:', {
        이전간격: currentSlideIntervalMs + 'ms',
        새간격: slideIntervalMs + 'ms'
      });
      currentSlideIntervalMs = slideIntervalMs;
    }
    
    console.log('🎯 자동 슬라이드 타이머 생성:', slideIntervalSeconds + '초 간격');
    
    // 🚀 새로운 타이머 생성
    autoSlideInterval = setInterval(() => {
      if (isDisplayVisible && !isSliding) {
        console.log('⏭️ 자동 슬라이드 실행 (' + slideIntervalSeconds + '초 간격)');
        nextSlide();
      }
    }, slideIntervalMs);
    
    console.log('✅ 자동 슬라이드 타이머 생성 완료:', {
      intervalId: autoSlideInterval,
      간격: slideIntervalSeconds + '초',
      밀리초: slideIntervalMs + 'ms'
    });
    
  } catch (error) {
    console.error('❌ 자동 슬라이드 설정 실패, 기본값(5초) 사용:', error);
    
    // 에러 시에도 기존 타이머 정리 후 기본값으로 생성
    clearAllSlideIntervals();
    
    autoSlideInterval = setInterval(() => {
      if (isDisplayVisible && !isSliding) {
        console.log('⏭️ 자동 슬라이드 실행 (기본 5초 간격)');
        nextSlide();
      }
    }, 5000);
    
    currentSlideIntervalMs = 5000;
    console.log('✅ 기본 자동 슬라이드 타이머 생성 완료 (5초)');
    
  } finally {
    // 🔓 초기화 플래그 해제
    isAutoSlideInitializing = false;
  }
}

// 다음 슬라이드
function nextSlide() {
  if (stockDataArray.length <= 1) return;
  
  isSliding = true;
  currentStockIndex = (currentStockIndex + 1) % stockDataArray.length;
  
  // 슬라이드 애니메이션 효과
  animateSlide('next');
}

// 🖱️ 수동 슬라이드 (클릭 시 타이머 재시작)
async function manualNextSlide() {
  console.log('🖱️ 수동 카드 전환 요청');
  
  if (stockDataArray.length <= 1) {
    console.log('📭 카드 1개 이하 - 수동 전환 불가');
    return;
  }
  
  // 이미 슬라이딩 중이면 중복 실행 방지
  if (isSliding) {
    console.log('⚠️ 이미 슬라이딩 중 - 수동 전환 무시');
    return;
  }
  
  console.log('📊 수동 전환 전 상태:', {
    현재인덱스: currentStockIndex,
    전체개수: stockDataArray.length,
    현재종목: stockDataArray[currentStockIndex]?.name
  });
  
  // 다음 슬라이드로 전환
  nextSlide();
  
  console.log('📊 수동 전환 후 상태:', {
    새인덱스: currentStockIndex,
    새종목: stockDataArray[currentStockIndex]?.name
  });
  
  // 🔄 자동 슬라이드 타이머 재시작 (슬라이딩 완료 후 지연 실행)
  if (stockDataArray.length >= 2) {
    console.log('🔄 자동 슬라이드 타이머 재시작 예약 (수동 전환 후)');
    // 애니메이션 완료 후 타이머 재시작 (중복 실행 방지)
    setTimeout(async () => {
      if (!isSliding) {
        console.log('🔄 자동 슬라이드 타이머 재시작 실행');
        await manageAutoSlide(true);
      }
    }, 500); // 애니메이션 완료 후 충분한 시간 대기
  }
}

// 이전 슬라이드
function prevSlide() {
  if (stockDataArray.length <= 1) return;
  
  isSliding = true;
  currentStockIndex = currentStockIndex === 0 ? stockDataArray.length - 1 : currentStockIndex - 1;
  
  // 슬라이드 애니메이션 효과
  animateSlide('prev');
}

// 특정 인덱스로 이동
function goToSlide(index) {
  if (index < 0 || index >= stockDataArray.length || index === currentStockIndex) return;
  
  isSliding = true;
  currentStockIndex = index;
  
  animateSlide('direct');
}

// 슬라이드 애니메이션
function animateSlide(direction) {
  const stockCard = stockDisplayContainer?.querySelector('.stock-card');
  if (!stockCard) {
    isSliding = false;
    return;
  }
  
  // 애니메이션 효과
  stockCard.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  stockCard.style.transform = direction === 'next' ? 'translateX(-20px)' : 
                              direction === 'prev' ? 'translateX(20px)' : 'scale(0.95)';
  stockCard.style.opacity = '0.3';
  
  setTimeout(() => {
    // 데이터 업데이트 (애니메이션 없이)
    updateStockCardContent();
    
    // 원래 상태로 복원
    stockCard.style.transform = 'translateX(0) scale(1)';
    stockCard.style.opacity = '1';
    
    setTimeout(() => {
      stockCard.style.transition = '';
      isSliding = false;
    }, 300);
  }, 150);
}

// 카드 내용만 업데이트 (전체 HTML 재생성 없이)
function updateStockCardContent() {
  if (stockDataArray.length === 0 || !stockDisplayContainer) return;
  
  const currentStock = stockDataArray[currentStockIndex];
  
  // 변동률 디버깅 로그 (updateStockCardContent)
  // console.log('🐍 Python 로직 기반 주가 데이터 (updateStockCardContent):', {
  //   종목코드: currentStock.code,
  //   종목명: currentStock.name,
  //   현재가: currentStock.price + '원',
  //   전일가: currentStock.yesterdayPrice + '원',
  //   변동가: currentStock.change + '원',
  //   변동률: currentStock.changeRate + '%',
  //   방향: currentStock.trendDirection
  // });
  
  // 🎯 계산된 변동률 사용 (offscreen.js에서 현재가-전일가로 정확히 계산됨)
  let change = 0;
  if (currentStock.change) {
    const changeStr = String(currentStock.change);
    // console.log(`🔍 계산된 변동가 (updateStockCardContent): "${changeStr}"`);
    
    // 이미 offscreen.js에서 정확히 계산된 값이므로 단순 파싱
    if (changeStr.startsWith('+')) {
      change = parseFloat(changeStr.substring(1));
      // console.log('📈 상승 변동가 확인 (updateStockCardContent)');
    } else if (changeStr.startsWith('-')) {
      change = parseFloat(changeStr.substring(1)) * -1;
      // console.log('📉 하락 변동가 확인 (updateStockCardContent)');
    } else {
      change = parseFloat(changeStr.replace(/[^0-9.]/g, ''));
      // trendDirection으로 부호 결정
      if (currentStock.trendDirection === 'down') {
        change = -change;
      }
    }
    
    // console.log(`🎯 최종 변동가 (updateStockCardContent): ${change}원 (방향: ${currentStock.trendDirection})`);
  }
  
  // console.log('🔍 파싱된 변동률 (updateStockCardContent):', change, `(방향: ${currentStock.trendDirection || '정보없음'})`);
  
  const isPositive = change >= 0;
  const changeColor = getChangeColor(change.toString());
  const changeSign = isPositive ? '+' : '';
  const priceFormatted = formatNumber(currentStock.price);
  const changeFormatted = formatNumber(Math.abs(change));
  
  // 기존 카드 찾기
  const stockCard = stockDisplayContainer.querySelector('.stock-card');
  if (!stockCard) return;
  
  // 카드 스타일 업데이트
  stockCard.style.borderLeft = `3px solid ${changeColor}`;
  stockCard.dataset.stockCode = currentStock.code;
  
  // 기존 내용 제거
  stockCard.innerHTML = '';
  
  // 헤더 섹션
  const header = document.createElement('div');
  header.className = 'stock-card-header';
  
  const info = document.createElement('div');
  info.className = 'stock-card-info';
  
  const infoInner = document.createElement('div');
  infoInner.className = 'stock-card-info-inner';
  
  const nameSection = document.createElement('div');
  nameSection.className = 'stock-name-section';
  nameSection.innerHTML = `
    <div>${currentStock.name}</div>
    <div>${currentStock.code}</div>
  `;
  
  infoInner.appendChild(nameSection);
  info.appendChild(infoInner);
  
  const timeSection = document.createElement('div');
  timeSection.className = 'stock-time-section';
  timeSection.innerHTML = `
    <div>업데이트: ${currentStock.updateTime || currentStock.lastUpdated || '정보 없음'}</div>
    <div class="stock-time-counter">${currentStockIndex + 1}/${stockDataArray.length}</div>
  `;
  
  header.appendChild(info);
  header.appendChild(timeSection);
  
  // 가격 섹션
  const priceSection = document.createElement('div');
  priceSection.className = 'stock-price-section';
  
  const priceInfo = document.createElement('div');
  priceInfo.className = 'stock-price-info';
  
  const priceMain = document.createElement('div');
  priceMain.className = 'stock-price-main';
  priceMain.textContent = `${priceFormatted}원`;
  
  const priceChange = document.createElement('div');
  priceChange.className = 'stock-price-change';
  priceChange.style.color = changeColor;
  priceChange.textContent = `${changeSign}${changeFormatted}원 (${changeSign}${currentStock.changeRate}%)`;
  
  priceInfo.appendChild(priceMain);
  priceInfo.appendChild(priceChange);
  
  // 에러 메시지 추가
  if (currentStock.error) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'stock-error-msg';
    errorDiv.innerHTML = `⚠️ ${currentStock.error}`;
    priceInfo.appendChild(errorDiv);
  }
  
  priceSection.appendChild(priceInfo);
  
  // 네이버 증권 페이지로 이동하는 버튼을 카드 오른쪽 하단에 배치
  const naverBtn = document.createElement('button');
  naverBtn.className = 'stock-naver-btn-fixed';
  naverBtn.title = '네이버 증권에서 보기';
  // 네이버 로고 SVG 아이콘
  naverBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="20" rx="2" fill="#03C75A"/>
      <path d="M6.5 5.5H8.5V10.5L11.5 5.5H13.5V14.5H11.5V9.5L8.5 14.5H6.5V5.5Z" fill="white"/>
    </svg>
  `;
  naverBtn.dataset.stockCode = currentStock.code;
  
  // 인라인 스타일로 강제 적용
  naverBtn.style.position = 'absolute';
  naverBtn.style.bottom = '6px';
  naverBtn.style.right = '6px';
  naverBtn.style.width = '28px';
  naverBtn.style.height = '28px';
  naverBtn.style.border = 'none';
  naverBtn.style.borderRadius = '6px';
  naverBtn.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.8), rgba(46, 125, 50, 0.6))';
  naverBtn.style.color = 'white';
  naverBtn.style.fontSize = '14px';
  naverBtn.style.cursor = 'pointer';
  naverBtn.style.display = 'flex';
  naverBtn.style.alignItems = 'center';
  naverBtn.style.justifyContent = 'center';
  naverBtn.style.zIndex = '99999';
  naverBtn.style.pointerEvents = 'auto';
  naverBtn.style.opacity = '1';
  naverBtn.style.visibility = 'visible';
  naverBtn.style.transition = 'all 0.2s ease';
  
  // 클릭 이벤트 핸들러
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const stockCode = currentStock.code;
    const naverUrl = `https://finance.naver.com/item/main.naver?code=${stockCode}`;
    
    // 클릭 시각적 피드백
    naverBtn.style.transform = 'scale(0.9)';
    setTimeout(() => {
      naverBtn.style.transform = '';
    }, 150);
    
    // Chrome Extension에서 안전한 방법으로 새 탭 열기
    try {
      // 먼저 window.open 시도
      const newWindow = window.open(naverUrl, '_blank');
      if (!newWindow) {
        // window.open이 차단된 경우 chrome.tabs API 사용
        chrome.runtime.sendMessage({
          action: 'openTab',
          url: naverUrl
        });
      }
    } catch (error) {
      // 대안으로 background script를 통해 열기
      chrome.runtime.sendMessage({
        action: 'openTab',
        url: naverUrl
      });
    }
  };
  
  // 이벤트 리스너 추가 (여러 방법으로 시도)
  naverBtn.addEventListener('click', handleClick, true); // capture phase
  naverBtn.addEventListener('click', handleClick, false); // bubble phase
  naverBtn.onclick = handleClick; // fallback

  // stockCard에 position relative 설정 (absolute 버튼의 부모)
  stockCard.style.position = 'relative';
  stockCard.style.overflow = 'visible';
  
  // 카드에 모든 섹션 추가
  stockCard.appendChild(header);
  stockCard.appendChild(priceSection);
  stockCard.appendChild(naverBtn);
  
  // 인디케이터 업데이트
  const indicators = stockDisplayContainer.querySelectorAll('.indicator');
  indicators.forEach((indicator, index) => {
    indicator.className = `indicator ${index === currentStockIndex ? 'active' : 'inactive'}`;
  });
}

// 이벤트 리스너 추가 함수
function attachEventListeners() {
  if (!stockDisplayContainer) return;
  
  // 토글 버튼 이벤트
  const toggleBtn = stockDisplayContainer.querySelector('.toggle-btn');
  if (toggleBtn) {
    toggleBtn.removeEventListener('click', toggleDisplay);
    toggleBtn.addEventListener('click', toggleDisplay);
  }
  
  // 새로고침 버튼 이벤트
  const refreshBtn = stockDisplayContainer.querySelector('.refresh-btn');
  if (refreshBtn) {
    refreshBtn.removeEventListener('click', refreshData);
    
    // 로딩 중이 아닐 때만 클릭 가능
    if (!refreshBtn.classList.contains('loading-disabled')) {
      refreshBtn.addEventListener('click', refreshData);
    }
    
    // 호버 효과 (로딩 중이 아닐 때만)
    refreshBtn.addEventListener('mouseenter', () => {
      if (!refreshBtn.classList.contains('loading-disabled') && !isLoadingData) {
        refreshBtn.style.transform = 'scale(1.1)';
      }
    });
    
    refreshBtn.addEventListener('mouseleave', () => {
      if (!refreshBtn.classList.contains('loading-disabled')) {
        refreshBtn.style.transform = 'scale(1)';
      }
    });
  }
  
  // 이전 버튼 이벤트
  const prevBtn = stockDisplayContainer.querySelector('.prev-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      prevSlide();
    });
    
    prevBtn.addEventListener('mouseenter', () => {
      prevBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    });
    
    prevBtn.addEventListener('mouseleave', () => {
      prevBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
  }
  
  // 다음 버튼 이벤트
  const nextBtn = stockDisplayContainer.querySelector('.next-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      nextSlide();
    });
    
    nextBtn.addEventListener('mouseenter', () => {
      nextBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    });
    
    nextBtn.addEventListener('mouseleave', () => {
      nextBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
  }
  
  // 인디케이터 이벤트
  const indicators = stockDisplayContainer.querySelectorAll('.indicator');
  indicators.forEach((indicator, index) => {
    indicator.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToSlide(index);
    });
    
    indicator.addEventListener('mouseenter', () => {
      if (index !== currentStockIndex) {
        indicator.style.background = 'rgba(255, 255, 255, 0.5)';
      }
    });
    
    indicator.addEventListener('mouseleave', () => {
      if (index !== currentStockIndex) {
        indicator.style.background = 'rgba(255, 255, 255, 0.3)';
      }
    });
  });
}

// 설정 관련 기능들이 제거되었습니다. 이제 네이버 증권 페이지로 이동 버튼을 사용합니다.

// 데이터 새로고침 함수
function refreshData(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  // 이미 로딩 중이면 무시
  if (isLoadingData) {
    return;
  }
  
  // 로딩 상태 시작
  setLoadingState(true);
  
  // 새로고침 버튼 애니메이션
  const refreshBtn = stockDisplayContainer?.querySelector('.refresh-btn');
  if (refreshBtn && !refreshBtn.classList.contains('loading-disabled')) {
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.style.transition = 'transform 0.5s ease';
    setTimeout(() => {
      refreshBtn.style.transform = 'rotate(0deg)';
      refreshBtn.style.transition = '';
    }, 500);
  }
  
  // background script에 즉시 업데이트 요청
  chrome.runtime.sendMessage({action: 'startUpdate'}).catch(console.error);
  
  // 로딩 상태가 너무 오래 지속되면 자동으로 종료 (90초 후 - 재시도 고려)
  setTimeout(() => {
    if (isLoadingData) {
      setLoadingState(false);
      
      // 에러 상태 표시
      if (stockDataArray.length === 0) {
        updateStockDisplay({}).catch(console.error);
      }
    }
  }, 90000);
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'updateDisplay':
      updateStockDisplay(message.data).catch(console.error);
      // 업데이트 애니메이션 효과
      if (stockDisplayContainer) {
        stockDisplayContainer.classList.add('updating');
        setTimeout(() => {
          stockDisplayContainer.classList.remove('updating');
        }, 1000);
      }
      sendResponse({success: true});
      break;

    case 'toggleVisibility':
      if (stockDisplayContainer) {
        // popup.js에서 명시적으로 visible 값을 전달받은 경우 사용
        const shouldBeVisible = message.visible !== undefined ? message.visible : 
          (stockDisplayContainer.style.display === 'none');
        
        stockDisplayContainer.style.display = shouldBeVisible ? 'block' : 'none';
        isDisplayVisible = shouldBeVisible;
        
        // localStorage에 상태 저장
        chrome.storage.local.set({ displayVisible: isDisplayVisible });
        
        // 자동 슬라이드 관리
        if (shouldBeVisible) {
          manageAutoSlide(stockDataArray.length > 1).catch(console.error);
        } else {
          // 숨김 상태로 전환 시 타이머 정리
          clearAllSlideIntervals();
        }
        
        sendResponse({ success: true, visible: shouldBeVisible });
      } else {
        sendResponse({ success: false, visible: false });
      }
      break;

    case 'updatePosition':
      applyPosition(message.position);
      sendResponse({success: true});
      break;
      
    case 'refreshData':
      // background script에 데이터 새로고침 요청
      chrome.runtime.sendMessage({action: 'startUpdate'});
      sendResponse({success: true});
      break;
      
    case 'settingsUpdated':
      // 🔄 popup.js에서 주식 설정이 변경됨 - 즉시 카드 업데이트
      handleSettingsUpdate(message.settings);
      sendResponse({success: true});
      break;
      
    case 'slideIntervalUpdated':
      // 🎬 popup.js에서 슬라이드 간격이 변경됨 - 즉시 자동 슬라이드 재시작
      handleSlideIntervalUpdate(message.slideInterval);
      sendResponse({success: true});
      break;
  }
  return true; // 비동기 응답을 위해
});

// 🎬 슬라이드 간격 변경 처리 함수 - manageAutoSlide 통합 사용
async function handleSlideIntervalUpdate(newInterval) {
  console.log('🎬 슬라이드 간격 업데이트 요청:', newInterval + '초');
  
  try {
    // 🔄 localStorage에 새 간격 저장 (manageAutoSlide에서 읽어갈 수 있도록)
    await chrome.storage.local.set({ slideInterval: newInterval });
    
    // 🔄 통합 관리 함수로 재시작 (중복 방지 및 안전한 처리)
    const hasMultiple = stockDataArray.length >= 2;
    if (hasMultiple) {
      console.log('🔄 manageAutoSlide로 새 간격 적용');
      await manageAutoSlide(true);
    } else {
      console.log('📭 2개 미만 종목 - 슬라이드 간격 변경 불필요');
      // 조건에 맞지 않으면 기존 타이머만 정리
      clearAllSlideIntervals();
    }
    
  } catch (error) {
    console.error('❌ 슬라이드 간격 업데이트 처리 실패:', error);
    
    // 에러 시 강제로 다시 시도
    try {
      clearAllSlideIntervals();
      if (stockDataArray.length >= 2) {
        await manageAutoSlide(true);
      }
    } catch (retryError) {
      console.error('❌ 슬라이드 간격 업데이트 재시도도 실패:', retryError);
    }
  }
}

// 🖱️ 카드 클릭 핸들러 변수 (중복 방지용)
let cardClickHandler = null;
// 🖱️ 중복 클릭 방지 플래그 (innerHTML 방식용)
let isHTMLCardClickProcessing = false;

// 🖱️ 이벤트 리스너 추가 함수 (innerHTML 방식에서 사용)
function attachEventListeners() {
  console.log('🖱️ 이벤트 리스너 추가 시작');
  
  try {
    // 🗑️ 기존 카드 클릭 이벤트 제거 (중복 방지)
    if (cardClickHandler) {
      stockDisplayContainer.removeEventListener('click', cardClickHandler);
      cardClickHandler = null;
    }
    
    // 🖱️ 이벤트 위임 방식으로 카드 클릭 이벤트 추가 (2개 이상 종목일 때만)
    if (stockDataArray.length > 1) {
      cardClickHandler = (e) => {
        const stockCard = e.target.closest('.stock-card');
        if (stockCard && !e.target.closest('.stock-naver-btn-fixed')) {
          // 중복 클릭 방지
          if (isHTMLCardClickProcessing) {
            console.log('⚠️ 카드 클릭 처리 중 - 중복 클릭 무시 (innerHTML 방식)');
            return;
          }
          
          isHTMLCardClickProcessing = true;
          console.log('🖱️ 카드 클릭 - 수동 슬라이드 시작 (innerHTML 방식)');
          
          manualNextSlide().then(() => {
            // 처리 완료 후 플래그 해제 (1초 후)
            setTimeout(() => {
              isHTMLCardClickProcessing = false;
            }, 1000);
          }).catch((error) => {
            console.error('❌ 수동 슬라이드 실행 실패:', error);
            setTimeout(() => {
              isHTMLCardClickProcessing = false;
            }, 1000);
          });
        }
      };
      
      stockDisplayContainer.addEventListener('click', cardClickHandler);
      
      // 카드 스타일 설정
      const stockCards = stockDisplayContainer.querySelectorAll('.stock-card');
      stockCards.forEach(card => {
        card.style.cursor = 'pointer';
      });
      
      console.log('✅ 카드 클릭 이벤트 리스너 추가됨 (이벤트 위임 방식)');
    }
    
    // 네비게이션 버튼 이벤트 추가
    const prevBtn = stockDisplayContainer.querySelector('.prev-btn');
    const nextBtn = stockDisplayContainer.querySelector('.next-btn');
    const indicators = stockDisplayContainer.querySelectorAll('.indicator');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        prevSlide();
        // 수동 전환 시 타이머 재시작
        manageAutoSlide(stockDataArray.length > 1).catch(console.error);
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        nextSlide();
        // 수동 전환 시 타이머 재시작
        manageAutoSlide(stockDataArray.length > 1).catch(console.error);
      });
    }
    
    indicators.forEach((indicator, index) => {
      indicator.addEventListener('click', () => {
        goToSlide(index);
        // 수동 전환 시 타이머 재시작
        manageAutoSlide(stockDataArray.length > 1).catch(console.error);
      });
    });

    // 토글 버튼 이벤트 추가
    const toggleBtn = stockDisplayContainer.querySelector('.toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleDisplay);
    }

    console.log('✅ 모든 이벤트 리스너 추가 완료');
    
  } catch (error) {
    console.error('❌ 이벤트 리스너 추가 실패:', error);
  }
}

// 🎬 슬라이드 관리 로직 실행 (직접 DOM 조작과 innerHTML 방식 모두 지원)
async function executeSlideManagementLogic() {
  try {
    // 이벤트 리스너 추가
    attachEventListeners();
    
    // 🚀 자동 슬라이드 무조건 관리 (2개 이상 종목 시 강제 시작)
    const actualHasMultiple = stockDataArray.length > 1;
    await manageAutoSlide(actualHasMultiple);
    
    // 🔄 안전장치: 타이머가 생성되지 않은 경우만 재시도 (중복 방지)
    if (actualHasMultiple) {  
      setTimeout(async () => {
        if (!autoSlideInterval && stockDataArray.length > 1 && !isAutoSlideInitializing) {
          console.warn('⚠️ 타이머 생성 실패 감지 - 재시도');
          await manageAutoSlide(true);
        }
      }, 500); // 충분한 시간 후 재확인
    }
  } catch (error) {
    console.error('❌ 슬라이드 관리 로직 실행 실패:', error);
  }
}

// 🔄 설정 업데이트 처리 함수 - localStorage 기반 완전 새로고침
async function handleSettingsUpdate(newSettings) {
  try {
    // 1. 🗑️ 모든 상태 완전 초기화
    stockDataArray = [];
    currentStockIndex = 0;
    
    // 자동 슬라이드 정리
    if (autoSlideInterval) {
      clearInterval(autoSlideInterval);
      autoSlideInterval = null;
    }
    
    // 2. 📱 localStorage에서 최신 설정 재로드 (정합성 보장)
    const storageData = await chrome.storage.local.get(['stocks', 'displayVisible']);
    const latestStocks = storageData.stocks || [];
    const isVisible = storageData.displayVisible !== false; // 기본값: true
    
    // 3. 활성화된 종목만 필터링 (localStorage 기준)
    const activeStocks = latestStocks.filter(stock => stock.enabled);
    
    // 4. 표시 상태 업데이트
    isDisplayVisible = isVisible;
    
    // 5. 모든 종목이 비활성화/삭제된 경우 처리
    if (activeStocks.length === 0) {
      
      if (stockDisplayContainer) {
        stockDisplayContainer.style.display = 'none';
      }

      return;
    }
    
    // 6. 🔄 로딩 상태 표시
    setLoadingState(true);
    
    if (isDisplayVisible && stockDisplayContainer) {
      stockDisplayContainer.style.display = 'block';
      showLoadingCard();
    }
    
    // 7. 🚀 Background script에 강제 새로고침 요청
    
    // background script는 자체적으로 localStorage를 읽으므로 단순히 forceRefresh만 요청
    chrome.runtime.sendMessage({
      action: 'startUpdate',
      forceRefresh: true
    }, (response) => {
      if (response && response.success) {
        return;
      }

      // 실패 시 로딩 상태 해제
      setTimeout(() => {
        setLoadingState(false);
        if (stockDisplayContainer && stockDataArray.length === 0) {
          stockDisplayContainer.style.display = 'none';
        }
      }, 2000);
    });
    
  } catch (error) {
    console.error('❌ 설정 업데이트 처리 실패:', error);
    
    // 에러 시 로딩 상태 해제
    setLoadingState(false);
    if (stockDisplayContainer && stockDataArray.length === 0) {
      stockDisplayContainer.style.display = 'none';
    }
  }
}

// 배열을 객체로 변환하는 헬퍼 함수
function convertArrayToObject(stockArray) {
  const stockObject = {};
  stockArray.forEach(stock => {
    stockObject[stock.code] = stock;
  });
  return stockObject;
}

// 초기화 함수
async function initializeStockDisplay() {
  createStockDisplay();
  
  // 저장된 표시 상태 복원
  try {
    const data = await chrome.storage.local.get(['displayVisible', 'stocks']);
    
    // displayVisible 상태 설정 (기본값: true)
    isDisplayVisible = data.displayVisible !== false;
    
    // 컨테이너 표시 상태 적용
    if (stockDisplayContainer) {
      stockDisplayContainer.style.display = isDisplayVisible ? 'block' : 'none';
      
      // 표시 상태가 아니면 자동 슬라이드 중지
      if (!isDisplayVisible && autoSlideInterval) {
        clearInterval(autoSlideInterval);
        autoSlideInterval = null;
      }
    }
    
    // 🎬 초기 자동 슬라이드 설정 (활성화된 종목이 2개 이상일 때)
    if (data.stocks) {
      const activeStocks = data.stocks.filter(s => s.enabled);
      
      if (activeStocks.length > 1) {
        
        // 데이터가 로드되면 자동 슬라이드가 시작되도록 준비
        setTimeout(() => {
          if (stockDataArray.length > 1 && !autoSlideInterval && !isAutoSlideInitializing) {
            manageAutoSlide(true).catch(console.error);
          }
        }, 2000); // 데이터 로딩 후 2초 뒤 재확인
      }
    }
    
    // 모니터링할 종목이 있으면 초기 로딩 상태 시작
    if (data.stocks && data.stocks.length > 0 && data.stocks.some(s => s.enabled)) {
      setLoadingState(true);
      
      // 90초 후 타임아웃 (재시도 고려)
      setTimeout(() => {
        if (isLoadingData) {
          setLoadingState(false);
        }
      }, 90000);
    }
    
  } catch (error) {
    console.error('초기화 실패:', error);
  }
}

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStockDisplay);
} else {
  initializeStockDisplay();
}

// 창 크기 변경 시 위치 조정
window.addEventListener('resize', () => {
  if (stockDisplayContainer) {
    const rect = stockDisplayContainer.getBoundingClientRect();
    const maxTop = window.innerHeight - stockDisplayContainer.offsetHeight;
    const maxLeft = window.innerWidth - stockDisplayContainer.offsetWidth;
    
    if (rect.top > maxTop || rect.left > maxLeft) {
      stockDisplayContainer.style.top = Math.max(0, Math.min(rect.top, maxTop)) + 'px';
      stockDisplayContainer.style.left = Math.max(0, Math.min(rect.left, maxLeft)) + 'px';
    }
  }
});

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
  if (autoSlideInterval) {
    clearInterval(autoSlideInterval);
    autoSlideInterval = null;
  }
});

// 페이지 숨김/표시 시 슬라이드 제어 - 2개 이상 종목 시 무조건 재시작
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // 페이지가 숨겨지면 슬라이드 정지
    if (autoSlideInterval) {
      clearInterval(autoSlideInterval);
      autoSlideInterval = null;
    }
  } else {
    if (stockDataArray.length < 2) {
      return;
    }
    // 🚀 페이지가 다시 표시되면 2개 이상 종목 시 무조건 슬라이드 재시작
    manageAutoSlide(true).catch(console.error);
    
    // 추가 재확인 (혹시 모른 상황 대비)
    setTimeout(() => {
      if (!autoSlideInterval && stockDataArray.length > 1 && isDisplayVisible && !isAutoSlideInitializing) {
        manageAutoSlide(true).catch(console.error);
      }
    }, 1000); // 충분한 시간 후 재확인
  }
});

