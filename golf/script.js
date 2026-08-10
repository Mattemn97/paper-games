/**
 * PAPER GOLF - Main Script
 * Un gioco di golf su griglia 2D sviluppato in HTML5 Canvas.
 */

// ==========================================
// 1. CONFIGURAZIONE E COSTANTI
// ==========================================

const canvas = document.getElementById('golfCanvas');
const ctx = canvas.getContext('2d');

const COLS = 12;
const ROWS = 18;

// Gestione HiDPI / Retina Display per garantire una grafica nitida
const BASE_CELL_SIZE = 40; 
const dpr = window.devicePixelRatio || 1;

canvas.width = COLS * BASE_CELL_SIZE * dpr;
canvas.height = ROWS * BASE_CELL_SIZE * dpr;
ctx.scale(dpr, dpr);

const CELL_SIZE = BASE_CELL_SIZE;

/** 
 * Configurazione della generazione procedurale della mappa in base alla difficoltà.
 */
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

/**
 * Mappatura dei tipi di terreno e delle relative proprietà visive.
 */
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

/**
 * Mappatura dei vettori di direzione (Delta Row, Delta Column).
 */
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

// ==========================================
// 2. STATO GLOBALE DELL'APPLICAZIONE
// ==========================================

let state = {
    grid: [],
    ballPos: { r: ROWS - 3, c: Math.floor(COLS / 2) },
    holePos: { r: 3, c: Math.floor(COLS / 2) },
    animatingPos: null, // Memorizza la posizione della pallina durante l'animazione
    currentRoll: null,
    strokeCount: 0,
    lastPath: [],
    shotHistory: [],
    gameOver: false,
    gameState: 'INIT', // Stati: INIT, TURN_START, ROLLING, TARGET_SELECT, ANIMATING
    validTargets: []
};

// ==========================================
// 3. CACHE DEGLI ELEMENTI DOM
// ==========================================

