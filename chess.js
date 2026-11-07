/**
 * Lightweight chess engine with Secret Queen support.
 * Board: 0x88 representation for fast off-board checks.
 */

const EMPTY = 0;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE = 8, BLACK = 16;
const TYPE_MASK = 7;
const COLOR_MASK = 24;

const PIECE_CHARS = {
  [WHITE | KING]: '♔', [WHITE | QUEEN]: '♕', [WHITE | ROOK]: '♖',
  [WHITE | BISHOP]: '♗', [WHITE | KNIGHT]: '♘', [WHITE | PAWN]: '♙',
  [BLACK | KING]: '♚', [BLACK | QUEEN]: '♛', [BLACK | ROOK]: '♜',
  [BLACK | BISHOP]: '♝', [BLACK | KNIGHT]: '♞', [BLACK | PAWN]: '♟',
};

const FILES = 'abcdefgh';

/** Chess Royale: what spawning each kind of piece costs in elixir (kings cannot be spawned). */
const SPAWN_COST = { [PAWN]: 1, [KNIGHT]: 3, [BISHOP]: 3, [ROOK]: 5, [QUEEN]: 9 };
const SPAWN_TYPES = [PAWN, KNIGHT, BISHOP, ROOK, QUEEN];
const ELIXIR_MAX = 10;
const SPAWN_FILES = [3, 4, 2, 5, 1, 6, 0, 7];   // centre-most files first (used when a bot only wants a few candidate squares)

function sq(file, rank) { return rank * 16 + file; }
function fileOf(s) { return s & 15; }
function rankOf(s) { return s >> 4; }
function alg(s) { return FILES[fileOf(s)] + (rankOf(s) + 1); }
function fromAlg(a) {
  return sq(a.charCodeAt(0) - 97, parseInt(a[1], 10) - 1);
}

const KNIGHT_DELTAS = [31, 33, 14, 18, -31, -33, -14, -18];
const KING_DELTAS = [1, -1, 16, -16, 15, 17, -15, -17];
const BISHOP_DIRS = [15, 17, -15, -17];
const ROOK_DIRS = [1, -1, 16, -16];

class Chess {
  constructor() {
    this.board = new Uint8Array(128);
    this.turn = WHITE;
    this.castling = 0b1111; // KQkq
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
    this.secretQueen = { [WHITE]: -1, [BLACK]: -1 }; // square of secret queen (still disguised)
    this.revealed = { [WHITE]: false, [BLACK]: false };
    this.mode = 'basic'; // 'basic' | 'secret' | 'snail' | 'gamble' | 'royale'
    this.snW = -1;       // Immortal Snail: square of White's snail (it hunts White's king), -1 when there are no snails
    this.snB = -1;       // ... and of Black's snail (it hunts Black's king)
    this.pW = 50;        // Gamblite: the chance (%) White had of getting the turn at the last roll
    this.kingTaken = 0;  // Gamblite: the colour whose king was captured (there is no check, a king is simply taken)
    this.el = { [WHITE]: 0, [BLACK]: 0 };   // Chess Royale: each side's elixir
    this.noKingCap = false;   // Foresight Chess bots: planning a move in a position where the opponent's king is in check must not 'capture' it
    this.spawnCap = 0;   // bots' private copies only: how many squares per piece to consider when spawning (0 = all)
    this.snailKilled = 0; // a snail reached a king: WHITE / BLACK = that side lost, WHITE|BLACK = both kings reached at once
    this.reset();
  }

  reset() {
    this.board.fill(0);
    const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
    for (let f = 0; f < 8; f++) {
      this.board[sq(f, 0)] = WHITE | back[f];
      this.board[sq(f, 1)] = WHITE | PAWN;
      this.board[sq(f, 6)] = BLACK | PAWN;
      this.board[sq(f, 7)] = BLACK | back[f];
    }
    this.turn = WHITE;
    this.castling = 0b1111;
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
    this.secretQueen = { [WHITE]: -1, [BLACK]: -1 };
    this.revealed = { [WHITE]: false, [BLACK]: false };
    this.pW = 50;
    this.kingTaken = 0;
    // Immortal Snail: both snails start on the d-file in the middle (White's on d4, Black's on d5)
    this.snailKilled = 0;
    this.el = { [WHITE]: 0, [BLACK]: 0 };
    if (this.mode === 'royale') {   // Chess Royale: only the kings are on the board, no castling (the army is spawned later)
      this.board.fill(0);
      this.board[sq(4, 0)] = WHITE | KING;
      this.board[sq(4, 7)] = BLACK | KING;
      this.castling = 0;
    }
    if (this.mode === 'snail') { this.snW = sq(3, 3); this.snB = sq(3, 4); }
    else { this.snW = -1; this.snB = -1; }
  }

