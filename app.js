import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/dist/esm/chess.js';

const STARTING_PGN = `[Event "Practice Game"]
[Site "something_chess"]
[White "White"]
[Black "Black"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O`;
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PIECES = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const $ = (id) => document.getElementById(id);

let chess = new Chess();
let baseFen = new Chess().fen();
let history = [];
let currentPly = 0;
let flipped = false;
let selectedSquare = null;
let legalTargets = [];
let importMode = 'pgn';
let engine = null;
let engineReady = false;
let engineBusy = false;
let analysisToken = 0;
let engineQueue = [];
let searchActive = false;
let analysisByLine = new Map();
let lastMove = null;

function setGameFromPgn(pgn, label = '불러온 대국') {
  const next = new Chess();
  next.loadPgn(pgn, { strict: false });
  chess = next;
  history = chess.history({ verbose: true });
  baseFen = chess.header().FEN || new Chess().fen();
  currentPly = history.length;
  $('gameLabel').textContent = label;
  resetAnalysis();
  renderAll();
}

function resetAnalysis() {
  analysisToken++;
  analysisByLine = new Map();
  engineQueue = [];
  if (engine && searchActive) {
    engineStopping = true;
    engine.postMessage('stop');
  }
  engineBusy = false;
  $('bestMove').textContent = '분석을 시작해보세요';
  $('bestMoveNote').textContent = '끝난 대국 또는 연습 포지션을 분석합니다.';
  $('evalText').textContent = '—';
  $('evalBar').style.width = '50%';
  $('depthTag').textContent = 'DEPTH —';
  $('analysisLines').innerHTML = [0, 1, 2].map(() => '<div class="empty-line"><span>—</span><span>분석 대기 중</span></div>').join('');
  setEngineBusy(false);
}

function getPositionAt(ply) {
  const position = new Chess(baseFen);
  for (const move of history.slice(0, ply)) {
    position.move({ from: move.from, to: move.to, promotion: move.promotion });
  }
  return position;
}

function renderAll() {
  const position = getPositionAt(currentPly);
  renderBoard(position);
  renderLabels();
  renderMoves();
  updatePositionLabels(position);
  $('moveCount').textContent = String(history.length);
  $('moveProgress').textContent = currentPly === 0 ? '시작 포지션' : `${currentPly} / ${history.length} ply`;
  $('firstMove').disabled = currentPly === 0;
  $('previousMove').disabled = currentPly === 0;
  $('nextMove').disabled = currentPly >= history.length;
  $('lastMove').disabled = currentPly >= history.length;
}

function renderBoard(position) {
  const board = $('chessboard');
  board.innerHTML = '';
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? [...FILES].reverse() : FILES;
  const last = currentPly > 0 ? history[currentPly - 1] : lastMove;
  for (const rank of ranks) {
    for (const file of files) {
      const squareName = `${file}${rank}`;
      const square = document.createElement('button');
      square.type = 'button';
      square.className = `square ${((FILES.indexOf(file) + rank) % 2 === 0) ? 'light' : 'dark'}`;
      square.setAttribute('role', 'gridcell');
      square.setAttribute('aria-label', `${squareName}${position.get(squareName) ? ` ${position.get(squareName).color === 'w' ? '백' : '흑'} ${pieceName(position.get(squareName).type)}` : ''}`);
      square.dataset.square = squareName;
      if (last && (last.from === squareName || last.to === squareName)) square.classList.add('last-move');
      if (selectedSquare === squareName) square.classList.add('selected');
      const piece = position.get(squareName);
      if (piece) {
        const glyph = document.createElement('span');
        glyph.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
        glyph.textContent = PIECES[piece.color][piece.type];
        square.append(glyph);
      } else if (legalTargets.includes(squareName)) {
        const dot = document.createElement('span');
        dot.className = 'legal-dot';
        square.append(dot);
      }
      if (last && last.to === squareName && piece && legalTargets.includes(squareName)) {
        const ring = document.createElement('span');
        ring.className = 'capture-ring';
        square.append(ring);
      }
      const fileIndex = FILES.indexOf(file);
      if ((!flipped && rank === 1) || (flipped && rank === 8)) {
        const coord = document.createElement('span');
        coord.className = 'square-file';
        coord.textContent = file;
        square.append(coord);
      }
      if ((!flipped && fileIndex === 0) || (flipped && fileIndex === 7)) {
        const coord = document.createElement('span');
        coord.className = 'square-rank';
        coord.textContent = String(rank);
        square.append(coord);
      }
      square.addEventListener('click', () => handleSquareClick(squareName, position));
      board.append(square);
    }
  }
}