const DOM = {
    modal: document.getElementById('gameModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalBody: document.getElementById('modalBody'),
    strokeInfo: document.getElementById('strokeInfo'),
    rollInfo: document.getElementById('rollInfo')
};

// ==========================================
// 4. GESTIONE MODALI E UI
// ==========================================

/**
 * Mostra la finestra modale sovrapposta.
 * @param {string} title - Titolo della modale.
 * @param {string} htmlContent - Contenuto HTML da iniettare.
 */
function showModal(title, htmlContent) {
    DOM.modalTitle.innerText = title;
    DOM.modalBody.innerHTML = htmlContent;
    DOM.modal.classList.add('active');
}

/**
 * Nasconde la finestra modale attiva.
 */
function hideModal() {
    DOM.modal.classList.remove('active');
}

/**
 * Inizializza l'applicazione e mostra il menu principale.
 */
function initGame() {
    state.gameState = 'INIT';
    showModal("Paper Golf", `
        <p>Seleziona la difficoltà per iniziare:</p>
        <select id="popupDifficulty" class="input-select">
            <option value="easy">Facile</option>
            <option value="medium" selected>Medio</option>
            <option value="hard">Difficile</option>
        </select>
        <button class="btn btn-primary" id="btnStartGame">Genera Campo & Gioca</button>
        <button class="btn btn-grey" id="btnTutorial">Regole del gioco</button>
    `);

    // Assegnazione degli eventi dinamicamente invece di usare attributi onclick inline
    document.getElementById('btnStartGame').addEventListener('click', startGame);
    document.getElementById('btnTutorial').addEventListener('click', openTutorial);
}

/**
 * Avvia una nuova partita con la difficoltà selezionata.
 */
function startGame() {
    const diff = document.getElementById('popupDifficulty').value;
    hideModal();
    generateMap(diff);
    startTurn();
}

/**
 * Prepara il turno del giocatore, chiedendo che azione eseguire.
 */
function startTurn() {
    if (state.gameOver) return;
    
    state.gameState = 'TURN_START';
    state.validTargets = [];
    state.currentRoll = null;
    DOM.rollInfo.innerText = '';
    
    showModal("Il tuo turno", `
        <p>Scegli l'azione da eseguire:</p>
        <button class="btn btn-orange" id="btnRoll">Lancia il Dado</button>
        <button class="btn btn-blue" id="btnMoveOne">Muovi di 1 (Sicuro)</button>
    `);

    document.getElementById('btnRoll').addEventListener('click', handleRollAction);
    document.getElementById('btnMoveOne').addEventListener('click', handleMoveOneAction);
}

/**
 * Gestisce l'animazione fittizia del lancio del dado.
 */
function handleRollAction() {
    hideModal();
    state.gameState = 'ROLLING';
    state.validTargets = [];
    
    let rollCount = 0;
    // Effetto "roulette" per dare feedback visivo del lancio
    const rollInterval = setInterval(() => {
        DOM.rollInfo.innerText = `Lancio... 🎲 ${randInt(1, 6)}`;
        rollCount++;
        
        if (rollCount > 10) {
            clearInterval(rollInterval);
            finalizeRoll();
        }
    }, 50);
}

/**
 * Calcola il risultato reale del lancio applicando i modificatori del terreno.
 */
function finalizeRoll() {
    PaperGames.finalizeRoll({
        state,
        grid: state.grid,
        ballPos: state.ballPos,
        draw,
        calculateValidTargets,
        rollInfo: DOM.rollInfo,
        terrainModifier: terrain => {
            if (terrain === 'FAIRWAY') return 1;
            if (terrain === 'SAND') return -1;
            return 0;
        }
    });
}

/**
 * Forza una mossa di lunghezza 1.
 */
function handleMoveOneAction() {
    hideModal();
    state.currentRoll = 1;
    DOM.rollInfo.innerText = `Mosse: 1`;
    calculateValidTargets(1);
    state.gameState = 'TARGET_SELECT';
    draw();
}

// ==========================================
// 5. LOGICA DI GIOCO (PATHFINDING E TIRO)
// ==========================================

/**
 * Calcola e salva tutti i bersagli validi in base alla distanza ottenuta.
 * @param {number} distance - Distanza del tiro in celle.
 */
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
                winner: result.winner || false
            });
        }
    });
    
    // Se il tiro genera bersagli non validi (es. sei incastrato) ma non era di 1 cella, forza a 1
    if (state.validTargets.length === 0 && distance !== 1) {
        state.currentRoll = 1;
        DOM.rollInfo.innerText = `Forzato: 1 cella (Ostacoli)`;
        calculateValidTargets(1);
        return;
    }

    if (state.validTargets.length === 0) {
        showModal("Attenzione", `
            <p>Nessuna mossa disponibile neanche a 1 cella! (Pallina incastrata)</p>
            <button class='btn btn-grey' id="btnSkip">Salta Turno</button>
        `);
        document.getElementById('btnSkip').addEventListener('click', startTurn);
    }
}

/**
 * Simula il percorso della pallina lungo una direzione per valutarne la validità.
 * @param {Object} start - Coordinate {r, c} di partenza.
 * @param {Object} direction - Vettore direzione {dr, dc}.
 * @param {number} distance - Numero di step.
 * @param {string} startTerrain - Tipo di terreno alla partenza.
 * @returns {Object} Risultato del pathfinding.
 */
