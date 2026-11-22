// =====================================================
// app.js : 화면 표시
// - 1초마다 sim.js에서 최신 데이터를 가져와 화면을 다시 그립니다.
// =====================================================

// ---------- 공통 도우미 ----------

// id로 찾은 요소에 글자 넣기
function show(id, text) {
  document.getElementById(id).textContent = text;
}

// 숫자를 두 자리로 (5 → "05")
function pad2(n) {
  return String(n).padStart(2, '0');
}

// 각도를 세 자리 정수로 (5.3 → "005")
function deg3(value) {
  return String(Math.round(value) % 360).padStart(3, '0');
}

// 위도·경도를 "35°06.00′N" 모양으로
function formatLatLon(value, plus, minus) {
  const totalMin = Math.round(Math.abs(value) * 60 * 100) / 100;  // 전체를 분 단위로
  const deg = Math.floor(totalMin / 60);
  const min = totalMin - deg * 60;
  return deg + '°' + min.toFixed(2).padStart(5, '0') + '′' + (value >= 0 ? plus : minus);
}

// 시각 "14:03:05"
function formatTime(date) {
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
}

// canvas 크기를 화면 크기에 맞추고 그리기 도구(ctx)를 돌려줌
function setupCanvas(canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;  // 고해상도 화면에서 선명하게
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: w, h: h };
}

// ---------- 상단 바 ----------
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function showClock(date) {
  show('clock',
    date.getFullYear() + '년 ' + (date.getMonth() + 1) + '월 ' + date.getDate() + '일 (' +
    DAY_NAMES[date.getDay()] + ') ' + formatTime(date));
}

// ---------- 기능01: 항해 정보 ----------
function showNav(d) {
  show('lat', formatLatLon(d.lat, 'N', 'S'));
  show('lon', formatLatLon(d.lon, 'E', 'W'));
  show('sog', d.sog.toFixed(1));
  show('cog', deg3(d.cog));
  show('heading', deg3(d.heading));
}

// ---------- 기능02: 지도와 항적 ----------
const mapCanvas = document.getElementById('map');

// 지도에 보일 범위 (위도·경도)
const MAP_AREA = { latMin: 34.45, latMax: 35.20, lonMin: 127.55, lonMax: 129.30 };
const GRID_STEP = 0.2;  // 격자선 간격(도)

