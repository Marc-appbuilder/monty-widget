/**
 * Vaughan embed script
 *
 * Usage — paste before </body> on any page:
 *   <script src="https://app.vaughanai.co/embed.js?clientId=demo" async></script>
 *
 * Optional query params:
 *   clientId  — which agent config to load  (default: "demo")
 *   color     — override brand hex color    (auto-fetched from server if omitted)
 */
(function () {
  'use strict';

  /* ── 1. Parse params ─────────────────────────────────────────────────────── */
  var scriptEl =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script');
      return all[all.length - 1];
    })();

  var srcUrl   = new URL(scriptEl.src);
  var origin   = srcUrl.searchParams.get('origin') || srcUrl.origin;
  var clientId   = srcUrl.searchParams.get('clientId') || 'demo';
  var colorArg   = srcUrl.searchParams.get('color');
  var teaserArg  = srcUrl.searchParams.get('teaserText');

  /* ── 2. Avoid double-init ────────────────────────────────────────────────── */
  if (window.__vaughanLoaded) return;
  window.__vaughanLoaded = true;

  /* ── 3. Helpers ──────────────────────────────────────────────────────────── */
  function hexRgb(hex) {
    return parseInt(hex.slice(1, 3), 16) + ',' +
           parseInt(hex.slice(3, 5), 16) + ',' +
           parseInt(hex.slice(5, 7), 16);
  }

  function isMobile() { return window.innerWidth <= 768; }

  /* ── 4. Keyframes ───────────────────────────────────────────────────────── */
  var styleEl = document.createElement('style');
  styleEl.textContent =
    '@keyframes ea-widget-in{from{opacity:0;transform:translateY(16px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}' +
    '@keyframes ea-widget-in-mob{from{opacity:0;transform:translateY(12px) scale(0.99)}to{opacity:1;transform:translateY(0) scale(1)}}' +
    /* Slide-in variants: right/left × bottom/middle */
    '@keyframes ea-fab-er{from{opacity:0;transform:translateX(110px)}to{opacity:1;transform:translateX(0)}}' +
    '@keyframes ea-fab-el{from{opacity:0;transform:translateX(-110px)}to{opacity:1;transform:translateX(0)}}' +
    '@keyframes ea-fab-emr{from{opacity:0;transform:translateX(110px) translateY(-50%)}to{opacity:1;transform:translateX(0) translateY(-50%)}}' +
    '@keyframes ea-fab-eml{from{opacity:0;transform:translateX(-110px) translateY(-50%)}to{opacity:1;transform:translateX(0) translateY(-50%)}}' +
    /* Chat panel: expands from V origin (bottom-right) on open, collapses on close */
    '@keyframes ea-widget-in{from{opacity:0;transform:scale(0.04)}to{opacity:1;transform:scale(1)}}' +
    '@keyframes ea-widget-out{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(0.04)}}' +
    '@keyframes ea-teaser-in{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}' +
    '@keyframes ea-teaser-out{from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(8px)}}';
  document.head.appendChild(styleEl);

  /* ── 5. FAB wrapper ─────────────────────────────────────────────────────── */
  var _pos = 'bottom-right'; // resolved from config

  var fabWrap = document.createElement('div');
  Object.assign(fabWrap.style, {
    position: 'fixed',
    zIndex:   '2147483647',
    width:    '88px',
    height:   '65px',
    overflow: 'visible',
  });

  function applyFabPosition(pos) {
    _pos = pos || 'bottom-right';

    /* On mobile always use bottom-right — admin positions are desktop-only */
    if (isMobile()) {
      Object.assign(fabWrap.style, {
        bottom: '24px', top: 'auto', right: '24px', left: 'auto',
        animation: 'ea-fab-er 0.6s cubic-bezier(0.22,1,0.36,1) 2s both',
      });
      return;
    }

    var isLeft    = _pos.indexOf('left')  !== -1;
    var isFloated = _pos === 'middle-left'  || _pos === 'middle-right' ||
                    _pos === 'lower-left'   || _pos === 'lower-right';
    var topVal    = _pos === 'lower-left'   || _pos === 'lower-right' ? '72%' : '50%';
    var anim      = isFloated
      ? (isLeft ? 'ea-fab-eml' : 'ea-fab-emr')
      : (isLeft ? 'ea-fab-el'  : 'ea-fab-er');

    Object.assign(fabWrap.style, {
      bottom: isFloated ? 'auto'  : '24px',
      top:    isFloated ? topVal  : 'auto',
      right:  isLeft    ? 'auto'  : '24px',
      left:   isLeft    ? '24px'  : 'auto',
      animation: anim + ' 0.6s cubic-bezier(0.22,1,0.36,1) 2s both',
    });

    /* Apply any drag offset saved this session (overrides admin position,
       but only until the user closes the tab / clears the session) */
    try {
      var saved = sessionStorage.getItem('__vaughan_fab_' + clientId);
      if (saved && !isMobile()) {
        var p = JSON.parse(saved);
        var c = _clampFab(p.x, p.y);
        Object.assign(fabWrap.style, {
          bottom: 'auto', right: 'auto',
          left: c[0] + 'px', top: c[1] + 'px',
          animation: 'none',
        });
        _dragged = true;
      }
    } catch (_) {}
  }

  /* ── Drag (desktop only) ─────────────────────────────────────────────── */
  var _dragged     = false; // true once the FAB has been dragged at least once
  var _dragging    = false; // true during an active drag move
  var _justDragged = false; // used to swallow the click that follows a drag-end

  function _clampFab(x, y) {
    var pad = 8;
    return [
      Math.max(pad, Math.min(window.innerWidth  - 88 - pad, x)),
      Math.max(pad, Math.min(window.innerHeight - 76 - pad, y)),
    ];
  }

  function _repoContainer() {
    var rect = fabWrap.getBoundingClientRect();
    var cw = 380, ch = 580, gap = 12, pad = 8;
    var fx = rect.left, fy = rect.top;
    // Prefer left of FAB when FAB is in the right half of the screen, else right
    var left = fx > window.innerWidth / 2
      ? fx - cw - gap
      : fx + 88 + gap;
    left = Math.max(pad, Math.min(window.innerWidth - cw - pad, left));
    // Prefer above FAB when in the bottom half, else below
    var top = fy + ch > window.innerHeight - pad
      ? fy - ch + 64
      : fy;
    top = Math.max(pad, Math.min(window.innerHeight - ch - pad, top));
    Object.assign(container.style, {
      left: left + 'px', top: top + 'px',
      right: 'auto', bottom: 'auto', transform: 'none',
    });
  }

  fabWrap.addEventListener('mousedown', function (e) {
    if (isMobile() || e.button !== 0) return;
    var rect = fabWrap.getBoundingClientRect();
    var startX = rect.left, startY = rect.top;
    var dx = e.clientX - startX, dy = e.clientY - startY;
    _dragging = false;

    /* Snapshot current visual position as top/left so we can freely move it */
    fabWrap.style.animation = 'none';
    fabWrap.style.bottom = 'auto'; fabWrap.style.right = 'auto';
    fabWrap.style.left = startX + 'px'; fabWrap.style.top = startY + 'px';

    function onMove(ev) {
      var nx = ev.clientX - dx, ny = ev.clientY - dy;
      if (!_dragging && (Math.abs(nx - startX) > 4 || Math.abs(ny - startY) > 4)) {
        _dragging = true;
        _dragged  = true;
        document.body.style.userSelect = 'none';
      }
      if (!_dragging) return;
      var c = _clampFab(nx, ny);
      fabWrap.style.left = c[0] + 'px';
      fabWrap.style.top  = c[1] + 'px';
      if (isOpen) _repoContainer();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.body.style.userSelect = '';
      if (_dragging) {
        _justDragged = true;
        try {
          var rect2 = fabWrap.getBoundingClientRect();
          sessionStorage.setItem('__vaughan_fab_' + clientId,
            JSON.stringify({ x: rect2.left, y: rect2.top }));
        } catch (_) {}
      }
      _dragging = false;
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  /* Clamp FAB back on-screen if window is resized after dragging */
  window.addEventListener('resize', function () {
    if (_dragged && !isMobile()) {
      var rect = fabWrap.getBoundingClientRect();
      var c = _clampFab(rect.left, rect.top);
      fabWrap.style.left = c[0] + 'px';
      fabWrap.style.top  = c[1] + 'px';
    }
    if (isOpen) { if (_dragged && !isMobile()) { _repoContainer(); } else { applyContainerSize(); } }
  });

  /* V arm geometry — both arms share an 88×76 SVG viewport,
     rotating around the vertex at (44, 70) */
  var _armTx  = 'transform 0.35s ease-in-out';
  var _armOri = '44px 61px'; /* vertex — rotation pivot */

  /* Left arm */
  var fabArmLeft = document.createElement('div');
  Object.assign(fabArmLeft.style, {
    position:        'absolute',
    top:             '0',
    left:            '0',
    width:           '88px',
    height:          '65px',
    transformOrigin: _armOri,
    transition:      _armTx,
    pointerEvents:   'none',
  });
  fabArmLeft.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="65" viewBox="0 0 88 65" fill="none">' +
      '<line x1="44" y1="61" x2="5" y2="5" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round"/>' +
    '</svg>';

  /* Right arm */
  var fabArmRight = document.createElement('div');
  Object.assign(fabArmRight.style, {
    position:        'absolute',
    top:             '0',
    left:            '0',
    width:           '88px',
    height:          '65px',
    transformOrigin: _armOri,
    transition:      _armTx,
    pointerEvents:   'none',
  });
  fabArmRight.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="65" viewBox="0 0 88 65" fill="none">' +
      '<line x1="44" y1="61" x2="83" y2="5" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round"/>' +
    '</svg>';

  /* Transparent click target covers the full V area */
  var fab = document.createElement('button');
  fab.setAttribute('aria-label', 'Open chat');
  Object.assign(fab.style, {
    position:  'absolute',
    top:       '0',
    left:      '0',
    width:     '88px',
    height:    '65px',
    border:    'none',
    background:'transparent',
    cursor:    'pointer',
  });

  function _setArmsOpen(deg) {
    fabArmLeft.style.animation  = 'none';
    fabArmRight.style.animation = 'none';
    fabArmLeft.style.transform  = 'rotate(' + (-deg) + 'deg)';
    fabArmRight.style.transform = 'rotate(' + deg + 'deg)';
  }
  function _setArmsHover() {
    fabArmLeft.style.animation  = 'none';
    fabArmRight.style.animation = 'none';
    fabArmLeft.style.transform  = 'rotate(-13deg)';
    fabArmRight.style.transform = 'rotate(13deg)';
  }
  function _setArmsResting() {
    fabArmLeft.style.animation  = 'none';
    fabArmRight.style.animation = 'none';
    var a = _teaserArmsAngle || 0;
    fabArmLeft.style.transform  = 'rotate(' + (-a) + 'deg)';
    fabArmRight.style.transform = 'rotate(' + a + 'deg)';
  }

  fab.addEventListener('mouseover', function () {
    _isHoveringFab = true;
    if (isOpen) return;
    _setArmsHover();
    hoverGlyph.style.opacity = '1';
    /* Reveal prompt immediately on hover if not yet shown this cycle */
    if (_teaserPrompts.length && !_teaserDismissed && teaser.style.display === 'none') {
      clearTimeout(_teaserTimer);
      clearTimeout(_teaserAutoTimer);
      _showTeaser();
    }
  });
  fab.addEventListener('mouseout', function () {
    _isHoveringFab = false;
    hoverGlyph.style.opacity = '0';
    if (!isOpen) _setArmsResting();
  });
  fab.addEventListener('click', function () {
    if (_justDragged) { _justDragged = false; return; }
    if (isOpen) { closeFab(); } else { openFab(); }
  });

  /* Hover glyph — two thin message lines, fades in on hover, never dominates */
  var hoverGlyph = document.createElement('div');
  Object.assign(hoverGlyph.style, {
    position:      'absolute',
    top:           '17px',
    left:          '44px',
    transform:     'translateX(-50%)',
    opacity:       '0',
    transition:    'opacity 0.3s ease',
    pointerEvents: 'none',
  });
  hoverGlyph.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="12" viewBox="0 0 26 12" fill="none">' +
      '<line x1="0" y1="3" x2="26" y2="3" stroke="rgba(255,255,255,0.58)" stroke-width="1.5" stroke-linecap="round"/>' +
      '<line x1="0" y1="9" x2="18" y2="9" stroke="rgba(255,255,255,0.58)" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg>';

  fabWrap.appendChild(fabArmLeft);
  fabWrap.appendChild(fabArmRight);
  fabWrap.appendChild(hoverGlyph);
  fabWrap.appendChild(fab);

  /* ── 6. Signal prompt ───────────────────────────────────────────────────── */
  var _teaserDismissed  = false;
  var _teaserTimer      = null;
  var _teaserAutoTimer  = null;
  var _teaserPrompts    = [];   /* rotating array of prompt strings */
  var _teaserIndex      = 0;   /* which prompt shows next */
  var _teaserShowCount  = 0;
  var _teaserArmsAngle  = 0;
  var _isHoveringFab    = false;

  function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  var teaser = document.createElement('div');
  Object.assign(teaser.style, {
    position:      'absolute',
    bottom:        '81px',          /* 65px V + 16px gap */
    left:          '44px',          /* center of 88px V */
    transform:     'translateX(-50%)',
    background:    'rgba(17,17,17,0.93)',
    color:         '#F5F7F4',
    borderRadius:  '13px',
    boxShadow:     '0 0 20px rgba(170,255,0,0.08)',
    padding:       '11px 22px',
    fontSize:      '14px',
    fontFamily:    '"Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fontWeight:    '500',
    letterSpacing: '0.02em',
    lineHeight:    '1',
    cursor:        'pointer',
    display:       'none',
    whiteSpace:    'nowrap',
    userSelect:    'none',
    maxWidth:      '85vw',
  });

  var teaserText = document.createElement('span');
  teaser.appendChild(teaserText);
  fabWrap.appendChild(teaser);

  teaser.addEventListener('click', function () {
    _teaserDismissed = true;
    clearTimeout(_teaserTimer);
    clearTimeout(_teaserAutoTimer);
    teaser.style.display = 'none';
    _teaserArmsAngle = 0;
    openFab();
  });

  function _showTeaser() {
    if (_teaserDismissed || isOpen || !_teaserPrompts.length) return;
    var maxShows = isMobile() ? 2 : 3;
    if (_teaserShowCount >= maxShows) return;
    _teaserShowCount++;
    var prompt = _teaserPrompts[_teaserIndex % _teaserPrompts.length];
    _teaserIndex++;
    /* V opens slightly first, bubble follows 150ms later */
    _teaserArmsAngle = 8;
    _setArmsResting();
    setTimeout(function () {
      if (_teaserDismissed || isOpen) return;
      teaserText.innerHTML =
        '<span style="color:#AAFF00;font-size:7px;vertical-align:2px;margin-right:6px">●</span>' +
        _escHtml(prompt);
      teaser.style.display   = 'block';
      teaser.style.animation = 'ea-teaser-in 0.3s ease-out both';
    }, 150);
  }

  function _hideTeaser(cb) {
    if (teaser.style.display === 'none') { if (cb) cb(); return; }
    teaser.style.animation = 'ea-teaser-out 0.2s ease-in both';
    setTimeout(function () {
      teaser.style.display   = 'none';
      teaser.style.animation = '';
      _teaserArmsAngle = 0;
      if (!isOpen) _setArmsResting();
      if (cb) cb();
    }, 220);
  }

  function _scheduleCycle() {
    var mob      = isMobile();
    var maxShows = mob ? 2 : 3;
    var visibleMs = mob ? 3500 : 4500;
    var repeatMs  = mob
      ? (30000 + Math.random() * 5000)
      : (25000 + Math.random() * 5000);

    if (_teaserDismissed || _teaserShowCount >= maxShows) return;
    _showTeaser();

    /* Stay visible while hovering, then hide and reschedule */
    function tryHide() {
      if (_isHoveringFab && !isMobile()) {
        _teaserAutoTimer = setTimeout(tryHide, 400);
        return;
      }
      _hideTeaser(function () {
        if (!_teaserDismissed && _teaserShowCount < maxShows) {
          _teaserTimer = setTimeout(_scheduleCycle, repeatMs);
        }
      });
    }
    _teaserAutoTimer = setTimeout(tryHide, visibleMs);
  }

  function initTeaser(text) {
    if (!text) return;
    /* Support comma-separated list for prompt rotation */
    _teaserPrompts = text.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!_teaserPrompts.length) return;
    var firstDelay = isMobile() ? 2000 : 2500;
    _teaserTimer = setTimeout(_scheduleCycle, firstDelay);
  }

  /* ── 7. Widget container ─────────────────────────────────────────────────── */
  var container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed', zIndex: '2147483646',
    overflow: 'hidden', display: 'none', transformOrigin: 'bottom right',
  });

  function applyContainerSize() {
    if (isMobile()) {
      Object.assign(container.style, {
        top: '0', left: '0', right: '0', bottom: '0',
        width: '100%', height: '100%',
        maxWidth: 'none', maxHeight: 'none',
        borderRadius: '0', boxShadow: 'none',
        transform: 'none',
      });
    } else {
      var isLeft    = _pos.indexOf('left') !== -1;
      var isFloated = _pos === 'middle-left' || _pos === 'middle-right' ||
                      _pos === 'lower-left'  || _pos === 'lower-right';
      var topVal    = _pos === 'lower-left' || _pos === 'lower-right'
        ? 'calc(72% - 290px)' : 'calc(50% - 290px)';
      Object.assign(container.style, {
        right:     isLeft    ? 'auto'  : '24px',
        left:      isLeft    ? '96px'  : 'auto',
        bottom:    isFloated ? 'auto'  : '101px',
        top:       isFloated ? topVal  : 'auto',
        width:     '380px',
        height:    '580px',
        maxWidth:  'calc(100vw - 110px)',
        maxHeight: isFloated ? 'calc(100vh - 40px)' : 'calc(100vh - 120px)',
        borderRadius: '16px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.28)',
      });
    }
  }

  applyContainerSize();

  var iframe = document.createElement('iframe');
  iframe.src = origin + '/widget?clientId=' + encodeURIComponent(clientId);
  iframe.title = 'Vaughan chat';
  iframe.setAttribute('allow', 'clipboard-write');
  Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', display: 'block' });
  container.appendChild(iframe);

  var overlay = document.createElement('div');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483645', display: 'none' });

  /* ── 7. Toggle state ─────────────────────────────────────────────────────── */
  var isOpen = false;
  var _closeTimer = null;

  overlay.addEventListener('click', function () { if (isOpen) closeFab(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closeFab(); });
  window.addEventListener('message', function (e) { if (e.data === 'vaughan:close' && isOpen) closeFab(); });

  function openFab() {
    isOpen = true;
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
    _teaserDismissed = true;  /* no more prompts once chat is opened */
    teaser.style.display = 'none';
    teaser.style.animation = '';
    _teaserArmsAngle = 0;
    clearTimeout(_teaserTimer);
    clearTimeout(_teaserAutoTimer);
    if (_dragged && !isMobile()) { _repoContainer(); } else { applyContainerSize(); }
    overlay.style.display = 'block';
    fabWrap.style.display = isMobile() ? 'none' : 'flex';
    /* Arms open first, chat springs out of the opening */
    _setArmsOpen(55);
    container.style.display   = 'block';
    container.style.animation = isMobile()
      ? 'ea-widget-in-mob 0.3s cubic-bezier(0.22,1,0.36,1) both'
      : 'ea-widget-in 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.06s both';
    fab.setAttribute('aria-label', 'Close chat');
  }

  function closeFab() {
    isOpen = false;
    overlay.style.display = 'none';
    fabWrap.style.display = 'flex';
    _setArmsResting();
    fab.setAttribute('aria-label', 'Open chat');
    /* Collapse chat back into the V, then hide */
    container.style.animation = 'ea-widget-out 0.22s ease-in both';
    _closeTimer = setTimeout(function () {
      container.style.display   = 'none';
      container.style.animation = '';
      _closeTimer = null;
    }, 240);
  }

  /* ── 8. Initialise V — static, clean, waiting */
  function applyColor() {
    _setArmsResting();
  }

  /* ── 9. Mount ───────────────────────────────────────────────────────────── */
  function mount() {
    /* Space Grotesk — signal prompt font */
    if (!document.getElementById('ea-sg-font')) {
      var fl = document.createElement('link');
      fl.id   = 'ea-sg-font';
      fl.rel  = 'stylesheet';
      fl.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500&display=swap';
      document.head.appendChild(fl);
    }
    document.body.appendChild(overlay);
    document.body.appendChild(container);
    document.body.appendChild(fabWrap);

    fetch(origin + '/api/client-config/' + encodeURIComponent(clientId))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        applyFabPosition(d.widgetPosition || 'bottom-right');
        applyColor();
        initTeaser(teaserArg || d.teaserText || null);
      })
      .catch(function () {
        applyFabPosition('bottom-right');
        applyColor();
        initTeaser(teaserArg || null);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