function calculateShot(start, direction, distance, startTerrain) {
    const path = [];
    // Gli alberi possono essere scavalcati solo dal Fairway
    const allowTreePass = startTerrain === 'FAIRWAY';

    for (let step = 1; step <= distance; step++) {
        const next = { r: start.r + direction.dr * step, c: start.c + direction.dc * step };
        
        if (!isInside(next)) return { valid: false, path };

        const terrain = state.grid[next.r][next.c];
        path.push(next);

        if (terrain === 'TREES') {
            // Non puoi fermarti sugli alberi
            if (step === distance) return { valid: false, path }; 
            // Se non sei sul fairway non puoi scavalcarli
            if (!allowTreePass) return { valid: false, path };      
        }
        
        // Se atterri o passi in acqua all'ultimo step, il colpo è perso
        if (terrain === 'WATER' && step === distance) {
            return { valid: true, canceled: true, path };
        }
        
        // Buca trovata durante il tragitto
        if (samePosition(next, state.holePos)) {
            return { valid: true, winner: true, finalPos: state.holePos, path };
        }
    }

    const finalPos = path[path.length - 1];
    const finalTerrain = state.grid[finalPos.r][finalPos.c];

    // Controlli finali di atterraggio
    if (finalTerrain === 'WATER') return { valid: true, canceled: true, path };
    if (finalTerrain === 'TREES') return { valid: false, path };

    // Risoluzione delle pendenze (scivolamento)
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

/**
 * Gestisce l'effetto scivolamento quando si atterra su un terreno pendente (SLOPE).
 * @param {Object} position - Posizione di atterraggio.
 * @returns {Object} Posizione finale aggiornata.
 */
function resolveSlope(position) {
    let current = { ...position };
    let rolled = false;

    while (true) {
        const terrain = state.grid[current.r][current.c];
        if (!terrain.startsWith('SLOPE_')) break;

        const slopeDirection = terrain === 'SLOPE_DN' ? 'S' : 
                               terrain === 'SLOPE_UP' ? 'N' : 
                               terrain === 'SLOPE_LF' ? 'W' : 'E';
                               
        const next = { r: current.r + DIRECTIONS[slopeDirection].dr, c: current.c + DIRECTIONS[slopeDirection].dc };
        
        if (!isInside(next)) break;
        
        if (samePosition(next, state.holePos)) {
            return { winner: true, finalPos: state.holePos, rolled: true };
        }

        const nextTerrain = state.grid[next.r][next.c];
        // Non scivola in acqua o sugli alberi (si ferma al limite)
        if (nextTerrain === 'WATER' || nextTerrain === 'TREES') break;

        current = next;
        rolled = true;
    }
    return { finalPos: current, rolled };
}

/**
 * Gestore dell'evento click sul Canvas.
 * Identifica la cella cliccata e avvia il tiro se è un bersaglio valido.
 */
function handleCanvasClick(event) {
    if (state.gameState !== 'TARGET_SELECT') return;

    const clicked = PaperGames.getCellFromCanvasEvent(event, canvas, CELL_SIZE, ROWS, COLS, dpr);
    const target = state.validTargets.find(t => samePosition(t.targetPos, clicked));

    if (target) {
        executeShot(target);
    }
}

/**
 * Esegue fisicamente (con animazione) il tiro selezionato verso la destinazione.
 * @param {Object} targetData - Dati del bersaglio calcolati.
 */
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

            DOM.strokeInfo.innerText = `Colpi: ${state.strokeCount}`;

            if (targetData.winner) {
                state.gameOver = true;
                draw();
                setTimeout(() => {
                    showModal('Buca in uno!', `
                        <p>Hai completato in ${state.strokeCount} colpi.</p>
                        <button class="btn btn-green" id="btnReplay">Gioca Ancora</button>
                    `);
                    document.getElementById('btnReplay').addEventListener('click', initGame);
                }, 500);
            } else {
                draw();
                setTimeout(startTurn, 600);
            }
        }
    });
}

// ==========================================
// 6. GENERAZIONE PROCEDURALE MAPPA
// ==========================================

/**
 * Genera la griglia di gioco e resetta lo stato della partita.
 * @param {string} difficulty - Livello ("easy", "medium", "hard")
 */
function generateMap(difficulty = 'medium') {
    state.grid = Array.from({ length: ROWS }, () => Array(COLS).fill('ROUGH'));
    
    const easy = difficulty === 'easy';
    const medium = difficulty === 'medium';
    const hard = difficulty === 'hard';

    addHazards(easy, medium, hard);
    placeStartAndHole();
    createFairway(difficulty);
    createSandBlobs(easy, medium, hard);
    createSlopes(difficulty);

    // Buca e Partenza sono sempre su terreno sicuro
    state.grid[state.ballPos.r][state.ballPos.c] = 'FAIRWAY';
    state.grid[state.holePos.r][state.holePos.c] = 'FAIRWAY';

    state.strokeCount = 0;
    state.lastPath = [];
    state.shotHistory = [];
    state.gameOver = false;
    DOM.strokeInfo.innerText = 'Colpi: 0';
    
    draw();
}

/**
 * Aggiunge ostacoli idrici e arborei alla mappa.
 */
