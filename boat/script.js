const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const COLS = 12;
const ROWS = 18;

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
        mulinelli: { easy: 2, medium: 4, hard: 6 },
        alghe: { easy: 0, medium: 4, hard: 7 },
        secche: { easy: 0, medium: 3, hard: 6 },
        mulinelliSize: { easy: [4, 9], medium: [4, 16], hard: [9, 25] },
        algheSize: { easy: [4, 9], medium: [4, 16], hard: [4, 16] }
    },
    vento: {
        radius: { easy: 3, medium: 2, hard: 1 },
        baseFill: { easy: 0.95, medium: 0.75, hard: 0.55 }
    },
    correnti: {
        chance: { easy: 0, medium: 0.05, hard: 0.12 }
    }
};

const TERRAIN = {
    MARE:        { color: '#0ea5e9', label: '' },
    VENTO:       { color: '#7dd3fc', label: '' },
    ALGHE:       { color: '#4ade80', label: '' },
    MULINELLO:   { color: '#1e3a8a', label: '🌀', textColor: '#ffffff' },
    SECCA:       { color: '#fcd34d', label: '⚓', textColor: '#0f172a' },
    CORRENTE_DN: { color: '#38bdf8', label: '↓', textColor: '#0f172a' },
    CORRENTE_UP: { color: '#38bdf8', label: '↑', textColor: '#0f172a' },
    CORRENTE_LF: { color: '#38bdf8', label: '←', textColor: '#0f172a' },
    CORRENTE_RT: { color: '#38bdf8', label: '→', textColor: '#0f172a' }
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

let grid = [];
let ballPos = { r: ROWS - 3, c: Math.floor(COLS / 2) };
let holePos = { r: 3, c: Math.floor(COLS / 2) };
let currentRoll = null;
let strokeCount = 0;
let lastPath = [];
let shotHistory = [];
let gameOver = false;

// Nuove logiche navali
let isStuck = false;
let requireBuoy = false;
let buoyCollected = true;
let buoyPos = null;

let gameState = 'INIT'; 
let validTargets = []; 

const modal = document.getElementById('gameModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const strokeInfo = document.getElementById('strokeInfo');
const rollInfo = document.getElementById('rollInfo');
const buoyStatus = document.getElementById('buoyStatus');

// UI & Modal
function showModal(title, htmlContent) {
    modalTitle.innerText = title;
    modalBody.innerHTML = htmlContent;
    modal.classList.add('active');
}
function hideModal() { modal.classList.remove('active'); }

function initGame() {
    gameState = 'INIT';
    showModal("Rotta Navale", `
        <p>Seleziona la difficoltà di navigazione:</p>
        <select id="popupDifficulty" class="input-select">
            <option value="easy">Facile</option>
            <option value="medium" selected>Medio</option>
            <option value="hard">Difficile (Con Boa)</option>
        </select>
        <button class="btn btn-primary" onclick="startGame()">Salpa!</button>
        <button class="btn btn-grey" onclick="openTutorial()">Manuale di Bordo</button>
    `);
}

function startGame() {
    const diff = document.getElementById('popupDifficulty').value;
    hideModal();
    generateMap(diff);
    startTurn();
}

function updateHUD() {
    strokeInfo.innerText = `Turni: ${strokeCount}`;
    if (requireBuoy) {
        buoyStatus.style.display = 'inline-block';
        buoyStatus.innerText = buoyCollected ? '🚩 Boa: ✅' : '🚩 Boa: ❌';
    } else {
        buoyStatus.style.display = 'none';
    }
}

function startTurn() {
    if (gameOver) return;
    gameState = 'TURN_START';
    validTargets = [];
    currentRoll = null;
    rollInfo.innerText = '';
    
    updateHUD();

    if (isStuck) {
        showModal("Nave Incagliata!", `
            <p>Sei finito in una secca. Devi sprecare un turno per disincagliare la barca.</p>
            <button class="btn btn-orange" onclick="disincaglia()">Disincaglia (-1 Turno)</button>
        `);
        return;
    }

    showModal("Il tuo turno", `
        <p>Scegli la manovra:</p>
        <button class="btn btn-orange" onclick="handleRollAction()">Lancia il Dado</button>
        <button class="btn btn-blue" onclick="handleMoveOneAction()">Motore (1 Cella)</button>
    `);
}

function disincaglia() {
    isStuck = false;
    strokeCount++;
    hideModal();
    startTurn();
}

function handleRollAction() {
    hideModal();
    const die = randInt(1, 6);
    const terrain = grid[ballPos.r][ballPos.c];
    let modifier = 0;
    
    if (terrain === 'VENTO') modifier = 1;  
    if (terrain === 'ALGHE') modifier = -1; 
    
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
                winner: result.winner || false,
                hitBuoy: result.hitBuoy || false
            });
        }
    });
    
    if (validTargets.length === 0 && distance !== 1) {
        currentRoll = 1;
        rollInfo.innerText = `Forzato: 1 cella`;
        calculateValidTargets(1);
        return;
    }

    if (validTargets.length === 0) {
        showModal("Attenzione", `
            <p>Sei bloccato, nessuna mossa disponibile!</p>
            <button class='btn btn-grey' onclick='startTurn()'>Salta Turno</button>
        `);
    }
}

