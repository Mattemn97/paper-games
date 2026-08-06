const canvas = document.getElementById('golfCanvas');
const ctx = canvas.getContext('2d');

const COLS = 12;
const ROWS = 18;

// Gestione HiDPI / Retina Display per grafica cristallina
const BASE_CELL_SIZE = 40; 
const dpr = window.devicePixelRatio || 1;

canvas.width = COLS * BASE_CELL_SIZE * dpr;
canvas.height = ROWS * BASE_CELL_SIZE * dpr;
ctx.scale(dpr, dpr);

const CELL_SIZE = BASE_CELL_SIZE;

const CONFIG = {
    startRows: [ROWS - 1, ROWS - 2, ROWS - 3],
    holeRows: [0, 1, 2],
    hazards: {
        waterBlobs: { easy: 0, medium: 3, hard: 5 },
        treeBlobs: { easy: 0, medium: 3, hard: 5 },
        waterSizeRange: { easy: [9, 25], medium: [9, 25], hard: [9, 25] },
        treeSizeRange: { easy: [4, 16], medium: [4, 16], hard: [4, 16] }
    },
    sand: {
        blobCount: { easy: 0, medium: 3, hard: 5 },
        blobSizeRange: { easy: [4, 9], medium: [4, 16], hard: [9, 16] }
    },
    fairway: {
        radius: { easy: 3, medium: 2, hard: 1 },
        baseFill: { easy: 0.95, medium: 0.75, hard: 0.55 }
    },
    slopes: {
        chance: { easy: 0, medium: 0.05, hard: 0.10 }
    }
};

const TERRAIN = {
    ROUGH:    { color: '#f8fafc', label: '' },
    FAIRWAY:  { color: '#86efac', label: '' },
    SAND:     { color: '#fde047', label: '' },
    WATER:    { color: '#60a5fa', label: '' },
    TREES:    { color: '#15803d', label: '◬', textColor: '#ffffff' },
    SLOPE_DN: { color: '#dcfce7', label: '↓', textColor: '#0f172a' },
    SLOPE_UP: { color: '#dcfce7', label: '↑', textColor: '#0f172a' },
    SLOPE_LF: { color: '#dcfce7', label: '←', textColor: '#0f172a' },
    SLOPE_RT: { color: '#dcfce7', label: '→', textColor: '#0f172a' }
};

const DIRECTIONS = {
    N:  { dr: -1, dc:  0 },
    NE: { dr: -1, dc:  1 },
    E:  { dr:  0, dc:  1 },
    SE: { dr:  1, dc:  1 },
    S:  { dr:  1, dc:  0 },
    SW: { dr:  1, dc: -1 },
    W:  { dr:  0, dc: -1 },
    NW: { dr: -1, dc: -1 }
};

// --- Variabili di Stato Globali ---
let grid = [];
let ballPos = { r: ROWS - 3, c: Math.floor(COLS / 2) };
let holePos = { r: 3, c: Math.floor(COLS / 2) };
let currentRoll = null;
let strokeCount = 0;
let lastPath = [];
let shotHistory = [];
let gameOver = false;

let gameState = 'INIT'; 
let validTargets = []; 

