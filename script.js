(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // UI elements
  const mainMenuEl = document.getElementById('mainMenu');
  const instructionsEl = document.getElementById('instructions');
  const startBtn = document.getElementById('startBtn');
  const beginGameBtn = document.getElementById('beginGameBtn');
  const hud = document.getElementById('hud');
  const timerText = document.getElementById('timerText');
  const scoreText = document.getElementById('scoreText');
  const hintText = document.getElementById('hintText');
  const warningText = document.getElementById('warningText');
  const endScreen = document.getElementById('endScreen');
  const endTitle = document.getElementById('endTitle');
  const endMsg = document.getElementById('endMsg');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const quitBtn = document.getElementById('quitBtn');

  // Game state
  let gameState = 'menu';
  let lastTS = 0, keys = {}, elapsedSeconds = 0;
  const MAX_TIME = 60; // 1 minute
  let remaining = MAX_TIME;
  let score = 0;
  let boat, boy, rescueItems = [], obstacles = [], rescueStation;
  let sitting = false, allowControl = false;
  let currentRescueCount = 0;
  let warningMessage = '', warningTimer = 0;

  const BOAT_W = 54, BOAT_H = 28, BOY_W = 14, BOY_H = 22;
  const rnd = (min, max) => Math.random() * (max - min) + min;

  function rectsOverlap(a, b) {
    return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
  }

  // --- Setup Level ---
  function setupLevel() {
    elapsedSeconds = 0;
    remaining = MAX_TIME;
    sitting = false;
    allowControl = false;
    currentRescueCount = 0;
    warningMessage = '';
    warningTimer = 0;

    scoreText.textContent = 'Score: ' + score;
    hintText.textContent = "Please Press Enter to Sit on Boat!";

    boat = { x: 80, y: H / 2 - BOAT_H / 2, w: BOAT_W, h: BOAT_H, speed: 140 };
    boy = { x: boat.x - 20, y: boat.y - BOY_H + 6, w: BOY_W, h: BOY_H, state: 'idle' };
    rescueStation = { x: W - 110, y: 40, w: 96, h: 80 };

    // 12 floating people
    rescueItems = [];
    for (let i = 0; i < 12; i++) {
      rescueItems.push({
        x: rnd(200, W - 140),
        y: rnd(80, H - 80),
        w: 26,
        h: 20,
        collected: false,
        bobPhase: rnd(0, Math.PI * 2)
      });
    }

    // Obstacles
    obstacles = [];
    for (let i = 0; i < 4; i++) obstacles.push({ type: 'rock', x: rnd(160, W - 160), y: rnd(60, H - 60), w: 36, h: 28 });
    obstacles.push({ type: 'whirlpool', cx: rnd(300, W - 220), cy: rnd(120, H - 120), r: 42 });
    for (let i = 0; i < 2; i++) obstacles.push({ type: 'snake', x: rnd(200, W - 200), y: rnd(60, H - 80), w: 48, h: 16, dir: Math.random() > 0.5 ? 1 : -1, speed: rnd(30, 60) });
  }

  // --- Drawing helpers ---
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawBackground(t) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#3aa1d8');
    grad.addColorStop(1, '#167aa4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 10; i++) {
      const y = (i * 72 + (t * 15) % 140);
      ctx.beginPath();
      ctx.ellipse(W / 2, (y % H) + 30, 400 - i * 30, 38, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRescueStation() {
    ctx.save();
    ctx.translate(rescueStation.x, rescueStation.y);
    ctx.fillStyle = '#ffd27f'; roundRect(ctx, 0, 0, rescueStation.w, rescueStation.h, 8);
    ctx.fillStyle = '#ff4d4d'; ctx.fillRect(rescueStation.w - 12, -6, 6, rescueStation.h + 6);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Segoe UI'; ctx.fillText('RESCUE', 8, 36);
    ctx.restore();
  }

  function drawBoat(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = '#8b5a2b'; roundRect(ctx, 0, 0, b.w, b.h, 8);
    ctx.fillStyle = '#5c3d27'; roundRect(ctx, 6, 6, b.w - 12, b.h - 12, 6);
    ctx.fillStyle = '#ffd27f'; ctx.fillRect(b.w - 10, -6, 4, 10);
    ctx.restore();
  }

  function drawBoy(boy, boat) {
    ctx.save();
    let x = boy.x, y = boy.y;
    if (boy.state === 'sitting') {
      x = boat.x + boat.w / 2 - boy.w / 2;
      y = boat.y - boy.h + 10;
    }
    ctx.translate(x, y);
    ctx.fillStyle = '#fff0c2'; roundRect(ctx, 0, 0, boy.w, boy.h, 4);
    ctx.fillStyle = '#ffd1a9';
    ctx.beginPath();
    ctx.ellipse(boy.w / 2, boy.state === 'idle' ? -6 : -4, 7, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRescueItems(list, t) {
    ctx.font = '11px Arial';
    for (let it of list) {
      if (it.collected) continue;
      const bob = Math.sin((t * 2) + it.bobPhase) * 6;
      const x = it.x, y = it.y + bob;
      ctx.fillStyle = '#ffeb3b'; roundRect(ctx, x, y, it.w, it.h, 6);
      ctx.fillStyle = '#c66'; ctx.fillRect(x + 4, y + 4, it.w - 8, 4);
      ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.fillText('HELP!!', x + it.w / 2, y - 6);
    }
  }

  function drawObstacles(obs) {
    for (let o of obs) {
      if (o.type === 'rock') {
        ctx.fillStyle = '#6b6b6b';
        ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); ctx.fill();
      } else if (o.type === 'whirlpool') {
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.lineWidth = 6 - i; ctx.strokeStyle = `rgba(255,255,255,${0.06 + i * 0.04})`;
          ctx.arc(o.cx, o.cy, o.r - i * 6, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (o.type === 'snake') {
        ctx.fillStyle = '#1b5313'; roundRect(ctx, o.x, o.y, o.w, o.h, 8);
      }
    }
  }

  function updateObstacles(obs, dt) {
    for (let o of obs) {
      if (o.type === 'snake') {
        o.x += o.dir * o.speed * dt;
        if (o.x < 140) { o.x = 140; o.dir = 1; }
        if (o.x > W - 140) { o.x = W - 140; o.dir = -1; }
      }
    }
  }

  // --- Input ---
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;

    if (e.key === 'Enter' && gameState === 'playing' && !sitting) {
      sitting = true;
      boy.state = 'sitting';
      allowControl = true;
      hintText.textContent = "Use arrows or WASD to control the boat";
    }
  });

  window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

  // --- Buttons ---
  startBtn.onclick = () => {
    mainMenuEl.style.display = 'none';
    instructionsEl.style.display = 'flex';
    gameState = 'instructions';
  };
  beginGameBtn.onclick = () => {
    instructionsEl.style.display = 'none';
    hud.style.display = 'block';
    startGame();
  };
  playAgainBtn.onclick = () => {
    endScreen.style.display = 'none';
    hud.style.display = 'block';
    startGame();
  };
  quitBtn.onclick = () => {
    endScreen.style.display = 'none';
    hud.style.display = 'none';
    mainMenuEl.style.display = 'flex';
    gameState = 'menu';
  };

  // --- Game Functions ---
  function startGame() {
    setupLevel();
    gameState = 'playing';
    lastTS = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame(reason) {
    gameState = 'ended';
    hud.style.display = 'none';
    endScreen.style.display = 'flex';
    if (reason === 'win') {
      endTitle.textContent = 'You Survived!';
      endMsg.textContent = `Final Score: ${score}`;
    } else if (reason === 'tsunami') {
      endTitle.textContent = 'You Lost, Tsunami hit!';
      endMsg.textContent = `Score: ${score}`;
    } else {
      endTitle.textContent = 'You Drowned!';
      endMsg.textContent = `Score: ${score}`;
    }
  }

  function update(dt) {
    if (!allowControl) return;

    if (keys['arrowup'] || keys['w']) boat.y -= boat.speed * dt;
    if (keys['arrowdown'] || keys['s']) boat.y += boat.speed * dt;
    if (keys['arrowleft'] || keys['a']) boat.x -= boat.speed * dt;
    if (keys['arrowright'] || keys['d']) boat.x += boat.speed * dt;

    boat.x = Math.max(0, Math.min(W - boat.w, boat.x));
    boat.y = Math.max(0, Math.min(H - boat.h, boat.y));

    // Check rescue items
    for (let it of rescueItems) {
      if (!it.collected && rectsOverlap({ x: boat.x, y: boat.y, w: boat.w, h: boat.h }, it)) {
        if (currentRescueCount < 3) {
          it.collected = true;
          currentRescueCount++;
        } else {
          warningMessage = "Maximum capacity 3!";
          warningTimer = 1; // 1 second
        }
      }
    }

    // Reaching rescue station
    if (rectsOverlap(boat, rescueStation) && currentRescueCount > 0) {
      score += currentRescueCount * 100;
      scoreText.textContent = 'Score: ' + score;
      currentRescueCount = 0; // empty boat to continue
    }

    // Warning timer countdown
    if (warningTimer > 0) {
      warningTimer -= dt;
      if (warningTimer <= 0) warningMessage = '';
    }
  }

  function checkHazards() {
    const b = { x: boat.x, y: boat.y, w: boat.w, h: boat.h };
    for (let o of obstacles) {
      if ((o.type === 'rock' || o.type === 'snake') && rectsOverlap(b, o)) return true;
      if (o.type === 'whirlpool') {
        const dx = b.x + b.w / 2 - o.cx;
        const dy = b.y + b.h / 2 - o.cy;
        if (dx * dx + dy * dy < o.r * o.r) return true;
      }
    }
    return false;
  }

  function loop(ts) {
    if (gameState !== 'playing') return;
    const dt = Math.min((ts - lastTS) / 1000, 0.05);
    lastTS = ts;
    elapsedSeconds += dt;
    remaining = Math.max(0, MAX_TIME - Math.floor(elapsedSeconds));

    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    timerText.textContent = `${mm}:${ss}`;

    update(dt);
    updateObstacles(obstacles, dt);

    if (checkHazards()) { endGame('drown'); return; }
    if (remaining <= 0) { endGame('tsunami'); return; }

    // --- Draw ---
    drawBackground(ts / 1000);
    drawRescueStation();
    drawRescueItems(rescueItems, ts / 1000);
    drawObstacles(obstacles);
    drawBoat(boat);
    drawBoy(boy, boat);

    // Draw warning
    if (warningMessage !== '') {
      ctx.fillStyle = 'red';
      ctx.font = '22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(warningMessage, W / 2, H / 2);
    }

    requestAnimationFrame(loop);
  }
})();