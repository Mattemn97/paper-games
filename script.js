const canvas = document.getElementById('golfCanvas');
const ctx = canvas.getContext('2d');

const COLS = 12;
const ROWS = 18;
const CELL_SIZE = 20;
canvas.width = COLS * CELL_SIZE;
canvas.height = ROWS * CELL_SIZE;

// --- Configuration: easy customization ---
// Change these values to control map sizing and spawn behavior.
const CONFIG = {
    startRows: [ROWS - 1, ROWS - 2, ROWS - 3],
    holeRows: [0, 1, 2],
    hazards: {
        waterBlobs: { easy: 0, medium: 3, hard: 3 },
        treeBlobs: { easy: 0, medium: 3, hard: 5 },
        waterSizeRange: { easy: [9, 25], medium: [9, 25], hard: [9, 25] },
        treeSizeRange: { easy: [4, 16], medium: [4, 16], hard: [4, 16] }
    },
    sand: {
        blobCount: { easy: 4, medium: 5, hard: 6 },
        blobSizeRange: { easy: [4, 6], medium: [5, 7], hard: [6, 9] }
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
    ROUGH:    { color: 'rgb(250, 250, 250)', label: '' },
    FAIRWAY:  { color: 'rgb(200, 255, 200)', label: '' },
    SAND:     { color: 'rgb(255, 255, 200)', label: '' },
    WATER:    { color: 'rgb(200, 200, 255)', label: '' },
    TREES:    { color: 'rgb(150, 205, 150)', label: '◬', textColor: 'rgb(27, 94, 32)' },
    SLOPE_DN: { color: 'rgb(220, 255, 220)', label: '↓', textColor: 'rgb(97, 97, 97)' },
    SLOPE_UP: { color: 'rgb(220, 255, 220)', label: '↑', textColor: 'rgb(97, 97, 97)' },
    SLOPE_LF: { color: 'rgb(220, 255, 220)', label: '←', textColor: 'rgb(97, 97, 97)' },
    SLOPE_RT: { color: 'rgb(220, 255, 220)', label: '→', textColor: 'rgb(97, 97, 97)' }
};

const DIRECTIONS = {
    N:  { dr: -1, dc:  0, label: 'Su' },
    NE: { dr: -1, dc:  1, label: 'Su-Destra' },
    E:  { dr:  0, dc:  1, label: 'Destra' },
    SE: { dr:  1, dc:  1, label: 'Giu-Destra' },
    S:  { dr:  1, dc:  0, label: 'Giu' },
    SW: { dr:  1, dc: -1, label: 'Giu-Sinistra' },
    W:  { dr:  0, dc: -1, label: 'Sinistra' },
    NW: { dr: -1, dc: -1, label: 'Su-Sinistra' }
};

let grid = [];
let ballPos = { r: ROWS - 3, c: Math.floor(COLS / 2) };
let holePos = { r: 3, c: Math.floor(COLS / 2) };
let currentRoll = null;
let selectedDirection = null;
let strokeCount = 0;
let lastPath = [];
let shotHistory = [];
let gameOver = false;

const rollInfo = document.getElementById('rollInfo');
const strokeInfo = document.getElementById('strokeInfo');

function generateMap() {
    const difficulty = document.getElementById('difficulty').value;
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

    currentRoll = null;
    selectedDirection = null;
    strokeCount = 0;
    lastPath = [];
    shotHistory = [];
    gameOver = false;

    updateStatus();
    updateDirectionButtons();
    draw();
}

function addHazards(easy, medium, hard) {
    const level = easy ? 'easy' : medium ? 'medium' : 'hard';
    const waterBlobs = CONFIG.hazards.waterBlobs[level];
    const treeBlobs = CONFIG.hazards.treeBlobs[level];
    const waterRange = CONFIG.hazards.waterSizeRange[level];
    const treeRange = CONFIG.hazards.treeSizeRange[level];

    for (let i = 0; i < waterBlobs; i++) {
        const seed = {
            r: randInt(Math.floor(ROWS * 0.15), Math.floor(ROWS * 0.8)),
            c: randInt(1, COLS - 2)
        };
        const waterSize = randInt(waterRange[0], waterRange[1]);
        createBlob('WATER', seed, waterSize, { avoid: ['FAIRWAY', 'SAND', 'WATER', 'TREES'] });
    }

    for (let i = 0; i < treeBlobs; i++) {
        const seed = {
            r: randInt(Math.floor(ROWS * 0.15), Math.floor(ROWS * 0.8)),
            c: randInt(1, COLS - 2)
        };
        const treeSize = randInt(treeRange[0], treeRange[1]);
        createBlob('TREES', seed, treeSize, { avoid: ['WATER', 'TREES'] });
    }
}

function placeStartAndHole() {
    ballPos = findRandomPositionInRows(CONFIG.startRows, ['WATER', 'TREES']);
    holePos = findRandomPositionInRows(CONFIG.holeRows, ['WATER', 'TREES']);
}

function createFairway(difficulty) {
    let path = findPath(ballPos, holePos, ['WATER', 'TREES']);
    if (!path) {
        path = findPath(ballPos, holePos, ['WATER']);
    }
    if (!path) {
        path = findPath(ballPos, holePos, []);
    }
    if (!path) {
        return;
    }

    path.forEach(cell => {
        if (grid[cell.r][cell.c] !== 'WATER' && grid[cell.r][cell.c] !== 'TREES') {
            grid[cell.r][cell.c] = 'FAIRWAY';
        }
    });
    const radius = CONFIG.fairway.radius[difficulty] ?? 2;
    const baseFill = CONFIG.fairway.baseFill[difficulty] ?? 0.75;
    path.forEach(cell => {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const r = cell.r + dr;
                const c = cell.c + dc;
                if (!isInside({ r, c })) continue;
                if (Math.abs(dr) + Math.abs(dc) > radius + 1) continue;
                const terrain = grid[r][c];
                if (terrain === 'ROUGH') {
                    const distance = Math.abs(dr) + Math.abs(dc);
                    const fillChance = Math.max(0.25, baseFill - distance * 0.2);
                    if (Math.random() < fillChance) {
                        grid[r][c] = 'FAIRWAY';
                    }
                }
            }
        }
    });

    grid[ballPos.r][ballPos.c] = 'FAIRWAY';
    grid[holePos.r][holePos.c] = 'FAIRWAY';
}

