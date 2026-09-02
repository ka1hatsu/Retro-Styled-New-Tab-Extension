// =========================================================
// 1. Clock & Date
// =========================================================
function pad(n) { 
  return n.toString().padStart(2, '0'); 
}

function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const meridiem = h >= 12 ? 'PM' : 'AM';
  h = h % 12; 
  if (h === 0) h = 12;
  document.getElementById('time').textContent = h + ':' + pad(now.getMinutes());
  document.getElementById('meridiem').textContent = meridiem;
  document.getElementById('date').textContent = now.toLocaleDateString(undefined, {
    weekday: 'long', 
    month: 'long', 
    day: 'numeric'
  });
}
updateClock();
setInterval(updateClock, 1000);

// =========================================================
// 2. Pixel-Art SVG Weather Icons
// =========================================================
const GRID = 16, CELL = 4;

function circleMask(cx, cy, r2) {
  return function(x, y) {
    const dx = x - cx + 0.5, dy = y - cy + 0.5;
    return (dx * dx + dy * dy) <= r2;
  };
}
function pointsMask(list) {
  return function(x, y) {
    return list.some(pt => pt[0] === x && pt[1] === y);
  };
}
function rectMask(x0, y0, x1, y1) {
  return function(x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; };
}
function unionMask(...fns) {
  return function(x, y) { return fns.some(fn => fn(x, y)); };
}
function subtractMask(a, b) {
  return function(x, y) { return a(x, y) && !b(x, y); };
}
function hline(y, x0, x1) {
  const a = [];
  for (let x = x0; x <= x1; x++) a.push([x, y]);
  return a;
}
function plus(cx, cy) {
  return [[cx, cy], [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
}

function layerRects(mask) {
  let out = '';
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (mask(x, y)) {
        out += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}"></rect>`;
      }
    }
  }
  return out;
}

function buildIconSVG(layers) {
  let out = `<svg viewBox="-6 -6 ${GRID * CELL + 12} ${GRID * CELL + 12}" shape-rendering="crispEdges">`;
  layers.forEach(layer => {
    out += `<g class="${layer.className}">${layerRects(layer.mask)}</g>`;
  });
  out += '</svg>';
  return out;
}

const CLOUD = unionMask(
  circleMask(5, 10, 10),
  circleMask(9, 9, 13),
  circleMask(12, 10, 8),
  rectMask(3, 11, 13, 12)
);

const SUN_RAYS = [[7,1],[7,2], [7,12],[7,13], [1,7],[2,7], [12,7],[13,7], [3,3],[11,3],[3,11],[11,11]];
const SUN = unionMask(circleMask(7, 7, 11), pointsMask(SUN_RAYS));
const SUN_SMALL_RAYS = [[5,0],[5,1], [0,5],[1,5], [2,2],[8,2],[2,8]];
const SUN_SMALL = unionMask(circleMask(5, 5, 8), pointsMask(SUN_SMALL_RAYS));
const MOON = subtractMask(circleMask(7, 8, 14), circleMask(10, 6, 13));
const MOON_SMALL = subtractMask(circleMask(5, 5, 9), circleMask(7, 3, 8));
const RAIN_DROPS = pointsMask([[4,13],[4,14],[8,13],[8,14],[12,13],[12,14]]);
const BOLT = pointsMask([[9,11],[8,12],[9,12],[7,13],[8,13],[6,14],[7,14],[5,15],[6,15]]);
const SNOW_DOTS = pointsMask(plus(4,14).concat(plus(8,14), plus(12,14)));
const FOG_LINES = pointsMask(hline(4,2,6).concat(hline(4,9,13), hline(7,3,12), hline(10,2,7), hline(10,10,14)));

const ICON_LAYERS = {
  clearDay:    [{mask: SUN, className: 'layer-sun'}],
  clearNight:  [{mask: MOON, className: 'layer-moon'}],
  partlyDay:   [{mask: SUN_SMALL, className: 'layer-sun'}, {mask: CLOUD, className: 'layer-cloud'}],
  partlyNight: [{mask: MOON_SMALL, className: 'layer-moon'}, {mask: CLOUD, className: 'layer-cloud'}],
  cloudy:      [{mask: CLOUD, className: 'layer-cloud'}],
  drizzle:     [{mask: CLOUD, className: 'layer-cloud'}, {mask: pointsMask([[6,13],[10,13]]), className: 'layer-rain'}],
  rain:        [{mask: CLOUD, className: 'layer-cloud'}, {mask: RAIN_DROPS, className: 'layer-rain'}],
  thunder:     [{mask: CLOUD, className: 'layer-cloud'}, {mask: BOLT, className: 'layer-bolt'}],
  snow:        [{mask: CLOUD, className: 'layer-cloud'}, {mask: SNOW_DOTS, className: 'layer-snow'}],
  fog:         [{mask: FOG_LINES, className: 'layer-fog'}]
};

