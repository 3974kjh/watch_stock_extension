// offscreen.js - 백그라운드에서 DOM 기반 크롤링을 수행하는 스크립트

console.log('📊 Offscreen document loaded for stock crawling');

// background.js로부터의 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('🔄 Offscreen received message:', message);
  
  if (message.action === 'fetchStock') {
    fetchStockData(message.stockCode)
      .then(result => {
        console.log('✅ Stock data fetched successfully:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('❌ Stock data fetch failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // 비동기 응답을 위해 true 반환
    return true;
  }
});

// 주식 데이터 크롤링 함수 (Fetch + DOMParser 방식)
async function fetchStockData(stockCode) {
  console.log(`🚀 Starting to fetch stock data for: ${stockCode}`);
  
  try {
    const url = `https://finance.naver.com/item/main.naver?code=${stockCode}`;
    
    console.log(`📡 Fetching HTML from: ${url}`);
    
    // 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    // HTML 페이지 가져오기
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`📄 HTML fetched successfully, length: ${html.length}`);
    
    // DOMParser로 HTML 파싱
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    console.log(`🔍 DOM parsed, title: ${doc.title}`);
    
    // 파싱된 문서에서 주식 데이터 추출
    const stockData = extractStockDataFromDocument(doc, stockCode);
    
    if (stockData && stockData.price && stockData.price !== '0') {
      console.log(`✅ Stock data extracted successfully:`, stockData);
      return stockData;
    } else {
      throw new Error('유효한 주식 데이터를 찾을 수 없습니다');
    }
    
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('네트워크 요청 시간 초과 (30초)');
    }
    
    console.error(`❌ Fetch error for ${stockCode}:`, error);
    throw new Error(`데이터 가져오기 실패: ${error.message}`);
  }
}

