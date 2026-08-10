(function (global) {
    'use strict';

    const PaperGames = {
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

        findPath(start, goal, grid, rows, cols, directions, avoidTerrains) {
            const queue = [start];
            const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
            const parent = Array.from({ length: rows }, () => Array(cols).fill(null));

            visited[start.r][start.c] = true;

            while (queue.length) {
                const current = queue.shift();
                if (PaperGames.samePosition(current, goal)) {
                    const path = [];
                    let node = current;
                    while (node) {
                        path.unshift(node);
                        node = parent[node.r][node.c];
                    }
                    return path;
                }

                for (const dir of Object.values(directions)) {
                    const next = { r: current.r + dir.dr, c: current.c + dir.dc };
                    if (!PaperGames.isInside(next, rows, cols) || visited[next.r][next.c] || avoidTerrains.includes(grid[next.r][next.c])) continue;

                    visited[next.r][next.c] = true;
                    parent[next.r][next.c] = current;
                    queue.push(next);
                }
            }

            return null;
        },

        createBlob(grid, type, seed, size, options, rows, cols) {
            const avoid = Array.isArray(options?.avoid) ? options.avoid : [];
            const baseTerrain = options?.baseTerrain || 'MARE';
            const cells = [{ ...seed }];
            let index = 0;

            if (!PaperGames.isInside(seed, rows, cols) || avoid.includes(grid[seed.r][seed.c]) || grid[seed.r][seed.c] !== baseTerrain) return;

            grid[seed.r][seed.c] = type;

            while (cells.length < size && index < cells.length) {
                const neighbors = PaperGames.getNeighbors(cells[index++])
                    .filter(n => PaperGames.isInside(n, rows, cols) && !avoid.includes(grid[n.r][n.c]) && grid[n.r][n.c] === baseTerrain);

                PaperGames.shuffleArray(neighbors);

                for (const n of neighbors) {
                    if (cells.length >= size) break;
                    if (grid[n.r][n.c] === baseTerrain) {
                        grid[n.r][n.c] = type;
                        cells.push(n);
                    }
                }
            }
        },

        getCellFromCanvasEvent(event, canvas, cellSize, rows, cols, dpr) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / (rect.width * dpr);
            const scaleY = canvas.height / (rect.height * dpr);

            const x = (event.clientX - rect.left) * scaleX;
            const y = (event.clientY - rect.top) * scaleY;

            return {
                r: Math.floor(y / cellSize),
                c: Math.floor(x / cellSize)
            };
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

            if (typeof beforeShot === 'function') {
                beforeShot();
            }

            let pathIndex = 0;

            function step() {
                if (pathIndex >= path.length) {
                    if (typeof afterLanding === 'function') {
                        afterLanding({ targetData, path, state: runtime.state });
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

            const die = PaperGames.randInt(1, 6);
            const terrain = grid[ballPos.r][ballPos.c];
            const modifier = terrainModifier(terrain, die) || 0;

            state.currentRoll = Math.max(1, die + modifier);
            const sign = modifier > 0 ? `+${modifier}` : modifier;

            rollInfo.innerText = `Dado: ${state.currentRoll} (${die} ${sign})`;
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
                mode = 'golf'
            } = runtime;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const type = grid[r][c];
                    ctx.fillStyle = terrain[type].color;
                    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
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