function pieceName(type) {
  return ({ k: '킹', q: '퀸', r: '룩', b: '비숍', n: '나이트', p: '폰' })[type];
}

function renderLabels() {
  $('rankLabels').innerHTML = (flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]).map((rank) => `<span>${rank}</span>`).join('');
  $('fileLabels').innerHTML = (flipped ? [...FILES].reverse() : FILES).map((file) => `<span>${file}</span>`).join('');
}

function renderMoves() {
  const list = $('moveList');
  if (history.length === 0) {
    list.innerHTML = '<div class="move-list-empty">아직 수순이 없어요.</div>';
    return;
  }
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    const whitePly = i + 1;
    const blackPly = i + 2;
    const white = history[i];
    const black = history[i + 1];
    rows.push(`<div class="move-row"><span class="move-number">${Math.floor(i / 2) + 1}.</span><button class="move-cell ${currentPly === whitePly ? 'active' : ''}" data-ply="${whitePly}" aria-label="${whitePly}수 ${escapeHtml(white.san)}">${escapeHtml(white.san)}</button><button class="move-cell ${currentPly === blackPly ? 'active' : ''}" data-ply="${blackPly}" ${black ? '' : 'disabled'}>${black ? escapeHtml(black.san) : ''}</button></div>`);
  }
  list.innerHTML = rows.join('');
  list.querySelectorAll('[data-ply]').forEach((button) => button.addEventListener('click', () => goToPly(Number(button.dataset.ply))));
  const active = list.querySelector('.move-cell.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function updatePositionLabels(position) {
  const suffix = currentPly === 0 ? '시작 포지션' : `${Math.ceil(currentPly / 2)}수 ${currentPly % 2 ? '백' : '흑'}의 차례`;
  $('positionLabel').textContent = position.isCheckmate() ? '체크메이트' : position.isDraw() ? '무승부 포지션' : position.isCheck() ? `${suffix} · 체크` : suffix;
}

function handleSquareClick(square, position) {
  const piece = position.get(square);
  if (!selectedSquare) {
    if (!piece || piece.color !== position.turn()) return;
    selectedSquare = square;
    legalTargets = position.moves({ square, verbose: true }).map((move) => move.to);
    renderBoard(position);
    return;
  }
  if (square === selectedSquare) {
    selectedSquare = null;
    legalTargets = [];
    renderBoard(position);
    return;
  }
  if (piece && piece.color === position.turn()) {
    selectedSquare = square;
    legalTargets = position.moves({ square, verbose: true }).map((move) => move.to);
    renderBoard(position);
    return;
  }
  const moveOptions = position.moves({ square: selectedSquare, verbose: true }).filter((move) => move.to === square);
  if (!moveOptions.length) {
    selectedSquare = null;
    legalTargets = [];
    renderBoard(position);
    return;
  }
  const chosen = moveOptions.find((move) => move.promotion === 'q') || moveOptions[0];
  position.move({ from: selectedSquare, to: square, promotion: chosen.promotion });
  const newMove = position.history({ verbose: true }).at(-1);
  history = [...history.slice(0, currentPly), newMove];
  currentPly = history.length;
  selectedSquare = null;
  legalTargets = [];
  lastMove = newMove;
  resetAnalysis();
  renderAll();
}

function goToPly(ply) {
  currentPly = Math.max(0, Math.min(ply, history.length));
  selectedSquare = null;
  legalTargets = [];
  resetAnalysis();
  renderAll();
}

function moveSan(position, uci) {
  if (!uci || uci === '(none)' || uci === '0000') return '';
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci[4];
  try { return position.move({ from, to, ...(promotion ? { promotion } : {}) }).san; } catch { return ''; }
}

function scoreForWhite(score, turn) {
  return score.type === 'mate' ? (turn === 'w' ? score.value : -score.value) : (turn === 'w' ? score.value : -score.value) / 100;
}