const ICONS = {};
Object.keys(ICON_LAYERS).forEach(key => {
  ICONS[key] = buildIconSVG(ICON_LAYERS[key]);
});

// =========================================================
// 3. Local Procedural Nature Audio Engine
// =========================================================
let audioCtx = null;
let masterGain = null;
let activeIntervals = [];
let activeTimeouts = [];

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function stopAll() {
  activeIntervals.forEach(clearInterval);
  activeIntervals = [];
  activeTimeouts.forEach(clearTimeout);
  activeTimeouts = [];
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
}

// Generates real physical pink/brown noise buffers locally
function createNoiseBuffer(ctx, type, lengthSeconds) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * (lengthSeconds || 3);
  const buffer = ctx.createBuffer(2, bufferSize, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lastOut = 0.0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown') {
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      } else {
        // Pink noise filter calculation
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
  }
  return buffer;
}

// ---------------------------------------------------------
// Sound Scenarios
// ---------------------------------------------------------

// Drizzle: Delicate misty hiss with tiny high-frequency droplet snaps
function playDrizzle() {
  initAudio();
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer(audioCtx, 'pink', 4);
  noise.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(2800, audioCtx.currentTime);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start();

  const id = setInterval(() => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const t = audioCtx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200 + Math.random() * 1500, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.01);

    g.gain.setValueAtTime(0.015, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.01);
  }, 80);

  activeIntervals.push(id);
}

// Heavy Rain: Deep resonant ground wash + dense droplet drumming
function playHeavyRain() {
  initAudio();

  const wash = audioCtx.createBufferSource();
  wash.buffer = createNoiseBuffer(audioCtx, 'pink', 4);
  wash.loop = true;
  const washFilter = audioCtx.createBiquadFilter();
  washFilter.type = 'bandpass';
  washFilter.frequency.setValueAtTime(1600, audioCtx.currentTime);
  washFilter.Q.setValueAtTime(0.7, audioCtx.currentTime);

  const body = audioCtx.createBufferSource();
  body.buffer = createNoiseBuffer(audioCtx, 'brown', 4);
  body.loop = true;
  const bodyFilter = audioCtx.createBiquadFilter();
  bodyFilter.type = 'lowpass';
  bodyFilter.frequency.setValueAtTime(450, audioCtx.currentTime);

  const bodyGain = audioCtx.createGain();
  bodyGain.gain.setValueAtTime(0.8, audioCtx.currentTime);

  wash.connect(washFilter);
  washFilter.connect(masterGain);

  body.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(masterGain);

  wash.start();
  body.start();

  const id = setInterval(() => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const t = audioCtx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600 + Math.random() * 1200, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.025);

    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.025);
  }, 35);

  activeIntervals.push(id);
}

// Thunderstorm: Heavy rain + rolling physical lightning claps
function triggerThunderClap() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // Initial strike crack
  const crack = audioCtx.createBufferSource();
  crack.buffer = createNoiseBuffer(audioCtx, 'pink', 1);
  const crackFilter = audioCtx.createBiquadFilter();
  crackFilter.type = 'bandpass';
  crackFilter.frequency.setValueAtTime(1400, now);
  crackFilter.Q.setValueAtTime(2.0, now);
  const crackGain = audioCtx.createGain();
  crackGain.gain.setValueAtTime(0.8, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(masterGain);
  crack.start(now);
  crack.stop(now + 0.22);

  // Sub-bass resonant roll
  const rumble = audioCtx.createBufferSource();
  rumble.buffer = createNoiseBuffer(audioCtx, 'brown', 5);
  const rumbleFilter = audioCtx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.setValueAtTime(110, now);
  rumbleFilter.frequency.linearRampToValueAtTime(45, now + 4.5);

  const rumbleGain = audioCtx.createGain();
  rumbleGain.gain.setValueAtTime(0.1, now);
  rumbleGain.gain.linearRampToValueAtTime(0.9, now + 0.35);
  rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.0);

  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(masterGain);
  rumble.start(now);
  rumble.stop(now + 5.2);
}