function addHazards(easy, medium, hard) {
    const level = easy ? 'easy' : medium ? 'medium' : 'hard';
    const waterBlobs = CONFIG.hazards.waterBlobs[level];
    const treeBlobs = CONFIG.hazards.treeBlobs[level];
    const waterRange = CONFIG.hazards.waterSizeRange[level];
    const treeRange = CONFIG.hazards.treeSizeRange[level];

    for (let i = 0; i < waterBlobs; i++) {
        const seed = { r: randInt(Math.floor(ROWS * 0.15), Math.floor(ROWS * 0.8)), c: randInt(1, COLS - 2) };
        createBlob('WATER', seed, randInt(...waterRange), { avoid: ['FAIRWAY', 'SAND', 'WATER', 'TREES'] });
    }
    for (let i = 0; i < treeBlobs; i++) {
        const seed = { r: randInt(Math.floor(ROWS * 0.15), Math.floor(ROWS * 0.8)), c: randInt(1, COLS - 2) };
        createBlob('TREES', seed, randInt(...treeRange), { avoid: ['WATER', 'TREES'] });
    }
}

/**
 * Posiziona randomicamente il punto di partenza (tee) e la buca.
 */
function placeStartAndHole() {
    state.ballPos = findRandomPositionInRows(CONFIG.startRows, ['WATER', 'TREES']);
    state.holePos = findRandomPositionInRows(CONFIG.holeRows, ['WATER', 'TREES']);
}

/**
 * Crea il Fairway calcolando un percorso (pathfinding) tra la pallina e la buca e allargandolo.
 */
function createFairway(difficulty) {
    // Tenta di tracciare un percorso evitando tutto, o abbassa i criteri se bloccato
    let path = findPath(state.ballPos, state.holePos, ['WATER', 'TREES']) || 
               findPath(state.ballPos, state.holePos, ['WATER']) || 
               findPath(state.ballPos, state.holePos, []);
               
    if (!path) return;

    // Traccia la linea guida
    path.forEach(cell => {
        if (!['WATER', 'TREES'].includes(state.grid[cell.r][cell.c])) {
            state.grid[cell.r][cell.c] = 'FAIRWAY';
        }
    });
    
    const radius = CONFIG.fairway.radius[difficulty] ?? 2;
    const baseFill = CONFIG.fairway.baseFill[difficulty] ?? 0.75;
    
    // Espande organicamente il fairway attorno alla linea centrale
    path.forEach(cell => {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const r = cell.r + dr, c = cell.c + dc;
                if (!isInside({ r, c }) || Math.abs(dr) + Math.abs(dc) > radius + 1) continue;
                
                const chance = Math.max(0.25, baseFill - (Math.abs(dr) + Math.abs(dc)) * 0.2);
                if (state.grid[r][c] === 'ROUGH' && Math.random() < chance) {
                    state.grid[r][c] = 'FAIRWAY';
                }
            }
        }
    });
}

/**
 * Disperde macchie di sabbia per la mappa ai bordi del fairway.
 */
function createSandBlobs(easy, medium, hard) {
    const seeds = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (state.grid[r][c] === 'ROUGH' && hasAdjacentTerrain({ r, c }, 'FAIRWAY')) {
                seeds.push({ r, c });
            }
        }
    }
    shuffleArray(seeds);
    const level = easy ? 'easy' : medium ? 'medium' : 'hard';
    
    for (let i = 0; i < CONFIG.sand.blobCount[level] && seeds.length > 0; i++) {
        const seed = seeds.pop();
        if (state.grid[seed.r][seed.c] === 'ROUGH') {
            createBlob('SAND', seed, randInt(...CONFIG.sand.blobSizeRange[level]), { avoid: ['WATER', 'TREES', 'SAND', 'FAIRWAY'] });
        }
    }
}

/**
 * Aggiunge vettori di pendenza (Slope) all'interno del Fairway.
 */