function drawMap(d) {
  const { ctx, w, h } = setupCanvas(mapCanvas);
  if (w === 0 || h === 0) return;

  // 위도·경도 → 화면 좌표
  // 경도 1도는 위도 1도보다 짧으므로 cos(위도)를 곱해 모양을 맞춤
  const k = Math.cos(34.8 * Math.PI / 180);
  const lonSpan = (MAP_AREA.lonMax - MAP_AREA.lonMin) * k;
  const latSpan = MAP_AREA.latMax - MAP_AREA.latMin;
  const scale = Math.min(w / lonSpan, h / latSpan);
  const offX = (w - lonSpan * scale) / 2;
  const offY = (h - latSpan * scale) / 2;
  const toX = lon => offX + (lon - MAP_AREA.lonMin) * k * scale;
  const toY = lat => offY + (MAP_AREA.latMax - lat) * scale;

  // 1) 바다색 배경
  ctx.fillStyle = '#0f3d66';
  ctx.fillRect(0, 0, w, h);

  // 2) 위도·경도 격자선과 눈금 숫자
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '12px sans-serif';
  const x0 = toX(MAP_AREA.lonMin), x1 = toX(MAP_AREA.lonMax);
  const y0 = toY(MAP_AREA.latMax), y1 = toY(MAP_AREA.latMin);

  for (let i = Math.ceil(MAP_AREA.latMin / GRID_STEP); i * GRID_STEP <= MAP_AREA.latMax; i++) {
    const lat = i * GRID_STEP;
    const y = toY(lat);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.fillText(lat.toFixed(1) + '°N', x0 + 4, y - 4);
  }
  for (let i = Math.ceil(MAP_AREA.lonMin / GRID_STEP); i * GRID_STEP <= MAP_AREA.lonMax; i++) {
    const lon = i * GRID_STEP;
    const x = toX(lon);
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.fillText(lon.toFixed(1) + '°E', x + 4, y1 - 6);
  }

  // 3) 계획 항로: 점선
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ROUTE.forEach((p, i) => {
    if (i === 0) ctx.moveTo(toX(p.lon), toY(p.lat));
    else ctx.lineTo(toX(p.lon), toY(p.lat));
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // 4) 경유점: 작은 원 + 번호
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  for (let i = 1; i < ROUTE.length - 1; i++) {
    const x = toX(ROUTE[i].lon), y = toY(ROUTE[i].lat);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(String(i), x + 6, y + 4);
  }

  // 5) 부산항·광양항: 점 + 이름
  ctx.font = 'bold 15px sans-serif';
  [ROUTE[0], ROUTE[ROUTE.length - 1]].forEach(port => {
    const x = toX(port.lon), y = toY(port.lat);
    ctx.fillStyle = '#ff5252';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillText(port.name, x + 9, y - 8);
  });

  // 6) 지나온 항적: 실선
  const track = getTrack();
  ctx.strokeStyle = '#ffeb3b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  track.forEach((p, i) => {
    if (i === 0) ctx.moveTo(toX(p.lon), toY(p.lat));
    else ctx.lineTo(toX(p.lon), toY(p.lat));
  });
  ctx.stroke();

  // 7) 선박: 삼각형을 선수 방위 방향으로 회전
  ctx.save();
  ctx.translate(toX(d.lon), toY(d.lat));
  ctx.rotate(d.heading * Math.PI / 180);  // 북쪽(위) 0도, 시계 방향
  ctx.fillStyle = '#00e5ff';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(8, 10);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// 지도 아래: 다음 경유점까지 거리, 도착 예정 시각
function showMapInfo(d) {
  show('next-wp', ROUTE[d.nextIndex].name);
  show('dist-next', d.distToNext.toFixed(1));

  // ETA = 지금 + (남은 거리 ÷ 현재 속력)
  const hoursLeft = d.distRemaining / d.sog;
  const eta = new Date(d.time.getTime() + hoursLeft * 3600 * 1000);
  show('eta', (eta.getMonth() + 1) + '월 ' + eta.getDate() + '일 ' +
    pad2(eta.getHours()) + ':' + pad2(eta.getMinutes()));
}

// ---------- 기능03: 기상·해상 ----------
function showWeather(d) {
  // 화살표는 바람이 불어가는 방향 (풍향 + 180도)
  document.getElementById('wind-arrow').style.transform = 'rotate(' + (d.windDir + 180) + 'deg)';
  show('wind-dir', deg3(d.windDir));
  show('wind-speed', d.windSpeed.toFixed(1));
  show('wave', d.waveHeight.toFixed(1));
  show('depth', d.depth.toFixed(1));
  show('water-temp', d.waterTemp.toFixed(1));
  show('pressure', d.pressure.toFixed(1));
}

// ---------- 기능04: 기관·연료 ----------
function showEngine(d) {
  show('rpm', Math.round(d.rpm));
  show('fuel-rate', Math.round(d.fuelRate));
  show('coolant', d.coolantTemp.toFixed(1));
  show('fuel-pct', d.fuelPct.toFixed(1));
  document.getElementById('fuel-bar').style.width = d.fuelPct + '%';
}

// ---------- 기능05: 경보 ----------
const ALARM_RULES = [
  { key: 'depth',       name: '얕은 수심', unit: 'm',   isAlarm: v => v < 20 },
  { key: 'windSpeed',   name: '강풍',      unit: 'm/s', isAlarm: v => v > 20 },
  { key: 'coolantTemp', name: '엔진 과열', unit: '℃',   isAlarm: v => v > 90 },
  { key: 'fuelPct',     name: '연료 부족', unit: '%',   isAlarm: v => v < 20 },
];

const activeAlarms = {};  // 지금 경보 중인 항목 (같은 경보 중복 추가 방지용)

function checkAlarms(d) {
  ALARM_RULES.forEach(rule => {
    // 화면에 보이는 숫자(소수 첫째 자리)로 판정해야 "20.0인데 경보" 같은 혼동이 없음
    const value = Math.round(d[rule.key] * 10) / 10;
    const on = rule.isAlarm(value);

    // 해당 항목: 숫자 주황색 + 경보 이름 글자
    const item = document.getElementById('item-' + rule.key);
    item.classList.toggle('warn', on);
    item.querySelector('.tag').textContent = on ? '⚠ ' + rule.name : '';

    // 새로 시작된 경보만 목록에 추가
    if (on && !activeAlarms[rule.key]) {
      addAlarmLog(rule, value, d.time);
    }
    activeAlarms[rule.key] = on;
  });

  // 경보 중인 항목이 있는 카드는 테두리 강조
  document.querySelectorAll('.card').forEach(card => {
    card.classList.toggle('warn', card.querySelector('.item.warn') !== null);
  });
}

// 경보 목록 맨 위에 추가 (최신순)
function addAlarmLog(rule, value, time) {
  const li = document.createElement('li');
  li.innerHTML =
    '<span class="alarm-time">' + formatTime(time) + '</span>' +
    '<span class="alarm-name">' + rule.name + '</span>' +
    '<span class="alarm-value">' + value.toFixed(1) + ' ' + rule.unit + '</span>' +
    '<button>확인</button>';

  const button = li.querySelector('button');
  button.addEventListener('click', () => {
    li.classList.add('acked');  // 흐리게 표시
    button.disabled = true;
  });

  document.getElementById('alarm-list').prepend(li);
}

// ---------- 기능06: 추이 그래프 ----------
const chartCanvas = document.getElementById('chart');
const CHART_POINTS = 60;      // 최근 60초
const speedHistory = [];      // 속력 기록
const fuelRateHistory = [];   // 연료 소모량 기록

// 두 선의 모양과 세로축 범위
const SPEED_LINE = { color: '#4fc3f7', dash: [],     min: 10,  max: 16,  unit: '노트', name: '속력(노트)' };
const FUEL_LINE  = { color: '#ffd54f', dash: [6, 4], min: 400, max: 700, unit: 'L/h',  name: '연료 소모량(L/h)' };

// 1초마다 새 값을 오른쪽에 추가, 60개가 넘으면 가장 오래된 값을 뺌
function addHistory(d) {
  speedHistory.push(d.sog);
  fuelRateHistory.push(d.fuelRate);
  if (speedHistory.length > CHART_POINTS) speedHistory.shift();
  if (fuelRateHistory.length > CHART_POINTS) fuelRateHistory.shift();
}

function drawChart() {
  const { ctx, w, h } = setupCanvas(chartCanvas);
  if (w === 0 || h === 0) return;

  const left = 48, right = 48, top = 40, bottom = 22;  // 눈금 숫자를 쓸 여백
  const pw = w - left - right;   // 그래프 영역 너비
  const ph = h - top - bottom;   // 그래프 영역 높이
  const STEPS = 3;               // 세로축 눈금 칸 수

  ctx.font = '12px sans-serif';

  // 가로 눈금선 + 양쪽 세로축 눈금 숫자 (왼쪽: 속력, 오른쪽: 연료 소모량)
  for (let i = 0; i <= STEPS; i++) {
    const y = top + ph * i / STEPS;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + pw, y); ctx.stroke();

    const speedTick = SPEED_LINE.max - (SPEED_LINE.max - SPEED_LINE.min) * i / STEPS;
    const fuelTick = FUEL_LINE.max - (FUEL_LINE.max - FUEL_LINE.min) * i / STEPS;
    ctx.fillStyle = SPEED_LINE.color;
    ctx.textAlign = 'right';
    ctx.fillText(speedTick.toFixed(0), left - 6, y + 4);
    ctx.fillStyle = FUEL_LINE.color;
    ctx.textAlign = 'left';
    ctx.fillText(fuelTick.toFixed(0), left + pw + 6, y + 4);
  }

  // 세로축 단위
  ctx.fillStyle = SPEED_LINE.color;
  ctx.textAlign = 'right';
  ctx.fillText(SPEED_LINE.unit, left - 6, top - 10);
  ctx.fillStyle = FUEL_LINE.color;
  ctx.textAlign = 'left';
  ctx.fillText(FUEL_LINE.unit, left + pw + 6, top - 10);

  // 가로축 글자
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.textAlign = 'left';
  ctx.fillText('60초 전', left, h - 6);
  ctx.textAlign = 'right';
  ctx.fillText('현재', left + pw, h - 6);
  ctx.textAlign = 'left';

  // 범례
  drawLegend(ctx, left, 12, SPEED_LINE);
  drawLegend(ctx, left + 130, 12, FUEL_LINE);

  // 두 선
  drawLine(ctx, speedHistory, SPEED_LINE, left, top, pw, ph);
  drawLine(ctx, fuelRateHistory, FUEL_LINE, left, top, pw, ph);
}