function playThunderstorm() {
  playHeavyRain();
  triggerThunderClap();

  function nextStrike() {
    triggerThunderClap();
    const delay = 6000 + Math.random() * 8000;
    const tid = setTimeout(nextStrike, delay);
    activeTimeouts.push(tid);
  }

  const tid = setTimeout(nextStrike, 5000);
  activeTimeouts.push(tid);
}

// Sunny Birds: Multi-note warbler whistles with organic pauses
function playBirdChirp() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const notes = [
    { start: 2800, end: 3800, dur: 0.08, pause: 0.04 },
    { start: 3900, end: 3200, dur: 0.12, pause: 0.06 },
    { start: 3300, end: 4600, dur: 0.15, pause: 0 }
  ];

  let elapsed = 0;
  notes.forEach(n => {
    const t = now + elapsed;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(n.start, t);
    osc.frequency.exponentialRampToValueAtTime(n.end, t + n.dur);

    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + n.dur);
    elapsed += n.dur + n.pause;
  });
}

function playSunnyBirds() {
  initAudio();

  // Background light air
  const air = audioCtx.createBufferSource();
  air.buffer = createNoiseBuffer(audioCtx, 'pink', 4);
  air.loop = true;
  const airFilter = audioCtx.createBiquadFilter();
  airFilter.type = 'bandpass';
  airFilter.frequency.setValueAtTime(350, audioCtx.currentTime);
  const airGain = audioCtx.createGain();
  airGain.gain.setValueAtTime(0.2, audioCtx.currentTime);

  air.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(masterGain);
  air.start();

  function nextBird() {
    playBirdChirp();
    const delay = 2000 + Math.random() * 4000;
    const tid = setTimeout(nextBird, delay);
    activeTimeouts.push(tid);
  }
  nextBird();
}

// Night Crickets: True stridulation rasp pulses with silence intervals
function chirpCricket() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const pulses = 3 + Math.floor(Math.random() * 3);

  for (let i = 0; i < pulses; i++) {
    const t = now + i * 0.032;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(4600 + Math.random() * 200, t);

    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.018);
  }
}

function playNightCrickets() {
  initAudio();

  // Night breeze
  const breeze = audioCtx.createBufferSource();
  breeze.buffer = createNoiseBuffer(audioCtx, 'pink', 4);
  breeze.loop = true;
  const bFilter = audioCtx.createBiquadFilter();
  bFilter.type = 'lowpass';
  bFilter.frequency.setValueAtTime(260, audioCtx.currentTime);
  const bGain = audioCtx.createGain();
  bGain.gain.setValueAtTime(0.2, audioCtx.currentTime);

  breeze.connect(bFilter);
  bFilter.connect(bGain);
  bGain.connect(masterGain);
  breeze.start();

  function nextCricket() {
    chirpCricket();
    const delay = 1200 + Math.random() * 2800;
    const tid = setTimeout(nextCricket, delay);
    activeTimeouts.push(tid);
  }
  nextCricket();
}

// Breeze: Rolling smooth wind sweep
function playBreeze() {
  initAudio();
  const wind = audioCtx.createBufferSource();
  wind.buffer = createNoiseBuffer(audioCtx, 'pink', 4);
  wind.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(300, audioCtx.currentTime);
  filter.Q.setValueAtTime(1.4, audioCtx.currentTime);

  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.setValueAtTime(0.12, audioCtx.currentTime);
  lfoGain.gain.setValueAtTime(120, audioCtx.currentTime);
  lfo.connect(filter.frequency);
  lfo.start();

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);

  wind.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  wind.start();
}

// Blizzard: Piercing high-pitch winter gale
function playBlizzard() {
  initAudio();
  const wind = audioCtx.createBufferSource();
  wind.buffer = createNoiseBuffer(audioCtx, 'pink', 4);
  wind.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(550, audioCtx.currentTime);
  filter.Q.setValueAtTime(2.8, audioCtx.currentTime);

  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.setValueAtTime(0.45, audioCtx.currentTime);
  lfoGain.gain.setValueAtTime(250, audioCtx.currentTime);
  lfo.connect(filter.frequency);
  lfo.start();

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.7, audioCtx.currentTime);

  wind.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  wind.start();
}