// Interaction
function handleCanvasClick(event) {
    if (gameState !== 'TARGET_SELECT') return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width * dpr);
    const scaleY = canvas.height / (rect.height * dpr);

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const clicked = { r: Math.floor(y / CELL_SIZE), c: Math.floor(x / CELL_SIZE) };
    const target = validTargets.find(t => samePosition(t.targetPos, clicked));

    if (target) {
        executeShot(target);
    }
}

function executeShot(targetData) {
    strokeCount++;
    
    lastPath = [{ ...ballPos }, ...targetData.path];
    shotHistory.push({ path: lastPath, landed: targetData.targetPos });
    
    ballPos = { ...targetData.targetPos };
    validTargets = []; 
    
    if (targetData.hitBuoy) {
        buoyCollected = true;
    }
    updateHUD();

    if (targetData.winner) {
        gameOver = true;
        draw();
        setTimeout(() => {
            showModal("Attraccato in " + strokeCount + " turni!", `
                <p>Hai raggiunto il porto in sicurezza.</p>
                <button class="btn btn-green" onclick="initGame()">Nuova Rotta</button>
            `);
        }, 500);
    } else {
        if (grid[ballPos.r][ballPos.c] === 'SECCA') {
            isStuck = true;
        }
        draw();
        setTimeout(startTurn, 600);
    }
}

function calculateShot(start, direction, distance, startTerrain) {
    const path = [];
    let hitB = false;

    for (let step = 1; step <= distance; step++) {
        const next = { r: start.r + direction.dr * step, c: start.c + direction.dc * step };
        if (!isInside(next)) return { valid: false, path };

        path.push(next);

        // Controllo se passiamo sopra la boa
        if (requireBuoy && !buoyCollected && buoyPos && samePosition(next, buoyPos)) {
            hitB = true;
        }

        // Il Mulinello annulla il tiro solo se ci atterri sopra esattamente
        if (grid[next.r][next.c] === 'MULINELLO' && step === distance) {
            return { valid: true, canceled: true, path };
        }

        if (samePosition(next, holePos)) {
            // Entri in porto solo se hai soddisfatto i requisiti della boa
            if (!requireBuoy || buoyCollected || hitB) {
                return { valid: true, winner: true, finalPos: holePos, hitBuoy: hitB, path };
            }
            // Altrimenti ci passi semplicemente sopra senza vincere (il porto agisce da casella normale)
        }
    }

    const finalPos = path[path.length - 1];
    const finalTerrain = grid[finalPos.r][finalPos.c];

    if (finalTerrain === 'MULINELLO') return { valid: true, canceled: true, path };

    const slopeResult = resolveCorrente(finalPos);
    if (slopeResult.hitBuoy) hitB = true;

    if (slopeResult.winner) {
        if (!requireBuoy || buoyCollected || hitB) {
            path.push(slopeResult.finalPos);
            return { valid: true, winner: true, finalPos: holePos, hitBuoy: hitB, path };
        }
    }

    if (slopeResult.rolled) {
        path.push(slopeResult.finalPos);
    }

    return { valid: true, finalPos: slopeResult.finalPos, hitBuoy: hitB, path };
}