// 범례 한 개: 선 모양 견본 + 이름
function drawLegend(ctx, x, y, line) {
  ctx.strokeStyle = line.color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash(line.dash);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'white';
  ctx.fillText(line.name, x + 32, y + 4);
}

// 기록 배열을 선으로 그림 (최신 값이 항상 오른쪽 끝)
function drawLine(ctx, values, line, left, top, pw, ph) {
  ctx.strokeStyle = line.color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash(line.dash);
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = left + pw * (CHART_POINTS - values.length + i) / (CHART_POINTS - 1);
    const ratio = (v - line.min) / (line.max - line.min);
    const y = top + ph * (1 - Math.min(1, Math.max(0, ratio)));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

// ---------- 1초마다 화면 전체 갱신 ----------
function render() {
  const d = getLatestData();
  showClock(d.time);
  showNav(d);          // 기능01
  drawMap(d);          // 기능02
  showMapInfo(d);
  showWeather(d);      // 기능03
  showEngine(d);       // 기능04
  checkAlarms(d);      // 기능05
  addHistory(d);       // 기능06
  drawChart();
}

// 상단 바 선명과 항로
show('ship-name', SHIP.name);
show('voyage', SHIP.from + ' → ' + SHIP.to);

render();
setInterval(render, 1000);
