// 팝업 UI 제어 스크립트

let currentSettings = {
  stocks: [],
  updateInterval: 2,
  slideInterval: 5, // 자동 슬라이드 간격 (초)
  position: 'top-left',
  showVolume: true,
  showChange: true,
  displayVisible: true,
  slideMode: 'auto' // 'auto' 또는 'manual'
};

// DOM 요소들
const stockCodeInput = document.getElementById('stockCode');
const stockNameInput = document.getElementById('stockName');
const addStockBtn = document.getElementById('addStockBtn');
const stockList = document.getElementById('stockList');
const updateIntervalInput = document.getElementById('updateInterval');
const slideIntervalInput = document.getElementById('slideInterval');
const positionButtons = document.querySelectorAll('.position-btn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const toggleDisplayBtn = document.getElementById('toggleDisplayBtn');
const statusDiv = document.getElementById('status');

// 모드 토글 관련 요소들
const modeToggleBtn = document.getElementById('modeToggleBtn');
const modeIndicator = document.getElementById('modeIndicator');
const modeDescription = document.getElementById('modeDescription');
const slideSettingItem = document.getElementById('slideSettingItem');

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

// 이벤트 리스너 설정
function setupEventListeners() {
  // 주식 추가
  addStockBtn.addEventListener('click', addStock);
  stockCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addStock();
  });
  stockNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addStock();
  });

  // 위치 버튼
  positionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      positionButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSettings.position = btn.dataset.position;
    });
  });

  // 설정 저장
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  // 표시/숨김 토글
  toggleDisplayBtn.addEventListener('click', toggleDisplay);
  
  // 업데이트 주기 변경
  updateIntervalInput.addEventListener('change', () => {
    currentSettings.updateInterval = parseInt(updateIntervalInput.value);
  });
  
  // 자동 슬라이드 간격 변경
  slideIntervalInput.addEventListener('change', async () => {
    const newInterval = parseInt(slideIntervalInput.value);
    if (newInterval >= 1 && newInterval <= 30) {
      const oldInterval = currentSettings.slideInterval;
      currentSettings.slideInterval = newInterval;
      
      console.log('🎬 자동 슬라이드 간격 변경:', oldInterval + '초 → ' + newInterval + '초');
      
      // 🚀 즉시 localStorage에 저장
      try {
        await chrome.storage.local.set({ slideInterval: newInterval });
        console.log('✅ 슬라이드 간격 저장 완료:', newInterval + '초');
        
        // 🔄 브라우저의 content script에 즉시 알림 (자동 슬라이드 재시작)
        await notifyContentScriptSlideIntervalUpdate(newInterval);
        
      } catch (error) {
        console.error('❌ 슬라이드 간격 저장 실패:', error);
        slideIntervalInput.value = oldInterval; // 실패 시 원래 값 복원
        currentSettings.slideInterval = oldInterval;
      }
    } else {
      console.warn('⚠️ 슬라이드 간격은 1-30초 범위여야 합니다');
      slideIntervalInput.value = currentSettings.slideInterval; // 원래 값으로 복원
    }
  });

  // 모드 토글 이벤트 리스너
  modeToggleBtn.addEventListener('click', toggleSlideMode);
}

// 설정 로드
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get([
      'stocks', 'updateInterval', 'slideInterval', 'position', 'showVolume', 'showChange', 'displayVisible', 'slideMode'
    ]);
    
    currentSettings = {
      stocks: data.stocks || [
        { code: '005930', name: '삼성전자', enabled: true }
      ],
      updateInterval: data.updateInterval || 2,
      slideInterval: data.slideInterval || 5, // 기본값 5초
      position: data.position || 'top-left',
      showVolume: data.showVolume !== false,
      showChange: data.showChange !== false,
      displayVisible: data.displayVisible !== false,
      slideMode: data.slideMode || 'auto' // 기본값 자동 모드
    };
    
    // UI 업데이트
    updateIntervalInput.value = currentSettings.updateInterval;
    slideIntervalInput.value = currentSettings.slideInterval;
    
    // 위치 버튼 활성화
    positionButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.position === currentSettings.position);
    });
    
    // 주식 목록 렌더링
    renderStockList();
    
    // 표시/숨김 버튼 텍스트 업데이트
    updateToggleButtonText();
    
    // 모드 UI 업데이트
    updateModeUI();
    
    // 최근 조회 데이터 로드
    await loadRecentStocks();
    
  } catch (error) {
    console.error('설정 로드 실패:', error);
    showStatus('설정 로드에 실패했습니다.', 'error');
  }
}

