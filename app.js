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
// 3. Hyper-Realistic Procedural Nature Audio Engine
// =========================================================
let audioCtx = null;
let masterGain = null;
let masterCompressor = null;
let rainGain = null;
let rainFilter = null;
let activeNodes = [];
let activeTimeouts = [];
let isCalmedPhase = false;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.58, audioCtx.currentTime);

    // A gentle safety limiter preserves dynamics without digital clipping.
    masterCompressor = audioCtx.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-10, audioCtx.currentTime);
    masterCompressor.knee.setValueAtTime(12, audioCtx.currentTime);
    masterCompressor.ratio.setValueAtTime(6, audioCtx.currentTime);
    masterCompressor.attack.setValueAtTime(0.008, audioCtx.currentTime);
    masterCompressor.release.setValueAtTime(0.32, audioCtx.currentTime);
    masterGain.connect(masterCompressor);
    masterCompressor.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function stopAll() {
  activeTimeouts.forEach(clearTimeout);
  activeTimeouts = [];

  activeNodes.forEach(node => {
    try {
      if (typeof node.stop === 'function') node.stop();
      if (typeof node.disconnect === 'function') node.disconnect();
    } catch {}
  });
  activeNodes = [];

  rainGain = null;
  rainFilter = null;
  isCalmedPhase = false;

  // Keep the context alive. Recreating it on every weather update causes clicks
  // and can hit the browser's AudioContext limit.
}

function createNoiseBuffer(ctx, type, lengthSeconds = 8) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.max(1, Math.floor(sampleRate * lengthSeconds));
  const buffer = ctx.createBuffer(2, bufferSize, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let lastBrown = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown') {
        data[i] = (lastBrown + (0.02 * white)) / 1.02;
        lastBrown = data[i];
        data[i] *= 3.8;
      } else if (type === 'white') {
        data[i] = white;
      } else {
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

function track(...nodes) {
  activeNodes.push(...nodes);
  return nodes[0];
}

function schedule(callback, delay) {
  const id = setTimeout(() => {
    activeTimeouts = activeTimeouts.filter(item => item !== id);
    callback();
  }, delay);
  activeTimeouts.push(id);
  return id;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function makeStereoDelay(destination, wet = 0.12) {
  // Tiny, unequal reflections add outdoor depth without a metallic reverb tail.
  const input = audioCtx.createGain();
  const dry = audioCtx.createGain();
  const leftDelay = audioCtx.createDelay(0.2);
  const rightDelay = audioCtx.createDelay(0.2);
  const merger = audioCtx.createChannelMerger(2);
  const wetGain = audioCtx.createGain();
  dry.gain.value = 1 - wet * 0.45;
  leftDelay.delayTime.value = 0.037;
  rightDelay.delayTime.value = 0.061;
  wetGain.gain.value = wet;
  input.connect(dry).connect(destination);
  input.connect(leftDelay).connect(merger, 0, 0);
  input.connect(rightDelay).connect(merger, 0, 1);
  merger.connect(wetGain).connect(destination);
  track(input, dry, leftDelay, rightDelay, merger, wetGain);
  return input;
}

// Safe stereo panner creation (falls back to an inert gain node if unsupported)
function pan(value) {
  try {
    const p = audioCtx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, value)), audioCtx.currentTime);
    return p;
  } catch {
    return audioCtx.createGain();
  }
}

// ---------------------------------------------------------
// Individual Raindrop Impact ("tick" against a surface)
// ---------------------------------------------------------
function spawnDroplet(destination, sharedBuffer, loudness = 1) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const src = audioCtx.createBufferSource();
  src.buffer = sharedBuffer;
  src.playbackRate.setValueAtTime(0.8 + Math.random() * 0.6, now);

  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(randomBetween(1100, 4300), now);
  bp.Q.setValueAtTime(randomBetween(0.7, 2.1), now);

  const g = audioCtx.createGain();
  const peak = randomBetween(0.012, 0.045) * loudness;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, now + randomBetween(0.025, 0.075));

  const p = pan(-0.8 + Math.random() * 1.6);

  src.connect(bp);
  bp.connect(g);
  g.connect(p);
  p.connect(destination);

  src.start(now);
  src.stop(now + 0.11);
  src.addEventListener('ended', () => {
    src.disconnect(); bp.disconnect(); g.disconnect(); p.disconnect();
  }, { once: true });
}

