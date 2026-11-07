/* Runs the chess analysis in the background so the page stays smooth. Loaded by analyze.js:  new Worker('analyzeworker.js?v=N') */
self.window = self;
(function () {
  var v = (self.location.search || '').replace(/^\?/, '');
  var q = v ? '?' + v : '';
  importScripts('chess.js' + q, 'puzzlegen.js' + q, 'ai.js' + q, 'ratings.js' + q, 'analyzecore.js' + q);
  var stop = false;
  self.onmessage = function (ev) {
    var d = ev.data || {};
    if (d.type === 'cancel') { stop = true; return; }
    if (d.type !== 'analyse') return;
    stop = false;
    self.AnalyzeCore.analyseGame(d.job, {
      progress: function (p, t) { self.postMessage({ type: 'progress', p: p, sub: t }); },
      cancelled: function () { return stop; },
    }).then(function (res) {
      self.postMessage({ type: 'done', plies: res });
    }, function (e) {
      self.postMessage({ type: 'error', msg: String((e && e.message) || e) });
    });
  };
  self.postMessage({ type: 'ready' });
})();