const modal = document.getElementById('gameModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const strokeInfo = document.getElementById('strokeInfo');
const rollInfo = document.getElementById('rollInfo');

// ==========================================
// LOGICA UI e MODALI
// ==========================================

function showModal(title, htmlContent) {
    modalTitle.innerText = title;
    modalBody.innerHTML = htmlContent;
    modal.classList.add('active');
}

function hideModal() {
    modal.classList.remove('active');
}

function initGame() {
    gameState = 'INIT';
    showModal("Paper Golf", `
        <p>Seleziona la difficoltà per iniziare:</p>
        <select id="popupDifficulty" class="input-select">
            <option value="easy">Facile</option>
            <option value="medium" selected>Medio</option>
            <option value="hard">Difficile</option>
        </select>
        <button class="btn btn-primary" onclick="startGame()">Genera Campo & Gioca</button>
    `);
}

function startGame() {
    const diff = document.getElementById('popupDifficulty').value;
    hideModal();
    generateMap(diff);
    startTurn();
}

function startTurn() {
    if (gameOver) return;
    gameState = 'TURN_START';
    validTargets = [];
    currentRoll = null;
    rollInfo.innerText = '';
    
    showModal("Il tuo turno", `
        <p>Scegli l'azione da eseguire:</p>
        <button class="btn btn-orange" onclick="handleRollAction()">Lancia il Dado</button>
        <button class="btn btn-blue" onclick="handleMoveOneAction()">Muovi di 1 (Sicuro)</button>
    `);
}

function handleRollAction() {
    hideModal();
    const die = randInt(1, 6);
    const terrain = grid[ballPos.r][ballPos.c];
    let modifier = 0;
    
    if (terrain === 'FAIRWAY') modifier = 1;  // +1 cella dal fairway (zona migliore)
    if (terrain === 'SAND') modifier = -1;    // -1 cella dalla sabbia (zona peggiore)
    
    // Garantiamo almeno 1 cella di movimento (evita il blocco totale a 0)
    currentRoll = Math.max(1, die + modifier);
    
    const sign = modifier > 0 ? `+${modifier}` : modifier;
    rollInfo.innerText = `Dado: ${currentRoll} (${die} ${sign})`;
    
    calculateValidTargets(currentRoll);
    gameState = 'TARGET_SELECT';
    draw();
}

function handleMoveOneAction() {
    hideModal();
    currentRoll = 1;
    rollInfo.innerText = `Mosse: 1`;
    calculateValidTargets(1);
    gameState = 'TARGET_SELECT';
    draw();
}

function calculateValidTargets(distance) {
    validTargets = [];
    const startTerrain = grid[ballPos.r][ballPos.c];

    Object.keys(DIRECTIONS).forEach(dirKey => {
        const direction = DIRECTIONS[dirKey];
        const result = calculateShot(ballPos, direction, distance, startTerrain);
        
        if (result.valid && !result.canceled) {
            validTargets.push({
                directionKey: dirKey,
                targetPos: result.finalPos,
                path: result.path,
                winner: result.winner || false
            });
        }
    });
    
    // Se non ci sono mosse valide e la distanza non era già 1, forziamo 1 cella
    if (validTargets.length === 0 && distance !== 1) {
        currentRoll = 1;
        rollInfo.innerText = `Forzato: 1 cella`;
        calculateValidTargets(1);
        return;
    }

    if (validTargets.length === 0) {
        showModal("Attenzione", `
            <p>Nessuna mossa disponibile neanche a 1 cella!</p>
            <button class='btn btn-grey' onclick='startTurn()'>Salta Turno</button>
        `);
    }
}

// ==========================================
// INTERAZIONE CANVAS E TIRO
// ==========================================

function handleCanvasClick(event) {
    if (gameState !== 'TARGET_SELECT') return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width * dpr);
    const scaleY = canvas.height / (rect.height * dpr);

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const clicked = {
        r: Math.floor(y / CELL_SIZE),
        c: Math.floor(x / CELL_SIZE)
    };

    const target = validTargets.find(t => samePosition(t.targetPos, clicked));

    if (target) {
        executeShot(target);
    }
}

function executeShot(targetData) {
    strokeCount++;
    strokeInfo.innerText = `Colpi: ${strokeCount}`;
    
    lastPath = [{ ...ballPos }, ...targetData.path];
    shotHistory.push({ path: lastPath, landed: targetData.targetPos });
    
    ballPos = { ...targetData.targetPos };
    validTargets = []; 
    
    if (targetData.winner) {
        gameOver = true;
        draw();
        setTimeout(() => {
            showModal("Buca in " + strokeCount + "!", `
                <p>Hai completato il percorso.</p>
                <button class="btn btn-green" onclick="initGame()">Nuova Partita</button>
            `);
        }, 500);
    } else {
        draw();
        setTimeout(startTurn, 600);
    }
}

