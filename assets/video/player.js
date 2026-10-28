/* Interactive lab "videos": scripted scenes (architecture camera moves, animated DNS packets, typed Cloud Shell
   output, screenshot zooms), captions, optional browser narration, clickable components and quizzes.
   Data: window.LAB_VIDEO_DATA (videos.js). No external dependencies. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zM9.5 12 18 18V6z" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" fill="currentColor"/></svg>',
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor"/></svg>',
    cc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
  };
  var players = [];

  function D() { return window.LAB_VIDEO_DATA; }
  // lvclock=wall (test hook): advance by real elapsed time even when the browser renders few frames
  var WALL = /[?&]lvclock=wall\b/.test(location.search);
  // lvdebug (test hook): show the narration audio state on the stage
  var DEBUG = /[?&]lvdebug\b/.test(location.search);
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function sv(tag, attrs) { var e = document.createElementNS(NS, tag); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function btn(icon, label, cls) { var b = el('button', cls || 'lv-btn', icon); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; return b; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function words(t) { return (t || '').trim().split(/\s+/).filter(Boolean).length; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rich(t) { return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>'); }
  function asset(p) { var m = D().media || {}; return m[p] || p; }

  /* ---------- geometry helpers ---------- */
  function expandPath(spec, sceneNodes) {
    var A = D().assets, pts = [];
    (spec || []).forEach(function (s) {
      var add = [];
      if (typeof s === 'string') {
        if (A.paths && A.paths[s]) add = A.paths[s].map(function (p) { return typeof p === 'string' ? A.points[p] : p; });
        else if (A.points && A.points[s]) add = [A.points[s]];
        else { var r = (sceneNodes && sceneNodes[s]) || (A.nodes[s] && A.nodes[s].r); if (r) add = [[r[0] + r[2] / 2, r[1] + r[3] / 2]]; }
      } else add = [s];
      add.forEach(function (p) { var l = pts[pts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p); });
    });
    return pts;
  }
  function pathLen(pts) { var L = 0; for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  function pointAt(pts, d) {
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= l || i === pts.length - 1) { var f = l ? clamp(d / l, 0, 1) : 1; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
      d -= l;
    }
    return pts[pts.length - 1];
  }
  function pktSpeed(pk, u) { return (pk && pk.speed) || 470 * u; }
  function pktTime(pk, u, sceneNodes) {
    var L = pathLen(expandPath(pk.path, sceneNodes)), v = pktSpeed(pk, u);
    return L / v * (pk.back ? 2 : 1) + (pk.back ? 0.55 : 0) + 0.3;
  }

  /* ---------- the player ---------- */
  function Player(host, id, opts) {
    this.host = host; this.opts = opts || {}; this.id = id;
    this.v = D().videos.filter(function (x) { return x.id === id; })[0];
    if (!this.v) { host.textContent = 'Video not found: ' + id; return; }
    this.flatten();
    this.k = -1; this.elT = 0; this.playing = false; this.started = false; this.ended = false;
    this.cc = true; this.narrate = narrPref(); this.speaking = false; this.speed = 1; this.aStarted = false;
    this.build();
    this.goto(0, true);
    this.poster();
    players.push(this);
  }
  Player.duration = function (id) {
    var v = D().videos.filter(function (x) { return x.id === id; })[0];
    if (!v) return 0; var t = 0;
    v.scenes.forEach(function (sc) { sc.beats.forEach(function (b) { t += beatDur(sc, b); }); });
    return t;
  };
  function sceneUnit(sc) {
    var A = D().assets;
    if (sc.type === 'arch') return A.arch.w / 1000;
    if (sc.type === 'shot') return (sc.w || 1000) / 1000;
    if (sc.type === 'flow') return 1.6;
    return 1;
  }
  var LEAD = 0.3, TAIL = 0.8;   // seconds before a narration clip starts / after it ends
  function beatDur(sc, b) {
    if (b.d) return b.d;
    var d = b.ad ? Math.max(3, LEAD + b.ad + TAIL) : Math.max(3.4, words(b.cap) * 0.34 + 1.5);
    if (b.pkt) d = Math.max(d, pktTime(b.pkt, sceneUnit(sc), sc.nodes && nodeMap(sc.nodes)) + 1.2);
    if (b.wait) d = Math.max(d, 1);
    return Math.round(d * 10) / 10;
  }
  // shrink an SVG text element so it fits maxW (world units); needs the element in the document
  function fitText(t, maxW) {
    try { var w = t.getComputedTextLength(); if (w > maxW && maxW > 0) t.setAttribute('font-size', (parseFloat(t.getAttribute('font-size')) * maxW / w).toFixed(1)); } catch (e) { }
  }
  function nodeMap(list) { var m = {}; (list || []).forEach(function (n) { m[n.id] = [n.x, n.y, n.w, n.h]; }); return m; }

  Player.prototype.flatten = function () {
    var self = this, t = 0; this.beats = []; this.sceneStart = [];
    this.v.scenes.forEach(function (sc, si) {
      self.sceneStart.push(self.beats.length);
      sc.beats.forEach(function (b, bi) {
        var x = {}; for (var k in b) x[k] = b[k];
        x.si = si; x.bi = bi; x.d = beatDur(sc, b); x.t0 = t; t += x.d; self.beats.push(x);
      });
    });
    this.total = t;
  };

  Player.prototype.build = function () {
    var self = this, h = this.host;
    h.classList.add('lv'); h.tabIndex = 0; h.setAttribute('role', 'region'); h.setAttribute('aria-label', 'Interactive video: ' + this.v.title);
    h.innerHTML = '';
    this.stage = el('div', 'lv-stage'); h.appendChild(this.stage);
    this.sceneHost = el('div', 'lv-scene'); this.stage.appendChild(this.sceneHost);
    this.badge = el('div', 'lv-badge'); this.badge.textContent = this.v.badge || this.v.title; this.stage.appendChild(this.badge);
    this.choiceBox = el('div', 'lv-choices'); this.stage.appendChild(this.choiceBox);
    this.capBox = el('div', 'lv-cap'); this.capSpan = el('span'); this.capBox.appendChild(this.capSpan); this.stage.appendChild(this.capBox);
    this.capBox.setAttribute('aria-live', 'polite');
    this.info = el('div', 'lv-info'); this.info.hidden = true; this.stage.appendChild(this.info);
    this.ov = el('div', 'lv-ov'); this.ov.hidden = true; this.stage.appendChild(this.ov);

    var bar = el('div', 'lv-bar'); h.appendChild(bar);
    this.bPlay = btn(ICON.play, 'Play (Space)'); this.bPrev = btn(ICON.prev, 'Previous scene'); this.bNext = btn(ICON.next, 'Next scene');
    this.track = el('div', 'lv-track'); this.track.setAttribute('role', 'slider'); this.track.setAttribute('aria-label', 'Seek');
    this.fill = el('div', 'lv-fill'); this.knob = el('div', 'lv-knob'); this.track.appendChild(this.fill);
    this.sceneStart.forEach(function (k, i) { if (i === 0) return; var tk = el('div', 'lv-tick'); tk.style.left = (self.beats[k].t0 / self.total * 100) + '%'; self.track.appendChild(tk); });
    this.track.appendChild(this.knob);
    this.time = el('span', 'lv-time');
    this.sel = el('select', 'lv-sel'); this.sel.setAttribute('aria-label', 'Speed');
    [0.75, 1, 1.25, 1.5].forEach(function (s) { var o = el('option'); o.value = s; o.textContent = s + '\u00d7'; if (s === 1) o.selected = true; self.sel.appendChild(o); });
    this.bCC = btn('<span class="lv-cc">CC</span>', 'Captions (C)'); this.bCC.classList.add('on');
    this.bVoice = btn(ICON.voice, 'Narration on/off (N)'); this.bVoice.classList.toggle('on', this.narrate); this.bVoice.setAttribute('aria-pressed', String(this.narrate));
    this.bFull = btn(ICON.full, 'Full screen (F)');
    [this.bPlay, this.bPrev, this.bNext, this.track, this.time, this.sel, this.bCC, this.bVoice, this.bFull].forEach(function (x) { bar.appendChild(x); });

    var tr = el('details', 'lv-tr'); var sm = el('summary'); sm.textContent = 'Transcript (click a line to jump there)'; tr.appendChild(sm);
    this.trList = el('ol'); tr.appendChild(this.trList); h.appendChild(tr);
    this.beats.forEach(function (b, k) {
      var li = el('li'); li.innerHTML = '<span>' + fmt(b.t0) + '</span>' + rich(b.cap || '');
      li.addEventListener('click', function () { self.goto(k); self.play(); });
      self.trList.appendChild(li);
    });

    this.bPlay.addEventListener('click', function () { self.toggle(); });
    this.bPrev.addEventListener('click', function () { self.jumpScene(-1); });
    this.bNext.addEventListener('click', function () { self.jumpScene(1); });
    this.track.addEventListener('click', function (e) {
      var r = self.track.getBoundingClientRect(), t = clamp((e.clientX - r.left) / r.width, 0, 1) * self.total;
      for (var k = self.beats.length - 1; k >= 0; k--) if (self.beats[k].t0 <= t) { self.goto(k); break; }
      if (self.started) self.play();
    });
    this.sel.addEventListener('change', function () { self.speed = parseFloat(self.sel.value) || 1; if (self.audio) self.audio.playbackRate = self.speed; });
    this.bCC.addEventListener('click', function () { self.toggleCC(); });
    this.bVoice.addEventListener('click', function () { self.toggleVoice(); });
    this.bFull.addEventListener('click', function () { self.fullscreen(); });
    h.addEventListener('keydown', function (e) {
      if (e.target !== h && /^(BUTTON|SELECT|INPUT|SUMMARY|LI)$/.test(e.target.tagName) && e.key !== 'Escape') return;
      var k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') { e.preventDefault(); self.toggle(); }
      else if (k === 'arrowright') { e.preventDefault(); self.goto(self.k + 1); }
      else if (k === 'arrowleft') { e.preventDefault(); self.goto(self.k - 1); }
      else if (k === 'c') self.toggleCC();
      else if (k === 'n') self.toggleVoice();
      else if (k === 'f') self.fullscreen();
      else if (k === 'escape') self.hideInfo();
    });
    if (window.ResizeObserver) new ResizeObserver(function () { self.relayout(); }).observe(this.stage);
    else window.addEventListener('resize', function () { self.relayout(); });
  };

  /* ---------- playback ---------- */
  Player.prototype.toggle = function () { if (this.playing) this.pause(); else this.play(); };
  Player.prototype.play = function () {
    var self = this;
    players.forEach(function (p) { if (p !== self && p.playing) p.pause(); });
    if (this.ended) { this.ended = false; this.goto(0); }
    if (!this.started) { this.started = true; this.goto(this.k < 0 ? 0 : this.k); }
    this.ov.hidden = true; this.hideInfo();
    this.playing = true; this.last = 0; this.bPlay.innerHTML = ICON.pause; this.bPlay.setAttribute('aria-label', 'Pause (Space)'); this.bPlay.title = 'Pause (Space)';
    this.resumeNarration();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(function (t) { self.loop(t); });
  };
  Player.prototype.pause = function () {
    this.playing = false; cancelAnimationFrame(this.raf); this.badge.classList.remove('hide');
    if (this.audio) this.audio.pause();
    this.bPlay.innerHTML = ICON.play; this.bPlay.setAttribute('aria-label', 'Play (Space)'); this.bPlay.title = 'Play (Space)';
    this.stopSpeech();
  };
  Player.prototype.loop = function (ts) {
    var self = this;
    if (!this.playing) return;
    var dt = this.last ? Math.min(WALL ? 600 : 0.25, (ts - this.last) / 1000) : 0; this.last = ts;
    var b = this.beats[this.k], sdt = dt * this.speed, guard = 0;
    if (this.rt && this.rt.tick) this.rt.tick(sdt);
    this.badgeT = (this.badgeT || 0) + sdt; this.badge.classList.toggle('hide', this.badgeT > 5);
    if (DEBUG) this.debugState();
    if (!b.wait) {
      this.elT += sdt;
      while (this.elT >= b.d && guard++ < 400) {
        if (this.narrate && this.speaking && this.elT < b.d * 4) break;
        var over = this.elT - b.d;
        if (this.k >= this.beats.length - 1) { this.finish(); return; }
        this.goto(this.k + 1);
        b = this.beats[this.k];
        if (b.wait) break;
        this.elT = over;
        if (over > 0 && this.rt && this.rt.tick) this.rt.tick(over);
      }
    }
    b = this.beats[this.k];
    if (this.narrate && !this.aStarted) { var lead = b.wait ? 0 : LEAD; if (this.elT >= lead) this.startNarration(b, this.elT - lead); }
    this.updateBar();
    this.raf = requestAnimationFrame(function (t) { self.loop(t); });
  };
  Player.prototype.finish = function () {
    var self = this;
    this.pause(); this.ended = true; this.elT = this.beats[this.k].d; this.updateBar();
    var nx = this.opts.next && this.opts.next(this.id);
    this.ov.innerHTML = '';
    var k = el('div', 'k'); k.textContent = 'End of ' + (this.v.badge || 'video');
    var t = el('div', 't'); t.textContent = this.v.title;
    var row = el('div', 'row');
    var r = el('button', 'lv-pbtn'); r.type = 'button'; r.textContent = 'Replay'; r.addEventListener('click', function () { self.play(); });
    row.appendChild(r);
    if (nx) {
      var n = el('button', 'lv-pbtn pri'); n.type = 'button'; n.textContent = 'Next: ' + nx.title;
      n.addEventListener('click', function () { self.opts.onNext(nx.id); }); row.appendChild(n);
    }
    this.ov.appendChild(k); this.ov.appendChild(t); this.ov.appendChild(row); this.ov.classList.add('poster'); this.ov.hidden = false;
    if (this.opts.onEnd) this.opts.onEnd(this.id);
  };
  Player.prototype.poster = function () {
    var self = this;
    this.ov.innerHTML = '';
    var k = el('div', 'k'); k.textContent = this.v.badge || '';
    var t = el('div', 't'); t.textContent = this.v.title;
    var b = btn(ICON.play, 'Play video', 'lv-big'); b.addEventListener('click', function () { self.play(); });
    var s = el('div', 's'); s.textContent = fmt(this.total) + ' \u00b7 interactive: pause any time, click the components, use the replay buttons' + (this.v.quiz ? ', answer the quiz' : '');
    this.ov.appendChild(k); this.ov.appendChild(t); this.ov.appendChild(b); this.ov.appendChild(s); this.ov.classList.add('poster'); this.ov.hidden = false;
  };
  Player.prototype.jumpScene = function (dir) {
    var si = this.beats[this.k].si, target;
    if (dir > 0) target = si + 1 < this.sceneStart.length ? this.sceneStart[si + 1] : this.beats.length - 1;
    else target = (this.k > this.sceneStart[si] || si === 0) ? this.sceneStart[si] : this.sceneStart[si - 1];
    this.goto(target);
    if (this.started && !this.playing && !this.ended) this.play();
  };

  Player.prototype.goto = function (k, initial) {
    k = clamp(k, 0, this.beats.length - 1);
    var b = this.beats[k], j;
    this.hideInfo();
    if (this.ended && !initial) { this.ended = false; this.ov.hidden = true; }
    var rebuild = !this.rt || this.rt.si !== b.si || k <= this.k;
    this.stopNarration();
    if (!this.rt || this.rt.si !== b.si) { this.badgeT = 0; this.badge.classList.remove('hide'); }
    if (rebuild) {
      this.rt = this.renderScene(b.si);
      for (j = this.sceneStart[b.si]; j < k; j++) this.rt.apply(this.beats[j], true);
    } else {
      for (j = this.k + 1; j < k; j++) this.rt.apply(this.beats[j], true);
    }
    this.k = k; this.elT = 0;
    this.rt.apply(b, !!initial);
    this.setCaption(b.cap);
    this.renderChoices();
    var lis = this.trList.children;
    for (j = 0; j < lis.length; j++) lis[j].classList.toggle('cur', j === k);
    this.updateBar();
  };
  Player.prototype.updateBar = function () {
    var b = this.beats[this.k]; if (!b) return;
    var t = b.t0 + Math.min(this.elT, b.d), f = this.total ? t / this.total * 100 : 0;
    this.fill.style.width = f + '%'; this.knob.style.left = f + '%';
    this.time.textContent = fmt(t) + ' / ' + fmt(this.total);
    this.track.setAttribute('aria-valuenow', Math.round(f));
  };
  Player.prototype.setCaption = function (c) { this.capSpan.innerHTML = rich(c || ''); this.capBox.style.display = c ? '' : 'none'; };
  Player.prototype.toggleCC = function () { this.cc = !this.cc; this.capBox.classList.toggle('off', !this.cc); this.bCC.classList.toggle('on', this.cc); this.relayout(); };
  Player.prototype.fullscreen = function () {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { var h = this.host; (h.requestFullscreen || h.webkitRequestFullscreen || function () {}).call(h); }
  };

  /* ---------- narration: recorded neural-voice clips per beat; the browser voice is only a fallback ---------- */
  var NKEY = 'labvideo.narration';
  function narrPref() { try { return window.localStorage.getItem(NKEY) !== 'off'; } catch (e) { return true; } }
  function setNarrPref(on) { try { window.localStorage.setItem(NKEY, on ? 'on' : 'off'); } catch (e) { } }
  Player.prototype.aud = function () {
    if (this.audio) return this.audio;
    var self = this, a = this.audio = new Audio(); a.preload = 'auto';
    try { a.preservesPitch = true; } catch (e) { }
    a.addEventListener('ended', function () { self.speaking = false; });
    a.addEventListener('error', function () {   // clip failed to load: read this line with the browser voice instead
      self.speaking = false;
      var b = self.beats[self.k];
      if (self.playing && self.narrate && b && b.au && a._src === asset(b.au) && self.elT < LEAD + 1.5) self.speak(b.say || b.cap);
    });
    return a;
  };
  Player.prototype.startNarration = function (b, off) {
    this.aStarted = true;
    if (b.au) {
      if (off > b.ad - 0.15) return;
      var self = this, a = this.aud(), src = asset(b.au), tok = this.aTok = (this.aTok || 0) + 1;
      if (a._src !== src) { a._src = src; a.src = src; }
      a.playbackRate = this.speed;
      var seek = function () { try { a.currentTime = off; } catch (e) { } };
      if (off > 0.05) { if (a.readyState >= 1) seek(); else a.addEventListener('loadedmetadata', seek, { once: true }); }
      else if (a.currentTime > 0.05) { try { a.currentTime = 0; } catch (e) { } }
      this.speaking = true;
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function (err) {
        if (self.aTok !== tok) return;
        self.speaking = false;
        if (err && err.name === 'NotAllowedError') self.bVoice.classList.add('blocked');   // the browser wants a click first
      });
      this.preloadNext();
    } else if (off < 0.6) this.speak(b.say || b.cap);
  };
  Player.prototype.debugState = function () {
    if (!this.dbg) { this.dbg = el('div', 'lv-dbg'); this.stage.appendChild(this.dbg); }
    var a = this.audio, src = a && a._src ? (a._src.slice(0, 5) === 'data:' ? 'data-uri' : a._src.split('/').slice(-2).join('/')) : '-';
    this.dbg.textContent = 'beat ' + this.k + ' elT ' + this.elT.toFixed(1) + ' | narr ' + this.narrate + ' started ' + this.aStarted + ' speaking ' + this.speaking +
      ' | clip ' + src + (a ? ' t ' + a.currentTime.toFixed(2) + ' paused ' + a.paused + ' ready ' + a.readyState + ' err ' + (a.error ? a.error.code : 0) : '') +
      (this.bVoice.classList.contains('blocked') ? ' | BLOCKED' : '');
  };
  Player.prototype.preloadNext = function () {
    var nb = this.beats[this.k + 1]; if (!nb || !nb.au) return;
    if (!this.pre) { this.pre = new Audio(); this.pre.preload = 'auto'; }
    var s = asset(nb.au); if (this.pre._src !== s) { this.pre._src = s; this.pre.src = s; }
  };
  Player.prototype.stopNarration = function () {
    this.aTok = (this.aTok || 0) + 1; this.aStarted = false;
    if (this.audio) this.audio.pause();
    this.stopSpeech();
  };
  Player.prototype.resumeNarration = function () {
    if (!this.narrate || !this.aStarted || !this.audio) return;
    var b = this.beats[this.k], a = this.audio;
    if (b && b.au && a._src === asset(b.au) && !a.ended) {
      this.speaking = true; a.playbackRate = this.speed;
      var self = this, pr = a.play(); if (pr && pr.catch) pr.catch(function () { self.speaking = false; });
    }
  };
  Player.prototype.playClip = function (c, text) {
    this.stopNarration(); this.aStarted = true;
    if (c && c.src) {
      var self = this, a = this.aud(), src = asset(c.src); a._src = src; a.src = src; a.playbackRate = this.speed;
      this.speaking = true; var pr = a.play(); if (pr && pr.catch) pr.catch(function () { self.speaking = false; });
    } else this.speak(text);
  };
  Player.prototype.setNarrate = function (on) {
    this.narrate = on; this.bVoice.classList.toggle('on', on); this.bVoice.setAttribute('aria-pressed', String(on));
    this.bVoice.classList.remove('blocked');
    if (!on) { this.stopNarration(); this.aStarted = true; return; }
    // turning narration on: pick up the current line if it has only just started, otherwise wait for the next one
    var b = this.beats[this.k], lead = b && b.wait ? 0 : LEAD;
    this.aStarted = !(this.playing && b && this.elT - lead < 1.2);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () {
    players.forEach(function (p) {
      if (!p.audio) return;
      if (document.hidden) { if (!p.audio.paused) { p.audio.pause(); p.visPaused = true; } }
      else if (p.visPaused) { p.visPaused = false; if (p.playing && p.narrate) { var pr = p.audio.play(); if (pr && pr.catch) pr.catch(function () { }); } }
    });
  });
  var voice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    var vs = window.speechSynthesis.getVoices() || [];
    var en = vs.filter(function (v) { return /^en(-|_)/i.test(v.lang); });
    var pref = en.filter(function (v) { return /natural|neural|online/i.test(v.name); });
    var us = pref.filter(function (v) { return /en-US/i.test(v.lang); });
    voice = us[0] || pref[0] || en.filter(function (v) { return /en-US/i.test(v.lang); })[0] || en[0] || null;
    return voice;
  }
  if ('speechSynthesis' in window) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }
  Player.prototype.toggleVoice = function () {
    if (this.bVoice.classList.contains('blocked')) {   // sound was blocked: this click allows it, restart the current line
      this.bVoice.classList.remove('blocked'); this.narrate = true; this.aStarted = false; return;
    }
    var on = !this.narrate; setNarrPref(on);
    players.forEach(function (p) { p.setNarrate(on); });
  };
  Player.prototype.speak = function (text) {
    var self = this;
    if (!('speechSynthesis' in window) || !text) { this.speaking = false; return; }
    this.stopSpeech();
    var u = new SpeechSynthesisUtterance(text.replace(/`/g, '').replace(/\u2192/g, ' to ').replace(/\u00b7/g, ',').replace(/\//g, ' / '));
    if (voice || pickVoice()) u.voice = voice;
    u.lang = (voice && voice.lang) || 'en-US'; u.rate = 1.02 * this.speed;
    var token = this.speechToken = (this.speechToken || 0) + 1;
    u.onend = u.onerror = function () { if (self.speechToken === token) self.speaking = false; };
    this.speaking = true;
    window.speechSynthesis.speak(u);
  };
  Player.prototype.stopSpeech = function () {
    this.speechToken = (this.speechToken || 0) + 1; this.speaking = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  /* ---------- choices, info cards ---------- */
  Player.prototype.renderChoices = function () {
    var self = this, sc = this.v.scenes[this.beats[this.k].si];
    this.choiceBox.innerHTML = '';
    (sc.choices || []).forEach(function (c) {
      var b = el('button'); b.type = 'button'; b.textContent = c.label;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        for (var k = 0; k < self.beats.length; k++) if (self.beats[k].id === c.to) { self.goto(k); break; }
        if (!self.playing) self.play();
      });
      self.choiceBox.appendChild(b);
    });
  };
  Player.prototype.showInfo = function (title, text) {
    var self = this;
    this.pause();
    this.info.innerHTML = '';
    var x = el('button', null, '\u00d7'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', function () { self.hideInfo(); });
    var b = el('b'); b.textContent = title; var p = el('div'); p.innerHTML = rich(text);
    var hint = el('div'); hint.style.cssText = 'margin-top:.5em;font-size:.85em;color:#5A6B7D'; hint.textContent = 'Press Play to continue.';
    this.info.appendChild(x); this.info.appendChild(b); this.info.appendChild(p); this.info.appendChild(hint);
    this.info.hidden = false;
  };
  Player.prototype.hideInfo = function () { if (this.info) this.info.hidden = true; };

  /* ---------- scene rendering ---------- */
  Player.prototype.relayout = function () { if (this.rt && this.rt.layout) this.rt.layout(); };
  Player.prototype.renderScene = function (si) {
    var sc = this.v.scenes[si];
    this.sceneHost.innerHTML = '';
    this.stage.classList.toggle('dark', sc.type === 'shot' || sc.type === 'term');
    this.stage.setAttribute('data-scene', sc.type);
    var make = { arch: this.sceneWorld, shot: this.sceneWorld, flow: this.sceneWorld, term: this.sceneTerm, title: this.sceneTitle, bullets: this.sceneBullets, quiz: this.sceneQuiz }[sc.type];
    var rt = make.call(this, sc);
    rt.si = si;
    return rt;
  };

  /* image / flow "world" scenes with a camera */
  Player.prototype.sceneWorld = function (sc) {
    var self = this, A = D().assets, W, H, src = null, nodes = {}, u;
    if (sc.type === 'arch') { W = A.arch.w; H = A.arch.h; src = asset(A.arch.src); for (var n in A.nodes) nodes[n] = A.nodes[n].r; }
    else if (sc.type === 'shot') { W = sc.w; H = sc.h; src = asset(sc.src); }
    else { W = 1600; H = 900; nodes = nodeMap(sc.nodes); }
    u = sceneUnit(sc);
    var world = el('div', 'lv-world'); world.style.width = W + 'px'; world.style.height = H + 'px';
    if (sc.type === 'flow') world.style.background = 'linear-gradient(160deg,#F4F8FC,#E6EEF7)';
    if (src) { var img = el('img', 'lv-bg'); img.src = src; img.alt = sc.alt || ''; img.draggable = false; img.style.width = W + 'px'; img.style.height = H + 'px'; world.appendChild(img); }
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H });
    var L = {};
    ['fl', 'ex', 'spot', 'hl', 'box', 'tag', 'pk', 'hot'].forEach(function (n) { L[n] = sv('g', { 'class': 'lv-' + n }); svg.appendChild(L[n]); });
    world.appendChild(svg); this.sceneHost.appendChild(world);
    var rt = { sc: sc, world: world, L: L, W: W, H: H, u: u, nodes: nodes, anims: [], cam: sc.cam || [0, 0, W, H], hl: {}, shown: {} };

    // flow nodes and edges (hidden until revealed)
    if (sc.type === 'flow') {
      var defs = sv('defs'); var mk = sv('marker', { id: 'lvarr' + Math.random().toString(36).slice(2, 7), viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      mk.appendChild(sv('path', { d: 'M0 0L10 5L0 10z', fill: '#5B7085' })); defs.appendChild(mk); svg.insertBefore(defs, svg.firstChild);
      rt.fnodes = {}; rt.fedges = [];
      (sc.nodes || []).forEach(function (n) {
        var g = sv('g', { 'class': 'lv-fnode' });
        g.appendChild(sv('rect', { 'class': 'card', x: n.x, y: n.y, width: n.w, height: n.h, rx: 18, 'stroke-width': 3, style: n.color ? 'stroke:' + n.color : '' }));
        var tx = n.x + 24;
        if (n.icon) { var im = sv('image', { x: n.x + 20, y: n.y + (n.h - 64) / 2, width: 64, height: 64 }); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', asset(A.icons[n.icon])); im.setAttribute('href', asset(A.icons[n.icon])); g.appendChild(im); tx = n.x + 100; }
        var t1 = sv('text', { x: tx, y: n.y + (n.sub ? n.h / 2 - 30 : n.h / 2 - 15), 'font-size': 30, 'font-weight': 700 }); t1.textContent = n.t; g.appendChild(t1);
        if (n.sub) { var t2 = sv('text', { 'class': 's', x: tx, y: n.y + n.h / 2 + 6, 'font-size': 23 }); t2.textContent = n.sub; g.appendChild(t2); }
        L.fl.appendChild(g); rt.fnodes[n.id] = g;
        fitText(t1, n.x + n.w - tx - 18); if (n.sub) fitText(t2, n.x + n.w - tx - 18);
      });
      (sc.edges || []).forEach(function (e) {
        var a = nodes[e.a], b = nodes[e.b], p1, p2;
        if (b[0] >= a[0] + a[2] - 2) { p1 = [a[0] + a[2], a[1] + a[3] / 2]; p2 = [b[0], b[1] + b[3] / 2]; }
        else if (b[0] + b[2] <= a[0] + 2) { p1 = [a[0], a[1] + a[3] / 2]; p2 = [b[0] + b[2], b[1] + b[3] / 2]; }
        else if (b[1] >= a[1] + a[3]) { p1 = [a[0] + a[2] / 2, a[1] + a[3]]; p2 = [b[0] + b[2] / 2, b[1]]; }
        else { p1 = [a[0] + a[2] / 2, a[1]]; p2 = [b[0] + b[2] / 2, b[1] + b[3]]; }
        var d;
        if (Math.abs(p1[1] - p2[1]) < 2 || Math.abs(p1[0] - p2[0]) < 2) d = 'M' + p1 + 'L' + p2;
        else if (Math.abs(p2[0] - p1[0]) > Math.abs(p2[1] - p1[1])) { var mx = (p1[0] + p2[0]) / 2; d = 'M' + p1 + 'L' + mx + ',' + p1[1] + 'L' + mx + ',' + p2[1] + 'L' + p2; }
        else { var my = (p1[1] + p2[1]) / 2; d = 'M' + p1 + 'L' + p1[0] + ',' + my + 'L' + p2[0] + ',' + my + 'L' + p2; }
        L.fl.appendChild(sv('path', { d: d, 'class': 'lv-fghost', 'stroke-width': 3, 'stroke-dasharray': '10 10' }));
        var g = sv('g', { 'class': 'lv-fedge' });
        var pth = sv('path', { d: d, 'stroke-width': 4, 'marker-end': 'url(#' + mk.id + ')', 'class': e.dash ? '' : 'draw' });
        if (e.dash) pth.setAttribute('stroke-dasharray', '12 10');
        g.appendChild(pth);
        if (e.label) { var lt = sv('text', { x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2 - 14, 'font-size': 22 }); lt.textContent = e.label; g.appendChild(lt); }
        L.fl.appendChild(g); rt.fedges.push(g);
        requestAnimationFrame(function () { try { var len = pth.getTotalLength(); pth.style.setProperty('--len', len); if (!e.dash) { pth.setAttribute('stroke-dasharray', len); pth.style.strokeDashoffset = len; } } catch (err) { } });
      });
    }

    // clickable hotspots with info cards (architecture scenes)
    if (sc.type === 'arch' && sc.hot !== false) {
      Object.keys(A.nodes).forEach(function (id) {
        var nd = A.nodes[id]; if (!nd.info) return;
        var r = sv('rect', { x: nd.r[0], y: nd.r[1], width: nd.r[2], height: nd.r[3], rx: 16, 'stroke-width': 4 * u });
        var tt = sv('title'); tt.textContent = nd.t + ' (click for details)'; r.appendChild(tt);
        r.addEventListener('click', function (e) { e.stopPropagation(); self.showInfo(nd.t, nd.info); });
        L.hot.appendChild(r);
      });
    }

    function camApply(rect, instant) {
      rt.cam = rect;
      var S = self.stage.getBoundingClientRect(); if (!S.width) return;
      var Sh = S.height * (1 - (self.cc ? 0.15 : 0.04));
      var s = Math.min(S.width / rect[2], Sh / rect[3]);
      var tx = S.width / 2 - (rect[0] + rect[2] / 2) * s, ty = Sh / 2 - (rect[1] + rect[3] / 2) * s;
      world.classList.toggle('instant', !!instant);
      world.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      if (instant) { void world.offsetWidth; world.classList.remove('instant'); }
    }
    rt.layout = function () { camApply(rt.cam, true); };
    camApply(rt.cam, true);

    function rectOf(r) { return typeof r === 'string' ? (nodes[r] || (A.extra && A.extra[r] && A.extra[r].r)) : r; }
    function drawHL(list) {
      L.hl.innerHTML = '';
      list.forEach(function (r) {
        var rr = rectOf(r); if (!rr) return;
        var g = sv('g', { 'class': 'lv-hl' });
        g.appendChild(sv('rect', { x: rr[0] - 6 * u, y: rr[1] - 6 * u, width: rr[2] + 12 * u, height: rr[3] + 12 * u, rx: 14 * u, 'stroke-width': 5 * u }));
        L.hl.appendChild(g);
      });
    }
    function drawSpot(on, list) {
      L.spot.innerHTML = ''; if (!on) return;
      var d = 'M0 0H' + W + 'V' + H + 'H0Z';
      list.forEach(function (r) { var rr = rectOf(r); if (rr) { var p = 8 * u; d += 'M' + (rr[0] - p) + ' ' + (rr[1] - p) + 'v' + (rr[3] + 2 * p) + 'h' + (rr[2] + 2 * p) + 'v' + (-(rr[3] + 2 * p)) + 'z'; } });
      L.spot.appendChild(sv('path', { d: d, 'fill-rule': 'evenodd' }));
    }
    function pill(parent, x, y, text, color, fs, anchor) {
      var g = sv('g', { 'class': 'lv-pill' }), w = text.length * fs * 0.58 + fs * 1.1, h = fs * 1.75;
      var x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      if (parent !== null && parent.getAttribute && parent.getAttribute('class') !== 'lv-pk') x0 = clamp(x0, 6 * u, Math.max(6 * u, W - w - 6 * u));
      g.appendChild(sv('rect', { x: x0, y: y - h / 2, width: w, height: h, rx: h / 2, fill: color || '#0B2B4C' }));
      var t = sv('text', { x: x0 + w / 2, y: y + fs * 0.05, 'font-size': fs, 'text-anchor': 'middle' }); t.textContent = text; g.appendChild(t);
      parent.appendChild(g); return g;
    }
    function drawTag(tg) {
      var rr = (Array.isArray(tg.at) && tg.at.length === 2) ? [tg.at[0], tg.at[1], 0, 0] : rectOf(tg.at), fs = (tg.fs || 13) * u, x, y, anc = 'middle';
      if (!rr) return;
      var pos = tg.pos || 'top';
      if (pos === 'top') { x = rr[0] + rr[2] / 2; y = rr[1] - fs * 1.4; }
      else if (pos === 'bottom') { x = rr[0] + rr[2] / 2; y = rr[1] + rr[3] + fs * 1.4; }
      else if (pos === 'left') { x = rr[0] - fs * 0.6; y = rr[1] + rr[3] / 2; anc = 'end'; }
      else if (pos === 'right') { x = rr[0] + rr[2] + fs * 0.6; y = rr[1] + rr[3] / 2; anc = 'start'; }
      else { x = rr[0] + rr[2] / 2; y = rr[1] + rr[3] / 2; }
      if (tg.dx) x += tg.dx * u; if (tg.dy) y += tg.dy * u;
      return pill(L.tag, x, y, tg.text, tg.color, fs, anc);
    }
    function drawBoxes(list) {
      list.forEach(function (bx) {
        var g = sv('g', { 'class': 'lv-box' });
        g.appendChild(sv('rect', { 'class': 'b', x: bx[0], y: bx[1], width: bx[2], height: bx[3], rx: 4 * u, 'stroke-width': 3 * u }));
        L.box.appendChild(g);
        if (bx[4]) pill(L.box, bx[0] + bx[2] / 2, bx[1] - 14 * u, bx[4], '#9A6700', 12 * u, 'middle');
      });
    }
    function showExtra(id) {
      var ex = A.extra && A.extra[id]; if (!ex || rt.shown[id]) return; rt.shown[id] = 1;
      var r = ex.r, g = sv('g', { 'class': 'lv-fnode on' });
      g.appendChild(sv('rect', { x: r[0], y: r[1], width: r[2], height: r[3], rx: 14, fill: ex.fill || '#FFF4CE', stroke: ex.color || '#8A6D00', 'stroke-width': 4 }));
      var t = sv('text', { x: r[0] + 22, y: r[1] + r[3] / 2 - 30, 'font-size': 27, 'font-weight': 700, fill: ex.color || '#5C4400' }); t.textContent = ex.t; g.appendChild(t);
      var t2 = sv('text', { x: r[0] + 22, y: r[1] + r[3] / 2 + 6, 'font-size': 22, fill: '#4A3A00' }); t2.textContent = ex.s; g.appendChild(t2);
      L.ex.appendChild(g);
      fitText(t, r[2] - 40); fitText(t2, r[2] - 40);
    }
    function packet(pk) {
      var pts = expandPath(pk.path, nodes); if (pts.length < 2) return;
      var Lh = pathLen(pts), v = pktSpeed(pk, u), g = sv('g', { 'class': 'lv-pk' });
      var trail = sv('polyline', { points: pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: pk.color || '#0078D4', 'stroke-width': 4 * u, 'stroke-opacity': 0.35, 'stroke-dasharray': (10 * u) + ' ' + (8 * u) });
      var dot = sv('circle', { r: 9 * u, fill: pk.color || '#0078D4', stroke: '#fff', 'stroke-width': 3 * u });
      g.appendChild(trail); g.appendChild(dot); L.pk.appendChild(g);
      var lab = null, phase = 0, t = 0, fs = 12 * u;
      function setLabel(text, color) { if (lab) lab.remove(); lab = text ? pill(g, 0, 0, text, color, fs, 'middle') : null; }
      setLabel(pk.label, pk.color || '#0078D4');
      var back = pk.back ? pts.slice().reverse() : null, pause = 0.55;
      rt.anims.push(function (dt) {
        t += dt;
        var cur = phase === 0 ? pts : back, d = Math.min(t * v, Lh), p = pointAt(cur, d);
        dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]);
        if (lab) lab.setAttribute('transform', 'translate(' + p[0] + ',' + (p[1] - 26 * u) + ')');
        if (d >= Lh) {
          if (phase === 0 && back) {
            if (t * v >= Lh + pause * v) { phase = 1; t = 0; dot.setAttribute('fill', pk.backColor || '#107C10'); trail.setAttribute('stroke', pk.backColor || '#107C10'); setLabel(pk.back, pk.backColor || '#107C10'); }
            return false;
          }
          if (pk.endTag) drawTag(pk.endTag);
          setTimeout(function () { g.style.transition = 'opacity .8s'; g.style.opacity = pk.keep ? 1 : 0; }, 900);
          return true;
        }
        return false;
      });
    }

    rt.apply = function (b, instant) {
      if (b.cam) camApply(b.cam, instant);
      if (b.hiClear) rt.hl = {};
      if (b.hi) b.hi.forEach(function (x) { rt.hl[typeof x === 'string' ? x : x.join(',')] = x; });
      if (b.hiOff) b.hiOff.forEach(function (x) { delete rt.hl[x]; });
      var hlList = Object.keys(rt.hl).map(function (k) { return rt.hl[k]; });
      drawHL(hlList);
      if (b.spot !== undefined) rt.spot = b.spot;
      drawSpot(rt.spot, hlList);
      if (b.show) b.show.forEach(function (id) { if (rt.fnodes && rt.fnodes[id]) rt.fnodes[id].classList.add('on'); else showExtra(id); });
      if (b.edges) b.edges.forEach(function (i) { if (rt.fedges && rt.fedges[i]) rt.fedges[i].classList.add('on'); });
      if (b.tagClear) L.tag.innerHTML = '';
      if (b.tags) b.tags.forEach(drawTag);
      if (b.boxClear) L.box.innerHTML = '';
      if (b.box) drawBoxes(b.box);
      if (b.pkt) { L.pk.innerHTML = ''; rt.anims = []; if (!instant) packet(b.pkt); else if (b.pkt.endTag) drawTag(b.pkt.endTag); }
    };
    rt.tick = function (dt) { rt.anims = rt.anims.filter(function (f) { return !f(dt); }); };
    return rt;
  };

  /* Cloud Shell terminal with typed commands and highlighted output */
  Player.prototype.sceneTerm = function (sc) {
    var wrap = el('div', 'lv-term');
    var bar = el('div', 'lv-term-bar', '<i></i><i></i><i></i><span></span>'); bar.querySelector('span').textContent = sc.title || 'Azure Cloud Shell (Bash)';
    var body = el('div', 'lv-term-body'); wrap.appendChild(bar); wrap.appendChild(body); this.sceneHost.appendChild(wrap);
    var maxLen = 20; sc.lines.forEach(function (l) { maxLen = Math.max(maxLen, (l.t || '').length + (l.c ? 2 : 0)); });
    maxLen = Math.min(maxLen, 100); // longer lines wrap
    body.style.fontSize = 'max(8px, ' + Math.min(1.55, 93 / (maxLen * 0.6)).toFixed(3) + 'cqw)';
    var rows = sc.lines.map(function (l) {
      var d = el('div', 'lv-ln' + (l.c ? ' cmd' : '') + (l.k ? ' ' + l.k : '')); d.hidden = true; d.dataset.full = l.t || ''; d.textContent = l.t || ''; body.appendChild(d); return d;
    });
    var rt = { shown: 0, queue: [], anims: [] };
    function scrollTo(i) {
      var r = rows[Math.max(0, i - 1)]; if (!r) return;
      var target = r.offsetTop + r.offsetHeight - body.clientHeight * 0.80;
      body.scrollTop = Math.max(0, target);
    }
    rt.layout = function () { scrollTo(rt.shown); };
    function flush() {
      rt.queue.forEach(function (i) { var r = rows[i]; r.hidden = false; r.textContent = r.dataset.full; r.classList.remove('lv-caret'); });
      rt.queue = []; rt.anims = [];
    }
    rt.apply = function (b, instant) {
      if (b.hlClear) rows.forEach(function (r) { r.classList.remove('hl'); });
      if (b.hl) b.hl.forEach(function (i) { if (rows[i]) rows[i].classList.add('hl'); });
      if (b.show != null && b.show > rt.shown) {
        flush();
        var from = rt.shown, to = Math.min(b.show, rows.length);
        rt.shown = to;
        if (instant) { for (var i = from; i < to; i++) { rows[i].hidden = false; rows[i].textContent = rows[i].dataset.full; rows[i].classList.remove('lv-caret'); } scrollTo(to); }
        else {
          rt.queue = []; for (var j = from; j < to; j++) rt.queue.push(j);
          var acc = 0, idx = 0, chars = 0;
          rt.anims = [function (dt) {
            acc += dt;
            while (idx < rt.queue.length) {
              var r = rows[rt.queue[idx]], full = r.dataset.full, isCmd = r.classList.contains('cmd');
              if (r.hidden) { r.hidden = false; r.textContent = isCmd ? '' : full; chars = 0; scrollTo(rt.queue[idx] + 1); }
              if (isCmd) {
                chars = Math.min(full.length, chars + dt * 55); r.textContent = full.slice(0, Math.floor(chars)); r.classList.add('lv-caret');
                if (chars < full.length) return false;
                r.classList.remove('lv-caret'); r.textContent = full; idx++; acc = -0.25; return false;
              }
              if (acc < 0.045) return false;
              acc -= 0.045; idx++;
            }
            return true;
          }];
        }
      }
    };
    rt.tick = function (dt) { rt.anims = rt.anims.filter(function (f) { return !f(dt); }); };
    return rt;
  };

  Player.prototype.sceneTitle = function (sc) {
    var p = el('div', 'lv-panel lv-title'); var A = D().assets;
    p.innerHTML = '<div class="k"></div><h3></h3><p></p>';
    p.querySelector('.k').textContent = sc.kicker || ''; p.querySelector('h3').textContent = sc.title || ''; p.querySelector('p').innerHTML = rich(sc.sub || '');
    if (sc.icons) {
      var ic = el('div', 'icons');
      sc.icons.forEach(function (n, i) { var im = el('img'); im.src = asset(A.icons[n]); im.alt = n.replace(/-/g, ' '); im.style.animationDelay = (0.25 + i * 0.18) + 's'; ic.appendChild(im); });
      p.appendChild(ic);
    }
    this.sceneHost.appendChild(p);
    return { apply: function () { }, tick: null };
  };
  Player.prototype.sceneBullets = function (sc) {
    var p = el('div', 'lv-panel lv-bul'), h = el('h3'); h.textContent = sc.title || ''; p.appendChild(h);
    var ul = el('ul'); var lis = (sc.items || []).map(function (t) { var li = el('li'); li.innerHTML = rich(t); ul.appendChild(li); return li; });
    p.appendChild(ul); this.sceneHost.appendChild(p);
    return { apply: function (b) { if (b.upto != null) lis.forEach(function (li, i) { li.classList.toggle('on', i < b.upto); }); }, tick: null };
  };
  Player.prototype.sceneQuiz = function (sc) {
    var self = this, p = el('div', 'lv-panel lv-quiz');
    var tg = el('div', 'tag'); tg.textContent = 'Check your understanding'; p.appendChild(tg);
    var h = el('h3'); h.innerHTML = rich(sc.q); p.appendChild(h);
    var opts = el('div', 'opts'), fb = el('div', 'fb'); p.appendChild(opts); p.appendChild(fb);
    var answered = false;
    sc.options.forEach(function (o, i) {
      var b = el('button'); b.type = 'button'; b.innerHTML = rich(o);
      b.addEventListener('click', function (e) {
        e.stopPropagation(); if (answered) return; answered = true;
        b.classList.add(i === sc.answer ? 'right' : 'wrong'); opts.children[sc.answer].classList.add('right');
        fb.innerHTML = '<b>' + (i === sc.answer ? 'Correct. ' : 'Not quite. ') + '</b>' + rich(sc.explain);
        var c = el('button', 'lv-pbtn pri'); c.type = 'button'; c.textContent = 'Continue \u25B6'; fb.appendChild(el('br')); fb.appendChild(c);
        c.addEventListener('click', function (ev) { ev.stopPropagation(); self.goto(self.k + 1); if (!self.playing) self.play(); });
        if (self.narrate) self.playClip(sc.fbau && sc.fbau[i === sc.answer ? 'right' : 'wrong'], (i === sc.answer ? 'Correct. ' : 'Not quite. ') + sc.explain);
        c.focus();
      });
      opts.appendChild(b);
    });
    this.sceneHost.appendChild(p);
    return { apply: function () { }, tick: null };
  };

  /* ---------- public API ---------- */
  window.LabVideo = {
    mount: function (host, id, opts) { return new Player(host, id, opts); },
    duration: Player.duration,
    fmt: fmt,
    autoMount: function (root) {
      var all = (root || document).querySelectorAll('[data-lab-video]'), byId = {};
      all.forEach(function (h) { byId[h.getAttribute('data-lab-video')] = h; });
      all.forEach(function (h) {
        if (h.__lv) return;
        h.__lv = new Player(h, h.getAttribute('data-lab-video'), {
          next: function (cid) { var vs = D().videos; for (var i = 0; i < vs.length - 1; i++) if (vs[i].id === cid && byId[vs[i + 1].id]) return vs[i + 1]; return null; },
          onNext: function (nid) {
            var t = byId[nid]; if (!t || !t.__lv) return;
            t.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function () { t.__lv.play(); try { t.focus({ preventScroll: true }); } catch (e) { } }, 650);
          }
        });
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.LabVideo.autoMount(); });
  else window.LabVideo.autoMount();
})();