// ---------------------------------------------------------
// Smooth Continuous Rainfall (bed + ground body + droplet texture)
// ---------------------------------------------------------
function startNaturalRain(initialVolume = 0.75, dropletDensity = 1) {
  initAudio();

  rainGain = audioCtx.createGain();
  rainGain.gain.setValueAtTime(initialVolume * 0.62, audioCtx.currentTime);
  rainGain.connect(masterGain);
  activeNodes.push(rainGain);

  // --- Continuous airborne "hiss" bed ---
  const rainSource = audioCtx.createBufferSource();
  rainSource.buffer = createNoiseBuffer(audioCtx, 'pink', 8);
  rainSource.loop = true;

  rainFilter = audioCtx.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.setValueAtTime(1250, audioCtx.currentTime);
  rainFilter.Q.setValueAtTime(0.42, audioCtx.currentTime);

  rainSource.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainSource.start();
  activeNodes.push(rainSource, rainFilter);

  // Subtle amplitude "breathing" so the bed doesn't sound perfectly static
  const hissLfo = audioCtx.createOscillator();
  const hissLfoGain = audioCtx.createGain();
  hissLfo.frequency.setValueAtTime(0.07 + Math.random() * 0.05, audioCtx.currentTime);
  hissLfoGain.gain.setValueAtTime(initialVolume * 0.045, audioCtx.currentTime);
  hissLfo.connect(hissLfoGain);
  hissLfoGain.connect(rainGain.gain);
  hissLfo.start();
  activeNodes.push(hissLfo, hissLfoGain);

  // --- Low-end "ground / surface" body ---
  const groundSource = audioCtx.createBufferSource();
  groundSource.buffer = createNoiseBuffer(audioCtx, 'brown', 8);
  groundSource.loop = true;

  const groundFilter = audioCtx.createBiquadFilter();
  groundFilter.type = 'lowpass';
  groundFilter.frequency.setValueAtTime(240, audioCtx.currentTime);

  const groundGain = audioCtx.createGain();
  groundGain.gain.setValueAtTime(0.22, audioCtx.currentTime);

  groundSource.connect(groundFilter);
  groundFilter.connect(groundGain);
  groundGain.connect(rainGain);
  groundSource.start();
  activeNodes.push(groundSource, groundFilter, groundGain);

  // --- Individual droplet impacts (gives the rain its "texture") ---
  const dropletBuffer = createNoiseBuffer(audioCtx, 'white', 0.25);
  function scheduleDroplets() {
    if (!audioCtx) return;
    const burstCount = 1 + Math.floor(Math.random() * 3 * dropletDensity);
    for (let i = 0; i < burstCount; i++) {
      spawnDroplet(rainGain, dropletBuffer, randomBetween(0.65, 1.15));
    }
    schedule(scheduleDroplets, randomBetween(22, 62) / dropletDensity);
  }
  scheduleDroplets();
}

// ---------------------------------------------------------
// Natural rolling thunder: pressure swell -> uneven low rumble -> distant tail.
// There is deliberately no synthetic crack/crash transient.
// ---------------------------------------------------------
function triggerNaturalThunder(isDistant = false) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const duration = isDistant ? randomBetween(8, 11) : randomBetween(10, 14);
  const thunderBus = makeStereoDelay(masterGain, isDistant ? 0.2 : 0.13);

  [
    { type: 'brown', hz: isDistant ? 62 : 82, q: 0.55, level: isDistant ? 0.35 : 0.62 },
    { type: 'pink', hz: isDistant ? 145 : 205, q: 0.7, level: isDistant ? 0.09 : 0.18 }
  ].forEach((layer, index) => {
    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    source.buffer = createNoiseBuffer(audioCtx, layer.type, duration + 0.5);
    filter.type = 'lowpass';
    filter.frequency.value = layer.hz;
    filter.Q.value = layer.q;
    gain.gain.setValueAtTime(0.0001, now);
    const attack = (isDistant ? 1.7 : 0.75) + index * 0.35;
    gain.gain.exponentialRampToValueAtTime(layer.level, now + attack);
    // Uneven rolling peaks imitate several echo paths across cloud layers.
    gain.gain.linearRampToValueAtTime(layer.level * 0.42, now + duration * 0.32);
    gain.gain.linearRampToValueAtTime(layer.level * 0.72, now + duration * 0.49);
    gain.gain.linearRampToValueAtTime(layer.level * 0.24, now + duration * 0.68);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(thunderBus);
    source.start(now);
    source.stop(now + duration + 0.1);
    source.addEventListener('ended', () => {
      source.disconnect(); filter.disconnect(); gain.disconnect();
    }, { once: true });
  });
}