function calculateShot(start, direction, distance, startTerrain) {
    const path = [];
    // Permette di superare gli alberi solo se si parte dal Fairway
    const allowTreePass = startTerrain === 'FAIRWAY';

    for (let step = 1; step <= distance; step++) {
        const next = { r: start.r + direction.dr * step, c: start.c + direction.dc * step };
        if (!isInside(next)) {
            return { valid: false, path };
        }

        const terrain = grid[next.r][next.c];
        path.push(next);

        if (terrain === 'TREES') {
            if (step === distance) return { valid: false, path }; // Non puoi atterrare sugli alberi
            if (!allowTreePass) return { valid: false, path };     // Non puoi scavalcarli se non sei su fairway
        }
        if (terrain === 'WATER' && step === distance) {
            return { valid: true, canceled: true, path };
        }
        if (samePosition(next, holePos)) {
            return { valid: true, winner: true, finalPos: holePos, path };
        }
    }

    const finalPos = path[path.length - 1];
    const finalTerrain = grid[finalPos.r][finalPos.c];

    if (finalTerrain === 'WATER') return { valid: true, canceled: true, path };
    if (finalTerrain === 'TREES') return { valid: false, path };

    const slopeResult = resolveSlope(finalPos);
    if (slopeResult.winner) {
        path.push(slopeResult.finalPos);
        return { valid: true, winner: true, finalPos: slopeResult.finalPos, path };
    }

    if (slopeResult.rolled) {
        path.push(slopeResult.finalPos);
    }

    return { valid: true, finalPos: slopeResult.finalPos, path };
}

function resolveSlope(position) {
    let current = { ...position };
    let rolled = false;

    while (true) {
        const terrain = grid[current.r][current.c];
        if (!terrain.startsWith('SLOPE_')) break;

        const slopeDirection = terrain === 'SLOPE_DN' ? 'S' : terrain === 'SLOPE_UP' ? 'N' : terrain === 'SLOPE_LF' ? 'W' : 'E';
        const next = { r: current.r + DIRECTIONS[slopeDirection].dr, c: current.c + DIRECTIONS[slopeDirection].dc };
        if (!isInside(next)) break;
        if (samePosition(next, holePos)) {
            return { winner: true, finalPos: holePos, rolled: true };
        }

        const nextTerrain = grid[next.r][next.c];
        if (nextTerrain === 'WATER' || nextTerrain === 'TREES') break;

        current = next;
        rolled = true;
    }
    return { finalPos: current, rolled };
}

// ==========================================
// GENERAZIONE MAPPA
// ==========================================

function generateMap(difficulty = 'medium') {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill('ROUGH'));
    const easy = difficulty === 'easy';
    const medium = difficulty === 'medium';
    const hard = difficulty === 'hard';

    addHazards(easy, medium, hard);
    placeStartAndHole();
    createFairway(difficulty);
    createSandBlobs(easy, medium, hard);
    createSlopes(difficulty);

    grid[ballPos.r][ballPos.c] = 'FAIRWAY';
    grid[holePos.r][holePos.c] = 'FAIRWAY';

    strokeCount = 0;
    lastPath = [];
    shotHistory = [];
    gameOver = false;
    strokeInfo.innerText = 'Colpi: 0';
    draw();
}

function addHazards(easy, medium, hard) {
    const level = easy ? 'easy' : medium ? 'medium' : 'hard';
    const waterBlobs = CONFIG.hazards.waterBlobs[level];
    const treeBlobs = CONFIG.hazards.treeBlobs[level];
    const waterRange = CONFIG.hazards.waterSizeRange[level];
    const treeRange = CONFIG.hazards.treeSizeRange[level];

    for (let i = 0; i < waterBlobs; i++) {
        const seed = { r: randInt(Math.floor(ROWS * 0.15), Math.floor(ROWS * 0.8)), c: randInt(1, COLS - 2) };
        createBlob('WATER', seed, randInt(waterRange[0], waterRange[1]), { avoid: ['FAIRWAY', 'SAND', 'WATER', 'TREES'] });
    }
    for (let i = 0; i < treeBlobs; i++) {
        const seed = { r: randInt(Math.floor(ROWS * 0.15), Math.floor(ROWS * 0.8)), c: randInt(1, COLS - 2) };
        createBlob('TREES', seed, randInt(treeRange[0], treeRange[1]), { avoid: ['WATER', 'TREES'] });
    }
}

