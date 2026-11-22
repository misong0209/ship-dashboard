// =====================================================
// sim.js : 가상 센서 데이터 만들기
// - 실제 선박이라면 이 파일 대신 센서에서 값을 받아 옵니다.
// - 1초마다 값을 조금씩 바꿉니다.
// - 다른 파일에서는 getLatestData(), getTrack()으로 값을 가져갑니다.
// =====================================================

// 선박 기본 정보
const SHIP = { name: '해사호', from: '부산항', to: '광양항' };

// 계획 항로: 출발항 → 경유점 5개 → 도착항 (위도, 경도)
const ROUTE = [
  { name: '부산항',   lat: 35.100, lon: 129.040 },
  { name: '경유점 1', lat: 35.030, lon: 129.000 },
  { name: '경유점 2', lat: 34.950, lon: 128.850 },
  { name: '경유점 3', lat: 34.660, lon: 128.720 },
  { name: '경유점 4', lat: 34.550, lon: 128.200 },
  { name: '경유점 5', lat: 34.650, lon: 127.880 },
  { name: '광양항',   lat: 34.900, lon: 127.700 },
];

// 시연용 배속: 화면의 1초 동안 실제 60초만큼 항해합니다. (약 7분이면 광양항 도착)
const SIM_SPEEDUP = 60;

// 경보 시연용: 약 1분마다 아래 항목 중 하나가 차례로 위험한 값이 됩니다.
const HAZARDS = ['depth', 'windSpeed', 'coolantTemp'];
const DANGER_VALUE = { depth: 14, windSpeed: 24, coolantTemp: 96 };

// ---------- 최신 데이터 (다른 파일에서 읽어 감) ----------
const simData = {
  time: new Date(),
  // 항해
  lat: ROUTE[0].lat,  // 위도(도)
  lon: ROUTE[0].lon,  // 경도(도)
  sog: 13.5,          // 속력 SOG(노트)
  cog: 0,             // 침로 COG(도)
  heading: 0,         // 선수 방위(도)
  // 기상·해상
  windDir: 300,       // 풍향(도, 바람이 불어오는 방향)
  windSpeed: 8,       // 풍속(m/s)
  waveHeight: 1.2,    // 파고(m)
  depth: 50,          // 수심(m)
  waterTemp: 16,      // 수온(℃)
  pressure: 1013,     // 기압(hPa)
  // 기관·연료
  rpm: 108,           // 엔진 회전수(RPM)
  fuelRate: 540,      // 연료 소모량(L/h)
  fuelPct: 25,        // 연료 잔량(%)
  coolantTemp: 78,    // 냉각수 온도(℃)
  // 항로 계산 결과
  nextIndex: 1,       // 향하고 있는 경유점 (ROUTE 안의 순서)
  distToNext: 0,      // 다음 경유점까지 거리(해리)
  distRemaining: 0,   // 도착항까지 남은 거리(해리)
};

// 지나온 위치 기록 [{lat, lon}, ...]
const simTrack = [];

// 위험 이벤트가 없을 때의 평상시 값
const normalValue = { depth: 50, windSpeed: 8, coolantTemp: 78 };

let simDrift = 0;     // 선수 방위와 침로의 차이 (바람·조류 영향)
let simTick = 0;      // 시작 후 지난 초
let simHazard = null; // 지금 위험한 값인 항목 이름

// ---------- 다른 파일에서 쓰는 함수 ----------
function getLatestData() {
  return simData;
}

function getTrack() {
  return simTrack;
}

// ---------- 계산 도우미 ----------

// 값을 조금씩 무작위로 바꾸되 min~max 범위를 벗어나지 않게 함
function wander(value, min, max, step) {
  value += (Math.random() * 2 - 1) * step;
  return Math.min(max, Math.max(min, value));
}

// 현재 값을 목표 값 쪽으로 rate만큼 서서히 다가가게 함
function approach(value, target, rate) {
  return value + (target - value) * rate;
}

// 각도를 0~360 범위로 맞춤
function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