function resolveCorrente(position) {
    let current = { ...position };
    let rolled = false;
    let hitB = false;

    while (true) {
        const terrain = grid[current.r][current.c];
        if (!terrain.startsWith('CORRENTE_')) break;

        const dirKey = terrain === 'CORRENTE_DN' ? 'S' : terrain === 'CORRENTE_UP' ? 'N' : terrain === 'CORRENTE_LF' ? 'W' : 'E';
        const next = { r: current.r + DIRECTIONS[dirKey].dr, c: current.c + DIRECTIONS[dirKey].dc };
        if (!isInside(next)) break;
        
        if (requireBuoy && !buoyCollected && buoyPos && samePosition(next, buoyPos)) {
            hitB = true;
        }

        if (samePosition(next, holePos)) {
            return { winner: true, finalPos: holePos, rolled: true, hitBuoy: hitB };
        }

        const nextTerrain = grid[next.r][next.c];
        if (nextTerrain === 'MULINELLO') break; // Fermato dal mulinello

        current = next;
        rolled = true;
    }
    return { finalPos: current, rolled, hitBuoy: hitB };
}


// MAP GEN
function generateMap(difficulty = 'medium') {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill('MARE'));
    const easy = difficulty === 'easy';
    const medium = difficulty === 'medium';
    const hard = difficulty === 'hard';

    addHazards(easy, medium, hard);
    placeStartAndHole();
    createVento(difficulty);
    createAlgheAndSecche(easy, medium, hard);
    createCorrenti(difficulty);
    placeBuoy(difficulty);

    grid[ballPos.r][ballPos.c] = 'VENTO';
    grid[holePos.r][holePos.c] = 'VENTO';

    strokeCount = 0;
    lastPath = [];
    shotHistory = [];
    gameOver = false;
    isStuck = false;
    
    updateHUD();
    draw();
}

function addHazards(easy, medium, hard) {
    const level = easy ? 'easy' : medium ? 'medium' : 'hard';
    const mulinelliBlobs = CONFIG.hazards.mulinelli[level];
    const mRange = CONFIG.hazards.mulinelliSize[level];

    for (let i = 0; i < mulinelliBlobs; i++) {
        const seed = { r: randInt(Math.floor(ROWS * 0.15), Math.floor(ROWS * 0.8)), c: randInt(1, COLS - 2) };
        createBlob('MULINELLO', seed, randInt(mRange[0], mRange[1]), { avoid: ['VENTO', 'MULINELLO'] });
    }
}

function placeStartAndHole() {
    ballPos = findRandomPositionInRows(CONFIG.startRows, ['MULINELLO']);
    holePos = findRandomPositionInRows(CONFIG.holeRows, ['MULINELLO']);
}

function createVento(difficulty) {
    let path = findPath(ballPos, holePos, ['MULINELLO']) || findPath(ballPos, holePos, []);
    if (!path) return;

    path.forEach(cell => {
        if (grid[cell.r][cell.c] !== 'MULINELLO') grid[cell.r][cell.c] = 'VENTO';
    });
    const radius = CONFIG.vento.radius[difficulty] ?? 2;
    const baseFill = CONFIG.vento.baseFill[difficulty] ?? 0.75;
    
    path.forEach(cell => {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const r = cell.r + dr, c = cell.c + dc;
                if (!isInside({ r, c }) || Math.abs(dr) + Math.abs(dc) > radius + 1) continue;
                if (grid[r][c] === 'MARE' && Math.random() < Math.max(0.25, baseFill - (Math.abs(dr) + Math.abs(dc)) * 0.2)) {
                    grid[r][c] = 'VENTO';
                }
            }
        }
    });
}

