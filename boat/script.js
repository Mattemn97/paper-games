/**
 * PAPER BOAT (Rotta Navale) - Main Script
 * Implementato utilizzando il motore modulare PaperGames.Engine
 */

(function () {
    'use strict';

    const { Utils, UI } = PaperGames;

    const COLS = 12;
    const ROWS = 18;

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
        MARE: { color: '#0ea5e9', label: '' },
        VENTO: { color: '#7dd3fc', label: '' },
        ALGHE: { color: '#4ade80', label: '' },
        MULINELLO: { color: '#1e3a8a', label: '🌀', textColor: '#ffffff' },
        SECCA: { color: '#fcd34d', label: '⚓', textColor: '#0f172a' },
        CORRENTE_DN: { color: '#38bdf8', label: '↓', textColor: '#0f172a' },
        CORRENTE_UP: { color: '#38bdf8', label: '↑', textColor: '#0f172a' },
        CORRENTE_LF: { color: '#38bdf8', label: '←', textColor: '#0f172a' },
        CORRENTE_RT: { color: '#38bdf8', label: '→', textColor: '#0f172a' }
    };

    const boatGame = PaperGames.createGame({
        canvasId: 'gameCanvas',
        mode: 'boat',
        cols: COLS,
        rows: ROWS,
        terrains: TERRAIN,

        rules: {
            terrainModifier: (terrain) => {
                if (terrain === 'VENTO') return 1;
                if (terrain === 'ALGHE') return -1;
                return 0;
            },

            onStartTurn: (engine) => {
                if (engine.state.custom.isStuck) {
                    UI.showModal("Nave Incagliata!", "<p>Sei finito in una secca. Devi sprecare un turno per disincagliare la barca.</p>", [
                        {
                            label: 'Disincaglia (-1 Turno)',
                            className: 'btn btn-orange',
                            onClick: () => {
                                engine.state.custom.isStuck = false;
                                engine.state.strokeCount++;
                                UI.hideModal();
                                engine.startTurn();
                            }
                        }
                    ]);
                    return true; // Gestito privatamente
                }
                return false;
            },

            updateHUD: (engine) => {
                if (engine.dom.buoyStatus) {
                    if (engine.state.custom.requireBuoy) {
                        engine.dom.buoyStatus.style.display = 'inline-block';
                        engine.dom.buoyStatus.innerText = engine.state.custom.buoyCollected ? '🚩 Boa: ✅' : '🚩 Boa: ❌';
                    } else {
                        engine.dom.buoyStatus.style.display = 'none';
                    }
                }
            },

            calculateShot: (start, direction, distance, startTerrain, engine) => {
                const path = [];
                let hitB = false;

                for (let step = 1; step <= distance; step++) {
                    const next = { r: start.r + direction.dr * step, c: start.c + direction.dc * step };
                    if (!Utils.isInside(next, engine.rows, engine.cols)) return { valid: false, path };

                    path.push(next);

                    if (engine.state.custom.requireBuoy && !engine.state.custom.buoyCollected && engine.state.custom.buoyPos && Utils.samePosition(next, engine.state.custom.buoyPos)) {
                        hitB = true;
                    }

                    if (engine.state.grid[next.r][next.c] === 'MULINELLO' && step === distance) {
                        return { valid: true, canceled: true, path };
                    }

                    if (Utils.samePosition(next, engine.state.goalPos)) {
                        if (!engine.state.custom.requireBuoy || engine.state.custom.buoyCollected || hitB) {
                            return { valid: true, winner: true, finalPos: engine.state.goalPos, hitBuoy: hitB, path };
                        }
                    }
                }

                const finalPos = path[path.length - 1];
                const finalTerrain = engine.state.grid[finalPos.r][finalPos.c];

                if (finalTerrain === 'MULINELLO') return { valid: true, canceled: true, path };

                const slopeResult = resolveCorrente(finalPos, engine);
                if (slopeResult.hitBuoy) hitB = true;

                if (slopeResult.winner) {
                    if (!engine.state.custom.requireBuoy || engine.state.custom.buoyCollected || hitB) {
                        path.push(slopeResult.finalPos);
                        return { valid: true, winner: true, finalPos: engine.state.goalPos, hitBuoy: hitB, path };
                    }
                }

                if (slopeResult.rolled) {
                    path.push(slopeResult.finalPos);
                }

                return { valid: true, finalPos: slopeResult.finalPos, hitBuoy: hitB, path };
            },

            onShotLanding: (targetData, engine) => {
                if (targetData.hitBuoy) engine.state.custom.buoyCollected = true;
                if (engine.state.grid[engine.state.playerPos.r][engine.state.playerPos.c] === 'SECCA') {
                    engine.state.custom.isStuck = true;
                }
            },

            generateMap: (difficulty, engine) => {
                engine.state.grid = Array.from({ length: engine.rows }, () => Array(engine.cols).fill('MARE'));
                const easy = difficulty === 'easy';
                const medium = difficulty === 'medium';
                const hard = difficulty === 'hard';

                // Hazards (mulinelli)
                const level = easy ? 'easy' : medium ? 'medium' : 'hard';
                for (let i = 0; i < CONFIG.hazards.mulinelli[level]; i++) {
                    const seed = { r: Utils.randInt(Math.floor(engine.rows * 0.15), Math.floor(engine.rows * 0.8)), c: Utils.randInt(1, engine.cols - 2) };
                    Utils.createBlob(engine.state.grid, 'MULINELLO', seed, Utils.randInt(...CONFIG.hazards.mulinelliSize[level]), { avoid: ['VENTO', 'MULINELLO'], baseTerrain: 'MARE' }, engine.rows, engine.cols);
                }

                // Partenza e porto
                engine.state.playerPos = findRandomPositionInRows(engine.state.grid, CONFIG.startRows, ['MULINELLO'], engine.cols);
                engine.state.goalPos = findRandomPositionInRows(engine.state.grid, CONFIG.holeRows, ['MULINELLO'], engine.cols);

                // Vento
                createVento(difficulty, engine);

                // Alghe e Secche
                createAlgheAndSecche(easy, medium, hard, engine);

                // Correnti
                createCorrenti(difficulty, engine);

                // Boa in modalità difficile
                placeBuoy(difficulty, engine);

                engine.state.grid[engine.state.playerPos.r][engine.state.playerPos.c] = 'VENTO';
                engine.state.grid[engine.state.goalPos.r][engine.state.goalPos.c] = 'VENTO';

                engine.state.strokeCount = 0;
                engine.state.lastPath = [];
                engine.state.shotHistory = [];
                engine.state.gameOver = false;
                engine.state.custom.isStuck = false;

                engine.updateHUD();
                engine.draw();
            },

            getInitHtml: (engine) => ({
                title: "Rotta Navale",
                bodyHtml: `
                    <p>Seleziona la difficoltà di navigazione:</p>
                    <select id="popupDifficulty" class="input-select">
                        <option value="easy">Facile</option>
                        <option value="medium" selected>Medio</option>
                        <option value="hard">Difficile (Con Boa)</option>
                    </select>
                `,
                buttons: [
                    {
                        label: 'Salpa!',
                        className: 'btn btn-primary',
                        onClick: () => {
                            const diff = document.getElementById('popupDifficulty').value;
                            engine.startGame(diff);
                        }
                    },
                    {
                        label: 'Manuale di Bordo',
                        className: 'btn btn-grey',
                        onClick: () => engine.openTutorial()
                    }
                ]
            }),

            winMessage: 'Vittoria!',

            getTutorialHtml: () => `
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
            `
        }
    });

    function resolveCorrente(position, engine) {
        let current = { ...position };
        let rolled = false;
        let hitB = false;

        while (true) {
            const terrain = engine.state.grid[current.r][current.c];
            if (!terrain.startsWith('CORRENTE_')) break;

            const dirKey = terrain === 'CORRENTE_DN' ? 'S' : terrain === 'CORRENTE_UP' ? 'N' : terrain === 'CORRENTE_LF' ? 'W' : 'E';
            const dir = engine.directions[dirKey];
            const next = { r: current.r + dir.dr, c: current.c + dir.dc };

            if (!Utils.isInside(next, engine.rows, engine.cols)) break;

            if (engine.state.custom.requireBuoy && !engine.state.custom.buoyCollected && engine.state.custom.buoyPos && Utils.samePosition(next, engine.state.custom.buoyPos)) {
                hitB = true;
            }

            if (Utils.samePosition(next, engine.state.goalPos)) {
                return { winner: true, finalPos: engine.state.goalPos, rolled: true, hitBuoy: hitB };
            }

            const nextTerrain = engine.state.grid[next.r][next.c];
            if (nextTerrain === 'MULINELLO') break;

            current = next;
            rolled = true;
        }
        return { finalPos: current, rolled, hitBuoy: hitB };
    }

    function findRandomPositionInRows(grid, rows, avoidTerrains, cols) {
        const candidates = [];
        rows.forEach(r => { for (let c = 0; c < cols; c++) if (!avoidTerrains.includes(grid[r][c])) candidates.push({ r, c }); });
        return candidates.length ? candidates[Utils.randInt(0, candidates.length - 1)] : { r: rows[0], c: Math.floor(cols / 2) };
    }

    function createVento(difficulty, engine) {
        let path = Utils.findPath(engine.state.playerPos, engine.state.goalPos, engine.state.grid, engine.rows, engine.cols, engine.directions, ['MULINELLO']) ||
            Utils.findPath(engine.state.playerPos, engine.state.goalPos, engine.state.grid, engine.rows, engine.cols, engine.directions, []);
        if (!path) return;

        path.forEach(cell => {
            if (engine.state.grid[cell.r][cell.c] !== 'MULINELLO') engine.state.grid[cell.r][cell.c] = 'VENTO';
        });

        const radius = CONFIG.vento.radius[difficulty] ?? 2;
        const baseFill = CONFIG.vento.baseFill[difficulty] ?? 0.75;

        path.forEach(cell => {
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    const r = cell.r + dr, c = cell.c + dc;
                    if (!Utils.isInside({ r, c }, engine.rows, engine.cols) || Math.abs(dr) + Math.abs(dc) > radius + 1) continue;
                    if (engine.state.grid[r][c] === 'MARE' && Math.random() < Math.max(0.25, baseFill - (Math.abs(dr) + Math.abs(dc)) * 0.2)) {
                        engine.state.grid[r][c] = 'VENTO';
                    }
                }
            }
        });
    }

    function createAlgheAndSecche(easy, medium, hard, engine) {
        const seedsAlghe = [];
        const seedsSecche = [];

        for (let r = 0; r < engine.rows; r++) {
            for (let c = 0; c < engine.cols; c++) {
                if (engine.state.grid[r][c] === 'MARE') {
                    seedsAlghe.push({ r, c });
                    seedsSecche.push({ r, c });
                }
            }
        }
        Utils.shuffleArray(seedsAlghe);
        Utils.shuffleArray(seedsSecche);

        const level = easy ? 'easy' : medium ? 'medium' : 'hard';

        for (let i = 0; i < CONFIG.hazards.alghe[level] && seedsAlghe.length > 0; i++) {
            const seed = seedsAlghe.pop();
            if (engine.state.grid[seed.r][seed.c] === 'MARE') {
                Utils.createBlob(engine.state.grid, 'ALGHE', seed, Utils.randInt(...CONFIG.hazards.algheSize[level]), { avoid: ['MULINELLO', 'VENTO', 'ALGHE'], baseTerrain: 'MARE' }, engine.rows, engine.cols);
            }
        }

        for (let i = 0; i < CONFIG.hazards.secche[level] && seedsSecche.length > 0; i++) {
            const seed = seedsSecche.pop();
            if (engine.state.grid[seed.r][seed.c] === 'MARE' && !Utils.samePosition(seed, engine.state.playerPos) && !Utils.samePosition(seed, engine.state.goalPos)) {
                engine.state.grid[seed.r][seed.c] = 'SECCA';
            }
        }
    }

    function createCorrenti(difficulty, engine) {
        const slopeChance = CONFIG.correnti.chance[difficulty] ?? 0;
        if (slopeChance <= 0) return;

        const slopeTypes = ['CORRENTE_DN', 'CORRENTE_UP', 'CORRENTE_LF', 'CORRENTE_RT'];
        for (let r = 0; r < engine.rows; r++) {
            for (let c = 0; c < engine.cols; c++) {
                if (engine.state.grid[r][c] === 'VENTO' && !Utils.samePosition({ r, c }, engine.state.playerPos) && !Utils.samePosition({ r, c }, engine.state.goalPos) && Math.random() < slopeChance) {
                    engine.state.grid[r][c] = slopeTypes[Utils.randInt(0, slopeTypes.length - 1)];
                }
            }
        }
    }

    function placeBuoy(difficulty, engine) {
        if (difficulty === 'hard') {
            engine.state.custom.requireBuoy = true;
            engine.state.custom.buoyCollected = false;
            const middleRows = [7, 8, 9, 10];
            const candidates = [];
            middleRows.forEach(r => {
                for (let c = 1; c < engine.cols - 1; c++) {
                    if (engine.state.grid[r][c] === 'MARE' || engine.state.grid[r][c] === 'VENTO') {
                        candidates.push({ r, c });
                    }
                }
            });

            if (candidates.length > 0) {
                Utils.shuffleArray(candidates);
                engine.state.custom.buoyPos = candidates[0];
            } else {
                engine.state.custom.buoyPos = { r: 8, c: Math.floor(engine.cols / 2) };
            }
        } else {
            engine.state.custom.requireBuoy = false;
            engine.state.custom.buoyCollected = true;
            engine.state.custom.buoyPos = null;
        }
    }

    const helpBtn = document.getElementById('btnHelpFloating');
    if (helpBtn) {
        helpBtn.addEventListener('click', () => boatGame.openTutorial());
    }

    window.onload = () => boatGame.initGame();
})();
