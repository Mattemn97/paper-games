(function (global) {
    'use strict';

    // ==========================================
    // 1. UTILITIES E FUNZIONI MATEMATICHE
    // ==========================================
    const Utils = {
        randInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        isInside(pos, rows, cols) {
            return Boolean(pos) && pos.r >= 0 && pos.r < rows && pos.c >= 0 && pos.c < cols;
        },

        samePosition(a, b) {
            return Boolean(a) && Boolean(b) && a.r === b.r && a.c === b.c;
        },

        shuffleArray(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },

        getNeighbors(cell) {
            return [
                { dr: -1, dc: 0 },
                { dr: 1, dc: 0 },
                { dr: 0, dc: -1 },
                { dr: 0, dc: 1 },
                { dr: -1, dc: -1 },
                { dr: -1, dc: 1 },
                { dr: 1, dc: -1 },
                { dr: 1, dc: 1 }
            ].map(d => ({ r: cell.r + d.dr, c: cell.c + d.dc }));
        },

        findPath(start, goal, grid, rows, cols, directions, avoidTerrains = []) {
            const queue = [start];
            const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
            const parent = Array.from({ length: rows }, () => Array(cols).fill(null));

            visited[start.r][start.c] = true;

            const dirValues = Array.isArray(directions) ? directions : Object.values(directions);

            while (queue.length) {
                const current = queue.shift();
                if (Utils.samePosition(current, goal)) {
                    const path = [];
                    let node = current;
                    while (node) {
                        path.unshift(node);
                        node = parent[node.r][node.c];
                    }
                    return path;
                }

                for (const dir of dirValues) {
                    const next = { r: current.r + dir.dr, c: current.c + dir.dc };
                    if (!Utils.isInside(next, rows, cols) || visited[next.r][next.c] || avoidTerrains.includes(grid[next.r][next.c])) continue;

                    visited[next.r][next.c] = true;
                    parent[next.r][next.c] = current;
                    queue.push(next);
                }
            }

            return null;
        },

        createBlob(grid, type, seed, size, options, rows, cols) {
            const avoid = Array.isArray(options?.avoid) ? options.avoid : [];
            const baseTerrain = options?.baseTerrain || 'ROUGH';
            const cells = [{ ...seed }];
            let index = 0;

            if (!Utils.isInside(seed, rows, cols) || avoid.includes(grid[seed.r][seed.c]) || grid[seed.r][seed.c] !== baseTerrain) return;

            grid[seed.r][seed.c] = type;

            while (cells.length < size && index < cells.length) {
                const neighbors = Utils.getNeighbors(cells[index++])
                    .filter(n => Utils.isInside(n, rows, cols) && !avoid.includes(grid[n.r][n.c]) && grid[n.r][n.c] === baseTerrain);

                Utils.shuffleArray(neighbors);

                for (const n of neighbors) {
                    if (cells.length >= size) break;
                    if (grid[n.r][n.c] === baseTerrain) {
                        grid[n.r][n.c] = type;
                        cells.push(n);
                    }
                }
            }
        },

        getCellFromCanvasEvent(event, canvas, cellSize, rows, cols, dpr = 1) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / (rect.width * dpr);
            const scaleY = canvas.height / (rect.height * dpr);

            const x = (event.clientX - rect.left) * scaleX;
            const y = (event.clientY - rect.top) * scaleY;

            return {
                r: Math.floor(y / cellSize),
                c: Math.floor(x / cellSize)
            };
        }
    };

    // Vettori di direzione standard a 8 vie
    const DEFAULT_DIRECTIONS = {
        N: { dr: -1, dc: 0 },
        NE: { dr: -1, dc: 1 },
        E: { dr: 0, dc: 1 },
        SE: { dr: 1, dc: 1 },
        S: { dr: 1, dc: 0 },
        SW: { dr: 1, dc: -1 },
        W: { dr: 0, dc: -1 },
        NW: { dr: -1, dc: -1 }
    };

    // ==========================================
    // 2. GESTIONE UNIFICATA UI E MODALI
    // ==========================================
    const UI = {
        showModal(title, htmlContent, buttons = []) {
            const modal = document.getElementById('gameModal');
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');

            if (!modal || !modalTitle || !modalBody) return;

            modalTitle.innerText = title;
            modalBody.innerHTML = htmlContent;

            if (buttons && buttons.length > 0) {
                const btnContainer = document.createElement('div');
                btnContainer.className = 'modal-buttons';

                buttons.forEach(btn => {
                    const buttonEl = document.createElement('button');
                    buttonEl.className = btn.className || 'btn btn-primary';
                    buttonEl.id = btn.id || '';
                    buttonEl.innerText = btn.label;
                    if (typeof btn.onClick === 'function') {
                        buttonEl.addEventListener('click', (e) => {
                            btn.onClick(e);
                        });
                    }
                    btnContainer.appendChild(buttonEl);
                });

                modalBody.appendChild(btnContainer);
            }

            modal.classList.add('active');
        },

        hideModal() {
            const modal = document.getElementById('gameModal');
            if (modal) modal.classList.remove('active');
        }
    };

    // ==========================================
    // 3. CORE GAME ENGINE CLASS
    // ==========================================
    class GameEngine {
        constructor(config) {
            this.cols = config.cols || 12;
            this.rows = config.rows || 18;
            this.baseCellSize = config.baseCellSize || 40;
            this.canvasId = config.canvasId || 'gameCanvas';
            this.mode = config.mode || 'golf'; // 'golf', 'boat', etc.
            this.terrains = config.terrains || {};
            this.directions = config.directions || DEFAULT_DIRECTIONS;
            this.config = config;

            // Callbacks di gioco
            this.rules = {
                terrainModifier: config.rules?.terrainModifier || (() => 0),
                calculateShot: config.rules?.calculateShot || null,
                resolveSlope: config.rules?.resolveSlope || null,
                generateMap: config.rules?.generateMap || null,
                onStartTurn: config.rules?.onStartTurn || null,
                onShotLanding: config.rules?.onShotLanding || null,
                onDrawExtra: config.rules?.onDrawExtra || null,
                updateHUD: config.rules?.updateHUD || null,
                getTutorialHtml: config.rules?.getTutorialHtml || (() => ''),
                getInitHtml: config.rules?.getInitHtml || null,
                winMessage: config.rules?.winMessage || 'Vittoria!'
            };

            // Elementi DOM
            this.dom = {
                strokeInfo: document.getElementById('strokeInfo'),
                rollInfo: document.getElementById('rollInfo'),
                buoyStatus: document.getElementById('buoyStatus')
            };

            // Stato del gioco
            this.state = {
                grid: [],
                playerPos: { r: this.rows - 3, c: Math.floor(this.cols / 2) },
                goalPos: { r: 3, c: Math.floor(this.cols / 2) },
                animatingPos: null,
                currentRoll: null,
                strokeCount: 0,
                lastPath: [],
                shotHistory: [],
                gameOver: false,
                gameState: 'INIT', // INIT, TURN_START, ROLLING, TARGET_SELECT, ANIMATING
                validTargets: [],
                custom: {} // per variabili extra (es. isStuck, buoyPos, buoyCollected, requireBuoy)
            };

            this.initCanvas();
        }

        // Alias per compatibilità con la proprietà ballPos / holePos nei renderer precedenti
        get ballPos() { return this.state.playerPos; }
        set ballPos(v) { this.state.playerPos = v; }
        get holePos() { return this.state.goalPos; }
        set holePos(v) { this.state.goalPos = v; }

        initCanvas() {
            this.canvas = document.getElementById(this.canvasId);
            if (!this.canvas) return;

            this.ctx = this.canvas.getContext('2d');
            this.dpr = window.devicePixelRatio || 1;

            this.canvas.width = this.cols * this.baseCellSize * this.dpr;
            this.canvas.height = this.rows * this.baseCellSize * this.dpr;
            this.ctx.scale(this.dpr, this.dpr);
            this.cellSize = this.baseCellSize;

            this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        }

        initGame() {
            this.state.gameState = 'INIT';

            if (typeof this.rules.getInitHtml === 'function') {
                const initConfig = this.rules.getInitHtml(this);
                UI.showModal(initConfig.title, initConfig.bodyHtml, initConfig.buttons);
            } else {
                UI.showModal("Nuova Partita", `
                    <p>Seleziona la difficoltà per iniziare:</p>
                    <select id="popupDifficulty" class="input-select">
                        <option value="easy">Facile</option>
                        <option value="medium" selected>Medio</option>
                        <option value="hard">Difficile</option>
                    </select>
                `, [
                    {
                        label: 'Gioca',
                        className: 'btn btn-primary',
                        onClick: () => {
                            const diff = document.getElementById('popupDifficulty').value;
                            this.startGame(diff);
                        }
                    },
                    {
                        label: 'Regole del gioco',
                        className: 'btn btn-grey',
                        onClick: () => this.openTutorial()
                    }
                ]);
            }
        }

        startGame(difficulty = 'medium') {
            UI.hideModal();
            if (typeof this.rules.generateMap === 'function') {
                this.rules.generateMap(difficulty, this);
            }
            this.startTurn();
        }

        updateHUD() {
            if (this.dom.strokeInfo) {
                const label = this.mode === 'boat' ? 'Turni' : 'Colpi';
                this.dom.strokeInfo.innerText = `${label}: ${this.state.strokeCount}`;
            }
            if (typeof this.rules.updateHUD === 'function') {
                this.rules.updateHUD(this);
            }
        }

        startTurn() {
            if (this.state.gameOver) return;

            this.state.gameState = 'TURN_START';
            this.state.validTargets = [];
            this.state.currentRoll = null;
            if (this.dom.rollInfo) this.dom.rollInfo.innerText = '';

            this.updateHUD();

            // Hook per gestire turni speciali (es. barca incagliata)
            if (typeof this.rules.onStartTurn === 'function') {
                const handled = this.rules.onStartTurn(this);
                if (handled) return;
            }

            UI.showModal("Il tuo turno", "<p>Scegli l'azione da eseguire:</p>", [
                {
                    label: 'Lancia il Dado',
                    className: 'btn btn-orange',
                    onClick: () => this.handleRollAction()
                },
                {
                    label: this.mode === 'boat' ? 'Motore (1 Cella)' : 'Muovi di 1 (Sicuro)',
                    className: 'btn btn-blue',
                    onClick: () => this.handleMoveOneAction()
                }
            ]);
        }

        handleRollAction() {
            UI.hideModal();
            this.state.gameState = 'ROLLING';
            this.state.validTargets = [];

            let rollCount = 0;
            const rollInterval = setInterval(() => {
                if (this.dom.rollInfo) {
                    this.dom.rollInfo.innerText = `Lancio... 🎲 ${Utils.randInt(1, 6)}`;
                }
                rollCount++;

                if (rollCount > 10) {
                    clearInterval(rollInterval);
                    this.finalizeRoll();
                }
            }, 50);
        }

        finalizeRoll() {
            const die = Utils.randInt(1, 6);
            const terrain = this.state.grid[this.state.playerPos.r][this.state.playerPos.c];
            const modifier = this.rules.terrainModifier(terrain, die, this) || 0;

            this.state.currentRoll = Math.max(1, die + modifier);
            const sign = modifier > 0 ? `+${modifier}` : modifier;

            if (this.dom.rollInfo) {
                this.dom.rollInfo.innerText = `Dado: ${this.state.currentRoll} (${die} ${sign})`;
            }

            this.calculateValidTargets(this.state.currentRoll);
            this.state.gameState = 'TARGET_SELECT';
            this.draw();
        }

        handleMoveOneAction() {
            UI.hideModal();
            this.state.currentRoll = 1;
            if (this.dom.rollInfo) {
                this.dom.rollInfo.innerText = `Mosse: 1`;
            }
            this.calculateValidTargets(1);
            this.state.gameState = 'TARGET_SELECT';
            this.draw();
        }

        calculateValidTargets(distance) {
            this.state.validTargets = [];
            const startTerrain = this.state.grid[this.state.playerPos.r][this.state.playerPos.c];

            Object.keys(this.directions).forEach(dirKey => {
                const direction = this.directions[dirKey];
                const result = this.rules.calculateShot
                    ? this.rules.calculateShot(this.state.playerPos, direction, distance, startTerrain, this)
                    : this.defaultCalculateShot(this.state.playerPos, direction, distance, startTerrain);

                if (result.valid && !result.canceled) {
                    this.state.validTargets.push({
                        directionKey: dirKey,
                        targetPos: result.finalPos,
                        path: result.path,
                        winner: result.winner || false,
                        hitBuoy: result.hitBuoy || false
                    });
                }
            });

            if (this.state.validTargets.length === 0 && distance !== 1) {
                this.state.currentRoll = 1;
                if (this.dom.rollInfo) this.dom.rollInfo.innerText = `Forzato: 1 cella`;
                this.calculateValidTargets(1);
                return;
            }

            if (this.state.validTargets.length === 0) {
                UI.showModal("Attenzione", "<p>Sei bloccato, nessuna mossa disponibile!</p>", [
                    {
                        label: 'Salta Turno',
                        className: 'btn btn-grey',
                        onClick: () => this.startTurn()
                    }
                ]);
            }
        }

        defaultCalculateShot(start, direction, distance, startTerrain) {
            const path = [];
            for (let step = 1; step <= distance; step++) {
                const next = { r: start.r + direction.dr * step, c: start.c + direction.dc * step };
                if (!Utils.isInside(next, this.rows, this.cols)) return { valid: false, path };

                path.push(next);

                if (Utils.samePosition(next, this.state.goalPos)) {
                    return { valid: true, winner: true, finalPos: this.state.goalPos, path };
                }
            }

            const finalPos = path[path.length - 1];
            return { valid: true, finalPos, path };
        }

        handleCanvasClick(event) {
            if (this.state.gameState !== 'TARGET_SELECT') return;

            const clicked = Utils.getCellFromCanvasEvent(event, this.canvas, this.cellSize, this.rows, this.cols, this.dpr);
            const target = this.state.validTargets.find(t => Utils.samePosition(t.targetPos, clicked));

            if (target) {
                this.executeShot(target);
            }
        }

        executeShot(targetData) {
            const fullPath = targetData.path;
            const oldPos = { ...this.state.playerPos };

            PaperGames.animateShot({
                targetData,
                path: fullPath,
                draw: () => this.draw(),
                delay: 100,
                beforeShot: () => {
                    this.state.strokeCount++;
                    this.state.validTargets = [];
                    this.state.gameState = 'ANIMATING';
                },
                onFrame: cell => {
                    this.state.animatingPos = cell;
                },
                afterLanding: () => {
                    this.state.animatingPos = null;
                    this.state.playerPos = { ...targetData.targetPos };

                    this.state.lastPath = [oldPos, ...targetData.path];
                    this.state.shotHistory.push({ path: this.state.lastPath, landed: targetData.targetPos });

                    this.updateHUD();

                    if (typeof this.rules.onShotLanding === 'function') {
                        this.rules.onShotLanding(targetData, this);
                    }

                    if (targetData.winner) {
                        this.state.gameOver = true;
                        this.draw();
                        setTimeout(() => {
                            const winMsg = typeof this.rules.winMessage === 'function' ? this.rules.winMessage(this) : this.rules.winMessage;
                            const unitLabel = this.mode === 'boat' ? 'turni' : 'colpi';
                            UI.showModal(winMsg, `<p>Hai completato in ${this.state.strokeCount} ${unitLabel}.</p>`, [
                                {
                                    label: 'Gioca Ancora',
                                    className: 'btn btn-green',
                                    onClick: () => this.initGame()
                                }
                            ]);
                        }, 500);
                    } else {
                        this.draw();
                        setTimeout(() => this.startTurn(), 600);
                    }
                }
            });
        }

        draw() {
            PaperGames.drawScene({
                ctx: this.ctx,
                canvas: this.canvas,
                grid: this.state.grid,
                rows: this.rows,
                cols: this.cols,
                cellSize: this.cellSize,
                terrain: this.terrains,
                ballPos: this.state.playerPos,
                holePos: this.state.goalPos,
                animatingPos: this.state.animatingPos,
                gameState: this.state.gameState,
                validTargets: this.state.validTargets,
                lastPath: this.state.lastPath,
                shotHistory: this.state.shotHistory,
                requireBuoy: this.state.custom?.requireBuoy || false,
                buoyCollected: this.state.custom?.buoyCollected ?? true,
                buoyPos: this.state.custom?.buoyPos || null,
                mode: this.mode,
                onDrawExtra: (ctx) => {
                    if (typeof this.rules.onDrawExtra === 'function') {
                        this.rules.onDrawExtra(ctx, this);
                    }
                }
            });
        }

        openTutorial() {
            const tutorialHtml = this.rules.getTutorialHtml(this);
            UI.showModal(this.mode === 'boat' ? 'Manuale di Bordo' : 'Come si gioca', tutorialHtml, [
                {
                    label: 'Ho capito',
                    className: 'btn btn-primary',
                    onClick: () => {
                        if (this.state.gameState === 'INIT') {
                            this.initGame();
                        } else {
                            this.startTurn();
                        }
                    }
                }
            ]);
        }
    }

    // ==========================================
    // 4. API GLOBALE PAPER GAMES
    // ==========================================
    const PaperGames = {
        Utils,
        UI,
        GameEngine,

        // Alias di utilità retrocompatibili
        randInt: Utils.randInt,
        isInside: Utils.isInside,
        samePosition: Utils.samePosition,
        shuffleArray: Utils.shuffleArray,
        getNeighbors: Utils.getNeighbors,
        findPath: Utils.findPath,
        createBlob: Utils.createBlob,
        getCellFromCanvasEvent: Utils.getCellFromCanvasEvent,

        createGame(config) {
            return new GameEngine(config);
        },

        animateShot(runtime) {
            const {
                targetData,
                draw,
                path = targetData?.path || [],
                delay = 100,
                beforeShot,
                onFrame,
                afterLanding
            } = runtime;

            if (typeof beforeShot === 'function') beforeShot();

            let pathIndex = 0;

            function step() {
                if (pathIndex >= path.length) {
                    if (typeof afterLanding === 'function') {
                        afterLanding({ targetData, path });
                    }
                    return;
                }

                if (typeof onFrame === 'function') {
                    onFrame(path[pathIndex], pathIndex);
                }

                if (typeof draw === 'function') {
                    draw();
                }

                pathIndex++;
                setTimeout(step, delay);
            }

            step();
        },

        finalizeRoll(runtime) {
            const {
                state,
                grid,
                ballPos,
                draw,
                calculateValidTargets,
                rollInfo,
                terrainModifier = () => 0
            } = runtime;

            const die = Utils.randInt(1, 6);
            const terrain = grid[ballPos.r][ballPos.c];
            const modifier = terrainModifier(terrain, die) || 0;

            state.currentRoll = Math.max(1, die + modifier);
            const sign = modifier > 0 ? `+${modifier}` : modifier;

            if (rollInfo) rollInfo.innerText = `Dado: ${state.currentRoll} (${die} ${sign})`;
            calculateValidTargets(state.currentRoll);
            state.gameState = 'TARGET_SELECT';
            draw();
        },

        drawScene(runtime) {
            const {
                ctx,
                canvas,
                grid,
                rows,
                cols,
                cellSize,
                terrain,
                ballPos,
                holePos,
                animatingPos,
                gameState,
                validTargets,
                lastPath,
                shotHistory,
                buoyPos,
                requireBuoy,
                buoyCollected,
                mode = 'golf',
                onDrawExtra
            } = runtime;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const type = grid[r][c];
                    if (terrain[type]) {
                        ctx.fillStyle = terrain[type].color;
                        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
                    }
                }
            }

            ctx.strokeStyle = 'rgba(0,0,0,0.05)';
            ctx.lineWidth = 1;
            for (let r = 0; r <= rows; r++) {
                ctx.beginPath();
                ctx.moveTo(0, r * cellSize);
                ctx.lineTo(canvas.width, r * cellSize);
                ctx.stroke();
            }
            for (let c = 0; c <= cols; c++) {
                ctx.beginPath();
                ctx.moveTo(c * cellSize, 0);
                ctx.lineTo(c * cellSize, canvas.height);
                ctx.stroke();
            }

            ctx.font = `bold ${cellSize * 0.55}px 'Inter', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const type = grid[r][c];
                    if (terrain[type] && terrain[type].label) {
                        ctx.fillStyle = terrain[type].textColor || '#000';
                        ctx.fillText(terrain[type].label, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
                    }
                }
            }

            if (requireBuoy && !buoyCollected && buoyPos) {
                const bx = buoyPos.c * cellSize + cellSize / 2;
                const by = buoyPos.r * cellSize + cellSize / 2;
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.moveTo(bx, by - cellSize * 0.35);
                ctx.lineTo(bx + cellSize * 0.3, by);
                ctx.lineTo(bx, by + cellSize * 0.35);
                ctx.lineTo(bx - cellSize * 0.3, by);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${cellSize * 0.35}px 'Inter'`;
                ctx.fillText('🚩', bx, by + 2);
            }

            if (typeof onDrawExtra === 'function') {
                onDrawExtra(ctx);
            }

            if (shotHistory.length) {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.lineWidth = 2;
                shotHistory.forEach(entry => {
                    ctx.beginPath();
                    entry.path.forEach((cell, index) => {
                        const x = cell.c * cellSize + cellSize / 2;
                        const y = cell.r * cellSize + cellSize / 2;
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
                    const x = cell.c * cellSize + cellSize / 2;
                    const y = cell.r * cellSize + cellSize / 2;
                    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                });
                ctx.stroke();
            }

            const holeX = holePos.c * cellSize + cellSize / 2;
            const holeY = holePos.r * cellSize + cellSize / 2;

            if (mode === 'boat') {
                ctx.fillStyle = '#94a3b8';
                ctx.fillRect(holePos.c * cellSize + 2, holePos.r * cellSize + 2, cellSize - 4, cellSize - 4);
                ctx.fillStyle = '#0f172a';
                ctx.font = `bold ${cellSize * 0.5}px 'Inter'`;
                ctx.fillText('🚢', holeX, holeY);
            } else {
                ctx.fillStyle = '#0f172a';
                ctx.beginPath();
                ctx.arc(holeX, holeY, cellSize * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }

            const renderR = (gameState === 'ANIMATING' && animatingPos) ? animatingPos.r : ballPos.r;
            const renderC = (gameState === 'ANIMATING' && animatingPos) ? animatingPos.c : ballPos.c;
            const ballX = renderC * cellSize + cellSize / 2;
            const ballY = renderR * cellSize + cellSize / 2;

            if (mode === 'boat') {
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(ballX, ballY - cellSize * 0.35);
                ctx.lineTo(ballX + cellSize * 0.25, ballY + cellSize * 0.3);
                ctx.lineTo(ballX - cellSize * 0.25, ballY + cellSize * 0.3);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(ballX, ballY, cellSize * 0.38, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            if (gameState === 'TARGET_SELECT' && validTargets.length > 0) {
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);

                validTargets.forEach(t => {
                    ctx.beginPath();
                    ctx.moveTo(ballPos.c * cellSize + cellSize / 2, ballPos.r * cellSize + cellSize / 2);
                    t.path.forEach(cell => {
                        ctx.lineTo(cell.c * cellSize + cellSize / 2, cell.r * cellSize + cellSize / 2);
                    });
                    ctx.stroke();
                });
                ctx.setLineDash([]);

                validTargets.forEach(t => {
                    const tx = t.targetPos.c * cellSize + cellSize / 2;
                    const ty = t.targetPos.r * cellSize + cellSize / 2;

                    ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
                    ctx.beginPath();
                    ctx.arc(tx, ty, cellSize * 0.45, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(tx, ty, cellSize * 0.25, 0, Math.PI * 2);
                    ctx.stroke();
                });
            }
        }
    };

    global.PaperGames = PaperGames;
})(window);
