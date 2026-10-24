// MU Weather site — tiny progressive enhancements. No dependencies.
(function () {
  'use strict';

  // Scroll reveals with a gentle stagger per batch.
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var batch = el.dataset.batch || 0;
        el.style.transitionDelay = (batch * 70) + 'ms';
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    // Elements entering together share a small stagger index.
    var batch = 0;
    var lastBatchAt = 0;
    reveals.forEach(function (el, i) {
      if (i - lastBatchAt > 5) { batch = 0; lastBatchAt = i; } else { batch++; }
      el.dataset.batch = batch % 6;
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  // Count-up stats when they first appear.
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (!target) { el.textContent = '0'; return; }
    var started = null;
    var dur = 1300;
    function step(ts) {
      if (!started) started = ts;
      var t = Math.min(1, (ts - started) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var stats = document.querySelectorAll('.stat b[data-count]');
  if ('IntersectionObserver' in window && stats.length) {
    var statIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        statIo.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    stats.forEach(function (el) { statIo.observe(el); });
  }

  // Hero temperature drifts like a real reading.
  var heroTemp = document.getElementById('heroTemp');
  if (heroTemp && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(function () {
      var base = parseInt(heroTemp.textContent, 10) || 9;
      var next = Math.max(7, Math.min(12, base + (Math.random() > 0.5 ? 1 : -1)));
      heroTemp.textContent = next;
    }, 4000);
  }

  // FAQ: close other open items when one opens (accordion feel).
  var faqItems = document.querySelectorAll('.faq details');
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      faqItems.forEach(function (other) { if (other !== item) other.open = false; });
    });
  });
})();