function createSandBlobs(easy, medium, hard) {
    const seeds = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 'ROUGH' && hasAdjacentTerrain({ r, c }, 'FAIRWAY')) {
                seeds.push({ r, c });
            }
        }
    }
    shuffleArray(seeds);

    const level = easy ? 'easy' : medium ? 'medium' : 'hard';
    const blobCount = CONFIG.sand.blobCount[level];
    const sizeRange = CONFIG.sand.blobSizeRange[level];

    for (let i = 0; i < blobCount && seeds.length > 0; i++) {
        const seed = seeds.pop();
        if (grid[seed.r][seed.c] !== 'ROUGH') continue;
        const blobSize = randInt(sizeRange[0], sizeRange[1]);
        createBlob('SAND', seed, blobSize, { avoid: ['WATER', 'TREES', 'SAND', 'FAIRWAY'] });
    }
}

function createSlopes(difficulty) {
    const slopeChance = CONFIG.slopes.chance[difficulty] ?? 0;
    if (slopeChance <= 0) return;
    const slopeTypes = ['SLOPE_DN', 'SLOPE_UP', 'SLOPE_LF', 'SLOPE_RT'];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 'FAIRWAY' && !samePosition({ r, c }, ballPos) && !samePosition({ r, c }, holePos)) {
                if (Math.random() < slopeChance) {
                    grid[r][c] = slopeTypes[randInt(0, slopeTypes.length - 1)];
                }
            }
        }
    }
}

