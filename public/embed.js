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
  var colorArg       = srcUrl.searchParams.get('color');
  var teaserArg      = srcUrl.searchParams.get('teaserText');
  var linecap        = srcUrl.searchParams.get('linecap') || 'round';
  var widgetStyleArg = srcUrl.searchParams.get('widgetStyle');

  var _widgetStyle   = 'v2';   // 'classic' or 'v2' — resolved from config
  var _isClassic     = false;
  var _teaserPersist = false;  // desktop-only: teaser stays visible permanently
  var _isChromeIOS   = /CriOS/i.test(navigator.userAgent);
  var _fabLogoUrl      = '';   // set when config provides a logoUrl for classic FAB
  var _fabBrandColour  = '';   // brand colour used for the logo FAB inset ring
  var _brandColour     = '';   // brand colour from config — set for all widget styles
  var _fabLogoDiv      = null; // div wrapper used to cleanly clip the logo to a circle
  var _fabLogoImg      = null; // img element inside _fabLogoDiv — brightness applied here directly
  var _fabCloseIcon    = null; // plain div shown in place of logo when chat is open
  var _fabLogoPulse    = false;
  var _fabGlowColour   = '';
  var _fabLogoPadding  = 0;
  var _teaserOnce      = false;

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
    '@keyframes ea-teaser-persist{0%,100%{box-shadow:0 4px 16px rgba(0,0,0,0.14)}50%{box-shadow:0 6px 22px rgba(0,0,0,0.24),0 0 0 3px rgba(0,0,0,0.05)}}' +
    '@keyframes ea-peek-in{from{opacity:0;transform:translateX(10px) translateY(-50%)}to{opacity:1;transform:translateX(0) translateY(-50%)}}' +
    '@keyframes ea-peek-in-l{from{opacity:0;transform:translateX(-10px) translateY(-50%)}to{opacity:1;transform:translateX(0) translateY(-50%)}}' +
    '@keyframes ea-peek-out{from{opacity:1;transform:translateX(0) translateY(-50%)}to{opacity:0;transform:translateX(10px) translateY(-50%)}}' +
    '@keyframes ea-peek-out-l{from{opacity:1;transform:translateX(0) translateY(-50%)}to{opacity:0;transform:translateX(-10px) translateY(-50%)}}' +
    '@media(prefers-reduced-motion:reduce){.ea-peek-panel{animation:ea-peek-fade 0.25s ease-out both!important}}' +
    '@keyframes ea-peek-fade{from{opacity:0}to{opacity:1}}' +
    '@keyframes ea-peek-dot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}' +
    '@keyframes ea-peek-blink{0%,100%{opacity:1}50%{opacity:0}}' +
    /* Classic FAB heartbeat — smooth lub-dub, generous spacing so easing has room to breathe */
    '@keyframes ea-heartbeat{' +
      '0%{transform:scale(1);box-shadow:0 8px 24px rgba(0,0,0,0.28)}' +
      '14%{transform:scale(1.05);box-shadow:0 10px 30px rgba(0,0,0,0.32),0 0 18px rgba(255,255,255,0.15)}' +
      '28%{transform:scale(1);box-shadow:0 8px 24px rgba(0,0,0,0.28)}' +
      '40%{transform:scale(1.03);box-shadow:0 9px 26px rgba(0,0,0,0.30),0 0 12px rgba(255,255,255,0.09)}' +
      '54%{transform:scale(1);box-shadow:0 8px 24px rgba(0,0,0,0.28)}' +
      '100%{transform:scale(1);box-shadow:0 8px 24px rgba(0,0,0,0.28)}}' +
    /* Logo FAB heartbeat — no white glow so brand colours stay true */
    '@keyframes ea-logo-heartbeat{' +
      '0%{transform:scale(1);box-shadow:0 8px 28px rgba(0,0,0,0.45)}' +
      '14%{transform:scale(1.06);box-shadow:0 12px 36px rgba(0,0,0,0.55)}' +
      '28%{transform:scale(1);box-shadow:0 8px 28px rgba(0,0,0,0.45)}' +
      '40%{transform:scale(1.04);box-shadow:0 10px 32px rgba(0,0,0,0.50)}' +
      '54%{transform:scale(1);box-shadow:0 8px 28px rgba(0,0,0,0.45)}' +
      '100%{transform:scale(1);box-shadow:0 8px 28px rgba(0,0,0,0.45)}}' +
    '.ea-fab-btn{-webkit-appearance:none;appearance:none;background:transparent!important;border:none}' +
    '.ea-fab-btn:hover,.ea-fab-btn:focus,.ea-fab-btn:active{background:transparent!important;outline:none}';
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
  fab.classList.add('ea-fab-btn');
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

  /* Classic mode: swap logo/chat-bubble ↔ × icon */
  function _setClassicIcon(open) {
    if (!_isClassic) return;
    if (open) {
      if (_fabLogoDiv)   _fabLogoDiv.style.display   = 'none';
      if (_fabCloseIcon) _fabCloseIcon.style.display  = 'flex';
      fab.style.display  = 'none'; /* hide button entirely — _fabCloseIcon handles clicks */
    } else if (_fabLogoDiv) {
      if (_fabCloseIcon) _fabCloseIcon.style.display  = 'none';
      _fabLogoDiv.style.display   = 'block';
      _fabLogoDiv.style.boxShadow = '0 0 0 2px ' + _fabBrandColour + ', 0 8px 24px rgba(0,0,0,0.25)';
      if (_fabLogoPulse) _fabLogoDiv.style.animation  = 'ea-logo-pulse 2.5s ease-in-out infinite';
      fab.style.display    = '';
      fab.style.background = 'transparent';
      fab.style.border     = 'none';
      fab.style.boxShadow  = '';
      fab.innerHTML        = '';
    } else {
      /* Default: chat bubble icon */
      fab.style.backgroundImage    = '';
      fab.style.backgroundSize     = '';
      fab.style.backgroundPosition = '';
      fab.style.background         = '#151515';
      fab.style.border             = '1px solid rgba(255,255,255,0.06)';
      fab.style.boxShadow          = '';
      fab.style.display            = 'flex';
      fab.style.alignItems         = 'center';
      fab.style.justifyContent     = 'center';
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

  fab.addEventListener('mouseenter', function () {
    _isHoveringFab = true;
    if (isOpen) return;
    if (_isClassic) {
      if (_fabLogoDiv) {
        _fabLogoDiv.style.transform = 'scale(1.03)';
        _fabLogoDiv.style.boxShadow = '0 0 0 2px ' + _fabBrandColour + ', 0 12px 28px rgba(0,0,0,0.35)';
        _fabLogoDiv.style.animationPlayState = 'paused';
      } else {
        fab.style.animationPlayState = 'paused';
        fab.style.transform  = 'scale(1.06)';
        fab.style.background = '#2a2a2a';
        fab.style.boxShadow  = '0 6px 24px rgba(0,0,0,0.45)';
      }
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
  fab.addEventListener('mouseleave', function () {
    _isHoveringFab = false;
    if (isOpen) return;
    if (_isClassic) {
      if (_fabLogoDiv) {
        _fabLogoDiv.style.transform = '';
        _fabLogoDiv.style.boxShadow = '0 0 0 2px ' + _fabBrandColour + ', 0 8px 24px rgba(0,0,0,0.25)';
        _fabLogoDiv.style.animationPlayState = 'running';
      } else {
        fab.style.transform          = '';
        fab.style.boxShadow          = '';
        fab.style.animationPlayState = 'running';
        fab.style.background         = '#151515';
      }
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
  var _isHoveringTeaser = false;
  var _teaserTypeSeq    = 0;   /* incremented each show — cancels any in-progress typing */

  var _peekMessage      = '';
  var _peekDelay        = 6000;
  var _peekRetract      = 7000;
  var _peekTimer        = null;
  var _peekRetractTimer = null;
  var _peekVisible      = false;
  var _peekDone         = false; /* true once shown this session — never show again */

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
    boxShadow:     '0 4px 16px rgba(0,0,0,0.18)',
    padding:       '8px 18px',
    fontSize:      '13px',
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
    _teaserTypeSeq++;
    clearTimeout(_teaserTimer);
    clearTimeout(_teaserAutoTimer);
    teaser.style.display = 'none';
    _teaserArmsAngle = 0;
    openFab();
  });
  teaser.addEventListener('mouseenter', function () { _isHoveringTeaser = true; });
  teaser.addEventListener('mouseleave', function () { _isHoveringTeaser = false; });

  /* ── Peek panel ─────────────────────────────────────────────────────────── */
  var _peekBg     = '#0e1621'; /* dark navy — updated per client in _showPeek */
  var _peekAccent = '#c77c56'; /* brand accent — updated per client in _showPeek */

  var peekPanel = document.createElement('div');
  peekPanel.className = 'ea-peek-panel';
  Object.assign(peekPanel.style, {
    position:     'absolute',
    top:          '50%',
    right:        '80px',   /* flush with classic FAB edge — no gap, set precisely in _showPeek */
    display:      'none',
    width:        '210px',
    background:   _peekBg,
    borderRadius: '14px 2px 2px 14px',
    border:       '1px solid rgba(255,255,255,0.07)',
    boxShadow:    '0 8px 24px rgba(0,0,0,0.35)',
    padding:      '13px 30px 13px 44px',
    fontFamily:   '"Space Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fontSize:     '13px',
    fontWeight:   '400',
    letterSpacing:'0.025em',
    lineHeight:   '1.5',
    cursor:       'pointer',
    userSelect:   'none',
    zIndex:       '3',
    boxSizing:    'border-box',
    minHeight:    '46px',
  });

  /* Thin-line chat icon — never a filled blob */
  var peekIcon = document.createElement('div');
  Object.assign(peekIcon.style, {
    position:  'absolute',
    left:      '12px',
    top:       '50%',
    transform: 'translateY(-50%)',
    width:     '20px',
    height:    '20px',
    opacity:   '0.8',
    color:     _peekAccent,
    lineHeight:'0',
  });
  peekIcon.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"' +
    ' stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  peekPanel.appendChild(peekIcon);

  /* Right-pointing arrow that bridges panel to FAB — direction flipped for left FABs */
  var peekArrow = document.createElement('div');
  Object.assign(peekArrow.style, {
    position:      'absolute',
    top:           '50%',
    right:         '-7px',
    transform:     'translateY(-50%)',
    width:         '0',
    height:        '0',
    borderTop:     '6px solid transparent',
    borderBottom:  '6px solid transparent',
    borderLeft:    '7px solid ' + _peekBg,
    pointerEvents: 'none',
  });
  peekPanel.appendChild(peekArrow);

  /* Typing indicator: 3 bouncing dots */
  var peekTyping = document.createElement('div');
  Object.assign(peekTyping.style, { display: 'flex', gap: '4px', alignItems: 'center', height: '20px' });
  for (var _pdi = 0; _pdi < 3; _pdi++) {
    var _pdot = document.createElement('span');
    Object.assign(_pdot.style, {
      width: '5px', height: '5px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.3)', display: 'inline-block', flexShrink: '0',
      animation: 'ea-peek-dot 1.1s ease-in-out ' + (_pdi * 0.18) + 's infinite',
    });
    peekTyping.appendChild(_pdot);
  }
  peekPanel.appendChild(peekTyping);

  /* Message text */
  var peekText = document.createElement('div');
  Object.assign(peekText.style, { display: 'none', color: 'rgba(255,255,255,0.88)', position: 'relative' });
  peekPanel.appendChild(peekText);

  /* Blinking cursor — inserted into peekText during typing */
  var peekCursor = document.createElement('span');
  Object.assign(peekCursor.style, {
    display: 'inline-block', width: '1.5px', height: '1em',
    background: 'rgba(255,255,255,0.6)', verticalAlign: 'middle', marginLeft: '1px',
    animation: 'ea-peek-blink 0.9s step-end infinite',
  });

  /* Dismiss × — very low contrast, appears only after typing finishes */
  var peekDismiss = document.createElement('button');
  Object.assign(peekDismiss.style, {
    position: 'absolute', top: '7px', right: '9px',
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
    fontSize: '14px', lineHeight: '1', cursor: 'pointer', padding: '2px',
    fontFamily: 'inherit', width: '18px', height: '18px',
    display: 'none', alignItems: 'center', justifyContent: 'center',
    opacity: '0', transition: 'opacity 0.4s ease',
  });
  peekDismiss.textContent = '×';
  peekDismiss.setAttribute('aria-label', 'Dismiss');
  peekPanel.appendChild(peekDismiss);

  fabWrap.appendChild(peekPanel);

  function _showTeaser(onTyped) {
    if (_teaserDismissed || isOpen || !_teaserPrompts.length) return;
    var prompt = _teaserPrompts[_teaserIndex % _teaserPrompts.length];
    _teaserIndex++;
    _teaserShowCount++;
    _teaserArmsAngle = 8;
    _setArmsResting();
    if (!_isHoveringFab) _setGlow('prompt');
    var seq   = ++_teaserTypeSeq;
    var typeMs = isMobile() ? 32 : 38;
    setTimeout(function () {
      if (_teaserDismissed || isOpen || seq !== _teaserTypeSeq) return;
      teaserText.textContent = '';
      teaser.style.display   = 'block';
      teaser.style.animation = 'ea-teaser-in 0.35s ease-out both';
      var chars = prompt.split('');
      var ci = 0;
      (function typeNext() {
        if (seq !== _teaserTypeSeq || _teaserDismissed || isOpen) return;
        if (ci < chars.length) {
          teaserText.textContent += chars[ci++];
          setTimeout(typeNext, typeMs);
        } else {
          if (onTyped) onTyped();
        }
      })();
    }, 150);
  }

  function _hideTeaser(cb) {
    _teaserTypeSeq++; /* cancel any in-progress typewriter */
    _isHoveringTeaser = false;
    if (teaser.style.display === 'none') { if (cb) cb(); return; }
    teaser.style.animation = 'ea-teaser-out 0.28s ease-in both';
    setTimeout(function () {
      teaser.style.display   = 'none';
      teaser.style.animation = '';
      _teaserArmsAngle = 0;
      if (!isOpen) _setArmsResting();
      _setGlow(_isHoveringFab ? 'hover' : 'none');
      if (cb) cb();
    }, 290);
  }

  function _scheduleCycle() {
    /* ms to stay visible after typing finishes */
    var pauseAfterTyping = 4500;
    /* gap before 2nd appearance, gap before 3rd — desktop */
    var gaps    = isMobile() ? [15000] : [15000, 20000];
    var maxShow = isMobile() ? 2 : 3;

    if (_teaserDismissed) return;
    /* Persist mode: show once, hold forever — no auto-hide, no cycling */
    if (_teaserPersist && !isMobile()) { _showTeaser(null); return; }
    if (_teaserShowCount >= maxShow) return;

    _showTeaser(function () {
      /* Fires when typing completes — start the post-type visible pause */
      function tryHide() {
        if (_isHoveringFab || _isHoveringTeaser) {
          _teaserAutoTimer = setTimeout(tryHide, 300);
          return;
        }
        /* _teaserShowCount already incremented inside _showTeaser */
        var gapIdx  = _teaserShowCount - 1;
        var nextGap = gaps[gapIdx] !== undefined ? gaps[gapIdx] : null;
        _hideTeaser(function () {
          if (_teaserOnce) { _teaserDismissed = true; return; }
          if (!_teaserDismissed && nextGap !== null && _teaserShowCount < maxShow) {
            _teaserTimer = setTimeout(_scheduleCycle, nextGap);
          }
        });
      }
      _teaserAutoTimer = setTimeout(tryHide, pauseAfterTyping);
    });
  }

  function initTeaser(text, persist, once) {
    if (!text) return;
    _teaserPersist = !!(persist && !isMobile());
    _teaserOnce    = !!once;
    _teaserPrompts = text.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!_teaserPrompts.length) return;
    /* Persist: show quickly. Otherwise give them 3.5 s to see the page (5 s on mobile). */
    var firstDelay = _teaserPersist ? 800 : (isMobile() ? 5000 : 3500);
    _teaserTimer = setTimeout(_scheduleCycle, firstDelay);
  }

  function _showPeek() {
    if (_peekDone || isOpen || !_peekMessage) return;
    _peekDone = true;
    try { sessionStorage.setItem('__vaughan_peek_' + clientId, '1'); } catch (_) {}

    var isLeft = _pos.indexOf('left') !== -1;
    /* Flush against the FAB edge — 80px classic, 88px V2 */
    var fabEdge = _isClassic ? 80 : 88;
    if (isLeft) {
      peekPanel.style.right         = 'auto';
      peekPanel.style.left          = fabEdge + 'px';
      peekPanel.style.borderRadius  = '2px 14px 14px 2px';
      /* Arrow points left (toward the FAB which is to the left) */
      Object.assign(peekArrow.style, {
        right: 'auto', left: '-7px',
        borderLeft: 'none', borderRight: '7px solid ' + _peekBg,
      });
    } else {
      peekPanel.style.left          = 'auto';
      peekPanel.style.right         = fabEdge + 'px';
      peekPanel.style.borderRadius  = '14px 2px 2px 14px';
      /* Arrow points right (toward the FAB which is to the right) */
      Object.assign(peekArrow.style, {
        left: 'auto', right: '-7px',
        borderRight: 'none', borderLeft: '7px solid ' + _peekBg,
      });
    }

    /* Brand accent on icon */
    var accent = _fabBrandColour || _brandColour || '#c77c56';
    peekIcon.style.color = accent;

    peekTyping.style.display    = 'flex';
    peekTyping.style.opacity    = '1';
    peekText.style.display      = 'none';
    peekText.textContent        = '';
    peekDismiss.style.display   = 'none';
    peekDismiss.style.opacity   = '0';

    peekPanel.style.display   = 'block';
    peekPanel.style.animation = (isLeft ? 'ea-peek-in-l' : 'ea-peek-in') + ' 0.32s ease-out both';
    _peekVisible = true;

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced) {
      peekTyping.style.display = 'none';
      peekText.textContent     = _peekMessage;
      peekText.style.display   = 'block';
      peekDismiss.style.display = 'flex';
      peekDismiss.style.opacity = '1';
      _peekRetractTimer = setTimeout(_hidePeek, _peekRetract);
      return;
    }

    /* Phase 1 — typing dots for ~820ms */
    setTimeout(function () {
      if (!_peekVisible) return;
      peekTyping.style.transition = 'opacity 0.18s ease';
      peekTyping.style.opacity    = '0';

      /* Phase 2 — typewriter */
      setTimeout(function () {
        if (!_peekVisible) return;
        peekTyping.style.display    = 'none';
        peekTyping.style.transition = '';
        peekText.textContent = '';
        peekText.appendChild(peekCursor);
        peekText.style.display = 'block';
        peekCursor.style.animation = 'ea-peek-blink 0.9s step-end infinite';
        peekCursor.style.opacity   = '1';
        peekCursor.style.transition = '';

        var chars = _peekMessage.split('');
        var ci = 0;
        (function typeNext() {
          if (!_peekVisible) return;
          if (ci >= chars.length) {
            setTimeout(function () {
              if (!_peekVisible) return;
              peekCursor.style.animation  = 'none';
              peekCursor.style.transition = 'opacity 0.35s ease';
              peekCursor.style.opacity    = '0';
              setTimeout(function () {
                if (peekCursor.parentNode === peekText) peekText.removeChild(peekCursor);
                peekDismiss.style.display = 'flex';
                requestAnimationFrame(function () { peekDismiss.style.opacity = '1'; });
              }, 380);
            }, 600);
            _peekRetractTimer = setTimeout(_hidePeek, _peekRetract);
            return;
          }
          peekText.insertBefore(document.createTextNode(chars[ci++]), peekCursor);
          setTimeout(typeNext, 38);
        })();
      }, 180);
    }, 820);
  }

  function _hidePeek() {
    if (!_peekVisible) return;
    _peekVisible = false;
    clearTimeout(_peekRetractTimer);
    var isLeft = _pos.indexOf('left') !== -1;
    peekPanel.style.animation = (isLeft ? 'ea-peek-out-l' : 'ea-peek-out') + ' 0.28s ease-out both';
    setTimeout(function () { peekPanel.style.display = 'none'; peekPanel.style.animation = ''; }, 300);
  }

  peekPanel.addEventListener('click', function (e) {
    if (e.target === peekDismiss) {
      e.stopPropagation();
      _hidePeek();
      return;
    }
    _hidePeek();
    openFab();
  });
  peekDismiss.addEventListener('click', function (e) {
    e.stopPropagation();
    _hidePeek();
  });

  function initPeek(msg, delay, retract) {
    if (!msg) return;
    try { if (sessionStorage.getItem('__vaughan_peek_' + clientId)) return; } catch (_) {}
    _peekMessage = msg;
    _peekDelay   = delay  || 6000;
    _peekRetract = retract || 7000;

    /* Delay trigger */
    _peekTimer = setTimeout(_showPeek, _peekDelay);

    /* Scroll trigger — whichever fires first */
    var _scrollHandler = function () {
      var pct = window.scrollY / (document.body.scrollHeight - window.innerHeight || 1);
      if (pct >= 0.20) {
        window.removeEventListener('scroll', _scrollHandler);
        clearTimeout(_peekTimer);
        _showPeek();
      }
    };
    window.addEventListener('scroll', _scrollHandler, { passive: true });
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
        bottom:    isFloated ? 'auto'  : (_isClassic ? '112px' : '112px'),
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

  /* Desktop only — Chrome iOS leaks click events from iframe taps which would wrongly close the widget */
  overlay.addEventListener('click', function () { if (isOpen && !isMobile()) closeFab(); });
  /* Chrome iOS also leaks touchend from iframe — guard against touches inside the container.
     Safari does NOT have this leak so it gets the original handler with no coordinate check. */
  overlay.addEventListener('touchend', function (e) {
    if (!isOpen) return;
    if (_isChromeIOS) {
      var t = e.changedTouches && e.changedTouches[0];
      if (t) {
        var r = container.getBoundingClientRect();
        if (t.clientX >= r.left && t.clientX <= r.right &&
            t.clientY >= r.top  && t.clientY <= r.bottom) return;
      }
    }
    e.preventDefault();
    closeFab();
  }, { passive: false });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closeFab(); });
  window.addEventListener('message', function (e) { if (e.data === 'vaughan:close' && isOpen) closeFab(); });

  function openFab() {
    isOpen = true;
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
    _teaserDismissed = true;
    teaser.style.display = 'none';
    teaser.style.animation = '';
    _teaserArmsAngle = 0;
    clearTimeout(_peekTimer);
    clearTimeout(_peekRetractTimer);
    if (_peekVisible) { _peekVisible = false; peekPanel.style.display = 'none'; peekPanel.style.animation = ''; }
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
  function buildClassicFab(logoUrl, brandColour, logoPulse, logoGlowColour, logoPadding) {
    _fabLogoUrl     = logoUrl       || '';
    _fabBrandColour = brandColour   || '';
    _fabLogoPulse   = !!logoPulse;
    _fabGlowColour  = logoGlowColour || brandColour || '';
    _fabLogoPadding = logoPadding || 0;
    /* Remove V arms — they were appended before we knew the style */
    fabWrap.removeChild(fabArmLeft);
    fabWrap.removeChild(fabArmRight);
    /* Size fabWrap to the button */
    fabWrap.style.width    = '80px';
    fabWrap.style.height   = '80px';
    fabWrap.style.position = 'fixed'; /* ensure positioning context for absolute children */

    if (_fabLogoUrl) {
      /* Create a clipping layer: div with overflow:hidden clips the img to a perfect circle.
         This avoids background-image anti-aliasing artifacts at the clip edge. */
      _fabLogoDiv = document.createElement('div');
      Object.assign(_fabLogoDiv.style, {
        position:        'absolute',
        top:             '0',
        left:            '0',
        width:           '100%',
        height:          '100%',
        borderRadius:    '50%',
        overflow:        'hidden',
        backgroundColor: 'transparent',
        boxShadow:       '0 0 0 2px ' + _fabBrandColour + ', 0 8px 24px rgba(0,0,0,0.25)',
        pointerEvents:   'none',
        transformOrigin: 'center',
        transition:      'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      });
      _fabLogoImg = document.createElement('img');
      _fabLogoImg.src = _fabLogoUrl;
      _fabLogoImg.alt = '';
      Object.assign(_fabLogoImg.style, {
        width:      (100 - _fabLogoPadding * 2) + '%',
        height:     (100 - _fabLogoPadding * 2) + '%',
        objectFit:  _fabLogoPadding ? 'contain' : 'cover',
        display:    'block',
        position:   _fabLogoPadding ? 'absolute' : 'static',
        top:        _fabLogoPadding ? '50%' : 'auto',
        left:       _fabLogoPadding ? '50%' : 'auto',
        transform:  _fabLogoPadding ? 'translate(-50%, -50%)' : 'none',
        transition: 'filter 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      });
      _fabLogoDiv.appendChild(_fabLogoImg);
      fabWrap.insertBefore(_fabLogoDiv, fab);

      if (_fabLogoPulse) {
        var pulseStyle = document.createElement('style');
        pulseStyle.textContent =
          '@keyframes ea-logo-pulse{' +
          '0%,100%{box-shadow:0 0 0 2px ' + _fabBrandColour + ',0 0 0 0 ' + _fabGlowColour + '}' +
          '50%{box-shadow:0 0 0 2px ' + _fabBrandColour + ',0 0 18px 6px ' + _fabGlowColour + '66}}';
        document.head.appendChild(pulseStyle);
        _fabLogoDiv.style.animation = 'ea-logo-pulse 2.5s ease-in-out infinite';
      }
    }

    /* Close icon: plain div (no button defaults), shown instead of logo when open */
    _fabCloseIcon = document.createElement('div');
    _fabCloseIcon.innerHTML =
      '<svg width="36" height="36" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<line x1="4" y1="4" x2="16" y2="16" stroke="' + (_fabBrandColour || 'rgba(255,255,255,0.85)') + '" stroke-width="2" stroke-linecap="round"/>' +
      '<line x1="16" y1="4" x2="4" y2="16" stroke="' + (_fabBrandColour || 'rgba(255,255,255,0.85)') + '" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
    Object.assign(_fabCloseIcon.style, {
      display:         'none',
      position:        'absolute',
      top:             '0', left: '0',
      width:           '100%', height: '100%',
      borderRadius:    '50%',
      overflow:        'hidden',
      background:      'transparent',
      alignItems:      'center',
      justifyContent:  'center',
      pointerEvents:   'auto',
      cursor:          'pointer',
    });
    _fabCloseIcon.addEventListener('click', function () { closeFab(); });
    fabWrap.insertBefore(_fabCloseIcon, fab);

    /* fab becomes the click target — absolute to sit on top of _fabLogoDiv */
    Object.assign(fab.style, {
      position:     'absolute',
      top:          '0',
      left:         '0',
      width:        '100%',
      height:       '100%',
      borderRadius: '50%',
      padding:      '0',
      cursor:       'pointer',
      transition:   'transform 0.2s ease, box-shadow 0.2s ease',
      animation:    _fabLogoUrl ? 'none' : 'ea-heartbeat 3.2s ease-in-out infinite',
    });
    _setClassicIcon(false);
    /* Teaser sits above the button */
    teaser.style.bottom = '96px';
  }

  /* ── 8b. Initialise V — static, clean, waiting */
  function applyColor() {
    _setArmsResting();
  }

  function applyMobileScale() {
    if (!isMobile()) return;
    if (_isClassic) {
      /* Classic button: 52px on mobile */
      fabWrap.style.width  = '68px';
      fabWrap.style.height = '68px';
      fab.style.width      = '68px';
      fab.style.height     = '68px';
      teaser.style.right  = '0';
      teaser.style.left   = 'auto';
      teaser.style.bottom = '84px'; /* 68px + 16px */
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
        _widgetStyle  = widgetStyleArg || d.widgetStyle || 'classic';
        _isClassic    = _widgetStyle === 'classic';
        _brandColour  = d.brandColour || '';
        if (_isClassic) buildClassicFab(d.logoUrl || '', d.brandColour || '', d.logoPulse || false, d.logoGlowColour || '', d.logoPadding || 0);
        applyFabPosition(d.widgetPosition || 'bottom-right');
        applyMobileScale();
        applyColor();
        initTeaser(d.teaserText || teaserArg || null, d.teaserPersist, d.teaserOnce || false);
        initPeek(d.peekMessage || null, d.peekDelay || 6000, d.peekRetract || 7000);
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