  /** Is a snail standing on this square? Snails are solid: nothing can land on them, pass through them or capture them. */
  snailAt(s) { return s === this.snW || s === this.snB; }

  /** Full moves left (counting the one being played) until the snails step: they move after Black's move 3, 6, 9... */
  snailMoveNo() { return Math.ceil(this.fullmove / 3) * 3; }

  /** One step of a snail towards a king: the most direct path, diagonal while it is off both the king's file and rank. */
  _snailStep(from, king) {
    const df = Math.sign(fileOf(king) - fileOf(from)), dr = Math.sign(rankOf(king) - rankOf(from));
    return from + dr * 16 + df;
  }

  /** Where each snail will step next (or -1): { [WHITE]: square, [BLACK]: square }. */
  snailNext() {
    const out = { [WHITE]: -1, [BLACK]: -1 };
    if (this.mode !== 'snail') return out;
    const wk = this.kingSquare(WHITE), bk = this.kingSquare(BLACK);
    if (this.snW >= 0 && wk >= 0 && this.snW !== wk) out[WHITE] = this._snailStep(this.snW, wk);
    if (this.snB >= 0 && bk >= 0 && this.snB !== bk) out[BLACK] = this._snailStep(this.snB, bk);
    return out;
  }

  /** The snails move one tile. Any piece on the new tile is eaten; a king on it loses. Records what happened in hist so it can be undone. */
  _snailTick(hist) {
    const nx = this.snailNext();
    hist.sn = { w: this.snW, b: this.snB, kill: this.snailKilled, eaten: [] };
    let killed = this.snailKilled;
    for (const c of [WHITE, BLACK]) {
      const to = nx[c];
      if (to < 0) continue;
      if (c === WHITE) this.snW = to; else this.snB = to;
      const p = this.board[to];
      if (!p) continue;
      if ((p & TYPE_MASK) === KING) { killed |= (p & COLOR_MASK); continue; }   // the king is not removed, the game just ends
      hist.sn.eaten.push([to, p]);
      this.board[to] = EMPTY;
      this.halfmove = 0;
      this.ep = -1;
      if (to === sq(0,0)) this.castling &= ~0b0010;
      else if (to === sq(7,0)) this.castling &= ~0b0001;
      else if (to === sq(0,7)) this.castling &= ~0b1000;
      else if (to === sq(7,7)) this.castling &= ~0b0100;
    }
    this.snailKilled = killed;
    hist.sn.nw = this.snW; hist.sn.nb = this.snB;   // where they ended up (for the slide animation)
    if (this.ep >= 0 && this.snailAt(this.ep)) this.ep = -1;
  }

  pieceAt(s) { return this.board[s]; }
  colorOf(p) { return p & COLOR_MASK; }
  typeOf(p) { return p & TYPE_MASK; }

  /** Effective type for move generation (secret queen can act as queen) */
  effectiveType(s) {
    const p = this.board[s];
    if (!p) return 0;
    const col = this.colorOf(p);
    if (this.mode === 'secret' && this.secretQueen[col] === s && !this.revealed[col]) {
      return QUEEN; // can move as queen while disguised
    }
    return this.typeOf(p);
  }

  /** Display character (shows real type until revealed) */
  displayChar(s) {
    const p = this.board[s];
    if (!p) return '';
    return PIECE_CHARS[p] || '';
  }

  isSecretDisguised(s) {
    const p = this.board[s];
    if (!p) return false;
    const col = this.colorOf(p);
    return this.mode === 'secret' && this.secretQueen[col] === s && !this.revealed[col];
  }