// 두 지점 사이 거리(해리). 가까운 거리라 평면으로 계산 (위도 1분 = 1해리)
function distanceNM(a, b) {
  const dy = (b.lat - a.lat) * 60;
  const dx = (b.lon - a.lon) * 60 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

// a에서 b를 바라보는 방위(도, 북쪽 0도, 시계 방향)
function bearingDeg(a, b) {
  const dy = (b.lat - a.lat) * 60;
  const dx = (b.lon - a.lon) * 60 * Math.cos(a.lat * Math.PI / 180);
  return normalizeDeg(Math.atan2(dx, dy) * 180 / Math.PI);
}

// ---------- 1초마다 하는 일 ----------

// 부산항에서 새 항해 시작
function startVoyage() {
  simData.lat = ROUTE[0].lat;
  simData.lon = ROUTE[0].lon;
  simData.nextIndex = 1;
  simData.fuelPct = 25;  // 새 항해는 연료 25%에서 시작 (항해 중 20% 미만이 되어 경보 시연)
  simTrack.length = 0;
  simTrack.push({ lat: simData.lat, lon: simData.lon });
}

// 계획 항로를 따라 선박 이동
function moveShip() {
  const target = ROUTE[simData.nextIndex];
  const step = simData.sog * SIM_SPEEDUP / 3600;  // 이번 1초 동안 갈 거리(해리)
  const dist = distanceNM(simData, target);

  // 침로는 다음 경유점 방향, 선수 방위는 침로에서 조금 틀어짐
  simData.cog = normalizeDeg(bearingDeg(simData, target) + (Math.random() - 0.5));
  simDrift = wander(simDrift, -4, 4, 0.5);
  simData.heading = normalizeDeg(simData.cog + simDrift);

  if (step >= dist) {
    // 경유점 도착 → 다음 경유점으로
    simData.lat = target.lat;
    simData.lon = target.lon;
    simData.nextIndex++;
    if (simData.nextIndex >= ROUTE.length) {
      startVoyage();  // 광양항 도착 → 부산항에서 다시 시작
      return;
    }
  } else {
    const ratio = step / dist;
    simData.lat += (target.lat - simData.lat) * ratio;
    simData.lon += (target.lon - simData.lon) * ratio;
  }
  simTrack.push({ lat: simData.lat, lon: simData.lon });
}

// 다음 경유점까지 거리, 도착항까지 남은 거리
function updateDistances() {
  simData.distToNext = distanceNM(simData, ROUTE[simData.nextIndex]);
  let total = simData.distToNext;
  for (let i = simData.nextIndex; i < ROUTE.length - 1; i++) {
    total += distanceNM(ROUTE[i], ROUTE[i + 1]);
  }
  simData.distRemaining = total;
}

// 약 1분마다 위험 이벤트 시작, 15초 뒤 끝
function updateHazard() {
  if (simTick % 60 === 30) {
    simHazard = HAZARDS[Math.floor(simTick / 60) % HAZARDS.length];
  }
  if (simTick % 60 === 45) {
    simHazard = null;
  }
}

// 위험 이벤트 중이면 위험 값 쪽으로, 아니면 평상시 값 쪽으로 서서히 이동
function hazardValue(key) {
  const target = (simHazard === key) ? DANGER_VALUE[key] : normalValue[key];
  return approach(simData[key], target, 0.4);
}

function updateWeather() {
  simData.windDir = normalizeDeg(simData.windDir + (Math.random() * 2 - 1) * 3);
  simData.waveHeight = wander(simData.waveHeight, 0.5, 2.5, 0.05);
  simData.waterTemp = wander(simData.waterTemp, 14, 18, 0.05);
  simData.pressure = wander(simData.pressure, 1008, 1018, 0.1);

  normalValue.depth = wander(normalValue.depth, 30, 80, 1);
  normalValue.windSpeed = wander(normalValue.windSpeed, 5, 12, 0.3);
  simData.depth = hazardValue('depth');
  simData.windSpeed = hazardValue('windSpeed');
}

function updateEngine() {
  simData.rpm = simData.sog * 8 + (Math.random() * 2 - 1);            // 속력에 비례
  simData.fuelRate = simData.sog * 40 + (Math.random() * 2 - 1) * 5;  // 속력에 비례
  simData.fuelPct = Math.max(0, simData.fuelPct - 0.02);              // 점점 줄어듦

  normalValue.coolantTemp = wander(normalValue.coolantTemp, 75, 82, 0.2);
  simData.coolantTemp = hazardValue('coolantTemp');
}

function simStep() {
  simTick++;
  simData.time = new Date();
  simData.sog = wander(simData.sog, 12, 15, 0.1);
  updateHazard();
  moveShip();
  updateDistances();
  updateWeather();
  updateEngine();
}

// ---------- 시작 ----------
startVoyage();
simStep();                    // 화면이 바로 값을 읽을 수 있게 한 번 실행
setInterval(simStep, 1000);   // 이후 1초마다 실행
