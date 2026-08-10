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

let state = {
    animatingPos: null,
    grid: [],
    ballPos: { r: ROWS - 3, c: Math.floor(COLS / 2) },
    holePos: { r: 3, c: Math.floor(COLS / 2) },
    currentRoll: null,
    strokeCount: 0,
    lastPath: [],
    shotHistory: [],
    gameOver: false,
    isStuck: false,
    requireBuoy: false,
    buoyCollected: true,
    buoyPos: null,
    gameState: 'INIT',
    validTargets: []
};

const DOM = {
    modal: document.getElementById('gameModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalBody: document.getElementById('modalBody'),
    strokeInfo: document.getElementById('strokeInfo'),
    rollInfo: document.getElementById('rollInfo'),
    buoyStatus: document.getElementById('buoyStatus')
};

// UI & Modal
function showModal(title, htmlContent) {
    DOM.modalTitle.innerText = title;
    DOM.modalBody.innerHTML = htmlContent;
    DOM.modal.classList.add('active');
}
function hideModal() { DOM.modal.classList.remove('active'); }

function initGame() {
    state.gameState = 'INIT';
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
    DOM.strokeInfo.innerText = `Turni: ${state.strokeCount}`;
    if (state.requireBuoy) {
        DOM.buoyStatus.style.display = 'inline-block';
        DOM.buoyStatus.innerText = state.buoyCollected ? '🚩 Boa: ✅' : '🚩 Boa: ❌';
    } else {
        DOM.buoyStatus.style.display = 'none';
    }
}

function startTurn() {
    if (state.gameOver) return;
    state.gameState = 'TURN_START';
    state.validTargets = [];
    state.currentRoll = null;
    DOM.rollInfo.innerText = '';
    
    updateHUD();

    if (state.isStuck) {
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
    state.isStuck = false;
    state.strokeCount++;
    hideModal();
    startTurn();
}

function handleRollAction() {
    hideModal();
    state.gameState = 'ROLLING';
    state.validTargets = [];
    
    let rollCount = 0;
    // Effetto "roulette" dei numeri per mezzo secondo
    const rollInterval = setInterval(() => {
        DOM.rollInfo.innerText = `Lancio... 🎲 ${randInt(1, 6)}`;
        rollCount++;
        
        if (rollCount > 10) {
            clearInterval(rollInterval);
            finalizeRoll(); // Chiama la vera logica
        }
    }, 50);
}

function finalizeRoll() {
    PaperGames.finalizeRoll({
        state,
        grid: state.grid,
        ballPos: state.ballPos,
        draw,
        calculateValidTargets,
        rollInfo: DOM.rollInfo,
        terrainModifier: terrain => {
            if (terrain === 'VENTO' || terrain === 'FAIRWAY') return 1;
            if (terrain === 'ALGHE' || terrain === 'SAND') return -1;
            return 0;
        }
    });
}

function handleMoveOneAction() {
    hideModal();
    state.currentRoll = 1;
    DOM.rollInfo.innerText = `Mosse: 1`;
    calculateValidTargets(1);
    state.gameState = 'TARGET_SELECT';
    draw();
}

function calculateValidTargets(distance) {
    state.validTargets = [];
    const startTerrain = state.grid[state.ballPos.r][state.ballPos.c];

    Object.keys(DIRECTIONS).forEach(dirKey => {
        const direction = DIRECTIONS[dirKey];
        const result = calculateShot(state.ballPos, direction, distance, startTerrain);
        
        if (result.valid && !result.canceled) {
            state.validTargets.push({
                directionKey: dirKey,
                targetPos: result.finalPos,
                path: result.path,
                winner: result.winner || false,
                hitBuoy: result.hitBuoy || false
            });
        }
    });
    
    if (state.validTargets.length === 0 && distance !== 1) {
        state.currentRoll = 1;
        DOM.rollInfo.innerText = `Forzato: 1 cella`;
        calculateValidTargets(1);
        return;
    }

    if (state.validTargets.length === 0) {
        showModal("Attenzione", `
            <p>Sei bloccato, nessuna mossa disponibile!</p>
            <button class='btn btn-grey' onclick='startTurn()'>Salta Turno</button>
        `);
    }
}

// Interaction
function handleCanvasClick(event) {
    if (state.gameState !== 'TARGET_SELECT') return;

    const clicked = PaperGames.getCellFromCanvasEvent(event, canvas, CELL_SIZE, ROWS, COLS, dpr);
    const target = state.validTargets.find(t => samePosition(t.targetPos, clicked));

    if (target) {
        executeShot(target);
    }
}

function executeShot(targetData) {
    const fullPath = targetData.path;
    const oldPos = { ...state.ballPos };

    PaperGames.animateShot({
        targetData,
        path: fullPath,
        draw,
        delay: 100,
        beforeShot: () => {
            state.strokeCount++;
            state.validTargets = [];
            state.gameState = 'ANIMATING';
        },
        onFrame: cell => {
            state.animatingPos = cell;
        },
        afterLanding: () => {
            state.animatingPos = null;
            state.ballPos = { ...targetData.targetPos };

            state.lastPath = [oldPos, ...targetData.path];
            state.shotHistory.push({ path: state.lastPath, landed: targetData.targetPos });

            if (typeof updateHUD === 'function') updateHUD();
            else DOM.strokeInfo.innerText = `Colpi: ${state.strokeCount}`;

            if (targetData.hitBuoy) state.buoyCollected = true;

            if (targetData.winner) {
                state.gameOver = true;
                draw();
                setTimeout(() => {
                    showModal('Vittoria!', `<p>Hai completato in ${state.strokeCount} turni.</p><button class="btn btn-green" onclick="initGame()">Gioca Ancora</button>`);
                }, 500);
            } else {
                if (state.grid[state.ballPos.r][state.ballPos.c] === 'SECCA') state.isStuck = true;
                draw();
                setTimeout(startTurn, 600);
            }
        }
    });
}

function calculateShot(start, direction, distance, startTerrain) {
    const path = [];
    let hitB = false;

    for (let step = 1; step <= distance; step++) {
        const next = { r: start.r + direction.dr * step, c: start.c + direction.dc * step };
        if (!isInside(next)) return { valid: false, path };

        path.push(next);

        // Controllo se passiamo sopra la boa
        if (state.requireBuoy && !state.buoyCollected && state.buoyPos && samePosition(next, state.buoyPos)) {
            hitB = true;
        }

        // Il Mulinello annulla il tiro solo se ci atterri sopra esattamente
        if (state.grid[next.r][next.c] === 'MULINELLO' && step === distance) {
            return { valid: true, canceled: true, path };
        }

        if (samePosition(next, state.holePos)) {
            // Entri in porto solo se hai soddisfatto i requisiti della boa
            if (!state.requireBuoy || state.buoyCollected || hitB) {
                return { valid: true, winner: true, finalPos: state.holePos, hitBuoy: hitB, path };
            }
            // Altrimenti ci passi semplicemente sopra senza vincere (il porto agisce da casella normale)
        }
    }

    const finalPos = path[path.length - 1];
    const finalTerrain = state.grid[finalPos.r][finalPos.c];

    if (finalTerrain === 'MULINELLO') return { valid: true, canceled: true, path };

    const slopeResult = resolveCorrente(finalPos);
    if (slopeResult.hitBuoy) hitB = true;

    if (slopeResult.winner) {
        if (!state.requireBuoy || state.buoyCollected || hitB) {
            path.push(slopeResult.finalPos);
            return { valid: true, winner: true, finalPos: state.holePos, hitBuoy: hitB, path };
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
        const terrain = state.grid[current.r][current.c];
        if (!terrain.startsWith('CORRENTE_')) break;

        const dirKey = terrain === 'CORRENTE_DN' ? 'S' : terrain === 'CORRENTE_UP' ? 'N' : terrain === 'CORRENTE_LF' ? 'W' : 'E';
        const next = { r: current.r + DIRECTIONS[dirKey].dr, c: current.c + DIRECTIONS[dirKey].dc };
        if (!isInside(next)) break;
        
        if (state.requireBuoy && !state.buoyCollected && state.buoyPos && samePosition(next, state.buoyPos)) {
            hitB = true;
        }

        if (samePosition(next, state.holePos)) {
            return { winner: true, finalPos: state.holePos, rolled: true, hitBuoy: hitB };
        }

        const nextTerrain = state.grid[next.r][next.c];
        if (nextTerrain === 'MULINELLO') break; // Fermato dal mulinello

        current = next;
        rolled = true;
    }
    return { finalPos: current, rolled, hitBuoy: hitB };
}


// MAP GEN
function generateMap(difficulty = 'medium') {
    state.grid = Array.from({ length: ROWS }, () => Array(COLS).fill('MARE'));
    const easy = difficulty === 'easy';
    const medium = difficulty === 'medium';
    const hard = difficulty === 'hard';

    addHazards(easy, medium, hard);
    placeStartAndHole();
    createVento(difficulty);
    createAlgheAndSecche(easy, medium, hard);
    createCorrenti(difficulty);
    placeBuoy(difficulty);

    state.grid[state.ballPos.r][state.ballPos.c] = 'VENTO';
    state.grid[state.holePos.r][state.holePos.c] = 'VENTO';

    state.strokeCount = 0;
    state.lastPath = [];
    state.shotHistory = [];
    state.gameOver = false;
    state.isStuck = false;
    
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
    state.ballPos = findRandomPositionInRows(CONFIG.startRows, ['MULINELLO']);
    state.holePos = findRandomPositionInRows(CONFIG.holeRows, ['MULINELLO']);
}

function createVento(difficulty) {
    let path = findPath(state.ballPos, state.holePos, ['MULINELLO']) || findPath(state.ballPos, state.holePos, []);
    if (!path) return;

    path.forEach(cell => {
        if (state.grid[cell.r][cell.c] !== 'MULINELLO') state.grid[cell.r][cell.c] = 'VENTO';
    });
    const radius = CONFIG.vento.radius[difficulty] ?? 2;
    const baseFill = CONFIG.vento.baseFill[difficulty] ?? 0.75;
    
    path.forEach(cell => {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const r = cell.r + dr, c = cell.c + dc;
                if (!isInside({ r, c }) || Math.abs(dr) + Math.abs(dc) > radius + 1) continue;
                if (state.grid[r][c] === 'MARE' && Math.random() < Math.max(0.25, baseFill - (Math.abs(dr) + Math.abs(dc)) * 0.2)) {
                    state.grid[r][c] = 'VENTO';
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
            if (state.grid[r][c] === 'MARE') {
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
        if (state.grid[seed.r][seed.c] === 'MARE') {
            createBlob('ALGHE', seed, randInt(CONFIG.hazards.algheSize[level][0], CONFIG.hazards.algheSize[level][1]), { avoid: ['MULINELLO', 'VENTO', 'ALGHE'] });
        }
    }
    
    // Secche (singole celle sparse)
    for (let i = 0; i < CONFIG.hazards.secche[level] && seedsSecche.length > 0; i++) {
        const seed = seedsSecche.pop();
        if (state.grid[seed.r][seed.c] === 'MARE' && !samePosition(seed, state.ballPos) && !samePosition(seed, state.holePos)) {
            state.grid[seed.r][seed.c] = 'SECCA';
        }
    }
}

function createCorrenti(difficulty) {
    const slopeChance = CONFIG.correnti.chance[difficulty] ?? 0;
    if (slopeChance <= 0) return;
    const slopeTypes = ['CORRENTE_DN', 'CORRENTE_UP', 'CORRENTE_LF', 'CORRENTE_RT'];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (state.grid[r][c] === 'VENTO' && !samePosition({ r, c }, state.ballPos) && !samePosition({ r, c }, state.holePos) && Math.random() < slopeChance) {
                state.grid[r][c] = slopeTypes[randInt(0, slopeTypes.length - 1)];
            }
        }
    }
}

function placeBuoy(difficulty) {
    if (difficulty === 'hard') {
        state.requireBuoy = true;
        state.buoyCollected = false;
        const middleRows = [7, 8, 9, 10];
        const candidates = [];
        middleRows.forEach(r => {
            for(let c = 1; c < COLS - 1; c++) {
                if (state.grid[r][c] === 'MARE' || state.grid[r][c] === 'VENTO') {
                    candidates.push({r, c});
                }
            }
        });
        
        if (candidates.length > 0) {
            shuffleArray(candidates);
            state.buoyPos = candidates[0];
        } else {
            state.buoyPos = { r: 8, c: Math.floor(COLS/2) }; 
        }
    } else {
        state.requireBuoy = false;
        state.buoyCollected = true;
        state.buoyPos = null;
    }
}


function findRandomPositionInRows(rows, avoidTerrains) {
    const candidates = [];
    rows.forEach(r => { for (let c = 0; c < COLS; c++) if (!avoidTerrains.includes(state.grid[r][c])) candidates.push({ r, c }); });
    if (candidates.length) return candidates[PaperGames.randInt(0, candidates.length - 1)];
    return { r: rows[0], c: Math.floor(COLS / 2) };
}

function findPath(start, goal, avoidTerrains) {
    return PaperGames.findPath(start, goal, state.grid, ROWS, COLS, DIRECTIONS, avoidTerrains);
}

function createBlob(type, seed, size, options) {
    return PaperGames.createBlob(state.grid, type, seed, size, { ...options, baseTerrain: options?.baseTerrain || 'MARE' }, ROWS, COLS);
}

function getNeighbors(cell) {
    return PaperGames.getNeighbors(cell);
}
function shuffleArray(arr) {
    PaperGames.shuffleArray(arr);
}
function randInt(min, max) { return PaperGames.randInt(min, max); }
function isInside(pos) { return PaperGames.isInside(pos, ROWS, COLS); }
function samePosition(a, b) { return PaperGames.samePosition(a, b); }

// DRAW
function draw() {
    PaperGames.drawScene({
        ctx,
        canvas,
        grid: state.grid,
        rows: ROWS,
        cols: COLS,
        cellSize: CELL_SIZE,
        terrain: TERRAIN,
        ballPos: state.ballPos,
        holePos: state.holePos,
        animatingPos: state.animatingPos,
        gameState: state.gameState,
        validTargets: state.validTargets,
        lastPath: state.lastPath,
        shotHistory: state.shotHistory,
        buoyPos: state.buoyPos,
        requireBuoy: state.requireBuoy,
        buoyCollected: state.buoyCollected,
        mode: 'boat'
    });
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
    if (state.gameState === 'INIT') {
        initGame();
    } else {
        startTurn();
    }
}

window.onload = initGame;