// 주식 목록 렌더링
function renderStockList() {
  // 기존 내용 초기화
  stockList.innerHTML = '';
  
  if (currentSettings.stocks.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <div class="empty-state-icon">📈</div>
      <div>모니터링할 주식을 추가해주세요</div>
    `;
    stockList.appendChild(emptyState);
    return;
  }
  
  // 각 주식 아이템을 DOM으로 생성
  currentSettings.stocks.forEach((stock, index) => {
    const stockItem = document.createElement('div');
    stockItem.className = 'stock-item';
    
    // 주식 정보 섹션
    const stockInfo = document.createElement('div');
    stockInfo.className = 'stock-info';
    
    const stockName = document.createElement('div');
    stockName.className = 'stock-name';
    stockName.textContent = stock.name;
    
    const stockCode = document.createElement('div');
    stockCode.className = 'stock-code';
    stockCode.textContent = stock.code;
    
    stockInfo.appendChild(stockName);
    stockInfo.appendChild(stockCode);
    
    // 컨트롤 섹션
    const stockControls = document.createElement('div');
    stockControls.className = 'stock-controls';
    
    // 토글 스위치
    const toggleSwitch = document.createElement('div');
    toggleSwitch.className = `toggle-switch ${stock.enabled ? 'active' : ''}`;
    toggleSwitch.addEventListener('click', () => toggleStock(index));
    
    const toggleSlider = document.createElement('div');
    toggleSlider.className = 'toggle-slider';
    toggleSwitch.appendChild(toggleSlider);
    
    // 삭제 버튼
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '삭제';
    deleteBtn.addEventListener('click', () => deleteStock(index));
    
    stockControls.appendChild(toggleSwitch);
    stockControls.appendChild(deleteBtn);
    
    // 전체 아이템 조립
    stockItem.appendChild(stockInfo);
    stockItem.appendChild(stockControls);
    
    // 리스트에 추가
    stockList.appendChild(stockItem);
  });
}

// 주식 추가
async function addStock() {
  const code = stockCodeInput.value.trim();
  const name = stockNameInput.value.trim();
  
  if (!code) {
    showStatus('주식 코드를 입력해주세요.', 'error');
    stockCodeInput.focus();
    return;
  }
  
  // 주식 코드 유효성 검사
  if (!validateStockCode(code)) {
    showStatus('올바른 6자리 주식 코드를 입력해주세요.', 'error');
    stockCodeInput.focus();
    return;
  }
  
  if (!name) {
    showStatus('종목명을 입력해주세요.', 'error');
    stockNameInput.focus();
    return;
  }
  
  // 중복 체크
  if (currentSettings.stocks.some(stock => stock.code === code)) {
    showStatus('이미 추가된 주식입니다.', 'error');
    stockCodeInput.focus();
    return;
  }
  
  try {
    // 새 주식 객체 생성
    const newStock = {
      code: code,
      name: name,
      enabled: true
    };
    
    // 주식 추가
    currentSettings.stocks.push(newStock);
    
    // 설정 저장
    await chrome.storage.local.set(currentSettings);
    
    // background script에 설정 업데이트 알림 (새 종목 추가 시 강제 새로고침)
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: currentSettings,
      forceRefresh: true // 🚀 새 종목 추가 시 fresh 데이터 요청
    });
    
    // 🔄 브라우저의 content script에 즉시 알림
    await notifyContentScriptUpdate();
    
    // UI 업데이트
    renderStockList();
    
    // 입력 필드 초기화
    stockCodeInput.value = '';
    stockNameInput.value = '';
    stockCodeInput.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    
    showStatus(`${name}이(가) 추가되었습니다.`, 'success');
    
    // 최근 조회에 추가
    await addToRecentStocks(code, name);
    
    // 다음 입력을 위해 코드 필드에 포커스
    stockCodeInput.focus();
    
  } catch (error) {
    // 오류 발생 시 원상복구
    currentSettings.stocks.pop();
    console.error('주식 추가 실패:', error);
    showStatus('주식 추가에 실패했습니다.', 'error');
  }
}

// 주식 토글 (활성화/비활성화)
async function toggleStock(index) {
  if (index < 0 || index >= currentSettings.stocks.length) return;
  
  const stock = currentSettings.stocks[index];
  const wasEnabled = stock.enabled;
  stock.enabled = !stock.enabled;
  
  try {
    // 설정 저장
    await chrome.storage.local.set(currentSettings);
    
    // background script에 설정 업데이트 알림 (활성화/비활성화 시 강제 새로고침)
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: currentSettings,
      forceRefresh: true // 🚀 활성화/비활성화 시 fresh 데이터로 완전 새로고침
    });
    
    // 🔄 브라우저의 content script에 즉시 알림
    notifyContentScriptUpdate();
    
    // UI 업데이트
    renderStockList();
    
    const statusMessage = stock.enabled ? 
      `${stock.name}이(가) 활성화되었습니다.` : 
      `${stock.name}이(가) 비활성화되었습니다.`;
    showStatus(statusMessage, 'success');
    
  } catch (error) {
    // 오류 발생 시 원상복구
    stock.enabled = wasEnabled;
    renderStockList();
    console.error('주식 상태 변경 실패:', error);
    showStatus('상태 변경에 실패했습니다.', 'error');
  }
}

// 주식 삭제
async function deleteStock(index) {
  if (index < 0 || index >= currentSettings.stocks.length) return;
  
  const stock = currentSettings.stocks[index];
  const stockName = stock.name;
  
  if (!confirm(`정말로 "${stockName}" 종목을 삭제하시겠습니까?`)) {
    return;
  }
  
  try {
    // 백업 (실패 시 복구용)
    const deletedStock = currentSettings.stocks.splice(index, 1)[0];
    
    // 설정 저장
    await chrome.storage.local.set(currentSettings);
    
    // background script에 설정 업데이트 알림 (삭제 시 강제 새로고침)
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: currentSettings,
      forceRefresh: true // 🚀 종목 삭제 시 fresh 데이터로 완전 새로고침
    });
    
    // 🔄 브라우저의 content script에 즉시 알림
    notifyContentScriptUpdate();
    
    // UI 업데이트
    renderStockList();
    showStatus(`${stockName}이(가) 삭제되었습니다.`, 'success');
    
  } catch (error) {
    // 오류 발생 시 원상복구
    currentSettings.stocks.splice(index, 0, deletedStock);
    renderStockList();
    console.error('주식 삭제 실패:', error);
    showStatus('주식 삭제에 실패했습니다.', 'error');
  }
}

// 설정 저장
async function saveSettings() {
  try {
    // localStorage에 저장
    await chrome.storage.local.set(currentSettings);
    
    // background script에 설정 업데이트 알림 (일반 설정 저장 시 forceRefresh 없음)
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      settings: currentSettings
      // forceRefresh: false - 일반 설정 변경 시에는 기존 데이터 유지
    }, async (response) => {
      if (response && response.success) {
        showStatus('설정이 저장되었습니다.', 'success');
        
        // 🔄 브라우저의 content script에 즉시 알림 (기존 데이터로 즉시 업데이트)
        await notifyContentScriptUpdate();
        
        // 📱 모드 변경 알림 (저장 버튼 클릭 시에만 적용)
        await notifyContentScriptModeChange(currentSettings.slideMode);
        
        // content script에 위치 업데이트 전송 (기존 코드 유지)
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updatePosition',
              position: currentSettings.position
            });
          }
        });
      } else {
        showStatus('설정 저장에 실패했습니다.', 'error');
      }
    });
    
  } catch (error) {
    console.error('설정 저장 실패:', error);
    showStatus('설정 저장에 실패했습니다.', 'error');
  }
}

// 표시/숨김 버튼 아이콘 업데이트
function updateToggleButtonText() {
  if (toggleDisplayBtn) {
    if (currentSettings.displayVisible) {
      toggleDisplayBtn.textContent = '👁️';
      toggleDisplayBtn.title = '주가 모니터를 숨깁니다';
      toggleDisplayBtn.classList.remove('hidden');
    } else {
      toggleDisplayBtn.textContent = '🙈';
      toggleDisplayBtn.title = '주가 모니터를 표시합니다';
      toggleDisplayBtn.classList.add('hidden');
    }
  }
}

// 표시/숨김 토글
async function toggleDisplay() {
  try {
    // 현재 상태를 토글
    currentSettings.displayVisible = !currentSettings.displayVisible;
    
    // localStorage에 저장
    await chrome.storage.local.set({ 
      displayVisible: currentSettings.displayVisible 
    });
    
    // 버튼 텍스트 업데이트
    updateToggleButtonText();
    
    // content script에 메시지 전송
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleVisibility',
          visible: currentSettings.displayVisible
        }, (response) => {
          if (response && response.success) {
            const statusMessage = currentSettings.displayVisible ? 
              '주가 모니터가 표시됩니다.' : '주가 모니터가 숨겨집니다.';
            showStatus(statusMessage, 'success');
          } else {
            showStatus('상태 변경에 실패했습니다.', 'error');
          }
        });
      }
    });
    
  } catch (error) {
    console.error('표시/숨김 토글 실패:', error);
    showStatus('상태 변경에 실패했습니다.', 'error');
    
    // 오류 시 원상복구
    currentSettings.displayVisible = !currentSettings.displayVisible;
    updateToggleButtonText();
  }
}

// 상태 메시지 표시
function showStatus(message, type = 'success') {
  // 기존 애니메이션이 있으면 클리어
  clearTimeout(showStatus.hideTimeout);
  clearTimeout(showStatus.showTimeout);
  
  // 메시지와 타입 설정
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  
  // 즉시 표시 상태로 설정
  statusDiv.classList.add('show');
  
  // 4초 후 사라지기 시작
  showStatus.hideTimeout = setTimeout(() => {
    statusDiv.classList.remove('show');
    
    // 애니메이션 완료 후 완전히 숨기기 (0.3초 후)
    showStatus.showTimeout = setTimeout(() => {
      statusDiv.className = 'status'; // 클래스 초기화
    }, 300);
  }, 4000);
}

// 타임아웃 ID 저장을 위한 프로퍼티
showStatus.hideTimeout = null;
showStatus.showTimeout = null;

// 🔄 Content Script에 변경사항 즉시 알림
async function notifyContentScriptUpdate() {
  try {
    console.log('🔄 브라우저 카드 업데이트 알림 전송 중...');
    
    // 모든 탭에 메시지 전송 (content script가 있는 탭만 응답)
    const tabs = await chrome.tabs.query({});
    
    let notifiedTabs = 0;
    
    for (const tab of tabs) {
      try {
        // content script에 설정 업데이트 알림
        await chrome.tabs.sendMessage(tab.id, {
          action: 'settingsUpdated',
          settings: currentSettings
        });
        
        notifiedTabs++;
        console.log(`✅ 탭 ${tab.id}에 설정 업데이트 알림 전송됨`);
        
      } catch (error) {
        // content script가 없는 탭에서는 에러가 발생할 수 있음 (정상)
        // console.log(`ℹ️ 탭 ${tab.id}에는 content script가 없음`);
      }
    }
    
    if (notifiedTabs > 0) {
      console.log(`✅ 총 ${notifiedTabs}개 탭에 업데이트 알림 완료`);
    } else {
      console.log('ℹ️ 업데이트할 content script가 있는 탭이 없음');
    }
    
  } catch (error) {
    console.error('❌ Content script 알림 전송 실패:', error);
  }
}

// 전역 함수 등록 제거 (더 이상 onclick을 사용하지 않으므로 불필요)

// 유효성 검사 함수들
function validateStockCode(code) {
  // 한국 주식 코드는 6자리 숫자
  return /^\d{6}$/.test(code);
}

// 실시간 입력 검증
stockCodeInput.addEventListener('input', () => {
  const code = stockCodeInput.value.trim();
  if (code && !validateStockCode(code)) {
    stockCodeInput.style.borderColor = '#F44336';
  } else {
    stockCodeInput.style.borderColor = 'rgba(255, 255, 255, 0.3)';
  }
});

// 최근 조회 주식 관리
let recentStocks = [];

// 최근 조회 주식 UI 추가
function addRecentStocksSection() {
  const recentSection = document.createElement('div');
  recentSection.id = 'recentStocksSection';
  recentSection.style.cssText = 'margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.2);';
  
  // 제목
  const title = document.createElement('div');
  title.style.cssText = 'font-size: 12px; margin-bottom: 8px; opacity: 0.8;';
  title.textContent = '최근 조회';
  
  // 버튼 컨테이너 (스크롤 가능)
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'recentStocksContainer';
  buttonContainer.style.cssText = `
    display: flex; 
    flex-wrap: wrap; 
    gap: 6px; 
    max-height: 80px; 
    overflow-y: auto; 
    padding: 2px;
  `;
  
  recentSection.appendChild(title);
  recentSection.appendChild(buttonContainer);
  
  document.querySelector('.section-content').appendChild(recentSection);
  
  // 초기 데이터 로드
  loadRecentStocks();
  renderRecentStocks();
}

// localStorage에서 최근 조회 데이터 로드
async function loadRecentStocks() {
  try {
    const data = await chrome.storage.local.get(['recentStocks']);
    recentStocks = data.recentStocks || [];
  } catch (error) {
    console.error('❌ 최근 조회 데이터 로드 실패:', error);
    recentStocks = [];
  }
}

// 최근 조회 데이터를 localStorage에 저장
async function saveRecentStocks() {
  try {
    await chrome.storage.local.set({ recentStocks });
    console.log('✅ 최근 조회 데이터 저장 완료:', recentStocks);
  } catch (error) {
    console.error('❌ 최근 조회 데이터 저장 실패:', error);
  }
}

// 최근 조회에 주식 추가 (중복 제거 후 첫 번째에 추가)
async function addToRecentStocks(code, name) {
  if (!code || !name) return;
  
  // 중복 항목 제거
  recentStocks = recentStocks.filter(stock => stock.code !== code);
  
  // 첫 번째에 추가
  recentStocks.unshift({ code, name });
  
  // 최대 10개까지만 유지
  if (recentStocks.length > 10) {
    recentStocks = recentStocks.slice(0, 10);
  }
  
  await saveRecentStocks();
  renderRecentStocks();
}

// 최근 조회에서 주식 제거
async function removeFromRecentStocks(code) {
  recentStocks = recentStocks.filter(stock => stock.code !== code);
  await saveRecentStocks();
  renderRecentStocks();
}

// 최근 조회 목록 렌더링
function renderRecentStocks() {
  const container = document.getElementById('recentStocksContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (recentStocks.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'font-size: 11px; opacity: 0.6; padding: 8px;';
    emptyMsg.textContent = '최근 조회한 종목이 없습니다';
    container.appendChild(emptyMsg);
    return;
  }
  
  recentStocks.forEach(stock => {
    const stockItem = document.createElement('div');
    stockItem.className = 'recent-stock-item';
    stockItem.style.cssText = `
      position: relative; 
      padding: 4px 8px; 
      font-size: 10px; 
      background: rgba(255, 255, 255, 0.2); 
      border-radius: 4px; 
      cursor: pointer; 
      transition: all 0.2s ease;
      margin: 2px;
    `;
    stockItem.textContent = stock.name;
    
    // 삭제 버튼 생성
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'recent-stock-delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.style.cssText = `
      position: absolute;
      top: -5px;
      right: -5px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(255, 0, 0, 0.8);
      color: white;
      border: none;
      font-size: 10px;
      font-weight: bold;
      cursor: pointer;
      display: none;
      z-index: 100;
      line-height: 1;
    `;
    
    // 마우스 이벤트
    stockItem.addEventListener('mouseenter', () => {
      stockItem.style.background = 'rgba(255, 255, 255, 0.3)';
      deleteBtn.style.display = 'block';
    });
    
    stockItem.addEventListener('mouseleave', () => {
      stockItem.style.background = 'rgba(255, 255, 255, 0.2)';
      deleteBtn.style.display = 'none';
    });
    
    // 클릭 이벤트 (빠른 추가)
    stockItem.addEventListener('click', (e) => {
      if (e.target === deleteBtn) return; // 삭제 버튼 클릭 시 제외
      quickAddStock(stock.code, stock.name);
    });
    
    // 삭제 버튼 클릭 이벤트
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromRecentStocks(stock.code);
    });
    
    stockItem.appendChild(deleteBtn);
    container.appendChild(stockItem);
  });
}

// 최근 조회에서 빠른 추가
function quickAddStock(code, name) {
  // 이미 모니터링 주식에 포함되어 있는지 확인
  const isDuplicate = currentSettings.stocks.some(stock => stock.code === code);
  
  if (isDuplicate) {
    console.log('⚠️ 이미 모니터링 중인 종목:', name, '(' + code + ')');
    showStatus(`${name}은(는) 이미 모니터링 중입니다.`, 'error');
    return;
  }
  
  stockCodeInput.value = code;
  stockNameInput.value = name;
  addStock();
}

// 슬라이드 간격 변경 알림 함수
async function notifyContentScriptSlideIntervalUpdate(newInterval) {
  console.log('🔄 브라우저 카드 슬라이드 간격 변경 알림 전송 중...', newInterval + '초');
  
  try {
    const tabs = await chrome.tabs.query({});
    let notifiedTabs = 0;
    
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'slideIntervalUpdated',
          slideInterval: newInterval
        });
        notifiedTabs++;
        console.log(`✅ 탭 ${tab.id}에 슬라이드 간격 변경 알림 전송됨 (${newInterval}초)`);
      } catch (error) {
        // content script가 없는 탭은 무시
      }
    }
    
    if (notifiedTabs > 0) {
      console.log(`✅ 총 ${notifiedTabs}개 탭에 슬라이드 간격 변경 알림 완료`);
    } else {
      console.log('ℹ️ 슬라이드 간격을 업데이트할 content script가 있는 탭이 없음');
    }
  } catch (error) {
    console.error('❌ 슬라이드 간격 변경 알림 전송 실패:', error);
  }
}

// 모드 토글 함수 (UI만 업데이트, 실제 적용은 저장 시)
function toggleSlideMode() {
  try {
    const newMode = currentSettings.slideMode === 'auto' ? 'manual' : 'auto';
    currentSettings.slideMode = newMode;
    
    // UI만 업데이트 (localStorage 저장은 하지 않음)
    updateModeUI();
    
    const modeText = newMode === 'auto' ? '자동' : '수동';
    console.log(`🔄 슬라이드 모드 UI 변경: ${modeText} (저장 대기 중)`);
    
  } catch (error) {
    console.error('❌ 모드 UI 변경 실패:', error);
  }
}

// 모드 UI 업데이트
function updateModeUI() {
  const isAuto = currentSettings.slideMode === 'auto';
  
  // 토글 버튼 상태 업데이트
  modeToggleBtn.className = `mode-toggle-btn ${isAuto ? 'auto' : 'manual'}`;
  modeDescription.textContent = isAuto ? '자동' : '수동';
  
  // 자동 슬라이드 설정 활성화/비활성화
  if (slideSettingItem) {
    if (isAuto) {
      slideSettingItem.classList.remove('disabled');
      slideIntervalInput.disabled = false;
    } else {
      slideSettingItem.classList.add('disabled');
      slideIntervalInput.disabled = true;
    }
  }
}

// content script에 모드 변경 알림
async function notifyContentScriptModeChange(mode) {
  try {
    const tabs = await chrome.tabs.query({});
    let notifiedTabs = 0;
    
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('moz-extension://')) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'modeChange',
            mode: mode
          });
          notifiedTabs++;
        } catch (error) {
          // content script가 없는 탭은 무시
        }
      }
    }
    
    if (notifiedTabs > 0) {
      console.log(`✅ 총 ${notifiedTabs}개 탭에 모드 변경 알림 완료`);
    } else {
      console.log('ℹ️ 모드 변경을 알릴 content script가 있는 탭이 없음');
    }
  } catch (error) {
    console.error('❌ 모드 변경 알림 전송 실패:', error);
  }
}

// 전역 함수 등록 제거 (더 이상 불필요)

// 페이지 로드 완료 후 최근 조회 섹션 추가
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    addRecentStocksSection();
  }, 100);
});
