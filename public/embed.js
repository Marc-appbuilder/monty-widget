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
  var linecap    = srcUrl.searchParams.get('linecap') || 'round';

  var _widgetStyle   = 'v2';   // 'classic' or 'v2' — resolved from config
  var _isClassic     = false;
  var _teaserPersist = false;  // desktop-only: teaser stays visible permanently

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
    '@keyframes ea-teaser-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
    '@keyframes ea-teaser-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(8px)}}' +
    /* Classic FAB heartbeat — lub-dub double beat with glow, then long rest */
    '@keyframes ea-heartbeat{' +
      '0%{transform:scale(1);box-shadow:0 8px 24px rgba(0,0,0,0.28)}' +
      '6%{transform:scale(1.09);box-shadow:0 12px 36px rgba(0,0,0,0.35),0 0 22px rgba(255,255,255,0.18)}' +
      '12%{transform:scale(1);box-shadow:0 8px 24px rgba(0,0,0,0.28)}' +
      '18%{transform:scale(1.05);box-shadow:0 10px 28px rgba(0,0,0,0.30),0 0 14px rgba(255,255,255,0.10)}' +
      '24%{transform:scale(1);box-shadow:0 8px 24px rgba(0,0,0,0.28)}' +
      '100%{transform:scale(1);box-shadow:0 8px 24px rgba(0,0,0,0.28)}}';
  document.head.appendChild(styleEl);

  /* ── 5. FAB wrapper ─────────────────────────────────────────────────────── */
  var _pos = 'bottom-right'; // resolved from config

  var fabWrap = document.createElement('div');
  Object.assign(fabWrap.style, {
    position:   'fixed',
    zIndex:     '2147483647',
    width:      '88px',
    height:     '76px',
    overflow:   'visible',
    filter:     'none',
    transition: 'filter 0.4s ease',
  });

  function applyFabPosition(pos) {
    _pos = pos || 'bottom-right';

    /* On mobile always use bottom-right — admin positions are desktop-only */
    if (isMobile()) {
      Object.assign(fabWrap.style, {
        bottom: '24px', top: 'auto', right: '32px', left: 'auto',
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
      right:  isLeft    ? 'auto'  : '32px',
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
  var _armOri = '44px 70px'; /* vertex — rotation pivot */

  /* Left arm */
  var fabArmLeft = document.createElement('div');
  Object.assign(fabArmLeft.style, {
    position:        'absolute',
    top:             '0',
    left:            '0',
    width:           '88px',
    height:          '76px',
    transformOrigin: _armOri,
    transition:      _armTx,
    color:           '#AAFF00',
    pointerEvents:   'none',
  });
  fabArmLeft.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="76" viewBox="0 0 88 76" fill="none">' +
      '<line x1="44" y1="72" x2="10" y2="8" stroke="currentColor" stroke-width="16" stroke-linecap="' + linecap + '"/>' +
    '</svg>';

  /* Right arm */
  var fabArmRight = document.createElement('div');
  Object.assign(fabArmRight.style, {
    position:        'absolute',
    top:             '0',
    left:            '0',
    width:           '88px',
    height:          '76px',
    transformOrigin: _armOri,
    transition:      _armTx,
    color:           '#AAFF00',
    pointerEvents:   'none',
  });
  fabArmRight.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="76" viewBox="0 0 88 76" fill="none">' +
      '<line x1="44" y1="72" x2="78" y2="8" stroke="currentColor" stroke-width="16" stroke-linecap="' + linecap + '"/>' +
    '</svg>';

  /* Transparent click target covers the full V area */
  var fab = document.createElement('button');
  fab.setAttribute('aria-label', 'Open chat');
  Object.assign(fab.style, {
    position:  'absolute',
    top:       '0',
    left:      '0',
    width:     '88px',
    height:    '76px',
    border:    'none',
    background:'transparent',
    cursor:    'pointer',
  });

  function _setArmsOpen(deg) {
    if (_isClassic) return;
    fabArmLeft.style.animation  = 'none';
    fabArmRight.style.animation = 'none';
    fabArmLeft.style.transform  = 'rotate(' + (-deg) + 'deg)';
    fabArmRight.style.transform = 'rotate(' + deg + 'deg)';
  }
  function _setArmsResting(overrideAngle) {
    if (_isClassic) return;
    fabArmLeft.style.animation  = 'none';
    fabArmRight.style.animation = 'none';
    var a = (overrideAngle !== undefined) ? overrideAngle : (_teaserArmsAngle || 0);
    fabArmLeft.style.transform  = 'rotate(' + (-a) + 'deg)';
    fabArmRight.style.transform = 'rotate(' + a + 'deg)';
  }

  /* Classic mode: swap chat-bubble ↔ × icon — white icons, no colour */
  function _setClassicIcon(open) {
    if (!_isClassic) return;
    if (open) {
      fab.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none">' +
        '<line x1="3" y1="3" x2="17" y2="17" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="17" y1="3" x2="3" y2="17" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round"/>' +
        '</svg>';
    } else {
      fab.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 28 28" fill="none">' +
        '<path d="M6 2H22Q26 2 26 6V17Q26 21 22 21H11L5 27L6 21Q2 21 2 17V6Q2 2 6 2Z" fill="rgba(255,255,255,0.88)"/>' +
        '</svg>';
    }
  }

  /* Glow levels — no-op for classic (classic uses natural shadow only, never coloured glow) */
  function _setGlow(level) {
    if (_isClassic) return;
    if (level === 'hover') {
      fabWrap.style.filter = 'drop-shadow(0 0 12px rgba(170,255,0,0.28))';
    } else if (level === 'prompt') {
      fabWrap.style.filter = 'drop-shadow(0 0 8px rgba(170,255,0,0.18))';
    } else {
      fabWrap.style.filter = 'none';
    }
  }

  fab.addEventListener('mouseover', function () {
    _isHoveringFab = true;
    if (isOpen) return;
    if (_isClassic) {
      /* Pause heartbeat, hold at slightly larger scale */
      fab.style.animationPlayState = 'paused';
      fab.style.transform  = 'scale(1.06)';
      fab.style.background = '#2a2a2a';
      fab.style.boxShadow  = '0 6px 24px rgba(0,0,0,0.45)';
      return;
    }
    _setGlow('hover');
    if (_teaserPrompts.length && !_teaserDismissed && teaser.style.display === 'none') {
      clearTimeout(_teaserTimer);
      clearTimeout(_teaserAutoTimer);
      _showTeaser();
      _setArmsResting(10); /* hover opens slightly past teaser angle */
    } else if (teaser.style.display !== 'none') {
      _setArmsResting(10); /* teaser already visible — open a touch further */
    } else {
      _setArmsResting(5);  /* no teaser — subtle spread to signal interactivity */
    }
  });
  fab.addEventListener('mouseout', function () {
    _isHoveringFab = false;
    if (isOpen) return;
    if (_isClassic) {
      fab.style.transform   = '';
      fab.style.boxShadow   = '';  /* animation owns box-shadow when running */
      fab.style.animationPlayState = 'running';
      fab.style.background  = '#151515';
      return;
    }
    _setArmsResting(); /* back to _teaserArmsAngle (8° if teaser up, 0° if not) */
    _setGlow(teaser.style.display !== 'none' ? 'prompt' : 'none');
  });
  fab.addEventListener('click', function () {
    if (_justDragged) { _justDragged = false; return; }
    if (isOpen) { closeFab(); } else { openFab(); }
  });
  /* Reliable tap on iOS Safari / Android Chrome — preventDefault stops ghost click */
  fab.addEventListener('touchend', function (e) {
    e.preventDefault();
    if (_justDragged) { _justDragged = false; return; }
    if (isOpen) { closeFab(); } else { openFab(); }
  }, { passive: false });

  fabWrap.appendChild(fabArmLeft);
  fabWrap.appendChild(fabArmRight);
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
    bottom:        '92px',          /* 76px V + 16px gap */
    right:         '0',             /* anchors right edge to V right — extends left into screen */
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
    var prompt = _teaserPrompts[_teaserIndex % _teaserPrompts.length];
    _teaserIndex++;
    /* V opens slightly, soft glow wakes up, bubble follows 150ms later */
    _teaserArmsAngle = 8;
    _setArmsResting();
    if (!_isHoveringFab) _setGlow('prompt'); /* hover already set stronger glow */
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
      _setGlow(_isHoveringFab ? 'hover' : 'none'); /* keep hover glow if still over V */
      if (cb) cb();
    }, 220);
  }

  function _scheduleCycle() {
    var visibleMs = 3000;   /* bubble visible for 3 s */
    var repeatMs  = 10000;  /* 10 s gap before next show */

    if (_teaserDismissed) return;
    _showTeaser();

    /* Stay visible while hovering, then hide and reschedule */
    function tryHide() {
      if (_isHoveringFab && !isMobile()) {
        _teaserAutoTimer = setTimeout(tryHide, 400);
        return;
      }
      /* Persist mode on desktop: never auto-hide — just rotate text after gap */
      if (_teaserPersist && !isMobile()) {
        if (!_teaserDismissed) {
          _teaserTimer = setTimeout(_scheduleCycle, repeatMs);
        }
        return;
      }
      _hideTeaser(function () {
        if (!_teaserDismissed) {
          _teaserTimer = setTimeout(_scheduleCycle, repeatMs);
        }
      });
    }
    _teaserAutoTimer = setTimeout(tryHide, visibleMs);
  }

  function initTeaser(text, persist) {
    if (!text) return;
    _teaserPersist = !!(persist && !isMobile());
    /* Support comma-separated list for prompt rotation */
    _teaserPrompts = text.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!_teaserPrompts.length) return;
    /* Persist: show quickly on desktop; otherwise standard delays */
    var firstDelay = _teaserPersist ? 800 : (isMobile() ? 6000 : 2500);
    _teaserTimer = setTimeout(_scheduleCycle, firstDelay);
  }

  /* ── 7. Widget container ─────────────────────────────────────────────────── */
  var container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed', zIndex: '2147483646',
    overflow: 'hidden', transformOrigin: 'bottom right',
    /* Pre-rendered but hidden — stays in render tree so first open is instant */
    visibility: 'hidden', pointerEvents: 'none',
  });

  /* Mobile bottom-sheet close button */
  var _mobClose = document.createElement('button');
  Object.assign(_mobClose.style, {
    display:     'none',
    position:    'absolute', top: '10px', right: '14px', zIndex: '10',
    width:       '30px', height: '30px', borderRadius: '50%',
    background:  'rgba(0,0,0,0.08)', border: 'none', cursor: 'pointer',
    fontSize:    '18px', color: '#444', lineHeight: '30px', textAlign: 'center',
    WebkitTapHighlightColor: 'transparent',
  });
  _mobClose.textContent = '×';
  _mobClose.setAttribute('aria-label', 'Close chat');
  _mobClose.addEventListener('click', function () { closeFab(); });
  _mobClose.addEventListener('touchend', function (e) { e.preventDefault(); closeFab(); }, { passive: false });
  container.appendChild(_mobClose);

  /* Mobile drag-handle pill */
  var _mobHandle = document.createElement('div');
  Object.assign(_mobHandle.style, {
    display:      'none',
    position:     'absolute', top: '8px', left: '50%',
    transform:    'translateX(-50%)',
    width:        '36px', height: '4px', borderRadius: '2px',
    background:   'rgba(0,0,0,0.15)', zIndex: '10', pointerEvents: 'none',
  });
  container.appendChild(_mobHandle);

  function applyContainerSize() {
    if (isMobile()) {
      Object.assign(container.style, {
        left: '0', right: '0', bottom: '0', top: 'auto',
        width: '100%', height: '70vh',
        maxWidth: 'none', maxHeight: 'none',
        borderRadius: '16px 16px 0 0',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.18)',
        transformOrigin: 'bottom center',
        /* Starting position for slide-up — overwritten to translateY(0) on open */
        transform: 'translateY(100%)',
      });
    } else {
      var isLeft    = _pos.indexOf('left') !== -1;
      var isFloated = _pos === 'middle-left' || _pos === 'middle-right' ||
                      _pos === 'lower-left'  || _pos === 'lower-right';
      var topVal    = _pos === 'lower-left' || _pos === 'lower-right'
        ? 'calc(72% - 290px)' : 'calc(50% - 290px)';
      Object.assign(container.style, {
        right:     isLeft    ? 'auto'  : '32px',
        left:      isLeft    ? '96px'  : 'auto',
        bottom:    isFloated ? 'auto'  : (_isClassic ? '102px' : '112px'),
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
  overlay.addEventListener('touchend', function (e) { if (isOpen) { e.preventDefault(); closeFab(); } }, { passive: false });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closeFab(); });
  window.addEventListener('message', function (e) { if (e.data === 'vaughan:close' && isOpen) closeFab(); });

  function openFab() {
    isOpen = true;
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
    _teaserDismissed = true;
    teaser.style.display = 'none';
    teaser.style.animation = '';
    _teaserArmsAngle = 0;
    _setGlow('none'); /* FAB glow off — activity signals now live inside the chat */
    clearTimeout(_teaserTimer);
    clearTimeout(_teaserAutoTimer);
    if (_dragged && !isMobile()) { _repoContainer(); } else { applyContainerSize(); }
    overlay.style.display = 'block';
    fabWrap.style.display = 'flex'; /* stay visible so arm-open animation plays on all devices */
    _setArmsOpen(55);
    if (_isClassic) { fab.style.animationPlayState = 'paused'; fab.style.transform = 'scale(1)'; _setClassicIcon(true); }
    fab.setAttribute('aria-label', 'Close chat');

    container.style.visibility    = 'visible';
    container.style.pointerEvents = 'auto';

    if (isMobile()) {
      _mobClose.style.display  = 'block';
      _mobHandle.style.display = 'block';
      /* Arms open for 200ms, then panel slides up behind them */
      container.style.transition = 'none';
      container.offsetHeight;
      setTimeout(function () {
        if (!isOpen) return;
        container.style.transition = 'transform 0.38s cubic-bezier(0.22,1,0.36,1)';
        container.style.transform  = 'translateY(0)';
        setTimeout(function () { if (isOpen) fabWrap.style.display = 'none'; }, 420);
      }, 200);
    } else {
      _mobClose.style.display  = 'none';
      _mobHandle.style.display = 'none';
      container.style.transition = 'none';
      container.style.animation  = 'ea-widget-in 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.06s both';
    }
  }

  function closeFab() {
    isOpen = false;
    overlay.style.display = 'none';
    fabWrap.style.display = 'flex';
    _setArmsResting();
    if (_isClassic) { _setClassicIcon(false); fab.style.transform = ''; fab.style.boxShadow = ''; fab.style.animationPlayState = 'running'; }
    fab.setAttribute('aria-label', 'Open chat');
    /* Persist mode: re-show teaser on desktop after chat closes */
    if (_teaserPersist && !isMobile()) {
      _teaserDismissed = false;
      clearTimeout(_teaserTimer);
      clearTimeout(_teaserAutoTimer);
      _teaserTimer = setTimeout(_scheduleCycle, 800);
    }

    if (isMobile()) {
      _mobClose.style.display  = 'none';
      _mobHandle.style.display = 'none';
      fabWrap.style.display = 'flex'; /* show V so arms animate back to resting */
      container.style.transition = 'transform 0.28s cubic-bezier(0.4,0,1,1)';
      container.style.transform  = 'translateY(100%)';
      _closeTimer = setTimeout(function () {
        container.style.visibility    = 'hidden';
        container.style.pointerEvents = 'none';
        container.style.transition    = 'none';
        _closeTimer = null;
      }, 300);
    } else {
      container.style.transition = 'none';
      container.style.animation  = 'ea-widget-out 0.22s ease-in both';
      _closeTimer = setTimeout(function () {
        container.style.visibility    = 'hidden';
        container.style.pointerEvents = 'none';
        container.style.animation     = '';
        _closeTimer = null;
      }, 240);
    }
  }

  /* ── 8a. Classic FAB — round button, applied after config fetch ── */
  function buildClassicFab() {
    /* Remove V arms — they were appended before we knew the style */
    fabWrap.removeChild(fabArmLeft);
    fabWrap.removeChild(fabArmRight);
    /* Size fabWrap to the button */
    fabWrap.style.width  = '66px';
    fabWrap.style.height = '66px';
    /* Turn the transparent fab into the visual button */
    Object.assign(fab.style, {
      width: '66px', height: '66px',
      borderRadius: '50%',
      background: '#151515',
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      transition: 'background 0.2s ease',
      animation: 'ea-heartbeat 2.4s ease-in-out infinite',
    });
    _setClassicIcon(false);
    /* Teaser sits above the 66px button */
    teaser.style.bottom = '82px';
  }

  /* ── 8b. Initialise V — static, clean, waiting */
  function applyColor() {
    _setArmsResting();
  }

  function applyMobileScale() {
    if (!isMobile()) return;
    if (_isClassic) {
      /* Classic button: 52px on mobile */
      fabWrap.style.width  = '56px';
      fabWrap.style.height = '56px';
      fab.style.width      = '56px';
      fab.style.height     = '56px';
      teaser.style.right  = '0';
      teaser.style.left   = 'auto';
      teaser.style.bottom = '72px'; /* 56px + 16px */
      return;
    }
    /* V widget: Scale to ~75% on mobile — desktop geometry unchanged */
    var w = '66px', h = '57px', ori = '33px 52px';
    fabWrap.style.width  = w;
    fabWrap.style.height = h;
    [fabArmLeft, fabArmRight].forEach(function (arm) {
      arm.style.width          = w;
      arm.style.height         = h;
      arm.style.transformOrigin = ori;
      var svg = arm.querySelector('svg');
      if (svg) { svg.setAttribute('width', '66'); svg.setAttribute('height', '57'); }
    });
    fab.style.width  = w;
    fab.style.height = h;
    /* Keep bubble right-aligned to V edge, update bottom for scaled V */
    teaser.style.right  = '0';
    teaser.style.left   = 'auto';
    teaser.style.bottom = '73px'; /* 57px V + 16px gap */
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
        _widgetStyle = d.widgetStyle || 'v2';
        _isClassic   = _widgetStyle === 'classic';
        if (_isClassic) buildClassicFab();
        applyFabPosition(d.widgetPosition || 'bottom-right');
        applyMobileScale();
        applyColor();
        initTeaser(teaserArg || d.teaserText || 'Chat to us', d.teaserPersist);
      })
      .catch(function () {
        applyFabPosition('bottom-right');
        applyMobileScale();
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