// Document에서 주식 데이터 추출
function extractStockDataFromDocument(doc, stockCode) {
  try {
    console.log(`🔍 Extracting data from document for stock: ${stockCode}`);
    
    // 현재가 추출 선택자
    const priceSelectors = [
      '.today .blind',
      '.no_today .blind', 
      '#_nowVal',
      '.no_today',
      '.today',
      '.rate_info .blind',
      '.new_totalinfo .blind',
      '.new_totalinfo .blind:first-child',
      '.today .no_today .blind'
    ];
    
    // 전일가 추출 선택자 
    const yesterdayPriceSelectors = [
      '.rate_info .blind:nth-child(2)', // 전일 정보
      '.rate_info tr:nth-child(1) .blind', // 전일 행
      '.rate_info td .blind', // 전일 셀
      '.new_totalinfo dl:nth-child(2) dd .blind', // 전일종가
      '.stock_info .blind', // 주식 정보의 전일가
      'dt:contains("전일") + dd .blind', // '전일' 라벨 다음 값
      'dt:contains("전일종가") + dd .blind', // '전일종가' 라벨 다음 값
      '.rate_info .tah:nth-child(2) .blind' // 전일 정보
    ];
    
    const volumeSelectors = [
      '.trading_volume .blind',
      '#_volume',
      '.trading_volume',
      '.volume .blind',
      'dd.tah:nth-child(6) .num',
      '.tah p11:nth-child(1) .blind'
    ];
    
    const nameSelectors = [
      '.wrap_company h2',
      '.h_company h2 a',
      '.company_info h2',
      '.wrap_company h2 a',
      'h2.h_company',
      'title'
    ];
    
    // 📊 Python 로직 기반 정확한 데이터 추출
    let currentPrice = '0';
    let yesterdayPrice = '0';
    let calculatedChange = '0';
    let calculatedChangeRate = '0';
    let volume = '0';
    let name = `주식 ${stockCode}`;
    let trendDirection = 'flat'; // 'up', 'down', 'flat'
    
    console.log('🐍 Python 로직 기반 크롤링 시작...');
    
    // 🎯 1. div.rate_info 컨테이너 찾기
    const rateInfoDiv = doc.querySelector('div.rate_info');
    if (!rateInfoDiv) {
      console.error('❌ rate_info div를 찾을 수 없음');
      throw new Error('rate_info 컨테이너를 찾을 수 없습니다');
    }
    
    console.log('✅ rate_info div 발견');
    
    // 🎯 2. 현재가 추출 (div > p.no_today .blind)
    const todayPriceElement = rateInfoDiv.querySelector('div > p.no_today .blind');
    if (todayPriceElement) {
      const priceText = todayPriceElement.textContent.trim().replace(/[^0-9]/g, '');
      if (priceText && priceText !== '0') {
        currentPrice = priceText;
        console.log(`💰 현재가 추출 성공: ${currentPrice}원`);
      }
    }
    
    // 🎯 3. 상승/하락 정보 추출 (div > p.no_exday span)
    const exdayElement = rateInfoDiv.querySelector('div > p.no_exday');
    if (exdayElement) {
      const spanElements = exdayElement.querySelectorAll('span');
      console.log(`🔍 no_exday span 요소 개수: ${spanElements.length}`);
      
      if (spanElements.length >= 3) {
        // Python 코드: context[1].get_text() == '하락'/'상승'/'보합'
        const statusText = spanElements[1].textContent.trim();
        // Python 코드: context[2].get_text() - 변동금액
        const changeAmountText = spanElements[2].textContent.trim().replace(/[^0-9]/g, '');
        
        console.log(`📊 상태 텍스트: "${statusText}"`);
        console.log(`💱 변동금액 텍스트: "${changeAmountText}"`);
        
        if (currentPrice !== '0' && changeAmountText && changeAmountText !== '0') {
          const current = parseInt(currentPrice);
          const changeAmount = parseInt(changeAmountText);
          
          // 🧮 Python 로직과 동일한 계산
          let yesterday = 0;
          
          if (statusText === '하락') {
            // 하락: 전일가 = 현재가 + 변동금액
            yesterday = current + changeAmount;
            trendDirection = 'down';
            calculatedChange = '-' + changeAmount.toString();
            console.log('📉 하락 감지');
          } else if (statusText === '보합') {
            // 보합: 전일가 = 현재가 + 변동금액 (실제로는 변동금액이 0)
            yesterday = current + changeAmount;
            trendDirection = 'flat';
            calculatedChange = '0';
            console.log('📊 보합 감지');
          } else { // '상승' 또는 기타
            // 상승: 전일가 = 현재가 - 변동금액
            yesterday = current - changeAmount;
            trendDirection = 'up';
            calculatedChange = '+' + changeAmount.toString();
            console.log('📈 상승 감지');
          }
          
          yesterdayPrice = yesterday.toString();
          
          // 🧮 변동률 계산 (소수점 둘째자리에서 반올림)
          if (yesterday > 0) {
            const changeRateValue = ((current - yesterday) / yesterday) * 100;
            calculatedChangeRate = Math.round(changeRateValue * 100) / 100; // 반올림
            calculatedChangeRate = Math.abs(calculatedChangeRate).toFixed(2);
            console.log(`📊 변동률 계산: ${calculatedChangeRate}%`);
          }
          
          console.log(`🎯 계산 완료:`);
          console.log(`  현재가: ${currentPrice}원`);
          console.log(`  전일가: ${yesterdayPrice}원`);
          console.log(`  변동가: ${calculatedChange}원`);
          console.log(`  변동률: ${calculatedChangeRate}%`);
          console.log(`  방향: ${trendDirection}`);
          
        } else {
          console.warn('⚠️ 현재가 또는 변동금액 추출 실패');
        }
      } else {
        console.warn('⚠️ no_exday span 요소가 충분하지 않음');
      }
    } else {
      console.warn('⚠️ no_exday 요소를 찾을 수 없음');
    }
    
    // 🔄 Fallback: 추출 실패 시 기존 방식으로 시도
    if (currentPrice === '0' || calculatedChange === '0') {
      console.log('🔄 기본 추출 실패 - 기존 방식으로 Fallback...');
      
      // 현재가 재시도
      if (currentPrice === '0') {
        for (const selector of priceSelectors) {
          const element = doc.querySelector(selector);
          if (element && element.textContent && element.textContent.trim() !== '') {
            const priceText = element.textContent.trim().replace(/[^0-9]/g, '');
            if (priceText && priceText !== '0' && parseInt(priceText) > 100) {
              currentPrice = priceText;
              console.log(`💰 Fallback 현재가: ${currentPrice}원`);
              break;
            }
          }
        }
      }
      
      // 변동가 재시도
      if (calculatedChange === '0') {
        const changeElements = doc.querySelectorAll('.no_exday .blind, .change .blind');
        if (changeElements.length > 0) {
          const changeText = changeElements[0]?.textContent?.trim().replace(/[^0-9]/g, '');
          if (changeText && changeText !== '0') {
            calculatedChange = changeText;
            console.log(`📈 Fallback 변동가: ${calculatedChange}원`);
          }
        }
      }
    }
    
    // 🎯 4. 거래량 추출 (Python 로직: today.select_one('table.no_info').select('span.blind')[3])
    if (rateInfoDiv) {
      const volumeTable = rateInfoDiv.querySelector('table.no_info');
      if (volumeTable) {
        const blindSpans = volumeTable.querySelectorAll('span.blind');
        console.log(`📊 거래량 테이블의 blind span 개수: ${blindSpans.length}`);
        
        // Python 코드: blind[3] - 네 번째 요소 (인덱스 3)
        if (blindSpans.length > 3) {
          const volumeText = blindSpans[3].textContent.trim().replace(/[^0-9]/g, '');
          if (volumeText && volumeText !== '0') {
            volume = volumeText;
            console.log(`📊 거래량 추출 성공: ${volume}`);
          }
        } else {
          console.warn('⚠️ 거래량 blind span 요소가 충분하지 않음');
          
          // Fallback: 기존 방식으로 거래량 찾기
          for (const selector of volumeSelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent && element.textContent.trim() !== '') {
              const volumeText = element.textContent.trim().replace(/[^0-9]/g, '');
              if (volumeText && volumeText !== '0') {
                volume = volumeText;
                console.log(`📊 Fallback 거래량: ${volume}`);
                break;
              }
            }
          }
        }
      } else {
        console.warn('⚠️ table.no_info를 찾을 수 없음 - Fallback 사용');
        
        // Fallback: 기존 방식으로 거래량 찾기
        for (const selector of volumeSelectors) {
          const element = doc.querySelector(selector);
          if (element && element.textContent && element.textContent.trim() !== '') {
            const volumeText = element.textContent.trim().replace(/[^0-9]/g, '');
            if (volumeText && volumeText !== '0') {
              volume = volumeText;
              console.log(`📊 Fallback 거래량: ${volume}`);
              break;
            }
          }
        }
      }
    }
    
    // 🎯 5. 종목명 추출 (Python 로직: soup.select_one('div.new_totalinfo').select_one('div > div > h2'))
    const nameContainer = doc.querySelector('div.new_totalinfo');
    if (nameContainer) {
      const companyElement = nameContainer.querySelector('div > div > h2');
      if (companyElement) {
        const nameText = companyElement.textContent.trim();
        if (nameText) {
          name = nameText;
          console.log(`🏷️ 종목명 추출 성공: ${name}`);
        }
      } else {
        console.warn('⚠️ div > div > h2를 찾을 수 없음 - Fallback 사용');
        
        // Fallback: 기존 방식으로 종목명 찾기
        for (const selector of nameSelectors) {
          const element = doc.querySelector(selector);
          if (element && element.textContent && element.textContent.trim() !== '') {
            const nameText = element.textContent.trim();
            // title 태그인 경우 종목명 부분만 추출
            if (selector === 'title') {
              const titleMatch = nameText.match(/^([^:]+)/);
              if (titleMatch) {
                name = titleMatch[1].trim();
              }
            } else {
              name = nameText;
            }
            console.log(`🏷️ Fallback 종목명: ${name}`);
            break;
          }
        }
      }
    } else {
      console.warn('⚠️ div.new_totalinfo를 찾을 수 없음 - Fallback 사용');
      
      // Fallback: 기존 방식으로 종목명 찾기
      for (const selector of nameSelectors) {
        const element = doc.querySelector(selector);
        if (element && element.textContent && element.textContent.trim() !== '') {
          const nameText = element.textContent.trim();
          // title 태그인 경우 종목명 부분만 추출
          if (selector === 'title') {
            const titleMatch = nameText.match(/^([^:]+)/);
            if (titleMatch) {
              name = titleMatch[1].trim();
            }
          } else {
            name = nameText;
          }
          console.log(`🏷️ Fallback 종목명: ${name}`);
          break;
        }
      }
    }
    
    const result = {
      code: stockCode,
      name: name,
      price: currentPrice || '0',  // 계산에서 사용한 현재가
      change: calculatedChange || '0',  // 계산된 변동가
      changeRate: calculatedChangeRate || '0',  // 계산된 변동률
      volume: volume || '0',
      trendDirection: trendDirection, // 'up', 'down', 'flat'
      yesterdayPrice: yesterdayPrice || '0',  // 전일가 정보 추가
      lastUpdated: new Date().toLocaleTimeString('ko-KR'),
      timestamp: Date.now()
    };
    
    // 📋 최종 결과 정리 및 로그
    console.log('🎯 Python 로직 기반 크롤링 완료:');
    console.log('📊 추출 결과:');
    console.log(`  종목코드: ${stockCode}`);
    console.log(`  종목명: ${name}`);
    console.log(`  현재가: ${currentPrice}원`);
    console.log(`  전일가: ${yesterdayPrice}원`);
    console.log(`  변동가: ${calculatedChange}원`);
    console.log(`  변동률: ${calculatedChangeRate}%`);
    console.log(`  방향: ${trendDirection} (up=상승, down=하락, flat=보합)`);
    console.log(`  거래량: ${volume}`);
    
    // 🔍 데이터 품질 검사
    const dataQuality = {
      현재가: currentPrice !== '0' ? '✅' : '❌',
      전일가: yesterdayPrice !== '0' ? '✅' : '❌',
      변동가: calculatedChange !== '0' ? '✅' : '❌',
      변동률: calculatedChangeRate !== '0' ? '✅' : '❌',
      종목명: name && name !== `주식 ${stockCode}` ? '✅' : '❌',
      거래량: volume !== '0' ? '✅' : '❌'
    };
    
    console.log('🔍 데이터 품질 검사:', dataQuality);
    
    const successCount = Object.values(dataQuality).filter(status => status === '✅').length;
    const totalCount = Object.keys(dataQuality).length;
    console.log(`📊 성공률: ${successCount}/${totalCount} (${Math.round(successCount/totalCount*100)}%)`);
    
    if (successCount >= 4) { // 현재가, 전일가, 변동가, 변동률이 최소 요구사항
      console.log('✅ 크롤링 품질: 양호 - 주요 데이터 확보');
    } else {
      console.log('⚠️ 크롤링 품질: 부족 - 일부 데이터 누락');
    }
    
    console.log('📋 Extracted stock data:', result);
    
    // 최소한의 유효성 검사 - 현재가가 있는지 확인
    if (!result.price || result.price === '0') {
      console.warn('⚠️ 현재가를 찾을 수 없음 - 상세 디버깅 시작');
      
      // 📊 페이지 구조 상세 분석
      console.log('📄 Page title:', doc.title);
      console.log('📄 Page URL 확인:', doc.location ? doc.location.href : 'N/A');
      
      // 🔍 주요 컨테이너 요소들 확인
      const containers = [
        '.wrap_company',
        '.rate_info', 
        '.new_totalinfo',
        '.today',
        '.no_today',
        '.stock_info',
        '.tab_con1'
      ];
      
      console.log('🔍 주요 컨테이너 요소 존재 여부:');
      containers.forEach(selector => {
        const element = doc.querySelector(selector);
        console.log(`  ${selector}: ${element ? '✅ 존재' : '❌ 없음'}`);
        if (element) {
          console.log(`    클래스: "${element.className}"`);
          console.log(`    내용 미리보기: "${element.textContent.substring(0, 100)}..."`);
        }
      });
      
      // 🔍 모든 .blind 요소 확인
      const blindElements = doc.querySelectorAll('.blind');
      console.log(`🔍 전체 .blind 요소 개수: ${blindElements.length}`);
      blindElements.forEach((element, index) => {
        if (index < 10) { // 처음 10개만 로그
          console.log(`  blind[${index}]: "${element.textContent.trim()}"`);
        }
      });
      
      // 🔍 숫자가 포함된 모든 요소 검색
      const allElements = doc.querySelectorAll('*');
      const numericElements = [];
      
      allElements.forEach(element => {
        const text = element.textContent.trim();
        if (text && /\d{2,}/.test(text) && text.length < 50) { // 2자리 이상 숫자가 포함된 짧은 텍스트
          numericElements.push({
            selector: element.tagName.toLowerCase() + (element.className ? '.' + element.className.split(' ').join('.') : ''),
            text: text,
            parent: element.parentElement ? element.parentElement.tagName.toLowerCase() : 'none'
          });
        }
      });
      
      console.log('🔍 숫자가 포함된 요소들 (최대 20개):');
      numericElements.slice(0, 20).forEach((item, index) => {
        console.log(`  [${index}] ${item.selector} (부모: ${item.parent}): "${item.text}"`);
      });
      
      // 에러 페이지인지 확인
      const bodyText = doc.body ? doc.body.textContent : '';
      if (bodyText.includes('오류') || bodyText.includes('error') || bodyText.includes('Error')) {
        throw new Error('네이버 증권 페이지 접근 오류');
      }
      
      // 페이지 내용 샘플
      console.log('📄 Body 내용 샘플:', bodyText.substring(0, 1000));
      
      throw new Error('주식 가격 정보를 찾을 수 없습니다');
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Data extraction error:', error);
    throw new Error(`데이터 추출 실패: ${error.message}`);
  }
}