// ---------------------------------------------------------
// Master Thunderstorm Transition Flow (15 Minutes)
// ---------------------------------------------------------
function playThunderstorm() {
  stopAll();
  isCalmedPhase = false;

  // 1. Immediately start natural heavy rain with dense droplet texture
  startNaturalRain(0.8, 1.4);

  function scheduleHeavyStrike() {
    if (isCalmedPhase || !audioCtx) return;
    triggerNaturalThunder(false);
    schedule(scheduleHeavyStrike, randomBetween(18000, 34000));
  }

  schedule(scheduleHeavyStrike, 3500);

  function scheduleDistantStrike() {
    if (!audioCtx) return;
    triggerNaturalThunder(true);
    schedule(scheduleDistantStrike, randomBetween(30000, 52000));
  }

  // 2. Exactly 15 Minutes (900,000 ms) Transition
  const transitionTid = setTimeout(() => {
    if (!audioCtx) return;
    isCalmedPhase = true;

    const now = audioCtx.currentTime;
    if (rainGain) {
      rainGain.gain.cancelScheduledValues(now);
      rainGain.gain.setValueAtTime(rainGain.gain.value, now);
      rainGain.gain.linearRampToValueAtTime(0.3, now + 18);
    }
    if (rainFilter) {
      rainFilter.frequency.cancelScheduledValues(now);
      rainFilter.frequency.setValueAtTime(rainFilter.frequency.value, now);
      rainFilter.frequency.linearRampToValueAtTime(800, now + 18);
    }

    schedule(scheduleDistantStrike, 7000);
  }, 15 * 60 * 1000);

  activeTimeouts.push(transitionTid);
}

// ---------------------------------------------------------
// Other Ambient Environments
// ---------------------------------------------------------
function playDrizzle() {
  stopAll();
  startNaturalRain(0.4, 0.4);
  if (rainFilter) {
    rainFilter.frequency.setValueAtTime(1100, audioCtx.currentTime);
  }
}

function playSunnyBirds() {
  stopAll();
  initAudio();

  const air = audioCtx.createBufferSource();
  air.buffer = createNoiseBuffer(audioCtx, 'pink', 4);
  air.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(260, audioCtx.currentTime);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.09, audioCtx.currentTime);

  air.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  air.start();
  activeNodes.push(air, filter, gain);

  const birdSpace = makeStereoDelay(masterGain, 0.16);

  // Each voice has its own habitat position and phrase contour. A modulated
  // carrier plus a filtered breath layer avoids the toy whistle sound.
  const voices = [
    { baseFreq: 2850, panPos: -0.62, minGap: 2600, maxGap: 6600, contour: [1, 1.22, 0.88] },
    { baseFreq: 2150, panPos: 0.48, minGap: 3800, maxGap: 8200, contour: [1, 0.91, 1.16, 0.82] },
    { baseFreq: 3650, panPos: 0.08, minGap: 5200, maxGap: 11000, contour: [1, 1.3] }
  ];

  voices.forEach(voice => {
    function chirp() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const p = pan(voice.panPos + (Math.random() * 0.2 - 0.1));
      p.connect(birdSpace);

      voice.contour.forEach((ratio, n) => {
        const t = now + n * randomBetween(0.09, 0.145);
        const osc = audioCtx.createOscillator();
        const mod = audioCtx.createOscillator();
        const modGain = audioCtx.createGain();
        const g = audioCtx.createGain();
        const startFreq = voice.baseFreq * ratio * randomBetween(0.96, 1.04);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, t);
        osc.frequency.exponentialRampToValueAtTime(startFreq * randomBetween(1.08, 1.28), t + 0.035);
        osc.frequency.exponentialRampToValueAtTime(startFreq * randomBetween(0.82, 0.96), t + 0.115);
        mod.frequency.value = randomBetween(24, 38);
        modGain.gain.value = randomBetween(35, 85);
        mod.connect(modGain).connect(osc.frequency);

        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(randomBetween(0.018, 0.035), t + 0.014);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.125);

        osc.connect(g);
        g.connect(p);
        mod.start(t);
        osc.start(t);
        mod.stop(t + 0.14);
        osc.stop(t + 0.14);
      });

      schedule(chirp, randomBetween(voice.minGap, voice.maxGap));
    }
    schedule(chirp, Math.random() * 2600);
  });
}