function formatScore(score, turn) {
  const value = scoreForWhite(score, turn);
  if (score.type === 'mate') return `M${Math.abs(value)}`;
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

function renderAnalysisLines(fen, turn) {
  const lines = [...analysisByLine.values()].sort((a, b) => a.multipv - b.multipv).slice(0, 3);
  if (!lines.length) return;
  $('analysisLines').innerHTML = [0, 1, 2].map((idx) => {
    const line = lines[idx];
    if (!line) return '<div class="empty-line"><span>—</span><span>분석 중</span></div>';
    const position = new Chess(fen);
    const sans = line.pv.map((uci) => moveSan(position, uci)).filter(Boolean).slice(0, 7);
    return `<div class="analysis-line"><span class="line-rank">${idx + 1}.</span><span class="line-pv">${sans.join(' ') || '—'}</span><span class="line-score">${formatScore(line.score, turn)}</span></div>`;
  }).join('');
}

function parseInfo(line) {
  if (!line.startsWith('info ')) return null;
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] || 0);
  const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
  const cp = line.match(/\bscore cp (-?\d+)/);
  const mate = line.match(/\bscore mate (-?\d+)/);
  const pv = line.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/) || [];
  if (!depth || (!cp && !mate) || !pv.length) return null;
  return { depth, multipv, score: cp ? { type: 'cp', value: Number(cp[1]) } : { type: 'mate', value: Number(mate[1]) }, pv };
}

function setEngineBusy(busy) {
  engineBusy = busy;
  $('engineLight').classList.toggle('busy', busy);
  $('engineLight').classList.toggle('ready', engineReady && !busy);
  $('analyzeButton').disabled = busy;
  $('analyzeButtonText').textContent = busy ? '분석 중…' : '이 포지션 분석';
  $('engineStatus').textContent = busy ? 'Stockfish가 수순을 살펴보고 있어요.' : engineReady ? '브라우저에서 Stockfish 실행 중 · 대국 후 복기 전용' : '엔진을 불러오면 분석이 시작됩니다.';
}

function initializeEngine() {
  if (engine) return;
  $('engineStatus').textContent = 'Stockfish 엔진을 불러오는 중…';
  try {
    engine = new Worker('stockfish-loader.js');
    engine.onmessage = ({ data }) => {
      const line = String(data).trim();
      if (line === 'uciok') {
        engine.postMessage('setoption name MultiPV value 3');
        engine.postMessage('isready');
        return;
      }
      if (line === 'readyok') {
        engineReady = true;
        $('engineLight').classList.add('ready');
        $('engineStatus').textContent = '엔진 준비 완료 · 분석은 이 복기 보드에서만 실행됩니다.';
        const next = engineQueue.shift();
        if (next) runAnalysis(next.depth, next.token, next.fen);
        return;
      }
      if (line.startsWith('bestmove ')) {
        searchActive = false;
        if (engineStopping) {
          engineStopping = false;
          const next = engineQueue.shift();
          if (next) runAnalysis(next.depth, next.token, next.fen);
          return;
        }
        if (!engineBusy) return;
        const token = analysisToken;
        if (token !== activeAnalysisToken) return;
        finishAnalysis(token);
        return;
      }
      const info = parseInfo(line);
      if (info && engineBusy && activeAnalysisToken === analysisToken) {
        analysisByLine.set(info.multipv, info);
        const fen = analyzedFen;
        const turn = new Chess(fen).turn();
        $('depthTag').textContent = `DEPTH ${info.depth}`;
        if (info.multipv === 1) {
          const score = scoreForWhite(info.score, turn);
          $('evalText').textContent = formatScore(info.score, turn);
          const advantage = info.score.type === 'mate' ? Math.sign(score) * 99 : score;
          const width = Math.max(4, Math.min(96, 50 + 50 * Math.tanh(advantage / 2.2)));
          $('evalBar').style.width = `${width}%`;
          const position = new Chess(fen);
          const san = moveSan(position, info.pv[0]);
          $('bestMove').textContent = san ? `${san}  ·  ${info.pv[0]}` : '수순을 찾는 중';
          $('bestMoveNote').textContent = info.score.type === 'mate' ? `강제 메이트까지 ${Math.abs(score)}수` : info.pv.slice(0, 4).join('  ');
        }
        renderAnalysisLines(fen, turn);
      }
    };
    engine.onerror = () => {
      engineReady = false;
      engineBusy = false;
      engine = null;
      $('engineLight').classList.remove('busy', 'ready');
      $('engineStatus').textContent = '엔진 로드에 실패했어요. 인터넷 연결을 확인하고 새로고침해 주세요.';
      $('bestMoveNote').textContent = 'Stockfish 엔진 파일을 불러오지 못했습니다.';
      $('analyzeButton').disabled = false;
      $('analyzeButtonText').textContent = '다시 시도';
    };
    engine.postMessage('uci');
  } catch (error) {
    $('engineStatus').textContent = '이 브라우저에서 엔진을 시작할 수 없어요.';
  }
}