// 🐍 Python 로직 기반 디버깅용 함수들
window.debugCrawler = {
  testStockCode: async (code) => {
    try {
      console.log(`🧪 Python 로직 기반 테스트: ${code}`);
      const result = await fetchStockData(code);
      
      // 상세 분석 출력
      console.log('🔍 상세 분석:');
      console.log(`  성공 여부: ${result.error ? '❌ 실패' : '✅ 성공'}`);
      if (!result.error) {
        console.log(`  데이터 완성도: ${result.price !== '0' && result.change !== '0' ? '완전' : '부분'}`);
        console.log(`  변동 방향: ${result.trendDirection}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Debug error:', error);
      return { error: error.message };
    }
  },
  
  testDOMStructure: async (code) => {
    try {
      const url = `https://finance.naver.com/item/main.naver?code=${code}`;
      console.log(`🔍 DOM 구조 분석: ${url}`);
      
      const response = await fetch(url);
      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      
      // Python 로직에 사용되는 주요 요소들 확인
      const analysis = {
        'div.rate_info': !!doc.querySelector('div.rate_info'),
        'p.no_today .blind': !!doc.querySelector('div.rate_info p.no_today .blind'),
        'p.no_exday': !!doc.querySelector('div.rate_info p.no_exday'),
        'p.no_exday span': doc.querySelectorAll('div.rate_info p.no_exday span').length,
        'table.no_info': !!doc.querySelector('div.rate_info table.no_info'),
        'table.no_info span.blind': doc.querySelectorAll('div.rate_info table.no_info span.blind').length,
        'div.new_totalinfo': !!doc.querySelector('div.new_totalinfo'),
        'div.new_totalinfo h2': !!doc.querySelector('div.new_totalinfo div > div > h2')
      };
      
      console.log('🔍 DOM 요소 존재 여부:', analysis);
      
      // 핵심 텍스트 추출 테스트
      const rateInfo = doc.querySelector('div.rate_info');
      if (rateInfo) {
        const exday = rateInfo.querySelector('p.no_exday');
        if (exday) {
          const spans = exday.querySelectorAll('span');
          console.log('📊 no_exday span 텍스트들:');
          spans.forEach((span, idx) => {
            console.log(`  [${idx}]: "${span.textContent.trim()}"`);
          });
        }
      }
      
      return analysis;
    } catch (error) {
      console.error('❌ DOM 구조 분석 오류:', error);
      return { error: error.message };
    }
  },
  
  testFetch: async (code) => {
    try {
      const url = `https://finance.naver.com/item/main.naver?code=${code}`;
      console.log(`🔗 Testing fetch to: ${url}`);
      
      const response = await fetch(url);
      console.log(`📡 Response status: ${response.status}`);
      console.log(`📡 Response headers:`, [...response.headers.entries()]);
      
      const text = await response.text();
      console.log(`📄 HTML length: ${text.length}`);
      console.log(`📄 HTML sample:`, text.substring(0, 200));
      
      return { status: response.status, length: text.length };
    } catch (error) {
      console.error('❌ Fetch test error:', error);
      return { error: error.message };
    }
  }
};

console.log('🔧 Offscreen crawler ready (Python Logic + Fetch + DOMParser mode)');
console.log('🐍 Python 로직 기반 크롤링 엔진 초기화 완료');
console.log('🧪 Test commands:');
console.log('   debugCrawler.testStockCode("005930")    - 전체 크롤링 테스트');
console.log('   debugCrawler.testDOMStructure("005930")  - DOM 구조 분석');
console.log('   debugCrawler.testFetch("005930")        - 기본 페이지 가져오기 테스트');