function playNightCrickets() {
  stopAll();
  initAudio();

  const breeze = audioCtx.createBufferSource();
  breeze.buffer = createNoiseBuffer(audioCtx, 'brown', 4);
  breeze.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(220, audioCtx.currentTime);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.075, audioCtx.currentTime);

  breeze.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  breeze.start();
  activeNodes.push(breeze, filter, gain);

  // Filtered-noise stridulation has the rough, organic texture of real wings.
  const species = [
    { freq: 4850, pulsesPerChirp: 4, pulseGap: 0.031, panPos: -0.55, minGap: 650, maxGap: 1700 },
    { freq: 3950, pulsesPerChirp: 5, pulseGap: 0.043, panPos: 0.42, minGap: 1100, maxGap: 2900 },
    { freq: 5650, pulsesPerChirp: 3, pulseGap: 0.026, panPos: 0.05, minGap: 1900, maxGap: 4300 }
  ];

  species.forEach(sp => {
    function stridulate() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const p = pan(sp.panPos + (Math.random() * 0.15 - 0.075));
      p.connect(masterGain);
      const chirpNoise = createNoiseBuffer(audioCtx, 'white', 0.35);

      for (let i = 0; i < sp.pulsesPerChirp; i++) {
        const t = now + i * sp.pulseGap;
        const src = audioCtx.createBufferSource();
        const bp = audioCtx.createBiquadFilter();
        const g = audioCtx.createGain();
        src.buffer = chirpNoise;
        bp.type = 'bandpass';
        bp.frequency.value = sp.freq + randomBetween(-130, 130);
        bp.Q.value = randomBetween(14, 23);

        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(randomBetween(0.025, 0.042), t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.021);

        src.connect(bp).connect(g);
        g.connect(p);
        src.start(t);
        src.stop(t + 0.026);
      }

      schedule(stridulate, randomBetween(sp.minGap, sp.maxGap));
    }
    schedule(stridulate, Math.random() * 1400);
  });
}

function playWind() {
  stopAll();
  initAudio();

  // Layer 1: broad low turbulence
  const wind = audioCtx.createBufferSource();
  wind.buffer = createNoiseBuffer(audioCtx, 'brown', 6);
  wind.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(320, audioCtx.currentTime);
  filter.Q.setValueAtTime(1.2, audioCtx.currentTime);

  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.setValueAtTime(0.1, audioCtx.currentTime);
  lfoGain.gain.setValueAtTime(140, audioCtx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.45, audioCtx.currentTime);

  wind.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  wind.start();
  activeNodes.push(wind, filter, lfo, lfoGain, gain);

  // Layer 2: higher "whistling" edge that swells with gusts
  const edge = audioCtx.createBufferSource();
  edge.buffer = createNoiseBuffer(audioCtx, 'pink', 6);
  edge.loop = true;

  const edgeFilter = audioCtx.createBiquadFilter();
  edgeFilter.type = 'bandpass';
  edgeFilter.frequency.setValueAtTime(900, audioCtx.currentTime);
  edgeFilter.Q.setValueAtTime(2.2, audioCtx.currentTime);

  const edgeLfo = audioCtx.createOscillator();
  const edgeLfoGain = audioCtx.createGain();
  edgeLfo.frequency.setValueAtTime(0.045, audioCtx.currentTime);
  edgeLfoGain.gain.setValueAtTime(300, audioCtx.currentTime);
  edgeLfo.connect(edgeLfoGain);
  edgeLfoGain.connect(edgeFilter.frequency);
  edgeLfo.start();

  const edgeGain = audioCtx.createGain();
  edgeGain.gain.setValueAtTime(0.08, audioCtx.currentTime);

  edge.connect(edgeFilter);
  edgeFilter.connect(edgeGain);
  edgeGain.connect(masterGain);
  edge.start();
  activeNodes.push(edge, edgeFilter, edgeLfo, edgeLfoGain, edgeGain);

  // Occasional stronger gusts swelling the overall level
  function scheduleGust() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const dur = 2 + Math.random() * 3;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0.7 + Math.random() * 0.25, now + dur * 0.4);
    gain.gain.linearRampToValueAtTime(0.4, now + dur);

    schedule(scheduleGust, randomBetween(7000, 16000));
  }
  schedule(scheduleGust, 3000);
}