function placeStartAndHole() {
    ballPos = findRandomPositionInRows(CONFIG.startRows, ['WATER', 'TREES']);
    holePos = findRandomPositionInRows(CONFIG.holeRows, ['WATER', 'TREES']);
}

function createFairway(difficulty) {
    let path = findPath(ballPos, holePos, ['WATER', 'TREES']) || findPath(ballPos, holePos, ['WATER']) || findPath(ballPos, holePos, []);
    if (!path) return;

    path.forEach(cell => {
        if (grid[cell.r][cell.c] !== 'WATER' && grid[cell.r][cell.c] !== 'TREES') grid[cell.r][cell.c] = 'FAIRWAY';
    });
    const radius = CONFIG.fairway.radius[difficulty] ?? 2;
    const baseFill = CONFIG.fairway.baseFill[difficulty] ?? 0.75;
    
    path.forEach(cell => {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const r = cell.r + dr, c = cell.c + dc;
                if (!isInside({ r, c }) || Math.abs(dr) + Math.abs(dc) > radius + 1) continue;
                if (grid[r][c] === 'ROUGH' && Math.random() < Math.max(0.25, baseFill - (Math.abs(dr) + Math.abs(dc)) * 0.2)) {
                    grid[r][c] = 'FAIRWAY';
                }
            }
        }
    });
}

function createSandBlobs(easy, medium, hard) {
    const seeds = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 'ROUGH' && hasAdjacentTerrain({ r, c }, 'FAIRWAY')) seeds.push({ r, c });
        }
    }
    shuffleArray(seeds);
    const level = easy ? 'easy' : medium ? 'medium' : 'hard';
    for (let i = 0; i < CONFIG.sand.blobCount[level] && seeds.length > 0; i++) {
        const seed = seeds.pop();
        if (grid[seed.r][seed.c] === 'ROUGH') createBlob('SAND', seed, randInt(CONFIG.sand.blobSizeRange[level][0], CONFIG.sand.blobSizeRange[level][1]), { avoid: ['WATER', 'TREES', 'SAND', 'FAIRWAY'] });
    }
}

function createSlopes(difficulty) {
    const slopeChance = CONFIG.slopes.chance[difficulty] ?? 0;
    if (slopeChance <= 0) return;
    const slopeTypes = ['SLOPE_DN', 'SLOPE_UP', 'SLOPE_LF', 'SLOPE_RT'];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 'FAIRWAY' && !samePosition({ r, c }, ballPos) && !samePosition({ r, c }, holePos) && Math.random() < slopeChance) {
                grid[r][c] = slopeTypes[randInt(0, slopeTypes.length - 1)];
            }
        }
    }
}

// --- Utility per la mappa ---
function findRandomPositionInRows(rows, avoidTerrains) {
    const candidates = [];
    rows.forEach(r => { for (let c = 0; c < COLS; c++) if (!avoidTerrains.includes(grid[r][c])) candidates.push({ r, c }); });
    if (candidates.length) return candidates[randInt(0, candidates.length - 1)];
    return { r: rows[0], c: Math.floor(COLS / 2) };
}

function findPath(start, goal, avoidTerrains) {
    const queue = [start], visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false)), parent = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    visited[start.r][start.c] = true;
    while (queue.length) {
        const current = queue.shift();
        if (samePosition(current, goal)) {
            const path = []; let node = current;
            while (node) { path.unshift(node); node = parent[node.r][node.c]; }
            return path;
        }
        for (const dir of Object.values(DIRECTIONS)) {
            const next = { r: current.r + dir.dr, c: current.c + dir.dc };
            if (!isInside(next) || visited[next.r][next.c] || avoidTerrains.includes(grid[next.r][next.c])) continue;
            visited[next.r][next.c] = true; parent[next.r][next.c] = current; queue.push(next);
        }
    }
    return null;
}

