/**
 * Local Pieces: Online server (Google Apps Script). Go to script.google.com, make a New project, paste this whole
 * file over the code, then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone) and copy the
 * Web app URL into online-config.js. A spreadsheet called "Local Pieces Online" is created in your Drive on first use.
 *
 * KEEP THAT SPREADSHEET PRIVATE. The game only talks to this script, never to the sheet. The sheet holds
 * each player's secret token, so do not share it.
 *
 * One row per game on a sheet called "Games". Players send moves as "e2e4" (plus q/r/b/n for promotions).
 * The script does not know the rules of chess: both browsers check every move they receive.
 */
var HEAD = ['id', 'status', 'mode', 'base', 'inc', 'pub', 'hostName', 'guestName', 'hostTok', 'guestTok', 'hostSide', 'white',
  'moves', 'clocks', 'result', 'reason', 'draw', 'rematch', 'created', 'updated', 'lastMove'];
var C = {};
HEAD.forEach(function (h, i) { C[h] = i; });
var ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var IDLE_MS = 30000;

function doGet(e) { return out(handle(e.parameter || {})); }
function doPost(e) {
  var b = {};
  try { b = JSON.parse(e.postData.contents); } catch (x) { b = {}; }
  return out(handle(b));
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** The sheet is created for you the first time the game calls this script, and remembered. */
function sheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID'), ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else { ss = SpreadsheetApp.create('Local Pieces Online'); props.setProperty('SHEET_ID', ss.getId()); }
  var sh = ss.getSheetByName('Games');
  if (!sh) {
    sh = ss.getSheets()[0]; sh.setName('Games');
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]); sh.setFrozenRows(1);
  }
  return sh;
}
function find(sh, id) {
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][C.id] === id) return { n: i + 1, r: v[i] };
  return null;
}
function save(sh, g) { g.r[C.updated] = Date.now(); sh.getRange(g.n, 1, 1, HEAD.length).setValues([g.r]); }
function clean(s, n) { return String(s == null ? '' : s).replace(/[<>&"]/g, '').substring(0, n); }
function roleOf(g, tok) { if (!tok) return ''; if (g.r[C.hostTok] === tok) return 'h'; if (g.r[C.guestTok] === tok && g.r[C.guestTok]) return 'g'; return ''; }
function colourOf(g, role) { return g.r[C.white] === role ? 'w' : 'b'; }
function movesOf(g) { try { return JSON.parse(g.r[C.moves] || '[]'); } catch (x) { return []; } }
function seenKey(id, role) { return 's_' + id + '_' + role; }

function handle(p) {
  var a = p.a;
  var write = a !== 'poll' && a !== 'list';
  var lock = LockService.getScriptLock();
  if (write) lock.waitLock(10000);
  try {
    var sh = sheet();
    if (a === 'create') return create(sh, p);
    if (a === 'list') return list(sh);
    var g = find(sh, clean(p.id, 8));
    if (!g) return { error: 'Game not found' };
    if (a === 'poll') return poll(g, p);
    if (a === 'join') return join(sh, g, p);
    if (a === 'cancel') { if (roleOf(g, p.tok) === 'h' && g.r[C.status] === 'waiting') { g.r[C.status] = 'cancelled'; save(sh, g); } return { ok: true }; }
    if (a === 'move') return move(sh, g, p);
    if (a === 'end') return end(sh, g, p);
    if (a === 'offerdraw') return offerDraw(sh, g, p);
    if (a === 'answerdraw') return answerDraw(sh, g, p);
    if (a === 'rematch') return rematch(sh, g, p);
    return { error: 'Unknown action' };
  } finally { if (write) lock.releaseLock(); }
}

function newId(sh) {
  for (var t = 0; t < 20; t++) {
    var id = '';
    for (var i = 0; i < 6; i++) id += ALPHA.charAt(Math.floor(Math.random() * ALPHA.length));
    if (!find(sh, id)) return id;
  }
  return 'G' + Date.now().toString(36).toUpperCase().slice(-5);
}

function create(sh, p) {
  tidy(sh);
  var timed = p.mode === 'timed';
  var base = timed ? Math.max(30, Math.min(7200, Number(p.base) || 300)) : 0;
  var inc = timed ? Math.max(0, Math.min(60, Number(p.inc) || 0)) : 0;
  var side = p.side === 'w' || p.side === 'b' ? p.side : 'r';
  var id = newId(sh);
  var row = [];
  for (var i = 0; i < HEAD.length; i++) row.push('');
  row[C.id] = id; row[C.status] = 'waiting'; row[C.mode] = timed ? 'timed' : 'unlimited'; row[C.base] = base; row[C.inc] = inc;
  row[C.pub] = p.pub ? 1 : 0; row[C.hostName] = clean(p.name, 16) || 'Player'; row[C.hostTok] = clean(p.tok, 40); row[C.hostSide] = side;
  row[C.moves] = '[]'; row[C.clocks] = JSON.stringify({ w: base * 1000, b: base * 1000 }); row[C.created] = Date.now(); row[C.updated] = Date.now(); row[C.lastMove] = Date.now();
  sh.appendRow(row);
  return { id: id };
}

/** Old games are removed so the sheet stays small. */
function tidy(sh) {
  var v = sh.getDataRange().getValues(), now = Date.now();
  for (var i = v.length - 1; i >= 1; i--) {
    var age = now - Number(v[i][C.updated] || v[i][C.created] || 0);
    if (age > 24 * 3600 * 1000) sh.deleteRow(i + 1);
    else if (v[i][C.status] === 'waiting' && age > 20 * 60 * 1000) { sh.getRange(i + 1, C.status + 1).setValue('expired'); }
  }
}

function list(sh) {
  var v = sh.getDataRange().getValues(), now = Date.now(), outl = [];
  for (var i = v.length - 1; i >= 1 && outl.length < 20; i--) {
    var r = v[i];
    if (r[C.status] === 'waiting' && r[C.pub] && now - Number(r[C.created]) < 20 * 60 * 1000) {
      outl.push({ id: r[C.id], name: r[C.hostName], mode: r[C.mode], base: r[C.base], inc: r[C.inc] });
    }
  }
  return { games: outl };
}

function stateOf(g, role, since) {
  var r = g.r, mv = movesOf(g), white = r[C.white];
  var names = white ? { w: white === 'h' ? r[C.hostName] : r[C.guestName], b: white === 'h' ? r[C.guestName] : r[C.hostName] } : null;
  var cache = CacheService.getScriptCache();
  var other = role === 'h' ? 'g' : 'h';
  var seen = Number(cache.get(seenKey(r[C.id], other)) || 0);
  seen = Math.max(seen, Number(r[C.lastMove] || 0), Number(r[C.updated] || 0) && r[C.status] === 'active' ? Number(r[C.lastMove] || 0) : 0);
  var clocks; try { clocks = JSON.parse(r[C.clocks]); } catch (x) { clocks = null; }
  var d = r[C.draw];
  return {
    status: r[C.status], mode: r[C.mode], base: r[C.base], inc: r[C.inc], names: names,
    you: role && white ? colourOf(g, role) : null, moves: mv.slice(Number(since) || 0), n: mv.length, clocks: clocks,
    result: r[C.result], reason: r[C.reason], draw: d, rematch: r[C.rematch], oppAgo: seen ? Date.now() - seen : 0, now: Date.now(),
  };
}

function poll(g, p) {
  var role = roleOf(g, p.tok);
  if (role) CacheService.getScriptCache().put(seenKey(g.r[C.id], role), String(Date.now()), 300);
  return stateOf(g, role, p.since);
}

function join(sh, g, p) {
  var r = g.r;
  if (r[C.status] !== 'waiting') return { error: 'That game is not open any more' };
  if (r[C.hostTok] === p.tok) return { error: 'You made this game' };
  r[C.guestName] = clean(p.name, 16) || 'Player'; r[C.guestTok] = clean(p.tok, 40);
  var hs = r[C.hostSide];
  r[C.white] = hs === 'w' ? 'h' : hs === 'b' ? 'g' : (Math.random() < 0.5 ? 'h' : 'g');
  r[C.status] = 'active'; r[C.lastMove] = Date.now();
  save(sh, g);
  CacheService.getScriptCache().put(seenKey(r[C.id], 'g'), String(Date.now()), 300);
  return stateOf(g, 'g', 0);
}

var MV = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
function move(sh, g, p) {
  var r = g.r, role = roleOf(g, p.tok);
  if (!role) return { error: 'Not your game' };
  if (r[C.status] !== 'active') return { error: 'Game is over' };
  var mv = movesOf(g), ply = Number(p.ply);
  if (ply !== mv.length) return { error: 'Out of sync', n: mv.length };
  if (colourOf(g, role) !== (ply % 2 === 0 ? 'w' : 'b')) return { error: 'Not your turn' };
  if (!MV.test(String(p.mv))) return { error: 'Bad move' };
  mv.push(String(p.mv));
  r[C.moves] = JSON.stringify(mv);
  if (r[C.mode] === 'timed' && p.clocks) r[C.clocks] = JSON.stringify({ w: Math.max(0, Number(p.clocks.w) || 0), b: Math.max(0, Number(p.clocks.b) || 0) });
  r[C.lastMove] = Date.now(); r[C.draw] = '';
  save(sh, g);
  return { ok: true, n: mv.length };
}

function finish(sh, g, result, reason) {
  if (g.r[C.status] !== 'active') return { ok: true, already: true };
  g.r[C.status] = 'over'; g.r[C.result] = result; g.r[C.reason] = reason; g.r[C.draw] = '';
  save(sh, g);
  return { ok: true };
}
function loserResult(colour) { return colour === 'w' ? '0-1' : '1-0'; }

function end(sh, g, p) {
  var r = g.r, role = roleOf(g, p.tok);
  if (!role) return { error: 'Not your game' };
  if (r[C.status] !== 'active') return { ok: true, already: true };
  var me = colourOf(g, role), opp = me === 'w' ? 'b' : 'w', why = String(p.reason);
  if (why === 'resign' || why === 'idle') return finish(sh, g, loserResult(me), why);
  if (why === 'illegal') return finish(sh, g, loserResult(opp), why);
  if (why === 'abandon') {
    var seen = Number(CacheService.getScriptCache().get(seenKey(r[C.id], role === 'h' ? 'g' : 'h')) || 0);
    seen = Math.max(seen, Number(r[C.lastMove] || 0));
    if (Date.now() - seen < IDLE_MS - 3000) return { error: 'Opponent is still here' };
    return finish(sh, g, loserResult(opp), why);
  }
  if (why === 'timeout') {
    if (r[C.mode] !== 'timed') return { error: 'Not a timed game' };
    var mv = movesOf(g), turn = mv.length % 2 === 0 ? 'w' : 'b', cl = JSON.parse(r[C.clocks]);
    var left = cl[turn] - (mv.length ? Date.now() - Number(r[C.lastMove]) : 0);
    if (left > 4000) return { error: 'Not out of time yet' };
    return finish(sh, g, loserResult(turn), why);
  }
  var res = String(p.result);
  if (['1-0', '0-1', '1/2-1/2'].indexOf(res) < 0) return { error: 'Bad result' };
  return finish(sh, g, res, clean(why, 12) || 'end');
}

function offerDraw(sh, g, p) {
  var role = roleOf(g, p.tok);
  if (!role || g.r[C.status] !== 'active') return { error: 'No game' };
  g.r[C.draw] = colourOf(g, role); save(sh, g);
  return { ok: true };
}
function answerDraw(sh, g, p) {
  var role = roleOf(g, p.tok);
  if (!role || g.r[C.status] !== 'active') return { error: 'No game' };
  var me = colourOf(g, role);
  if (g.r[C.draw] && g.r[C.draw] !== me && p.accept) return finish(sh, g, '1/2-1/2', 'agreed');
  g.r[C.draw] = ''; save(sh, g);
  return { ok: true };
}

/** Rematch: whoever asks first makes a new game (colours swapped); the other one joins it. */
function rematch(sh, g, p) {
  var r = g.r, role = roleOf(g, p.tok);
  if (!role || r[C.status] !== 'over') return { error: 'No game' };
  if (r[C.rematch]) return { id: r[C.rematch], join: true };
  var me = colourOf(g, role);
  var id = newId(sh), row = [];
  for (var i = 0; i < HEAD.length; i++) row.push('');
  row[C.id] = id; row[C.status] = 'waiting'; row[C.mode] = r[C.mode]; row[C.base] = r[C.base]; row[C.inc] = r[C.inc]; row[C.pub] = 0;
  row[C.hostName] = role === 'h' ? r[C.hostName] : r[C.guestName]; row[C.hostTok] = clean(p.newTok, 40); row[C.hostSide] = me === 'w' ? 'b' : 'w';
  row[C.moves] = '[]'; row[C.clocks] = JSON.stringify({ w: r[C.base] * 1000, b: r[C.base] * 1000 }); row[C.created] = Date.now(); row[C.updated] = Date.now(); row[C.lastMove] = Date.now();
  sh.appendRow(row);
  r[C.rematch] = id; save(sh, g);
  return { id: id, join: false };
}