// ---------------------------------------------------------
// Master Sound Dispatcher
// ---------------------------------------------------------
function applySoundProfile(profileKey) {
  stopAll();
  if (!isSoundEnabled) return;

  switch (profileKey) {
    case 'drizzle':
      playDrizzle();
      break;
    case 'rain':
      playHeavyRain();
      break;
    case 'thunder':
      playThunderstorm();
      break;
    case 'clearDay':
      playSunnyBirds();
      break;
    case 'clearNight':
      playNightCrickets();
      break;
    case 'snow':
      playBlizzard();
      break;
    case 'cloudy':
    case 'fog':
    default:
      playBreeze();
      break;
  }
}

// =========================================================
// 4. UI Soundboard & Preference State
// =========================================================
let isSoundEnabled = localStorage.getItem('retro_sound_enabled') === 'true';
let selectedPreset = 'auto';
let liveDetectedWeather = 'clearNight';

const soundBtn = document.getElementById('sound-btn');
const soundChips = document.querySelectorAll('.chip');

function updateMasterButtonUI() {
  if (!soundBtn) return;
  if (isSoundEnabled) {
    soundBtn.textContent = '[ SOUND: ON ]';
    soundBtn.classList.add('playing');
  } else {
    soundBtn.textContent = '[ SOUND: OFF ]';
    soundBtn.classList.remove('playing');
  }
}

function resolveActiveProfile() {
  return (selectedPreset === 'auto') ? liveDetectedWeather : selectedPreset;
}

if (soundBtn) {
  soundBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem('retro_sound_enabled', isSoundEnabled);
    updateMasterButtonUI();

    if (isSoundEnabled) {
      applySoundProfile(resolveActiveProfile());
    } else {
      stopAll();
    }
  });
  updateMasterButtonUI();
}

soundChips.forEach(chip => {
  chip.addEventListener('click', () => {
    soundChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    selectedPreset = chip.dataset.sound;
    
    if (!isSoundEnabled) {
      isSoundEnabled = true;
      localStorage.setItem('retro_sound_enabled', 'true');
      updateMasterButtonUI();
    }
    
    applySoundProfile(resolveActiveProfile());
  });
});

// =========================================================
// 5. Open-Meteo Weather Mapping API
// =========================================================
function codeToCategory(code, isDay) {
  if (code === 0) return isDay ? 'clearDay' : 'clearNight';
  if ([1, 2].includes(code)) return isDay ? 'partlyDay' : 'partlyNight';
  if (code === 3) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'cloudy';
}

function codeToLabel(code) {
  if (code === 0) return 'clear sky';
  if ([1, 2].includes(code)) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if ([45, 48].includes(code)) return 'foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  return 'clear';
}

function renderWeather(temp, code, isDay) {
  const category = codeToCategory(code, isDay);
  document.getElementById('weather-icon').innerHTML = ICONS[category] || ICONS.cloudy;
  document.getElementById('temp').innerHTML = Math.round(temp) + '&deg;C';
  document.getElementById('condition').textContent = codeToLabel(code);
  
  liveDetectedWeather = (category === 'partlyDay') ? 'clearDay' : 
                        (category === 'partlyNight') ? 'clearNight' : category;

  if (selectedPreset === 'auto' && isSoundEnabled) {
    applySoundProfile(liveDetectedWeather);
  }
}

document.getElementById('weather-icon').innerHTML = ICONS.cloudy;

function fetchWeather(lat, lon) {
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
    .then(res => res.json())
    .then(data => {
      if (data && data.current_weather) {
        const cw = data.current_weather;
        renderWeather(cw.temperature, cw.weathercode, cw.is_day === 1);
      }
    })
    .catch(() => {
      document.getElementById('condition').textContent = 'weather offline';
    });
}

function initGeolocationWeather() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      position => {
        fetchWeather(position.coords.latitude, position.coords.longitude);
      },
      error => {
        console.warn("Geolocation fallback applied:", error.message);
        document.getElementById('condition').textContent = 'location blocked (defaulting)';
        fetchWeather(28.6139, 77.2090);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 600000 }
    );
  } else {
    document.getElementById('condition').textContent = 'geo unsupported';
    fetchWeather(28.6139, 77.2090);
  }
}

initGeolocationWeather();