function createSlopes(difficulty) {
    const slopeChance = CONFIG.slopes.chance[difficulty] ?? 0;
    if (slopeChance <= 0) return;
    
    const slopeTypes = ['SLOPE_DN', 'SLOPE_UP', 'SLOPE_LF', 'SLOPE_RT'];
    
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const isTee = samePosition({ r, c }, state.ballPos);
            const isHole = samePosition({ r, c }, state.holePos);
            
            if (state.grid[r][c] === 'FAIRWAY' && !isTee && !isHole && Math.random() < slopeChance) {
                state.grid[r][c] = slopeTypes[randInt(0, slopeTypes.length - 1)];
            }
        }
    }
}

// --- Funzioni Utility per la Generazione e Navigazione Griglia ---

function findRandomPositionInRows(rows, avoidTerrains) {
    const candidates = [];
    rows.forEach(r => { 
        for (let c = 0; c < COLS; c++) {
            if (!avoidTerrains.includes(state.grid[r][c])) candidates.push({ r, c });
        }
    });
    return candidates.length ? candidates[PaperGames.randInt(0, candidates.length - 1)] : { r: rows[0], c: Math.floor(COLS / 2) };
}

function findPath(start, goal, avoidTerrains) {
    return PaperGames.findPath(start, goal, state.grid, ROWS, COLS, DIRECTIONS, avoidTerrains);
}

function createBlob(type, seed, size, options) {
    return PaperGames.createBlob(state.grid, type, seed, size, { ...options, baseTerrain: options?.baseTerrain || 'ROUGH' }, ROWS, COLS);
}

function getNeighbors(cell) { 
    return PaperGames.getNeighbors(cell);
}

function hasAdjacentTerrain(cell, terrainType) { 
    return getNeighbors(cell).some(n => PaperGames.isInside(n, ROWS, COLS) && state.grid[n.r][n.c] === terrainType); 
}

function shuffleArray(arr) {
    PaperGames.shuffleArray(arr);
}

function randInt(min, max) { return PaperGames.randInt(min, max); }
function isInside(pos) { return PaperGames.isInside(pos, ROWS, COLS); }
function samePosition(a, b) { return PaperGames.samePosition(a, b); }

// ==========================================
// 7. RENDERIZZAZIONE (DRAW LOOP)
// ==========================================

/**
 * Disegna l'intero stato del gioco sul canvas.
 * Viene chiamata ad ogni cambio di stato o frame di animazione.
 */
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
        requireBuoy: false,
        buoyCollected: true,
        buoyPos: null,
        mode: 'golf'
    });
}

// ==========================================
// 8. TUTORIAL E SETUP
// ==========================================

/**
 * Apre il menu informativo con le regole del gioco.
 */
function openTutorial() {
    showModal("Come si gioca", `
        <div class="tutorial-text">
            <p><strong>L'obiettivo:</strong> Porta la pallina (cerchio bianco) fino alla buca (cerchio scuro) con il minor numero di colpi possibile.</p>
            <p><strong>Il Turno:</strong> A ogni turno puoi scegliere se <strong>Lanciare il Dado</strong> o fare un <strong>Movimento Sicuro di 1 cella</strong>.</p>
            <p><strong>I Terreni e Modificatori:</strong></p>
            <ul>
                <li>🌿 <strong>Fairway:</strong> Dà un bonus di +1 cella al dado e ti permette di scavalcare gli alberi.</li>
                <li>🏖️ <strong>Sabbia (Sand):</strong> Toglie 1 cella al tiro (minimo garantito 1).</li>
                <li>🌳 <strong>Alberi / 💧 Acqua:</strong> Ostacoli invalicabili (finire in acqua annulla il colpo).</li>
                <li>📉 <strong>Pendii (Slope):</strong> Ti fanno scivolare automaticamente nella direzione della freccia.</li>
            </ul>
            <p><strong>Come tirare:</strong> Dopo il calcolo del colpo, vedrai delle aree blu evidenziate sulla mappa. Clicca la destinazione desiderata per confermare!</p>
        </div>
        <button class="btn btn-primary" id="btnBack">Ho capito</button>
    `);
    
    document.getElementById('btnBack').addEventListener('click', () => {
        if (state.gameState === 'INIT') {
            initGame();
        } else {
            startTurn();
        }
    });
}

// Associa l'evento click al canvas
canvas.addEventListener('click', handleCanvasClick);

// Avvio applicazione all'avvio della finestra
window.onload = initGame;