function findRandomPositionInRows(rows, avoidTerrains) {
    const candidates = [];
    rows.forEach(r => {
        for (let c = 0; c < COLS; c++) {
            if (!avoidTerrains.includes(grid[r][c])) {
                candidates.push({ r, c });
            }
        }
    });
    if (candidates.length) {
        return candidates[randInt(0, candidates.length - 1)];
    }
    for (let r of rows) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c] === 'ROUGH') {
                return { r, c };
            }
        }
    }
    return { r: rows[0], c: Math.floor(COLS / 2) };
}

function findPath(start, goal, avoidTerrains) {
    const queue = [start];
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const parent = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    visited[start.r][start.c] = true;

    while (queue.length) {
        const current = queue.shift();
        if (samePosition(current, goal)) {
            const path = [];
            let node = current;
            while (node) {
                path.unshift(node);
                node = parent[node.r][node.c];
            }
            return path;
        }

        for (const dir of Object.values(DIRECTIONS)) {
            const next = { r: current.r + dir.dr, c: current.c + dir.dc };
            if (!isInside(next) || visited[next.r][next.c]) continue;
            const terrain = grid[next.r][next.c];
            if (avoidTerrains.includes(terrain)) continue;
            visited[next.r][next.c] = true;
            parent[next.r][next.c] = current;
            queue.push(next);
        }
    }
    return null;
}

function createBlob(type, seed, size, options) {
    const { avoid } = options;
    const cells = [{ ...seed }];
    let index = 0;

    if (!isInside(seed) || avoid.includes(grid[seed.r][seed.c]) || grid[seed.r][seed.c] !== 'ROUGH') {
        return;
    }
    grid[seed.r][seed.c] = type;

    while (cells.length < size && index < cells.length) {
        const cell = cells[index++];
        const neighbors = getNeighbors(cell).filter(n => {
            if (!isInside(n)) return false;
            if (avoid.includes(grid[n.r][n.c])) return false;
            return grid[n.r][n.c] === 'ROUGH';
        });
        shuffleArray(neighbors);
        for (const n of neighbors) {
            if (cells.length >= size) break;
            if (grid[n.r][n.c] !== 'ROUGH') continue;
            grid[n.r][n.c] = type;
            cells.push(n);
        }
    }
}

function getNeighbors(cell) {
    const dirs = [
        { dr: -1, dc: 0 },
        { dr: 1, dc: 0 },
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
        { dr: -1, dc: -1 },
        { dr: -1, dc: 1 },
        { dr: 1, dc: -1 },
        { dr: 1, dc: 1 }
    ];
    return dirs.map(d => ({ r: cell.r + d.dr, c: cell.c + d.dc }));
}