  kingSquare(color) {
    const k = color | KING;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      if (this.board[s] === k) return s;
    }
    return -1;
  }

  attacked(sqTarget, byColor) {
    // Pawns
    const pawnDir = byColor === WHITE ? -16 : 16;
    for (const df of [-1, 1]) {
      const s = sqTarget + pawnDir + df;
      if (!(s & 0x88) && this.board[s] === (byColor | PAWN)) return true;
      // secret queen that is still a pawn visually but attacks as queen handled below
    }

    // Knights
    for (const d of KNIGHT_DELTAS) {
      const s = sqTarget + d;
      if (!(s & 0x88) && this.board[s] === (byColor | KNIGHT)) return true;
    }

    // King
    for (const d of KING_DELTAS) {
      const s = sqTarget + d;
      if (!(s & 0x88) && this.board[s] === (byColor | KING)) return true;
    }

    // Sliding: bishops / queens / secret queens
    for (const d of BISHOP_DIRS) {
      let s = sqTarget + d;
      while (!(s & 0x88)) {
        if (s === this.snW || s === this.snB) break;
        const p = this.board[s];
        if (p) {
          const t = this.typeOf(p);
          const c = this.colorOf(p);
          if (c === byColor) {
            if (t === BISHOP || t === QUEEN) return true;
            if (this.mode === 'secret' && this.secretQueen[byColor] === s && !this.revealed[byColor]) return true;
          }
          break;
        }
        s += d;
      }
    }

    // Sliding: rooks / queens / secret queens
    for (const d of ROOK_DIRS) {
      let s = sqTarget + d;
      while (!(s & 0x88)) {
        if (s === this.snW || s === this.snB) break;
        const p = this.board[s];
        if (p) {
          const t = this.typeOf(p);
          const c = this.colorOf(p);
          if (c === byColor) {
            if (t === ROOK || t === QUEEN) return true;
            if (this.mode === 'secret' && this.secretQueen[byColor] === s && !this.revealed[byColor]) return true;
          }
          break;
        }
        s += d;
      }
    }

    return false;
  }

  /** Is this side's king attacked right now? (always real, even in Gamblite) */
  kingAttacked(color) {
    const k = this.kingSquare(color);
    if (k < 0) return false;
    return this.attacked(k, color === WHITE ? BLACK : WHITE);
  }

  /** Check. In Gamblite there is no check: the king can be left attacked, and capturing it wins. */
  inCheck(color) {
    if (this.mode === 'gamble' || this.mode === 'guess') return false;   // Gamblite and Guess Who have no check
    return this.kingAttacked(color);
  }

  /** Gamblite: the chance (%) White gets the next turn once `mover` has just moved. Every move shifts 5 points against the mover, kept between 5 and 95. */
  oddsAfter(mover) {
    return Math.max(5, Math.min(95, this.pW + (mover === WHITE ? -5 : 5)));
  }

  /** Generate pseudo-legal moves for a piece at s (ignoring self-check) */
  genPieceMoves(s) {
    const p = this.board[s];
    if (!p) return [];
    if (this.isSecretDisguised(s)) {
      // A disguised secret piece moves as what it looks like OR as a queen.
      // Queen-only moves are flagged q:1 and reveal the piece.
      const moves = this._gen(s, this.typeOf(p));
      const taken = new Set(moves.map(m => m.to));
      for (const m of this._gen(s, QUEEN)) {
        if (!taken.has(m.to)) { m.q = 1; moves.push(m); }
      }
      return moves;
    }
    return this._gen(s, this.typeOf(p));
  }

  _gen(s, type) {
    const p = this.board[s];
    const col = this.colorOf(p);
    const moves = [];
    const enemy = col === WHITE ? BLACK : WHITE;

    const add = (to, flags = 0) => {
      if (to & 0x88) return;
      if (to === this.snW || to === this.snB) return;   // a snail is a wall
      const target = this.board[to];
      if (target && this.colorOf(target) === col) return;
      if (this.noKingCap && target && (target & TYPE_MASK) === KING) return;
      moves.push({ from: s, to, flags, promo: 0 });
    };

    if (type === PAWN) {
      const dir = col === WHITE ? 16 : -16;
      const startRank = col === WHITE ? 1 : 6;
      const promoRank = col === WHITE ? 7 : 0;
      // forward
      let to = s + dir;
      if (!(to & 0x88) && !this.board[to] && to !== this.snW && to !== this.snB) {
        if (rankOf(to) === promoRank) {
          for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) {
            moves.push({ from: s, to, flags: 0, promo: pr });
          }
        } else {
          add(to);
          if (rankOf(s) === startRank) {
            const to2 = s + dir * 2;
            if (!this.board[to2]) add(to2, 1); // double push flag (add() refuses a snail's square)
          }
        }
      }
      // captures
      for (const df of [-1, 1]) {
        to = s + dir + df;
        if (to & 0x88) continue;
        if (this.board[to] && this.colorOf(this.board[to]) === enemy) {
          if (this.noKingCap && (this.board[to] & TYPE_MASK) === KING) continue;
          if (rankOf(to) === promoRank) {
            for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) {
              moves.push({ from: s, to, flags: 0, promo: pr });
            }
          } else add(to);
        } else if (to === this.ep && to !== this.snW && to !== this.snB) {
          moves.push({ from: s, to, flags: 2, promo: 0 }); // en passant
        }
      }
    } else if (type === KNIGHT) {
      for (const d of KNIGHT_DELTAS) add(s + d);
    } else if (type === KING) {
      for (const d of KING_DELTAS) add(s + d);
      // Castling (a snail on a square in between blocks it)
      const fr = (q) => !this.board[q] && q !== this.snW && q !== this.snB;
      const safe = this.mode === 'gamble';   // no check in Gamblite, so castling may pass through attacked squares
      const att = (q, by) => !safe && this.attacked(q, by);
      if (col === WHITE) {
        if ((this.castling & 1) && fr(sq(5,0)) && fr(sq(6,0)) &&
            !att(sq(4,0), BLACK) && !att(sq(5,0), BLACK) && !att(sq(6,0), BLACK)) {
          moves.push({ from: s, to: sq(6,0), flags: 4, promo: 0 }); // O-O
        }
        if ((this.castling & 2) && fr(sq(3,0)) && fr(sq(2,0)) && fr(sq(1,0)) &&
            !att(sq(4,0), BLACK) && !att(sq(3,0), BLACK) && !att(sq(2,0), BLACK)) {
          moves.push({ from: s, to: sq(2,0), flags: 8, promo: 0 }); // O-O-O
        }
      } else {
        if ((this.castling & 4) && fr(sq(5,7)) && fr(sq(6,7)) &&
            !att(sq(4,7), WHITE) && !att(sq(5,7), WHITE) && !att(sq(6,7), WHITE)) {
          moves.push({ from: s, to: sq(6,7), flags: 4, promo: 0 });
        }
        if ((this.castling & 8) && fr(sq(3,7)) && fr(sq(2,7)) && fr(sq(1,7)) &&
            !att(sq(4,7), WHITE) && !att(sq(3,7), WHITE) && !att(sq(2,7), WHITE)) {
          moves.push({ from: s, to: sq(2,7), flags: 8, promo: 0 });
        }
      }
    } else {
      // sliding
      const dirs = [];
      if (type === BISHOP || type === QUEEN) dirs.push(...BISHOP_DIRS);
      if (type === ROOK || type === QUEEN) dirs.push(...ROOK_DIRS);
      for (const d of dirs) {
        let to = s + d;
        while (!(to & 0x88)) {
          if (to === this.snW || to === this.snB) break;   // cannot pass through a snail
          if (this.board[to]) {
            if (this.colorOf(this.board[to]) === enemy) add(to);
            break;
          }
          add(to);
          to += d;
        }
      }
    }
    return moves;
  }

  /**
   * Chess Royale: every spawn the side to move can pay for, as moves { from: to, to, spawn: type, flags: 16 } (from === to marks a spawn).
   * A side may spawn on any empty square of its two starting ranks. `full` ignores the bots' square limit (see spawnCap).
   */
  genSpawns(full) {
    const col = this.turn, el = this.el[col];
    const out = [];
    if (this.mode !== 'royale' || el < 1) return out;
    // bots (spawnCap set on their private copy) only look at a few squares per piece, except when they are in check and need the exact blocking square
    const cap = !full && this.spawnCap && !this.kingAttacked(col) ? this.spawnCap : 0;
    const r0 = col === WHITE ? 0 : 7, r1 = col === WHITE ? 1 : 6;
    const squares = [];
    for (const r of [r1, r0]) {   // (own second rank first)
      const row = [];
      for (const f of SPAWN_FILES) { const t = sq(f, r); if (!this.board[t]) row.push(t); }
      squares.push(row);
    }
    for (const type of SPAWN_TYPES) {
      if (SPAWN_COST[type] > el) continue;
      let list;
      if (cap) list = squares[0].slice(0, Math.ceil(cap / 2)).concat(squares[1].slice(0, Math.floor(cap / 2)));
      else list = squares[0].concat(squares[1]);
      for (const t of list) out.push({ from: t, to: t, flags: 16, promo: 0, spawn: type });
    }
    return out;
  }

  /** Chess Royale: the spawns that leave the king safe (so a spawn can block a check, but not ignore one). */
  legalSpawns() {
    const col = this.turn, out = [];
    for (const m of this.genSpawns(false)) {
      this.makeMove(m);
      if (!this.kingAttacked(col)) out.push(m);
      this.unmakeMove();
    }
    return out;
  }

  /** All legal moves for side to move */
  legalMoves() {
    const col = this.turn;
    const result = [];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = this.board[s];
      if (!p || this.colorOf(p) !== col) continue;
      const candidates = this.genPieceMoves(s);
      for (const m of candidates) {
        this.makeMove(m);
        if (!this.inCheck(col)) result.push(m);
        this.unmakeMove();
      }
    }
    if (this.mode === 'royale') for (const m of this.legalSpawns()) result.push(m);
    return result;
  }

  legalMovesFrom(from) {
    const p = this.board[from];
    if (!p) return [];
    const col = this.colorOf(p);
    const result = [];
    for (const m of this.genPieceMoves(from)) {
      this.makeMove(m);
      if (!this.inCheck(col)) result.push(m);
      this.unmakeMove();
    }
    return result;
  }

  hasLegalMove() {
    const col = this.turn;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = this.board[s];
      if (!p || this.colorOf(p) !== col) continue;
      for (const m of this.genPieceMoves(s)) {
        this.makeMove(m);
        const ok = !this.inCheck(col);
        this.unmakeMove();
        if (ok) return true;
      }
    }
    if (this.mode === 'royale') {   // spawning is a move too: it can block a check or give a side something to do
      for (const m of this.genSpawns(true)) {
        this.makeMove(m);
        const ok = !this.kingAttacked(col);
        this.unmakeMove();
        if (ok) return true;
      }
    }
    return false;
  }

  makeMove(m) {
    if (m.spawn) return this._makeSpawn(m);
    if (m.ask) return this._makeAsk(m);
    // Mod menu edits (a piece moved or painted between moves): m.ed = [[square, piece], ...] is applied just before the move, m.ec = castling rights after it
    let ed0 = null;
    if (m.ed) {
      ed0 = { old: m.ed.map((e) => [e[0], this.board[e[0]]]), castling: this.castling, ep: this.ep };
      for (const e of m.ed) this.board[e[0]] = e[1];
      if (m.ec != null) this.castling = m.ec;
      this.ep = -1;
    }
    const p = this.board[m.from];
    const col = this.colorOf(p);
    const captured = this.board[m.to];
    const hist = {
      move: m,
      mover: col,
      pW: this.pW,
      kt: this.kingTaken,
      captured,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      secretFrom: this.secretQueen[col],
      enemySecret: this.secretQueen[col === WHITE ? BLACK : WHITE],
      revealed: this.revealed[col],
      wasSecretMove: false,
      elW: this.el[WHITE], elB: this.el[BLACK],
      ed0,
    };

    // Detect if this is a revealing secret-queen move
    if (this.mode === 'secret' && this.secretQueen[col] === m.from && !this.revealed[col]) {
      if (m.q) {
        hist.wasSecretMove = true;
        hist.origPiece = p;
        this.revealed[col] = true;
        // Promote the piece to queen on the board
        this.board[m.from] = col | QUEEN;
      }
    }

    // Update secret queen square if the secret piece moves
    if (this.secretQueen[col] === m.from) {
      // a secret pawn that promotes is just a normal piece afterwards
      this.secretQueen[col] = m.promo && this.mode !== 'guess' ? -1 : m.to;   // (Guess Who: a promoted piece is still the selected piece)
    }

    // Clear captured secret if any
    const enemy = col === WHITE ? BLACK : WHITE;
    if (captured && this.secretQueen[enemy] === m.to) {
      this.secretQueen[enemy] = -1;
    }

    // En passant capture
    if (m.flags === 2) {
      const capSq = m.to + (col === WHITE ? -16 : 16);
      hist.epCaptured = this.board[capSq];
      this.board[capSq] = EMPTY;
      if (this.secretQueen[enemy] === capSq) this.secretQueen[enemy] = -1;
    }

    if (this.mode === 'gamble' && captured && (captured & TYPE_MASK) === KING) this.kingTaken = captured & COLOR_MASK;

    // Move piece
    this.board[m.to] = this.board[m.from];
    this.board[m.from] = EMPTY;

    // Promotion
    if (m.promo) {
      this.board[m.to] = col | m.promo;
    }

    // Castling rook move
    if (m.flags === 4) { // king side
      const rFrom = col === WHITE ? sq(7,0) : sq(7,7);
      const rTo = col === WHITE ? sq(5,0) : sq(5,7);
      this.board[rTo] = this.board[rFrom];
      this.board[rFrom] = EMPTY;
      if (this.secretQueen[col] === rFrom) this.secretQueen[col] = rTo;   // a secret rook goes with the castle
    } else if (m.flags === 8) {
      const rFrom = col === WHITE ? sq(0,0) : sq(0,7);
      const rTo = col === WHITE ? sq(3,0) : sq(3,7);
      this.board[rTo] = this.board[rFrom];
      this.board[rFrom] = EMPTY;
      if (this.secretQueen[col] === rFrom) this.secretQueen[col] = rTo;
    }

    // Update castling rights
    if (this.typeOf(p) === KING) {
      if (col === WHITE) this.castling &= ~0b0011;
      else this.castling &= ~0b1100;
    }
    if (m.from === sq(0,0) || m.to === sq(0,0)) this.castling &= ~0b0010;
    if (m.from === sq(7,0) || m.to === sq(7,0)) this.castling &= ~0b0001;
    if (m.from === sq(0,7) || m.to === sq(0,7)) this.castling &= ~0b1000;
    if (m.from === sq(7,7) || m.to === sq(7,7)) this.castling &= ~0b0100;

    // EP square
    this.ep = (m.flags === 1) ? (m.from + m.to) / 2 : -1;

    // Halfmove
    if (this.typeOf(p) === PAWN || captured || m.flags === 2) this.halfmove = 0;
    else this.halfmove++;

    if (col === BLACK) this.fullmove++;

    // Chess Royale: moving a piece earns 1 elixir (up to 10)
    if (this.mode === 'royale') this.el[col] = Math.min(ELIXIR_MAX, this.el[col] + 1);

    // Immortal Snail: after Black's 3rd, 6th, 9th... move both snails take one step
    if (this.mode === 'snail' && col === BLACK && (this.fullmove - 1) % 3 === 0) this._snailTick(hist);

    if (this.mode === 'gamble') {
      // the next turn is rolled by the caller and passed in as m.nx; searches leave it out and simply alternate
      this.pW = this.oddsAfter(col);
      this.turn = m.nx || enemy;
      if (this.turn !== enemy) this.ep = -1;   // en passant only exists for the side that was just passed
    } else this.turn = enemy;
    this.history.push(hist);
  }

  /** Chess Royale: put a new piece on the board. It costs elixir, earns none, and counts as the turn. */
  _makeSpawn(m) {
    const col = this.turn, enemy = col === WHITE ? BLACK : WHITE;
    const hist = {
      move: m, mover: col, pW: this.pW, kt: this.kingTaken, captured: 0, castling: this.castling, ep: this.ep, halfmove: this.halfmove,
      secretFrom: this.secretQueen[col], enemySecret: this.secretQueen[enemy], revealed: this.revealed[col], wasSecretMove: false,
      elW: this.el[WHITE], elB: this.el[BLACK],
    };
    this.board[m.to] = col | m.spawn;
    this.el[col] -= SPAWN_COST[m.spawn];
    this.ep = -1;
    this.halfmove = 0;
    if (col === BLACK) this.fullmove++;
    this.turn = enemy;
    this.history.push(hist);
  }

  /** Guess Who: a question asked after a move (the record is { ask: question id, ans: the answer, by: who asked }). */
  _makeAsk(m) {
    // a question comes right after the asker's move: nothing on the board changes and the turn does not pass (m.by = who asked)
    this.history.push({ move: m, mover: m.by, ask: true });
  }

  unmakeMove() {
    const hist = this.history.pop();
    if (!hist) return;
    const m = hist.move;
    if (m.ask) return;
    if (m.spawn) {
      this.board[m.to] = EMPTY;
      this.el[WHITE] = hist.elW; this.el[BLACK] = hist.elB;
      this.pW = hist.pW; this.kingTaken = hist.kt;
      this.castling = hist.castling; this.ep = hist.ep; this.halfmove = hist.halfmove;
      if (hist.mover === BLACK) this.fullmove--;
      this.turn = hist.mover;
      return;
    }
    this.el[WHITE] = hist.elW; this.el[BLACK] = hist.elB;
    const col = this.colorOf(this.board[m.to]) || (this.turn === WHITE ? BLACK : WHITE);
    // Actually after make, turn has flipped, so the mover is the opposite of current turn
    const mover = hist.mover || (this.turn === WHITE ? BLACK : WHITE);
    this.pW = hist.pW; this.kingTaken = hist.kt;

    if (hist.sn) {   // take the snails back a step and give back whatever they ate
      for (const [s, p] of hist.sn.eaten) this.board[s] = p;
      this.snW = hist.sn.w; this.snB = hist.sn.b; this.snailKilled = hist.sn.kill;
    }

    this.castling = hist.castling;
    this.ep = hist.ep;
    this.halfmove = hist.halfmove;
    this.secretQueen[mover] = hist.secretFrom;
    this.secretQueen[mover === WHITE ? BLACK : WHITE] = hist.enemySecret;
    this.revealed[mover] = hist.revealed;

    // Undo castling rook
    if (m.flags === 4) {
      const rFrom = mover === WHITE ? sq(7,0) : sq(7,7);
      const rTo = mover === WHITE ? sq(5,0) : sq(5,7);
      this.board[rFrom] = this.board[rTo];
      this.board[rTo] = EMPTY;
    } else if (m.flags === 8) {
      const rFrom = mover === WHITE ? sq(0,0) : sq(0,7);
      const rTo = mover === WHITE ? sq(3,0) : sq(3,7);
      this.board[rFrom] = this.board[rTo];
      this.board[rTo] = EMPTY;
    }

    // Restore piece (possibly undo reveal)
    let restored = this.board[m.to];
    if (hist.wasSecretMove) {
      restored = hist.origPiece; // put back the disguised piece
    }
    if (m.promo) {
      restored = mover | PAWN;
    }
    this.board[m.from] = restored;
    this.board[m.to] = hist.captured;

    // Restore EP captured
    if (m.flags === 2 && hist.epCaptured) {
      const capSq = m.to + (mover === WHITE ? -16 : 16);
      this.board[capSq] = hist.epCaptured;
    }

    if (hist.ed0) {   // take the mod edits back too
      for (const e of hist.ed0.old) this.board[e[0]] = e[1];
      this.castling = hist.ed0.castling; this.ep = hist.ed0.ep;
    }
    if (mover === BLACK) this.fullmove--;
    this.turn = mover;
  }

  isCheckmate() {
    return this.inCheck(this.turn) && !this.hasLegalMove();
  }

  isStalemate() {
    return !this.inCheck(this.turn) && !this.hasLegalMove();
  }

  moveToSan(m) {
    if (m.ask) return '?';
    if (m.spawn) return ({ [PAWN]: 'P', [KNIGHT]: 'N', [BISHOP]: 'B', [ROOK]: 'R', [QUEEN]: 'Q' })[m.spawn] + '@' + alg(m.to);
    const p = this.board[m.from]; // before make
    // We call this before making the move
    const type = this.typeOf(p);
    let san = '';
    if (m.flags === 4) return 'O-O';
    if (m.flags === 8) return 'O-O-O';

    const isSecretReveal = !!m.q;

    if (type !== PAWN || isSecretReveal) {
      const sym = { [KING]: 'K', [QUEEN]: 'Q', [ROOK]: 'R', [BISHOP]: 'B', [KNIGHT]: 'N', [PAWN]: '' };
      san += isSecretReveal ? 'Q' : (sym[type] || '');
    }

    // two pieces of the same kind can reach the square: say which one moved (Nbd2, R1e2, Qh4e1)
    if (type !== PAWN && type !== KING && !isSecretReveal && !this.isSecretDisguised(m.from)) {
      const col = this.colorOf(p);
      let amb = false, sameFile = false, sameRank = false;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) { s += 7; continue; }
        if (s === m.from || this.board[s] !== p || this.isSecretDisguised(s)) continue;
        for (const o of this.genPieceMoves(s)) {
          if (o.to !== m.to) continue;
          this.makeMove(o);
          const ok = !this.inCheck(col);
          this.unmakeMove();
          if (ok) { amb = true; if (fileOf(s) === fileOf(m.from)) sameFile = true; if (rankOf(s) === rankOf(m.from)) sameRank = true; break; }
        }
      }
      if (amb) {
        if (!sameFile) san += FILES[fileOf(m.from)];
        else if (!sameRank) san += String(rankOf(m.from) + 1);
        else san += alg(m.from);
      }
    }
    const capture = this.board[m.to] || m.flags === 2;
    if (capture) {
      if (type === PAWN && !isSecretReveal) san += FILES[fileOf(m.from)];
      san += 'x';
    }
    san += alg(m.to);
    if (m.promo) {
      const pr = { [QUEEN]: 'Q', [ROOK]: 'R', [BISHOP]: 'B', [KNIGHT]: 'N' };
      san += '=' + pr[m.promo];
    }
    return san;
  }
}