function createAlgheAndSecche(easy, medium, hard) {
    const seedsAlghe = [];
    const seedsSecche = [];
    
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 'MARE') {
                seedsAlghe.push({ r, c });
                seedsSecche.push({ r, c });
            }
        }
    }
    shuffleArray(seedsAlghe);
    shuffleArray(seedsSecche);
    
    const level = easy ? 'easy' : medium ? 'medium' : 'hard';
    
    // Alghe
    for (let i = 0; i < CONFIG.hazards.alghe[level] && seedsAlghe.length > 0; i++) {
        const seed = seedsAlghe.pop();
        if (grid[seed.r][seed.c] === 'MARE') {
            createBlob('ALGHE', seed, randInt(CONFIG.hazards.algheSize[level][0], CONFIG.hazards.algheSize[level][1]), { avoid: ['MULINELLO', 'VENTO', 'ALGHE'] });
        }
    }
    
    // Secche (singole celle sparse)
    for (let i = 0; i < CONFIG.hazards.secche[level] && seedsSecche.length > 0; i++) {
        const seed = seedsSecche.pop();
        if (grid[seed.r][seed.c] === 'MARE' && !samePosition(seed, ballPos) && !samePosition(seed, holePos)) {
            grid[seed.r][seed.c] = 'SECCA';
        }
    }
}

function createCorrenti(difficulty) {
    const slopeChance = CONFIG.correnti.chance[difficulty] ?? 0;
    if (slopeChance <= 0) return;
    const slopeTypes = ['CORRENTE_DN', 'CORRENTE_UP', 'CORRENTE_LF', 'CORRENTE_RT'];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 'VENTO' && !samePosition({ r, c }, ballPos) && !samePosition({ r, c }, holePos) && Math.random() < slopeChance) {
                grid[r][c] = slopeTypes[randInt(0, slopeTypes.length - 1)];
            }
        }
    }
}

function placeBuoy(difficulty) {
    if (difficulty === 'hard') {
        requireBuoy = true;
        buoyCollected = false;
        const middleRows = [7, 8, 9, 10];
        const candidates = [];
        middleRows.forEach(r => {
            for(let c = 1; c < COLS - 1; c++) {
                if (grid[r][c] === 'MARE' || grid[r][c] === 'VENTO') {
                    candidates.push({r, c});
                }
            }
        });
        
        if (candidates.length > 0) {
            shuffleArray(candidates);
            buoyPos = candidates[0];
        } else {
            buoyPos = { r: 8, c: Math.floor(COLS/2) }; 
        }
    } else {
        requireBuoy = false;
        buoyCollected = true;
        buoyPos = null;
    }
}


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
    if (!isInside(seed) || avoid.includes(grid[seed.r][seed.c]) || grid[seed.r][seed.c] !== 'MARE') return;
    grid[seed.r][seed.c] = type;
    while (cells.length < size && index < cells.length) {
        const neighbors = getNeighbors(cells[index++]).filter(n => isInside(n) && !avoid.includes(grid[n.r][n.c]) && grid[n.r][n.c] === 'MARE');
        shuffleArray(neighbors);
        for (const n of neighbors) {
            if (cells.length >= size) break;
            if (grid[n.r][n.c] === 'MARE') { grid[n.r][n.c] = type; cells.push(n); }
        }
    }
}