function hasAdjacentTerrain(cell, terrainType) {
    return getNeighbors(cell).some(n => isInside(n) && grid[n.r][n.c] === terrainType);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function updateStatus() {
    rollInfo.innerHTML = `<strong>Dado:</strong> ${currentRoll === null ? '-' : currentRoll}`;
    strokeInfo.innerHTML = `<strong>Colpi:</strong> ${strokeCount}`;
    draw();
}

function handleDirection(dirKey) {
    if (gameOver) {
        updateStatus();
        return;
    }
    selectedDirection = dirKey;
    updateDirectionButtons();

    if (currentRoll === null) {
        updateStatus();
    } else {
        updateStatus();
    }
}

function prepMoveOne() {
    if (gameOver) {
        updateStatus();
        return;
    }
    if (!selectedDirection) {
        updateStatus();
        return;
    }
    if (currentRoll !== null) {
        updateStatus();
        return;
    }

    const result = moveBallOne(selectedDirection);
    if (result.success) {
        updateStatus();
    } else {
        updateStatus();
    }
}

function rollDice() {
    if (gameOver) {
        updateStatus();
        return;
    }
    if (currentRoll !== null) {
        updateStatus();
        return;
    }

    const die = randInt(1, 6);
    const terrain = grid[ballPos.r][ballPos.c];
    let modifier = 0;
    if (terrain === 'FAIRWAY') modifier = 1;
    if (terrain === 'SAND') modifier = -1;
    currentRoll = Math.max(0, die + modifier);
    updateStatus();
}

function takeShot() {
    if (gameOver) {
        updateStatus();
        return;
    }
    if (currentRoll === null) {
        updateStatus();
        return;
    }
    if (!selectedDirection) {
        updateStatus();
        return;
    }

    const direction = DIRECTIONS[selectedDirection];
    const startTerrain = grid[ballPos.r][ballPos.c];
    const result = calculateShot(ballPos, direction, currentRoll, startTerrain);
    strokeCount += 1;
    currentRoll = null;
    lastPath = [{ ...ballPos }, ...result.path];

    if (result.valid && !result.canceled) {
        shotHistory.push({
            path: lastPath,
            landed: lastPath[lastPath.length - 1]
        });
    }

    if (!result.valid) {
        updateStatus();
        return;
    }

    if (result.canceled) {
        updateStatus();
    } else if (result.winner) {
        ballPos = { ...holePos };
        gameOver = true;
        updateStatus();
    } else {
        ballPos = { ...result.finalPos };
        if (result.rolled) {
            updateStatus();
        } else {
            updateStatus();
        }
    }

    selectedDirection = null;
    updateDirectionButtons();
}

function calculateShot(start, direction, distance, startTerrain) {
    const path = [];
    const allowTreePass = startTerrain === 'FAIRWAY';

    for (let step = 1; step <= distance; step++) {
        const next = { r: start.r + direction.dr * step, c: start.c + direction.dc * step };
        if (!isInside(next)) {
            return { valid: false, message: 'Tiro fuori dal campo.', path };
        }

        const terrain = grid[next.r][next.c];
        path.push(next);

        if (terrain === 'TREES') {
            if (step === distance) {
                return { valid: false, message: 'Non puoi atterrare sugli alberi.', path };
            }
            if (!allowTreePass) {
                return { valid: false, message: 'Non puoi attraversare gli alberi da qui.', path };
            }
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

    if (finalTerrain === 'WATER') {
        return { valid: true, canceled: true, path };
    }
    if (finalTerrain === 'TREES') {
        return { valid: false, message: 'Non puoi atterrare sugli alberi.', path };
    }

    const slopeResult = resolveSlope(finalPos);
    if (slopeResult.winner) {
        path.push(slopeResult.finalPos);
        return { valid: true, winner: true, finalPos: slopeResult.finalPos, path, rolled: true, rollDirection: slopeResult.rollDirection };
    }

    if (slopeResult.rolled) {
        path.push(slopeResult.finalPos);
    }

    return { valid: true, finalPos: slopeResult.finalPos, path, rolled: slopeResult.rolled, rollDirection: slopeResult.rollDirection };
}

function resolveSlope(position) {
    let current = { ...position };
    let rolled = false;
    let rollDirection = null;

    while (true) {
        const terrain = grid[current.r][current.c];
        if (!terrain.startsWith('SLOPE_')) break;

        const slopeDirection = terrain === 'SLOPE_DN' ? 'S' : terrain === 'SLOPE_UP' ? 'N' : terrain === 'SLOPE_LF' ? 'W' : 'E';
        const next = { r: current.r + DIRECTIONS[slopeDirection].dr, c: current.c + DIRECTIONS[slopeDirection].dc };
        if (!isInside(next)) break;
        if (samePosition(next, holePos)) {
            return { winner: true, finalPos: holePos, rolled: true, rollDirection: slopeDirection };
        }

        const nextTerrain = grid[next.r][next.c];
        if (nextTerrain === 'WATER' || nextTerrain === 'TREES') break;

        current = next;
        rolled = true;
        rollDirection = slopeDirection;
    }

    return { finalPos: current, rolled, rollDirection };
}

function moveBallOne(dirKey) {
    const direction = DIRECTIONS[dirKey];
    const target = { r: ballPos.r + direction.dr, c: ballPos.c + direction.dc };
    if (!isInside(target)) {
        return { success: false, message: 'Non puoi muovere fuori dal campo.' };
    }

    const terrain = grid[target.r][target.c];
    if (terrain === 'TREES' || terrain === 'WATER') {
        return { success: false, message: `Non puoi muovere la pallina su ${terrain.toLowerCase()}.` };
    }

    ballPos = { ...target };
    updateStatus();
    return { success: true };
}

function resetGame() {
    generateMap();
}

function updateDirectionButtons() {
    document.querySelectorAll('.dir-button').forEach(button => {
        const dir = button.dataset.dir;
        if (!dir) return;
        button.classList.toggle('selected', selectedDirection === dir);
    });
}

function isInside(pos) {
    return pos.r >= 0 && pos.r < ROWS && pos.c >= 0 && pos.c < COLS;
}

function samePosition(a, b) {
    return a.r === b.r && a.c === b.c;
}

function handleCanvasClick(event) {
    if (gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const clicked = {
        r: Math.floor((y / rect.height) * ROWS),
        c: Math.floor((x / rect.width) * COLS)
    };

    if (!isInside(clicked) || samePosition(clicked, ballPos)) return;
    const deltaR = clicked.r - ballPos.r;
    const deltaC = clicked.c - ballPos.c;
    const directionKey = getDirectionFromDelta(deltaR, deltaC);
    if (!directionKey) {
        updateStatus();
        return;
    }

    selectedDirection = directionKey;
    updateDirectionButtons();
    updateStatus();
}

function getDirectionFromDelta(dr, dc) {
    const stepR = Math.sign(dr);
    const stepC = Math.sign(dc);
    if (stepR === 0 && stepC === 0) return null;
    if (stepR !== 0 && stepC !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;

    return Object.keys(DIRECTIONS).find(key => DIRECTIONS[key].dr === stepR && DIRECTIONS[key].dc === stepC) || null;
}

function draw() {
    ctx.fillStyle = '#fcfaf2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const type = grid[r][c];
            const x = c * CELL_SIZE;
            const y = r * CELL_SIZE;
            ctx.fillStyle = TERRAIN[type].color;
            ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        }
    }

    ctx.strokeStyle = '#d3cbbd';
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL_SIZE);
        ctx.lineTo(canvas.width, r * CELL_SIZE);
        ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL_SIZE, 0);
        ctx.lineTo(c * CELL_SIZE, canvas.height);
        ctx.stroke();
    }

    ctx.font = `bold ${CELL_SIZE * 0.6}px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const type = grid[r][c];
            if (TERRAIN[type].label) {
                const centerX = c * CELL_SIZE + CELL_SIZE / 2;
                const centerY = r * CELL_SIZE + CELL_SIZE / 2;
                ctx.fillStyle = TERRAIN[type].textColor || '#000';
                ctx.fillText(TERRAIN[type].label, centerX, centerY);
            }
        }
    }

    if (shotHistory.length) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 2;
        shotHistory.forEach(entry => {
            ctx.beginPath();
            entry.path.forEach((cell, index) => {
                const x = cell.c * CELL_SIZE + CELL_SIZE / 2;
                const y = cell.r * CELL_SIZE + CELL_SIZE / 2;
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });

        ctx.fillStyle = 'rgba(255, 235, 59, 0.18)';
        shotHistory.forEach(entry => {
            const cell = entry.landed;
            if (!cell) return;
            ctx.fillRect(cell.c * CELL_SIZE, cell.r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        });
    }

    if (lastPath.length) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        lastPath.forEach((cell, index) => {
            const x = cell.c * CELL_SIZE + CELL_SIZE / 2;
            const y = cell.r * CELL_SIZE + CELL_SIZE / 2;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    const holeX = holePos.c * CELL_SIZE + CELL_SIZE / 2;
    const holeY = holePos.r * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(holeX, holeY, CELL_SIZE * 0.35, 0, Math.PI * 2);
    ctx.fill();

    const ballX = ballPos.c * CELL_SIZE + CELL_SIZE / 2;
    const ballY = ballPos.r * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ballX, ballY, CELL_SIZE * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

generateMap();