let activeAnalysisToken = 0;
let analyzedFen = '';
let engineStopping = false;

function finishAnalysis(token) {
  if (token !== analysisToken) return;
  setEngineBusy(false);
  $('engineStatus').textContent = '분석 완료 · 더 깊게 보려면 분석 깊이를 조정하세요.';
}

function runAnalysis(depth, token, fen) {
  if (!engineReady || token !== analysisToken) return;
  activeAnalysisToken = token;
  analyzedFen = fen;
  analysisByLine = new Map();
  engineBusy = true;
  searchActive = true;
  $('analysisLines').innerHTML = [0, 1, 2].map(() => '<div class="empty-line"><span>…</span><span>분석 중</span></div>').join('');
  engine.postMessage('setoption name MultiPV value 3');
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage(`go depth ${depth}`);
}

function requestAnalysis() {
  const token = ++analysisToken;
  const depth = Number($('depthSelect').value);
  const fen = getPositionAt(currentPly).fen();
  engineQueue = [{ depth, token, fen }];
  $('bestMove').textContent = '포지션 분석 중';
  $('bestMoveNote').textContent = '세 가지 후보 수를 비교하고 있어요.';
  setEngineBusy(true);
  initializeEngine();
  if (engineReady) {
    if (!engineStopping) {
      engineQueue = [];
      runAnalysis(depth, token, fen);
    }
  }
}

function openImport(mode) {
  importMode = mode;
  const isFen = mode === 'fen';
  $('dialogEyebrow').textContent = isFen ? 'IMPORT POSITION' : 'IMPORT GAME';
  $('dialogTitle').textContent = isFen ? 'FEN 포지션' : 'PGN 불러오기';
  $('dialogDescription').textContent = isFen ? '분석할 포지션의 FEN 문자열을 붙여 넣으세요.' : '끝난 대국의 PGN 텍스트를 붙여 넣으세요.';
  $('importText').placeholder = isFen ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : '[Event "Casual Game"]\n1. e4 e5 2. Nf3 Nc6 ...';
  $('importText').value = '';
  $('dialogError').textContent = '';
  $('importDialog').showModal();
  $('importText').focus();
}

function submitImport(event) {
  event.preventDefault();
  const value = $('importText').value.trim();
  try {
    if (importMode === 'fen') {
      const next = new Chess();
      next.load(value);
      chess = next;
      baseFen = value;
      history = [];
      currentPly = 0;
      lastMove = null;
      $('gameLabel').textContent = 'FEN 포지션';
      resetAnalysis();
      renderAll();
    } else {
      setGameFromPgn(value, '불러온 대국');
    }
    $('importDialog').close();
  } catch (error) {
    $('dialogError').textContent = error.message || '입력 내용을 읽지 못했어요.';
  }
}

function loadDemo() {
  setGameFromPgn(STARTING_PGN, '연습 대국');
}

$('depthSelect').addEventListener('input', (event) => { $('depthValue').textContent = `${event.target.value} ply`; });
$('analyzeButton').addEventListener('click', requestAnalysis);
$('loadPgnButton').addEventListener('click', () => openImport('pgn'));
$('loadFenButton').addEventListener('click', () => openImport('fen'));
$('importSubmit').addEventListener('click', submitImport);
$('flipButton').addEventListener('click', () => { flipped = !flipped; renderAll(); });
$('firstMove').addEventListener('click', () => goToPly(0));
$('previousMove').addEventListener('click', () => goToPly(currentPly - 1));
$('nextMove').addEventListener('click', () => goToPly(currentPly + 1));
$('lastMove').addEventListener('click', () => goToPly(history.length));
$('clearHighlights').addEventListener('click', () => { selectedSquare = null; legalTargets = []; renderBoard(getPositionAt(currentPly)); });
$('newGameButton').addEventListener('click', () => {
  chess = new Chess();
  baseFen = chess.fen();
  history = [];
  currentPly = 0;
  lastMove = null;
  selectedSquare = null;
  legalTargets = [];
  $('gameLabel').textContent = '새 포지션';
  resetAnalysis();
  renderAll();
});

loadDemo();