// ---------------------------------------------------------
// Master Sound Dispatcher
// ---------------------------------------------------------
function applySoundProfile(profileKey) {
  stopAll();
  if (!isSoundEnabled) return;

  switch (profileKey) {
    case 'thunder':
      playThunderstorm();
      break;
    case 'rain':
      startNaturalRain(0.75, 1);
      break;
    case 'drizzle':
      playDrizzle();
      break;
    case 'clearDay':
      playSunnyBirds();
      break;
    case 'clearNight':
      playNightCrickets();
      break;
    case 'snow':
    case 'cloudy':
    case 'fog':
    default:
      playWind();
      break;
  }
}

// =========================================================
// 4. State & Controls
// =========================================================
let isSoundEnabled = localStorage.getItem('retro_sound_enabled') === 'true';
let selectedPreset = localStorage.getItem('retro_sound_preset') || 'auto';
let liveDetectedWeather = 'thunder';

const soundBtn = document.getElementById('sound-btn');
const presetButtons = [...document.querySelectorAll('[data-sound]')];

function updateMasterButtonUI() {
  if (!soundBtn) return;
  if (isSoundEnabled) {
    soundBtn.textContent = ' SOUND: ON ';
    soundBtn.classList.add('playing');
  } else {
    soundBtn.textContent = ' SOUND: OFF ';
    soundBtn.classList.remove('playing');
  }
  soundBtn.setAttribute('aria-pressed', String(isSoundEnabled));
}

function updatePresetUI() {
  presetButtons.forEach(button => {
    const active = button.dataset.sound === selectedPreset;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function resolveActiveProfile() {
  return (selectedPreset === 'auto') ? liveDetectedWeather : selectedPreset;
}

function handleToggleSound() {
  isSoundEnabled = !isSoundEnabled;
  localStorage.setItem('retro_sound_enabled', isSoundEnabled);
  updateMasterButtonUI();

  if (isSoundEnabled) {
    initAudio();
    applySoundProfile(resolveActiveProfile());
  } else {
    stopAll();
  }
}

if (soundBtn) {
  soundBtn.addEventListener('click', handleToggleSound);
  updateMasterButtonUI();
}

presetButtons.forEach(button => {
  button.addEventListener('click', () => {
    selectedPreset = button.dataset.sound;
    localStorage.setItem('retro_sound_preset', selectedPreset);
    updatePresetUI();
    if (!isSoundEnabled) {
      isSoundEnabled = true;
      localStorage.setItem('retro_sound_enabled', 'true');
      updateMasterButtonUI();
    }
    initAudio();
    applySoundProfile(resolveActiveProfile());
  });
});
updatePresetUI();

document.addEventListener('keydown', (event) => {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
    return;
  }
  if (event.key.toLowerCase() === 'm') {
    event.preventDefault(); 
    handleToggleSound();
  }
});

document.addEventListener('click', function unlockContext() {
  if (isSoundEnabled && !audioCtx) {
    initAudio();
    applySoundProfile(resolveActiveProfile());
  }
}, { once: true });

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
    .then(res => {
      if (!res.ok) throw new Error(`Weather request failed: ${res.status}`);
      return res.json();
    })
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

// The placeholder promises URL navigation as well as search, so honour both.
const searchForm = document.querySelector('.search-form');
if (searchForm) {
  searchForm.addEventListener('submit', event => {
    const input = searchForm.elements.q;
    const value = input.value.trim();
    if (!value || /\s/.test(value)) return;
    const looksLikeUrl = /^(https?:\/\/|localhost(?::\d+)?(?:\/|$)|(?:[\w-]+\.)+[a-z]{2,}(?:[/:?#]|$))/i.test(value);
    if (looksLikeUrl) {
      event.preventDefault();
      window.location.href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    }
  });
}
