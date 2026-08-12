/**
 * PAPER GOLF - Main Script
 * Implementato utilizzando il motore modulare PaperGames.Engine
 */

(function () {
    'use strict';

    const { Utils } = PaperGames;

    const COLS = 12;
    const ROWS = 18;

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
        ROUGH: { color: '#f8fafc', label: '' },
        FAIRWAY: { color: '#86efac', label: '' },
        SAND: { color: '#fde047', label: '' },
        WATER: { color: '#60a5fa', label: '' },
        TREES: { color: '#15803d', label: '◬', textColor: '#ffffff' },
        SLOPE_DN: { color: '#dcfce7', label: '↓', textColor: '#0f172a' },
        SLOPE_UP: { color: '#dcfce7', label: '↑', textColor: '#0f172a' },
        SLOPE_LF: { color: '#dcfce7', label: '←', textColor: '#0f172a' },
        SLOPE_RT: { color: '#dcfce7', label: '→', textColor: '#0f172a' }
    };

    // Creazione istanza di gioco tramite PaperGames.createGame
    const golfGame = PaperGames.createGame({
        canvasId: 'gameCanvas',
        mode: 'golf',
        cols: COLS,
        rows: ROWS,
        terrains: TERRAIN,

        rules: {
            terrainModifier: (terrain) => {
                if (terrain === 'FAIRWAY') return 1;
                if (terrain === 'SAND') return -1;
                return 0;
            },

            calculateShot: (start, direction, distance, startTerrain, engine) => {
                const path = [];
                const allowTreePass = startTerrain === 'FAIRWAY';

                for (let step = 1; step <= distance; step++) {
                    const next = { r: start.r + direction.dr * step, c: start.c + direction.dc * step };

                    if (!Utils.isInside(next, engine.rows, engine.cols)) return { valid: false, path };

                    const terrain = engine.state.grid[next.r][next.c];
                    path.push(next);

                    if (terrain === 'TREES') {
                        if (step === distance || !allowTreePass) return { valid: false, path };
                    }

                    if (terrain === 'WATER' && step === distance) {
                        return { valid: true, canceled: true, path };
                    }

                    if (Utils.samePosition(next, engine.state.goalPos)) {
                        return { valid: true, winner: true, finalPos: engine.state.goalPos, path };
                    }
                }

                const finalPos = path[path.length - 1];
                const finalTerrain = engine.state.grid[finalPos.r][finalPos.c];

                if (finalTerrain === 'WATER') return { valid: true, canceled: true, path };
                if (finalTerrain === 'TREES') return { valid: false, path };

                // Gestione pendenze / scivolamento
                const slopeResult = resolveSlope(finalPos, engine);
                if (slopeResult.winner) {
                    path.push(slopeResult.finalPos);
                    return { valid: true, winner: true, finalPos: slopeResult.finalPos, path };
                }
                if (slopeResult.rolled) {
                    path.push(slopeResult.finalPos);
                }

                return { valid: true, finalPos: slopeResult.finalPos, path };
            },

            generateMap: (difficulty, engine) => {
                engine.state.grid = Array.from({ length: engine.rows }, () => Array(engine.cols).fill('ROUGH'));

                const easy = difficulty === 'easy';
                const medium = difficulty === 'medium';
                const hard = difficulty === 'hard';

                // Ostacoli (acqua e alberi)
                const level = easy ? 'easy' : medium ? 'medium' : 'hard';
                for (let i = 0; i < CONFIG.hazards.waterBlobs[level]; i++) {
                    const seed = { r: Utils.randInt(Math.floor(engine.rows * 0.15), Math.floor(engine.rows * 0.8)), c: Utils.randInt(1, engine.cols - 2) };
                    Utils.createBlob(engine.state.grid, 'WATER', seed, Utils.randInt(...CONFIG.hazards.waterSizeRange[level]), { avoid: ['FAIRWAY', 'SAND', 'WATER', 'TREES'] }, engine.rows, engine.cols);
                }
                for (let i = 0; i < CONFIG.hazards.treeBlobs[level]; i++) {
                    const seed = { r: Utils.randInt(Math.floor(engine.rows * 0.15), Math.floor(engine.rows * 0.8)), c: Utils.randInt(1, engine.cols - 2) };
                    Utils.createBlob(engine.state.grid, 'TREES', seed, Utils.randInt(...CONFIG.hazards.treeSizeRange[level]), { avoid: ['WATER', 'TREES'] }, engine.rows, engine.cols);
                }

                // Posizione partenza e buca
                engine.state.playerPos = findRandomPositionInRows(engine.state.grid, CONFIG.startRows, ['WATER', 'TREES'], engine.cols);
                engine.state.goalPos = findRandomPositionInRows(engine.state.grid, CONFIG.holeRows, ['WATER', 'TREES'], engine.cols);

                // Fairway
                createFairway(difficulty, engine);

                // Sabbia
                createSandBlobs(easy, medium, hard, engine);

                // Pendii
                createSlopes(difficulty, engine);

                // Partenza e buca su fairway
                engine.state.grid[engine.state.playerPos.r][engine.state.playerPos.c] = 'FAIRWAY';
                engine.state.grid[engine.state.goalPos.r][engine.state.goalPos.c] = 'FAIRWAY';

                engine.state.strokeCount = 0;
                engine.state.lastPath = [];
                engine.state.shotHistory = [];
                engine.state.gameOver = false;
                if (engine.dom.strokeInfo) engine.dom.strokeInfo.innerText = 'Colpi: 0';

                engine.draw();
            },

            winMessage: 'Buca in uno!',

            getTutorialHtml: () => `
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
            `
        }
    });

    // Helper specifici del Golf per la generazione mappa
    function resolveSlope(position, engine) {
        let current = { ...position };
        let rolled = false;

        while (true) {
            const terrain = engine.state.grid[current.r][current.c];
            if (!terrain.startsWith('SLOPE_')) break;

            const slopeDirKey = terrain === 'SLOPE_DN' ? 'S' : terrain === 'SLOPE_UP' ? 'N' : terrain === 'SLOPE_LF' ? 'W' : 'E';
            const slopeDir = engine.directions[slopeDirKey];
            const next = { r: current.r + slopeDir.dr, c: current.c + slopeDir.dc };

            if (!Utils.isInside(next, engine.rows, engine.cols)) break;

            if (Utils.samePosition(next, engine.state.goalPos)) {
                return { winner: true, finalPos: engine.state.goalPos, rolled: true };
            }

            const nextTerrain = engine.state.grid[next.r][next.c];
            if (nextTerrain === 'WATER' || nextTerrain === 'TREES') break;

            current = next;
            rolled = true;
        }
        return { finalPos: current, rolled };
    }

    function findRandomPositionInRows(grid, rows, avoidTerrains, cols) {
        const candidates = [];
        rows.forEach(r => {
            for (let c = 0; c < cols; c++) {
                if (!avoidTerrains.includes(grid[r][c])) candidates.push({ r, c });
            }
        });
        return candidates.length ? candidates[Utils.randInt(0, candidates.length - 1)] : { r: rows[0], c: Math.floor(cols / 2) };
    }

    function createFairway(difficulty, engine) {
        let path = Utils.findPath(engine.state.playerPos, engine.state.goalPos, engine.state.grid, engine.rows, engine.cols, engine.directions, ['WATER', 'TREES']) ||
            Utils.findPath(engine.state.playerPos, engine.state.goalPos, engine.state.grid, engine.rows, engine.cols, engine.directions, ['WATER']) ||
            Utils.findPath(engine.state.playerPos, engine.state.goalPos, engine.state.grid, engine.rows, engine.cols, engine.directions, []);

        if (!path) return;

        path.forEach(cell => {
            if (!['WATER', 'TREES'].includes(engine.state.grid[cell.r][cell.c])) {
                engine.state.grid[cell.r][cell.c] = 'FAIRWAY';
            }
        });

        const radius = CONFIG.fairway.radius[difficulty] ?? 2;
        const baseFill = CONFIG.fairway.baseFill[difficulty] ?? 0.75;

        path.forEach(cell => {
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    const r = cell.r + dr, c = cell.c + dc;
                    if (!Utils.isInside({ r, c }, engine.rows, engine.cols) || Math.abs(dr) + Math.abs(dc) > radius + 1) continue;

                    const chance = Math.max(0.25, baseFill - (Math.abs(dr) + Math.abs(dc)) * 0.2);
                    if (engine.state.grid[r][c] === 'ROUGH' && Math.random() < chance) {
                        engine.state.grid[r][c] = 'FAIRWAY';
                    }
                }
            }
        });
    }

    function createSandBlobs(easy, medium, hard, engine) {
        const seeds = [];
        for (let r = 0; r < engine.rows; r++) {
            for (let c = 0; c < engine.cols; c++) {
                if (engine.state.grid[r][c] === 'ROUGH' && Utils.getNeighbors({ r, c }).some(n => Utils.isInside(n, engine.rows, engine.cols) && engine.state.grid[n.r][n.c] === 'FAIRWAY')) {
                    seeds.push({ r, c });
                }
            }
        }
        Utils.shuffleArray(seeds);
        const level = easy ? 'easy' : medium ? 'medium' : 'hard';

        for (let i = 0; i < CONFIG.sand.blobCount[level] && seeds.length > 0; i++) {
            const seed = seeds.pop();
            if (engine.state.grid[seed.r][seed.c] === 'ROUGH') {
                Utils.createBlob(engine.state.grid, 'SAND', seed, Utils.randInt(...CONFIG.sand.blobSizeRange[level]), { avoid: ['WATER', 'TREES', 'SAND', 'FAIRWAY'] }, engine.rows, engine.cols);
            }
        }
    }

    function createSlopes(difficulty, engine) {
        const slopeChance = CONFIG.slopes.chance[difficulty] ?? 0;
        if (slopeChance <= 0) return;

        const slopeTypes = ['SLOPE_DN', 'SLOPE_UP', 'SLOPE_LF', 'SLOPE_RT'];

        for (let r = 0; r < engine.rows; r++) {
            for (let c = 0; c < engine.cols; c++) {
                const isTee = Utils.samePosition({ r, c }, engine.state.playerPos);
                const isHole = Utils.samePosition({ r, c }, engine.state.goalPos);

                if (engine.state.grid[r][c] === 'FAIRWAY' && !isTee && !isHole && Math.random() < slopeChance) {
                    engine.state.grid[r][c] = slopeTypes[Utils.randInt(0, slopeTypes.length - 1)];
                }
            }
        }
    }

    // Event listener per il pulsante d'aiuto fluttuante
    const helpBtn = document.getElementById('btnHelpFloating');
    if (helpBtn) {
        helpBtn.addEventListener('click', () => golfGame.openTutorial());
    }

    // Avvio gioco
    window.onload = () => golfGame.initGame();
})();