function createBlob(type, seed, size, options) {
    const { avoid } = options; const cells = [{ ...seed }]; let index = 0;
    if (!isInside(seed) || avoid.includes(grid[seed.r][seed.c]) || grid[seed.r][seed.c] !== 'ROUGH') return;
    grid[seed.r][seed.c] = type;
    while (cells.length < size && index < cells.length) {
        const neighbors = getNeighbors(cells[index++]).filter(n => isInside(n) && !avoid.includes(grid[n.r][n.c]) && grid[n.r][n.c] === 'ROUGH');
        shuffleArray(neighbors);
        for (const n of neighbors) {
            if (cells.length >= size) break;
            if (grid[n.r][n.c] === 'ROUGH') { grid[n.r][n.c] = type; cells.push(n); }
        }
    }
}

function getNeighbors(cell) { return [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }, { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }].map(d => ({ r: cell.r + d.dr, c: cell.c + d.dc })); }
function hasAdjacentTerrain(cell, terrainType) { return getNeighbors(cell).some(n => isInside(n) && grid[n.r][n.c] === terrainType); }
function shuffleArray(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function isInside(pos) { return pos.r >= 0 && pos.r < ROWS && pos.c >= 0 && pos.c < COLS; }
function samePosition(a, b) { return a.r === b.r && a.c === b.c; }

// ==========================================
// RENDER (DRAW)
// ==========================================

function draw() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const type = grid[r][c];
            ctx.fillStyle = TERRAIN[type].color;
            ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL_SIZE); ctx.lineTo(canvas.width, r * CELL_SIZE); ctx.stroke(); }
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL_SIZE, 0); ctx.lineTo(c * CELL_SIZE, canvas.height); ctx.stroke(); }

    ctx.font = `bold ${CELL_SIZE * 0.6}px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const type = grid[r][c];
            if (TERRAIN[type].label) {
                ctx.fillStyle = TERRAIN[type].textColor || '#000';
                ctx.fillText(TERRAIN[type].label, c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2);
            }
        }
    }

    if (shotHistory.length) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 2;
        shotHistory.forEach(entry => {
            ctx.beginPath();
            entry.path.forEach((cell, index) => {
                const x = cell.c * CELL_SIZE + CELL_SIZE / 2, y = cell.r * CELL_SIZE + CELL_SIZE / 2;
                index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke();
        });
    }

    if (lastPath.length) {
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        lastPath.forEach((cell, index) => {
            const x = cell.c * CELL_SIZE + CELL_SIZE / 2, y = cell.r * CELL_SIZE + CELL_SIZE / 2;
            index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    const holeX = holePos.c * CELL_SIZE + CELL_SIZE / 2, holeY = holePos.r * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(holeX, holeY, CELL_SIZE * 0.35, 0, Math.PI * 2); ctx.fill();

    const ballX = ballPos.c * CELL_SIZE + CELL_SIZE / 2, ballY = ballPos.r * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ballX, ballY, CELL_SIZE * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Disegna i bersagli validi pulsanti
    if (gameState === 'TARGET_SELECT' && validTargets.length > 0) {
        validTargets.forEach(t => {
            const tx = t.targetPos.c * CELL_SIZE + CELL_SIZE / 2;
            const ty = t.targetPos.r * CELL_SIZE + CELL_SIZE / 2;
            
            ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
            ctx.beginPath();
            ctx.arc(tx, ty, CELL_SIZE * 0.45, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(tx, ty, CELL_SIZE * 0.25, 0, Math.PI * 2);
            ctx.stroke();
        });
    }
}

// Avvio applicazione
window.onload = initGame;