/* ---- positions as text (FEN), used by the position editor and by games that start from a custom position ---- */
const FEN_CH = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
/** Load a position. Returns an error message, or '' when the position was loaded. Leaves the game untouched on error. */
Chess.prototype.loadFen = function (fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  if (parts.length < 2) return 'A position needs at least the pieces and whose turn it is.';
  const rows = parts[0].split('/');
  if (rows.length !== 8) return 'The piece placement needs 8 ranks separated by "/".';
  const board = new Uint8Array(128);
  for (let i = 0; i < 8; i++) {
    let f = 0;
    for (const c of rows[i]) {
      if (/[1-8]/.test(c)) { f += +c; continue; }
      const t = FEN_CH[c.toLowerCase()];
      if (!t) return 'Unknown piece "' + c + '".';
      if (f > 7) return 'Rank ' + (8 - i) + ' has too many squares.';
      board[sq(f, 7 - i)] = (c === c.toLowerCase() ? BLACK : WHITE) | t;
      f++;
    }
    if (f !== 8) return 'Rank ' + (8 - i) + ' does not add up to 8 squares.';
  }
  const turn = parts[1] === 'b' ? BLACK : parts[1] === 'w' ? WHITE : 0;
  if (!turn) return 'The side to move must be w or b.';
  let castling = 0;
  const cs = parts[2] || '-';
  if (cs.indexOf('K') >= 0) castling |= 1; if (cs.indexOf('Q') >= 0) castling |= 2;
  if (cs.indexOf('k') >= 0) castling |= 4; if (cs.indexOf('q') >= 0) castling |= 8;
  let ep = -1;
  if (parts[3] && parts[3] !== '-') { if (!/^[a-h][36]$/.test(parts[3])) return 'The en passant square is not valid.'; ep = fromAlg(parts[3]); }
  this.board.set(board); this.turn = turn; this.castling = castling; this.ep = ep;
  this.halfmove = Math.max(0, parseInt(parts[4], 10) || 0); this.fullmove = Math.max(1, parseInt(parts[5], 10) || 1);
  this.history = [];
  this.secretQueen = { [WHITE]: -1, [BLACK]: -1 };
  this.revealed = { [WHITE]: false, [BLACK]: false };
  return '';
};
Chess.prototype.toFen = function () {
  const ch = { [PAWN]: 'p', [KNIGHT]: 'n', [BISHOP]: 'b', [ROOK]: 'r', [QUEEN]: 'q', [KING]: 'k' };
  let out = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', e = 0;
    for (let f = 0; f < 8; f++) {
      const p = this.board[sq(f, r)];
      if (!p) { e++; continue; }
      if (e) { row += e; e = 0; }
      const c = ch[p & 7];
      row += (p & COLOR_MASK) === WHITE ? c.toUpperCase() : c;
    }
    if (e) row += e;
    out.push(row);
  }
  const cs = (this.castling & 1 ? 'K' : '') + (this.castling & 2 ? 'Q' : '') + (this.castling & 4 ? 'k' : '') + (this.castling & 8 ? 'q' : '');
  return out.join('/') + ' ' + (this.turn === WHITE ? 'w' : 'b') + ' ' + (cs || '-') + ' ' + (this.ep >= 0 ? alg(this.ep) : '-') + ' ' + this.halfmove + ' ' + this.fullmove;
};
/** Problems that would make a position unplayable (empty list = fine). Also drops castling rights that no longer make sense. */
Chess.prototype.problems = function () {
  const out = [];
  let wk = 0, bk = 0, wp = 0, bp = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = this.board[s];
    if (!p) continue;
    if (p === (WHITE | KING)) wk++; else if (p === (BLACK | KING)) bk++;
    if ((p & 7) === PAWN) { if (rankOf(s) === 0 || rankOf(s) === 7) out.push('Pawns cannot stand on the first or last rank.'); (p & COLOR_MASK) === WHITE ? wp++ : bp++; }
  }
  if (wk !== 1) out.push('White needs exactly one king.');
  if (bk !== 1) out.push('Black needs exactly one king.');
  if (wp > 8 || bp > 8) out.push('A side cannot have more than 8 pawns.');
  if (!out.length) {
    const other = this.turn === WHITE ? BLACK : WHITE;
    if (this.inCheck(other)) out.push((other === WHITE ? 'White' : 'Black') + ' is in check but it is not their move.');
    const wks = this.kingSquare(WHITE), bks = this.kingSquare(BLACK);
    if (Math.abs(fileOf(wks) - fileOf(bks)) <= 1 && Math.abs(rankOf(wks) - rankOf(bks)) <= 1) out.push('The kings cannot touch each other.');
  }
  // castling rights only where the king and rook are still on their home squares
  let c = this.castling;
  if (this.board[sq(4, 0)] !== (WHITE | KING)) c &= ~3;
  if (this.board[sq(4, 7)] !== (BLACK | KING)) c &= ~12;
  if (this.board[sq(7, 0)] !== (WHITE | ROOK)) c &= ~1;
  if (this.board[sq(0, 0)] !== (WHITE | ROOK)) c &= ~2;
  if (this.board[sq(7, 7)] !== (BLACK | ROOK)) c &= ~4;
  if (this.board[sq(0, 7)] !== (BLACK | ROOK)) c &= ~8;
  this.castling = c;
  return out;
};

// Export for browser
window.Chess = Chess;
window.WHITE = WHITE;
window.BLACK = BLACK;
window.PAWN = PAWN;
window.QUEEN = QUEEN;
window.ROOK = ROOK;
window.BISHOP = BISHOP;
window.KNIGHT = KNIGHT;
window.KING = KING;
window.sq = sq;
window.fileOf = fileOf;
window.rankOf = rankOf;
window.alg = alg;
window.PIECE_CHARS = PIECE_CHARS;
window.SPAWN_COST = SPAWN_COST;
window.SPAWN_TYPES = SPAWN_TYPES;
window.ELIXIR_MAX = ELIXIR_MAX;