function getNeighbors(cell) { return [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }, { dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }].map(d => ({ r: cell.r + d.dr, c: cell.c + d.dc })); }
function shuffleArray(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function isInside(pos) { return pos.r >= 0 && pos.r < ROWS && pos.c >= 0 && pos.c < COLS; }
function samePosition(a, b) { return a.r === b.r && a.c === b.c; }

// DRAW
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

    ctx.font = `bold ${CELL_SIZE * 0.55}px 'Inter', sans-serif`;
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

    if (requireBuoy && !buoyCollected && buoyPos) {
        const bx = buoyPos.c * CELL_SIZE + CELL_SIZE / 2;
        const by = buoyPos.r * CELL_SIZE + CELL_SIZE / 2;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(bx, by - CELL_SIZE * 0.35);
        ctx.lineTo(bx + CELL_SIZE * 0.3, by);
        ctx.lineTo(bx, by + CELL_SIZE * 0.35);
        ctx.lineTo(bx - CELL_SIZE * 0.3, by);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${CELL_SIZE * 0.35}px 'Inter'`;
        ctx.fillText('🚩', bx, by + 2);
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

    // Porto
    const holeX = holePos.c * CELL_SIZE + CELL_SIZE / 2;
    const holeY = holePos.r * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(holePos.c * CELL_SIZE + 2, holePos.r * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${CELL_SIZE * 0.5}px 'Inter'`;
    ctx.fillText('🚢', holeX, holeY);

    // Barca
    const ballX = ballPos.c * CELL_SIZE + CELL_SIZE / 2;
    const ballY = ballPos.r * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath(); 
    ctx.moveTo(ballX, ballY - CELL_SIZE * 0.35); 
    ctx.lineTo(ballX + CELL_SIZE * 0.25, ballY + CELL_SIZE * 0.3);
    ctx.lineTo(ballX - CELL_SIZE * 0.25, ballY + CELL_SIZE * 0.3);
    ctx.closePath();
    ctx.fill(); 
    ctx.stroke();

    if (gameState === 'TARGET_SELECT' && validTargets.length > 0) {
        validTargets.forEach(t => {
            const tx = t.targetPos.c * CELL_SIZE + CELL_SIZE / 2;
            const ty = t.targetPos.r * CELL_SIZE + CELL_SIZE / 2;
            
            ctx.fillStyle = 'rgba(14, 165, 233, 0.35)';
            ctx.beginPath();
            ctx.arc(tx, ty, CELL_SIZE * 0.45, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#0ea5e9';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(tx, ty, CELL_SIZE * 0.25, 0, Math.PI * 2);
            ctx.stroke();
        });
    }
}

function openTutorial() {
    showModal("Manuale di Bordo", `
        <div class="tutorial-text">
            <p><strong>L'obiettivo:</strong> Guida la barca fino al porto (🚢) usando meno turni possibile.</p>
            <p><strong>Il Turno:</strong> Scegli se <strong>Lanciare il Dado</strong> o usare il <strong>Motore (1 casella)</strong>.</p>
            <p><strong>Gli Elementi:</strong></p>
            <ul>
                <li>💨 <strong>Vento (Azzurro):</strong> +1 cella al tiro se parti da qui.</li>
                <li>🌿 <strong>Alghe (Verde):</strong> -1 cella al tiro se parti da qui.</li>
                <li>🌀 <strong>Mulinelli (Blu scuro):</strong> Ti respingono, il tiro si annulla se ci finisci sopra.</li>
                <li>🌊 <strong>Correnti (Frecce):</strong> Ti trascinano automaticamente a fine turno.</li>
                <li>⚓ <strong>Secche (Giallo):</strong> Ti incagli e devi usare 1 turno per liberarti.</li>
                <li>🚩 <strong>Boa (Rosso):</strong> In modalità Difficile, <strong>DEVI</strong> passarci sopra prima di poter entrare in porto.</li>
            </ul>
        </div>
        <button class="btn btn-primary" onclick="backToInitOrTurn()">Ricevuto!</button>
    `);
}

function backToInitOrTurn() {
    if (gameState === 'INIT') {
        initGame();
    } else {
        startTurn();
    }
}

window.onload = initGame;
