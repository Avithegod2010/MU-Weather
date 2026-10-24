// MU Weather site v3 — living sky engine + interactions. No dependencies.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover)').matches;

  /* ── weather modes: page theme + phone content ── */
  var PHONE = {
    clear: {
      temp: 21, cond: 'Clear night', feels: 'Feels like 20° — a perfect evening',
      hi: '23°', lo: '14°', warn: null,
      hours: [['Now', 21, .05], ['10PM', 20, .1], ['11PM', 18, .15], ['12AM', 17, .05], ['1AM', 16, 0], ['2AM', 15, 0]],
    },
    rain: {
      temp: 9, cond: 'Rainy', feels: 'Feels like 7° — the humidity talking',
      hi: '12°', lo: '8°', warn: null,
      hours: [['Now', 9, .95], ['10PM', 9, .9], ['11PM', 8, .75], ['12AM', 8, .6], ['1AM', 7, .45], ['2AM', 7, .3]],
    },
    snow: {
      temp: -3, cond: 'Snow', feels: 'Feels like −9° — wrap up warm',
      hi: '-1°', lo: '-6°', warn: null,
      hours: [['Now', -3, .9], ['10PM', -3, .85], ['11PM', -4, .7], ['12AM', -4, .6], ['1AM', -5, .5], ['2AM', -5, .4]],
    },
    storm: {
      temp: 14, cond: 'Thunderstorms', feels: 'Feels like 14° — electric air',
      hi: '16°', lo: '12°', warn: 'Severe thunderstorm warning · until 9 PM',
      hours: [['Now', 14, 1], ['10PM', 14, .9], ['11PM', 13, .8], ['12AM', 13, .85], ['1AM', 12, .7], ['2AM', 12, .6]],
    },
  };

  var mode = 'clear';

  function setPhone(m) {
    var d = PHONE[m];
    var phone = document.querySelector('.phone');
    if (!phone) return;
    phone.className = 'phone ph-' + m;
    var q = function (id) { return document.getElementById(id); };
    if (q('phTemp')) q('phTemp').textContent = d.temp;
    if (q('phCond')) q('phCond').textContent = d.cond;
    if (q('phFeels')) q('phFeels').textContent = d.feels;
    if (q('phHi')) q('phHi').textContent = d.hi;
    if (q('phLo')) q('phLo').textContent = d.lo;
    var warn = q('phWarn');
    if (warn) {
      if (d.warn) { q('phWarnText').textContent = d.warn; warn.classList.remove('hidden'); }
      else warn.classList.add('hidden');
    }
    var strip = q('phStrip');
    if (strip) {
      var hours = strip.querySelectorAll('.scr-hour');
      d.hours.forEach(function (h, i) {
        var el = hours[i];
        if (!el) return;
        el.querySelector('span').textContent = h[0];
        el.querySelector('b').textContent = h[1] + '°';
        el.querySelector('i').style.setProperty('--p', h[2]);
      });
    }
  }

  function setMode(m) {
    mode = m;
    document.body.className = 'wx-' + m;
    setPhone(m);
    document.querySelectorAll('.wx-chip').forEach(function (chip) {
      chip.setAttribute('aria-pressed', chip.dataset.mode === m ? 'true' : 'false');
    });
  }

  document.querySelectorAll('.wx-chip').forEach(function (chip) {
    chip.addEventListener('click', function () { setMode(chip.dataset.mode); });
  });

  /* ── cursor: smoothed pointer for wind, parallax, glow, tilt ── */
  var mx = 0.5, my = 0.5, smx = 0.5, smy = 0.5;
  window.addEventListener('pointermove', function (e) {
    mx = e.clientX / window.innerWidth;
    my = e.clientY / window.innerHeight;
  }, { passive: true });

  /* ── canvas sky engine ── */
  var canvas = document.getElementById('sky-canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  var rand = function (a, b) { return a + Math.random() * (b - a); };

  var stars = [];
  for (var i = 0; i < 190; i++) {
    stars.push({
      x: Math.random(), y: Math.random() * 0.92,
      r: rand(0.4, 1.5), depth: rand(0.25, 1),
      phase: rand(0, Math.PI * 2), speed: rand(0.4, 1.4),
      warm: Math.random() < 0.16,
    });
  }

  var clouds = [];
  for (var c = 0; c < 6; c++) {
    clouds.push({
      x: Math.random(), y: rand(0.04, 0.34), s: rand(0.1, 0.24),
      v: rand(0.006, 0.02), depth: rand(0.3, 1), seed: c,
    });
  }

  var drops = [], splashes = [], flakes = [], shooters = [];
  var mix = { rain: 0, snow: 0, storm: 0 };   // eased 0..1 per weather
  var starAlpha = 0.85;
  var flashAlpha = 0, bolt = null, nextFlash = 0;
  var t0 = performance.now();

  function targets() {
    return {
      rain: (mode === 'rain' || mode === 'storm') ? 1 : 0,
      snow: mode === 'snow' ? 1 : 0,
      storm: mode === 'storm' ? 1 : 0,
      star: (mode === 'clear' || mode === 'snow') ? 0.85 : 0.3,
    };
  }

  function drawCloud(t) {
    var g = ctx.createRadialGradient(t.x * W, t.y * H, 0, t.x * W, t.y * H, t.s * W);
    var a = { clear: 0.16, rain: 0.42, snow: 0.3, storm: 0.5 }[mode] || 0.3;
    g.addColorStop(0, 'rgba(150,170,215,' + a + ')');
    g.addColorStop(1, 'rgba(150,170,215,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x * W, t.y * H, t.s * W, 0, Math.PI * 2);
    ctx.fill();
  }

  function spawnBolt() {
    var pts = [];
    var x = rand(0.15, 0.85) * W, y = -10;
    pts.push([x, y]);
    while (y < H * rand(0.45, 0.8)) {
      x += rand(-46, 46); y += rand(28, 64);
      pts.push([x, y]);
    }
    bolt = { pts: pts, life: 1 };
    var ov = document.getElementById('flash-overlay');
    if (ov) { ov.classList.remove('on'); void ov.offsetWidth; ov.classList.add('on'); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    var t = (now - t0) / 1000;
    var tg = targets();

    // eased transitions
    mix.rain += (tg.rain - mix.rain) * 0.03;
    mix.snow += (tg.snow - mix.snow) * 0.02;
    mix.storm += (tg.storm - mix.storm) * 0.03;
    starAlpha += (tg.star - starAlpha) * 0.04;
    smx += (mx - smx) * 0.06; smy += (my - smy) * 0.06;

    var wind = (smx - 0.5) * (0.6 + mix.storm * 1.6 + mix.rain * 0.6);

    ctx.clearRect(0, 0, W, H);

    // stars (twinkle + mouse parallax)
    for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      var tw = 0.5 + 0.5 * Math.sin(t * st.speed + st.phase);
      var a = starAlpha * (0.35 + 0.65 * tw);
      var px = st.x * W + (smx - 0.5) * 26 * st.depth;
      var py = st.y * H + (smy - 0.5) * 14 * st.depth;
      ctx.beginPath();
      ctx.fillStyle = st.warm ? 'rgba(245,200,106,' + a + ')' : 'rgba(232,238,247,' + a + ')';
      ctx.arc(px, py, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // shooting stars (calm modes)
    if ((mode === 'clear' || mode === 'snow') && Math.random() < 0.004 && shooters.length < 2) {
      shooters.push({ x: rand(0.3, 0.95) * W, y: rand(0, 0.2) * H, vx: -rand(380, 560), vy: rand(160, 260), life: 1 });
    }
    for (var sh = shooters.length - 1; sh >= 0; sh--) {
      var s2 = shooters[sh];
      s2.x += s2.vx / 60; s2.y += s2.vy / 60; s2.life -= 0.016;
      if (s2.life <= 0) { shooters.splice(sh, 1); continue; }
      var grad = ctx.createLinearGradient(s2.x, s2.y, s2.x - s2.vx * 0.12, s2.y - s2.vy * 0.12);
      grad.addColorStop(0, 'rgba(255,255,255,' + (0.9 * s2.life) + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s2.x, s2.y);
      ctx.lineTo(s2.x - s2.vx * 0.12, s2.y - s2.vy * 0.12); ctx.stroke();
    }

    // clouds
    for (var cl = 0; cl < clouds.length; cl++) {
      var cd = clouds[cl];
      cd.x += (cd.v + wind * 0.01) / 60;
      if (cd.x > 1.25) cd.x = -0.25;
      if (cd.x < -0.25) cd.x = 1.25;
      drawCloud(cd);
    }

    // rain
    var wantDrops = Math.round((mix.rain * (mode === 'storm' ? 200 : 130)));
    while (drops.length < wantDrops) drops.push({ x: Math.random() * (W * 1.3), y: Math.random() * -H, l: rand(9, 22), v: rand(520, 900) });
    if (drops.length > wantDrops) drops.length = wantDrops;
    if (mix.rain > 0.02) {
      ctx.strokeStyle = 'rgba(158,196,238,' + (0.5 * mix.rain) + ')';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (var d = 0; d < drops.length; d++) {
        var dr = drops[d];
        dr.y += dr.v / 60; dr.x += wind * dr.v / 60 * 0.12;
        var ang = Math.atan2(dr.v / 60, wind * dr.v / 60 * 0.12);
        if (dr.y > H) {
          if (splashes.length < 50 && Math.random() < 0.3) splashes.push({ x: dr.x % W, y: H - rand(2, 10), r: 1, life: 1 });
          dr.y = rand(-60, -10); dr.x = Math.random() * (W * 1.3);
          continue;
        }
        var dx = Math.cos(ang) * dr.l, dy = Math.sin(ang) * dr.l;
        ctx.moveTo(dr.x, dr.y); ctx.lineTo(dr.x - dx * 0.3, dr.y - dy);
      }
      ctx.stroke();
    }
    // splashes
    for (var sp = splashes.length - 1; sp >= 0; sp--) {
      var sl = splashes[sp];
      sl.r += 0.7; sl.life -= 0.05;
      if (sl.life <= 0) { splashes.splice(sp, 1); continue; }
      ctx.strokeStyle = 'rgba(158,196,238,' + (0.4 * sl.life * mix.rain) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sl.x, sl.y, sl.r * 2.2, sl.r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // snow
    var wantFlakes = Math.round(mix.snow * 150);
    while (flakes.length < wantFlakes) flakes.push({ x: Math.random() * W, y: Math.random() * -H, r: rand(1, 3.4), v: rand(26, 80), ph: rand(0, 6.3), depth: rand(0.3, 1) });
    if (flakes.length > wantFlakes) flakes.length = wantFlakes;
    for (var f = 0; f < flakes.length; f++) {
      var fl = flakes[f];
      fl.y += fl.v / 60;
      fl.x += (Math.sin(t * 0.8 + fl.ph) * 0.4 + wind * 0.5) * fl.depth;
      if (fl.y > H + 6) { fl.y = -6; fl.x = Math.random() * W; }
      if (fl.x > W + 6) fl.x = -6; if (fl.x < -6) fl.x = W + 6;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(240,247,255,' + (0.35 + 0.5 * fl.depth) + ')';
      ctx.arc(fl.x, fl.y, fl.r * (0.7 + fl.depth * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }

    // lightning
    if (mix.storm > 0.5) {
      if (now > nextFlash) { spawnBolt(); flashAlpha = 1; nextFlash = now + rand(2600, 7000); }
    }
    if (bolt) {
      bolt.life -= 0.045;
      if (bolt.life <= 0) bolt = null;
      else {
        ctx.save();
        ctx.strokeStyle = 'rgba(230,238,255,' + bolt.life + ')';
        ctx.shadowColor = 'rgba(185,167,245,' + bolt.life + ')';
        ctx.shadowBlur = 18; ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (var p = 0; p < bolt.pts.length; p++) {
          var pt = bolt.pts[p];
          if (p === 0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // aurora breath (very subtle top glow following cursor)
    var g2 = ctx.createRadialGradient(smx * W, smy * H, 0, smx * W, smy * H, Math.max(W, H) * 0.5);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    // (kept intentionally empty — glow handled by #cursor-glow element)

    // phone tilt
    if (tiltEl && canHover && !reduceMotion) {
      tiltEl.style.transform = 'rotateX(' + ((0.5 - smy) * 7).toFixed(2) + 'deg) rotateY(' + ((smx - 0.5) * 9).toFixed(2) + 'deg)';
    }
    // cursor glow
    if (glowEl && canHover) {
      glowEl.style.left = (smx * W) + 'px';
      glowEl.style.top = (smy * H) + 'px';
    }
  }

  var tiltEl = document.querySelector('.tilt');
  var glowEl = document.getElementById('cursor-glow');
  if (reduceMotion) {
    // one static starfield frame; no loop
    for (var k = 0; k < stars.length; k++) {
      var st2 = stars[k];
      ctx.beginPath();
      ctx.fillStyle = st2.warm ? 'rgba(245,200,106,.8)' : 'rgba(232,238,247,.7)';
      ctx.arc(st2.x * W, st2.y * H, st2.r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    requestAnimationFrame(frame);
  }

  /* ── scroll progress + to-top ── */
  var prog = document.getElementById('scroll-progress');
  var toTop = document.getElementById('toTop');
  window.addEventListener('scroll', function () {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    if (prog) prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    if (toTop) toTop.classList.toggle('show', h.scrollTop > 600);
  }, { passive: true });
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });

  /* ── reveal on scroll with stagger ── */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.style.transitionDelay = ((el.dataset.batch || 0) * 70) + 'ms';
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    var batch = 0, last = 0;
    reveals.forEach(function (el, i) {
      if (i - last > 5) { batch = 0; last = i; } else { batch++; }
      el.dataset.batch = batch % 6;
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ── count-up stats ── */
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (!target) { el.textContent = '0'; return; }
    var started = null;
    function step(ts) {
      if (!started) started = ts;
      var p = Math.min(1, (ts - started) / 1300);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var stats = document.querySelectorAll('.stat b[data-count]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); sio.unobserve(e.target); } });
    }, { threshold: 0.5 });
    stats.forEach(function (el) { sio.observe(el); });
  } else {
    stats.forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
  }

  /* ── radar tile: cursor echoes ── */
  var tileMap = document.getElementById('tileMap');
  if (tileMap && canHover) {
    var lastEcho = 0;
    tileMap.addEventListener('pointermove', function (e) {
      var now = performance.now();
      if (now - lastEcho < 70) return;
      lastEcho = now;
      if (tileMap.children.length > 18) return;
      var r = tileMap.getBoundingClientRect();
      var size = rand(12, 30);
      var sp = document.createElement('span');
      sp.className = 'echo';
      sp.style.left = (e.clientX - r.left) + 'px';
      sp.style.top = (e.clientY - r.top) + 'px';
      sp.style.width = size + 'px';
      sp.style.height = (size * 0.6) + 'px';
      sp.addEventListener('animationend', function () { sp.remove(); });
      tileMap.appendChild(sp);
    });
  }

  /* ── FAQ accordion ── */
  var faqItems = document.querySelectorAll('.faq details');
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      faqItems.forEach(function (o) { if (o !== item) o.open = false; });
    });
  });
})();
