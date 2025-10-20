/* ------------------------------
   Playable mini-game logic
   Canvas-based falling drops with click/tap detection
   -------------------------------*/
(function(){
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('2D context not available!');
    return;
  }
  const DPR = window.devicePixelRatio || 1;
  function setupCanvas(){
    try {
      const rect = canvas.getBoundingClientRect();
      const displayWidth = rect.width || 720;
      const displayHeight = rect.height || 420;
      canvas.width = displayWidth * DPR;
      canvas.height = displayHeight * DPR;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(DPR, DPR);
      canvas._w = displayWidth;
      canvas._h = displayHeight;
      canvas.style.width = displayWidth + 'px';
      canvas.style.height = displayHeight + 'px';
    } catch(e) {
      console.error('Canvas setup error:', e);
    }
  }
  setupCanvas();
  window.addEventListener('resize', setupCanvas);

  // Game state
  let running = false;
  let paused = false;
  let drops = [];
  let lastSpawn = 0;
  let spawnInterval = 700;
  let score = 0;
  let lives = 3;
  let waterPercent = 0;
  const roundTime = 30;
  let timeLeft = roundTime;
  let timerId = null;
  let animationId = null;
  
  // Difficulty modes
  let currentDifficulty = 'normal';
  // Tweaked to make higher difficulties feel noticeably faster
  const difficultySettings = {
    // spawnMin: lower bound for interval between spawns
    // spawnAccel: how much the interval shrinks per second as the round progresses
    easy:   { spawnInterval: 950, spawnMin: 520, spawnAccel: 10, dropSpeed: 1.3, roundTime: 45, lives: 5 },
    normal: { spawnInterval: 650, spawnMin: 340, spawnAccel: 14, dropSpeed: 1.7, roundTime: 30, lives: 3 },
    hard:   { spawnInterval: 420, spawnMin: 220, spawnAccel: 18, dropSpeed: 2.2, roundTime: 20, lives: 2 }
  };
  
  // Milestones
  let milestones = [50, 100, 150];
  let milestonesReached = [];
  
  // Sound effects
  const sounds = {
    collect: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGnOD0t2snCCqAy/H'),
    lose: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAgICAgo'),
    milestone: new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACA')
  };
  
  // Mute sounds on error
  Object.values(sounds).forEach(sound => {
    sound.volume = 0.3;
    sound.addEventListener('error', () => sound.muted = true);
  });

  // Unlock audio on first user gesture (for iOS/Chrome autoplay policies)
  function unlockAudio() {
    Object.values(sounds).forEach(sound => {
      try {
        sound.muted = false;
        sound.currentTime = 0;
        sound.play().catch(()=>{});
        sound.pause();
        sound.currentTime = 0;
      } catch(e){}
    });
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  }
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  // DOM refs
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const barFill = document.getElementById('barFill');
  const timerEl = document.getElementById('timer');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const results = document.getElementById('results');
  const resultsTitle = document.getElementById('resultsTitle');
  const resultsStats = document.getElementById('resultsStats');
  const levelFact = document.getElementById('levelFact');
  const claimBtn = document.getElementById('claimBtn');
  const modal = document.getElementById('modal');
  const closeModal = document.getElementById('closeModal');
  const confirmClaim = document.getElementById('confirmClaim');
  const claimCode = document.getElementById('claimCode');
  const claimCodeArea = document.getElementById('claimCodeArea');
  const modalCoins = document.getElementById('modalCoins');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const fullscreenIcon = document.getElementById('fullscreenIcon');
  const siteElement = document.getElementById('site');

  const resetUI = () => {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    barFill.style.width = Math.round(waterPercent) + '%';
    timerEl.textContent = Math.max(0, Math.ceil(timeLeft)) + 's';
  };

  // Utility
  const rand = (min,max)=> Math.random()*(max-min)+min;

  function createDrop(isPolluted){
    const settings = difficultySettings[currentDifficulty] || {};
    const speedMult = settings.dropSpeed || 1;
    const size = isPolluted ? rand(24,35) : rand(18,28);
    const x = rand(size * 2, canvas._w - size * 2);
    const speed = (isPolluted ? rand(40,60) : rand(30,50)) * speedMult;
    return {
      x, y: -size * 2, size, speed,
      polluted: !!isPolluted,
      vx: rand(-5,5),
      rotation: rand(0, Math.PI * 2),
      rotationSpeed: rand(-0.03, 0.03),
      birth: Date.now(),
      gravity: (isPolluted ? 90 : 75) * speedMult,
      drag: 0.999,
      opacity: isPolluted ? rand(0.8, 1.0) : 1.0,
      trail: []
    };
  }
  function spawnDrop(){
    const pollutedChance = Math.min(0.28, 0.08 + (30 - timeLeft) * 0.006);
    const polluted = Math.random() < pollutedChance;
    drops.push(createDrop(polluted));
  }

  function drawCleanDrop(x, y, r, age){
    ctx.beginPath();
    const mainGrad = ctx.createRadialGradient(x - r*0.3, y - r*0.5, r*0.1, x, y, r*1.4);
    mainGrad.addColorStop(0, '#e6f9ff');
    mainGrad.addColorStop(0.3, '#7dd3fc');
    mainGrad.addColorStop(0.7, '#0ea5e9');
    mainGrad.addColorStop(1, '#0284c7');
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r*0.8, y - r*0.3, x + r*0.6, y + r*0.4);
    ctx.quadraticCurveTo(x, y + r*1.2, x - r*0.6, y + r*0.4);
    ctx.quadraticCurveTo(x - r*0.8, y - r*0.3, x, y - r);
    ctx.fillStyle = mainGrad;
    ctx.fill();
    ctx.shadowColor = 'rgba(14, 165, 233, 0.3)';
    ctx.shadowBlur = r * 0.5; ctx.fill(); ctx.shadowBlur = 0;
    const highlight = ctx.createRadialGradient(x - r*0.3, y - r*0.4, 0, x - r*0.3, y - r*0.4, r*0.4);
    highlight.addColorStop(0, 'rgba(255,255,255,0.9)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.ellipse(x - r*0.3, y - r*0.4, r*0.35, r*0.25, -0.3, 0, Math.PI*2);
    ctx.fillStyle = highlight; ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - r*0.15, y - r*0.6, r*0.15, r*0.1, 0.2, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r*0.8, y - r*0.3, x + r*0.6, y + r*0.4);
    ctx.quadraticCurveTo(x, y + r*1.2, x - r*0.6, y + r*0.4);
    ctx.quadraticCurveTo(x - r*0.8, y - r*0.3, x, y - r);
    ctx.stroke();
  }
  function drawPollutedDrop(x, y, r, age){
    const irregularity = Math.sin(age * 4) * 0.1;
    ctx.beginPath();
    const pollutedGrad = ctx.createRadialGradient(x - r*0.2, y - r*0.3, r*0.1, x, y, r*1.3);
    pollutedGrad.addColorStop(0, '#8b7355');
    pollutedGrad.addColorStop(0.4, '#6b5b47');
    pollutedGrad.addColorStop(0.8, '#4a4037');
    pollutedGrad.addColorStop(1, '#2d2621');
    const points = 8;
    for(let i = 0; i < points; i++){
      const angle = (i / points) * Math.PI * 2;
      const variation = 1 + (Math.sin(angle * 3 + age) * 0.15);
      const px = x + Math.cos(angle) * r * 0.7 * variation;
      const py = y + Math.sin(angle) * r * 0.8 * variation;
      if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = pollutedGrad; ctx.fill();
    for(let i = 0; i < 3; i++){
      ctx.beginPath();
      const px = x + (Math.random() - 0.5) * r;
      const py = y + (Math.random() - 0.5) * r;
      ctx.arc(px, py, r * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(x - r*0.2, y - r*0.3, r*0.2, r*0.12, -0.5, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(139,115,85,0.6)'; ctx.fill();
  }
  function drawDrop(drop){
    const {x,y,size} = drop;
    const age = (Date.now() - drop.birth) / 1000;
    ctx.save();
    const wobble = Math.sin(age * 6) * 0.5;
    ctx.translate(wobble, 0);
    if(drop.polluted) drawPollutedDrop(x, y, size, age); else drawCleanDrop(x, y, size, age);
    ctx.restore();
  }

  function update(dt){
    if(Date.now() - lastSpawn > spawnInterval){
      spawnDrop();
      lastSpawn = Date.now();
      const s = difficultySettings[currentDifficulty];
      const base = s?.spawnInterval || 700;
      const minI = s?.spawnMin || 300;
      const accel = s?.spawnAccel || 12;
      // As the timer counts down, increase spawn rate using difficulty curve
      const elapsed = (s?.roundTime || 30) - timeLeft;
      spawnInterval = Math.max(minI, base - elapsed * accel);
    }
    for(let i=drops.length-1;i>=0;i--){
      const d = drops[i];
      d.speed += d.gravity * dt; d.speed *= d.drag; d.vx *= 0.996;
      d.y += d.speed * dt; d.x += d.vx * dt; d.rotation += d.rotationSpeed;
      if(!d.polluted && d.trail.length < 3) d.trail.push({x: d.x, y: d.y, alpha: 0.5});
      for(let j = d.trail.length - 1; j >= 0; j--) {
        d.trail[j].alpha *= 0.9; if(d.trail[j].alpha < 0.1) d.trail.splice(j, 1);
      }
      const wind = Math.sin(Date.now() * 0.001 + d.x * 0.01) * 5; d.vx += wind * dt;
      if(d.y - d.size > canvas._h + 60){
        drops.splice(i,1);
        if(!d.polluted) waterPercent = Math.max(0, waterPercent - 1.2);
      }
      if(d.x - d.size < 0){ d.x = d.size; d.vx = Math.abs(d.vx) * 0.7; }
      if(d.x + d.size > canvas._w){ d.x = canvas._w - d.size; d.vx = -Math.abs(d.vx) * 0.7; }
    }
  }

  function drawBackground(){
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas._h);
    skyGrad.addColorStop(0, '#87ceeb');
    skyGrad.addColorStop(0.3, '#b8e6ff');
    skyGrad.addColorStop(1, '#e8f4fd');
    ctx.fillStyle = skyGrad; ctx.fillRect(0,0,canvas._w,canvas._h);
    drawCloud(canvas._w * 0.2, canvas._h * 0.15, 40);
    drawCloud(canvas._w * 0.7, canvas._h * 0.25, 35);
    drawCloud(canvas._w * 0.85, canvas._h * 0.1, 25);
  }
  function drawCloud(x, y, size){
    ctx.save(); ctx.fillStyle='rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI*2);
    ctx.arc(x + size * 0.8, y, size * 0.8, 0, Math.PI*2);
    ctx.arc(x - size * 0.6, y, size * 0.7, 0, Math.PI*2);
    ctx.arc(x, y - size * 0.5, size * 0.6, 0, Math.PI*2);
    ctx.fill(); ctx.restore();
  }

  function drawJerryCan(){
    const canW = 140, canH = 80;
    const canX = canvas._w/2 - canW/2;
    const canY = canvas._h - canH - 12;
    ctx.save();
    ctx.shadowColor = 'rgba(7,38,58,0.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    // Main body (rounded rectangle)
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(canX, canY, canW, canH, 16);
    } else {
      ctx.moveTo(canX + 16, canY);
      ctx.lineTo(canX + canW - 16, canY);
      ctx.quadraticCurveTo(canX + canW, canY, canX + canW, canY + 16);
      ctx.lineTo(canX + canW, canY + canH - 16);
      ctx.quadraticCurveTo(canX + canW, canY + canH, canX + canW - 16, canY + canH);
      ctx.lineTo(canX + 16, canY + canH);
      ctx.quadraticCurveTo(canX, canY + canH, canX, canY + canH - 16);
      ctx.lineTo(canX, canY + 16);
      ctx.quadraticCurveTo(canX, canY, canX + 16, canY);
    }
    const canGrad = ctx.createLinearGradient(canX, canY, canX + canW, canY + canH);
    canGrad.addColorStop(0, '#ffe066');
    canGrad.addColorStop(0.5, '#ffd300');
    canGrad.addColorStop(1, '#b8860b');
    ctx.fillStyle = canGrad;
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Handle
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#b8860b';
    ctx.moveTo(canX + canW*0.18, canY - 10);
    ctx.lineTo(canX + canW*0.45, canY - 10);
    ctx.stroke();
    ctx.restore();
    // Cap
    ctx.save();
    ctx.beginPath();
    ctx.arc(canX + canW*0.45, canY - 10, 7, 0, Math.PI*2);
    ctx.fillStyle = '#8b6914';
    ctx.fill();
    ctx.restore();
    // Spout
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(canX + canW*0.45 + 12, canY, 7, 12, 0.2, 0, Math.PI*2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.restore();
    // X emboss (classic jerry can detail)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(canX + 20, canY + 18);
    ctx.lineTo(canX + canW - 20, canY + canH - 18);
    ctx.moveTo(canX + canW - 20, canY + 18);
    ctx.lineTo(canX + 20, canY + canH - 18);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#b8860b';
    ctx.stroke();
    ctx.restore();
    // Label
    ctx.fillStyle = '#07263a'; ctx.font = 'bold 12px Inter, Arial'; ctx.textAlign = 'center';
    ctx.fillText('charity: water', canX + canW/2, canY + canH/2 + 3);
    ctx.restore();
  }

  function drawWaterLevel(){
    if(waterPercent <= 0) return;
    const canW = 140, canH = 80; const canX = canvas._w/2 - canW/2; const canY = canvas._h - canH - 12;
    const waterH = (canH - 10) * (waterPercent / 100);
    const waterY = canY + canH - 5 - waterH;
    ctx.save();
    ctx.beginPath(); if (ctx.roundRect) { ctx.roundRect(canX + 5, canY + 5, canW - 10, canH - 10, 4); } else { ctx.rect(canX + 5, canY + 5, canW - 10, canH - 10); }
    ctx.clip();
    const waterGrad = ctx.createLinearGradient(0, waterY, 0, waterY + waterH);
    waterGrad.addColorStop(0, 'rgba(30,167,234,0.3)'); waterGrad.addColorStop(1, 'rgba(30,167,234,0.6)');
    ctx.fillStyle = waterGrad; ctx.fillRect(canX + 5, waterY, canW - 10, waterH);
    const waveOffset = Date.now() * 0.003;
    ctx.beginPath(); ctx.strokeStyle = 'rgba(30,167,234,0.8)'; ctx.lineWidth = 2;
    for(let x = canX + 5; x < canX + canW - 5; x += 2) {
      const wave = Math.sin((x - canX) * 0.1 + waveOffset) * 1;
      if(x === canX + 5) ctx.moveTo(x, waterY + wave); else ctx.lineTo(x, waterY + wave);
    }
    ctx.stroke(); ctx.restore();
  }

  // Particles
  let particles = [];
  function addParticle(x, y, type = 'positive'){
    particles.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 80 - 20, life: 1.0, maxLife: 1.0, size: Math.random() * 3 + 2, color: type === 'positive' ? '#1ea7ea' : '#ff6b6b' });
  }
  function drawParticleEffects(){
    for(let i = particles.length - 1; i >= 0; i--){
      const p = particles[i];
      p.x += p.vx * 0.016; p.y += p.vy * 0.016; p.vy += 200 * 0.016; p.life -= 0.016;
      if(p.life <= 0){ particles.splice(i, 1); continue; }
      ctx.save(); const alpha = p.life / p.maxLife; ctx.globalAlpha = alpha; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  // Ripples
  let ripples = [];
  function popEffect(x, y){
    for(let i = 0; i < 3; i++){
      ripples.push({ x, y, radius: 0, maxRadius: 28 + i * 10, alpha: 1, delay: i * 0.06, startedAt: performance.now() });
    }
  }
  function drawRipples(now){
    for(let i = ripples.length - 1; i >= 0; i--){
      const r = ripples[i];
      const t = (now - r.startedAt)/1000 - r.delay; if(t < 0) continue;
      r.radius = Math.min(r.maxRadius, t * 120);
      r.alpha = 1 - (r.radius / r.maxRadius);
      if(r.alpha <= 0){ ripples.splice(i,1); continue; }
      ctx.save(); ctx.beginPath(); ctx.strokeStyle = `rgba(30,167,234,${Math.max(0, r.alpha * 0.8)})`; ctx.lineWidth = 2; ctx.arc(r.x, r.y, r.radius, 0, Math.PI*2); ctx.stroke(); ctx.restore();
    }
  }

  function render(now){
    try{
      ctx.clearRect(0,0,canvas._w,canvas._h);
      drawBackground();
      drawJerryCan();
      if(drops && drops.length){ drops.sort((a,b)=> a.y - b.y); for(const d of drops) drawDrop(d); }
      drawWaterLevel();
      if(running && !paused) drawParticleEffects();
      if(running && !paused && typeof drawRipples === 'function') drawRipples(now || performance.now());
    } catch(e){ console.error('Render error:', e); }
  }

  // Main loop
  let lastFrame = performance.now();
  function loop(now){
    const dt = Math.min(0.05, (now - lastFrame)/1000);
    lastFrame = now;
    if(!paused) update(dt);
    render(now);
    animationId = requestAnimationFrame(loop);
  }

  // Pointer
  function handlePointer(evt){
    if(!running) return;
    evt.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    const x = (clientX - rect.left) * (canvas._w / rect.width);
    const y = (clientY - rect.top) * (canvas._h / rect.height);
    for(let i=drops.length-1;i>=0;i--){
      const d = drops[i];
      const dx = d.x - x, dy = d.y - y; const dist = Math.sqrt(dx*dx + dy*dy);
      if(dist < d.size*1.8){
        if(d.polluted){
          lives = Math.max(0, lives - 1); waterPercent = Math.max(0, waterPercent - 10); flashScreen('#fdecea');
          for(let i = 0; i < 5; i++) addParticle(d.x + (Math.random() - 0.5) * 20, d.y + (Math.random() - 0.5) * 20, 'negative');
          try{ sounds.lose.currentTime = 0; sounds.lose.play(); } catch(e){}
        } else {
          score += 10; waterPercent = Math.min(100, waterPercent + 6); popEffect(d.x, d.y); flashScreen('#fff4d9');
          for(let i = 0; i < 8; i++) addParticle(d.x + (Math.random() - 0.5) * 30, d.y + (Math.random() - 0.5) * 30, 'positive');
          try{ sounds.collect.currentTime = 0; sounds.collect.play(); } catch(e){}
          checkMilestones();
        }
        drops.splice(i,1); resetUI(); checkGameOver(); return;
      }
    }
  }
  canvas.addEventListener('click', handlePointer);
  canvas.addEventListener('touchstart', (e)=>{ handlePointer(e); e.preventDefault(); }, {passive:false});

  function flashScreen(color='#fff4d9'){
    const g = document.createElement('div');
    g.style.position='absolute'; g.style.left=0; g.style.top=0; g.style.width='100%'; g.style.height='100%';
    g.style.pointerEvents='none'; g.style.background=color; g.style.opacity='0.16'; g.style.mixBlendMode='screen'; g.style.transition='opacity 400ms ease';
    document.body.appendChild(g);
    setTimeout(()=> g.style.opacity='0', 40);
    setTimeout(()=> document.body.removeChild(g), 500);
  }

  // Timer
  function startTimer(){
    timeLeft = roundTime; timerEl.textContent = timeLeft + 's';
    timerId = setInterval(()=>{
      timeLeft -= 1; if(timeLeft <= 0){ timeLeft = 0; endRound(); }
      resetUI();
    },1000);
  }
  function stopTimer(){ if(timerId) clearInterval(timerId); timerId = null; }

  // Round control
  function startRound(){
    try{
      // Apply difficulty settings
  const settings = difficultySettings[currentDifficulty];
  spawnInterval = settings.spawnInterval; // starting interval per difficulty
  lives = settings.lives;
  timeLeft = settings.roundTime;
      milestonesReached = [];
      
      drops = []; lastSpawn = 0; running = true; paused = false; score = 0; waterPercent = 0;
      resetUI(); results.classList.remove('show');
      setupCanvas();
      startTimer(); cancelAnimationFrame(animationId); lastFrame = performance.now(); animationId = requestAnimationFrame(loop);
      startBtn.textContent = 'Playing...'; startBtn.disabled = true;
      if(pauseBtn){ pauseBtn.disabled = false; pauseBtn.textContent = 'Pause'; }
      const po = document.getElementById('pauseOverlay'); if (po){ po.classList.remove('show'); po.setAttribute('aria-hidden','true'); }
    } catch(e){
      console.error('Error starting game:', e); startBtn.textContent = 'Start Round'; startBtn.disabled = false; if(pauseBtn){ pauseBtn.disabled = true; pauseBtn.textContent = 'Pause'; }
    }
  }
  function endRound(){
    running = false; paused = false; stopTimer(); cancelAnimationFrame(animationId);
    startBtn.textContent = 'Start Round'; startBtn.disabled = false; if(pauseBtn){ pauseBtn.disabled = true; pauseBtn.textContent = 'Pause'; }
    const po2 = document.getElementById('pauseOverlay'); if (po2){ po2.classList.remove('show'); po2.setAttribute('aria-hidden','true'); }
    const coins = Math.max(0, Math.floor(score / 50));
    results.classList.add('show');
    resultsTitle.textContent = waterPercent >= 100 ? 'Well Built!' : 'Round Complete';
    resultsStats.textContent = `Score: ${score} • Water: ${Math.round(waterPercent)}% • Lives: ${lives}`;
    const facts = [
      'Clean water improves health and reduces child mortality.',
      'Women and girls often walk miles to collect water — building wells changes lives.',
      'An investment in water and sanitation reduces health care costs and boosts education.'
    ];
    levelFact.textContent = facts[Math.floor(Math.random()*facts.length)];
    modalCoins.textContent = coins; canvas._lastCoins = coins;
  }
  function resetGame(){
    running = false; paused = false; stopTimer(); drops = []; score = 0; lives = 3; waterPercent = 0; timeLeft = roundTime;
    results.classList.remove('show'); resetUI(); cancelAnimationFrame(animationId);
    startBtn.textContent = 'Start Round'; startBtn.disabled = false; if(pauseBtn){ pauseBtn.disabled = true; pauseBtn.textContent = 'Pause'; }
    const po3 = document.getElementById('pauseOverlay'); if (po3){ po3.classList.remove('show'); po3.setAttribute('aria-hidden','true'); }
    setupCanvas(); drawWelcomeScreen();
  }
  function checkGameOver(){ if(lives <= 0 || waterPercent >= 100) endRound(); }

  // Controls and handlers
  startBtn.addEventListener('click', startRound);
  if(pauseBtn){ pauseBtn.addEventListener('click', ()=>{ if(!running && !paused) return; if(paused) resumeGame(); else pauseGame(); }); }
  resetBtn.addEventListener('click', resetGame);

  fullscreenBtn.addEventListener('click', toggleFullscreen);
  
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }
  
  function toggleFullscreen(){
    if (!isFullscreen()) {
      if (siteElement.requestFullscreen) {
        siteElement.requestFullscreen().catch(err => console.log('Fullscreen request failed:', err));
      } else if (siteElement.webkitRequestFullscreen) {
        siteElement.webkitRequestFullscreen();
      } else if (siteElement.mozRequestFullScreen) {
        siteElement.mozRequestFullScreen();
      } else if (siteElement.msRequestFullscreen) {
        siteElement.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.log('Exit fullscreen failed:', err));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }
  
  function updateFullscreenIcon(){
    const iconPath = fullscreenIcon.querySelector('path');
    if (!iconPath) return;
    
    if (isFullscreen()) {
      iconPath.setAttribute('d', 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z');
      fullscreenBtn.title = 'Exit Fullscreen (F)';
      fullscreenBtn.setAttribute('aria-label', 'Exit fullscreen mode');
    } else {
      iconPath.setAttribute('d', 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z');
      fullscreenBtn.title = 'Fullscreen (F)';
      fullscreenBtn.setAttribute('aria-label', 'Toggle fullscreen mode');
    }
  }
  
  document.addEventListener('fullscreenchange', ()=>{ updateFullscreenIcon(); setTimeout(setupCanvas, 100); });
  document.addEventListener('webkitfullscreenchange', ()=>{ updateFullscreenIcon(); setTimeout(setupCanvas, 100); });
  document.addEventListener('mozfullscreenchange', ()=>{ updateFullscreenIcon(); setTimeout(setupCanvas, 100); });
  document.addEventListener('msfullscreenchange', ()=>{ updateFullscreenIcon(); setTimeout(setupCanvas, 100); });
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'f' || e.key === 'F') {
      if (e.target === canvas || siteElement.contains(e.target)) { e.preventDefault(); toggleFullscreen(); }
    }
    if (e.key === 'p' || e.key === 'P') {
      if (running || paused) { e.preventDefault(); if (paused) resumeGame(); else pauseGame(); }
    }
  });

  function pauseGame(){
    if(paused || !running) return;
    paused = true; stopTimer();
    const po = document.getElementById('pauseOverlay'); if (po){ po.classList.add('show'); po.setAttribute('aria-hidden','false'); }
    if (pauseBtn) pauseBtn.textContent = 'Resume';
  }
  function resumeGame(){
    if(!paused) return;
    paused = false; startTimer(); lastFrame = performance.now();
    const po = document.getElementById('pauseOverlay'); if (po){ po.classList.remove('show'); po.setAttribute('aria-hidden','true'); }
    if (pauseBtn) pauseBtn.textContent = 'Pause';
  }

  // results actions
  claimBtn.addEventListener('click', openModal);
  document.getElementById('shareBtn').addEventListener('click', ()=>{
    const shareText = `I just scored ${score} points in Ripple Effect! 🌊 Playing games for clean water access. #RippleEffect #CharityWater`;
    if (navigator.share) {
      navigator.share({ title: 'Ripple Effect Game', text: shareText, url: window.location.href });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText + ' ' + window.location.href);
      alert('Score shared to clipboard!');
    } else {
      alert(shareText);
    }
  });
  closeModal.addEventListener('click', ()=> closeModalFn());
  document.getElementById('closeClaim').addEventListener('click', ()=> closeModalFn());
  confirmClaim.addEventListener('click', ()=>{
    const code = 'RW-' + Math.random().toString(36).slice(2,7).toUpperCase() + '-25';
    claimCode.textContent = code; claimCodeArea.style.display = 'block';
  });

  // Modal focus management
  let lastFocusedEl = null; let modalKeyHandler = null;
  function trapFocus(e){
    if(e.key !== 'Tab') return;
    const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if(!focusables.length) return;
    const first = focusables[0]; const last = focusables[focusables.length - 1];
    if(e.shiftKey){ if(document.activeElement === first){ e.preventDefault(); last.focus(); } }
    else { if(document.activeElement === last){ e.preventDefault(); first.focus(); } }
  }
  function openModal(){
    lastFocusedEl = document.activeElement; modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false');
    claimCodeArea.style.display = 'none'; claimCode.textContent = '';
    modalKeyHandler = (e)=> trapFocus(e); modal.addEventListener('keydown', modalKeyHandler);
    confirmClaim.focus();
  }
  function closeModalFn(){
    modal.style.display = 'none'; modal.setAttribute('aria-hidden','true');
    if(modalKeyHandler){ modal.removeEventListener('keydown', modalKeyHandler); modalKeyHandler=null; }
    if(lastFocusedEl){ lastFocusedEl.focus(); }
  }

  // Initialize
  function drawWaterDropIcon(x, y){
    ctx.save(); const r = 25;
    const dropGrad = ctx.createRadialGradient(x - r*0.3, y - r*0.5, r*0.1, x, y, r*1.4);
    dropGrad.addColorStop(0, '#e6f9ff'); dropGrad.addColorStop(0.3, '#7dd3fc'); dropGrad.addColorStop(0.7, '#0ea5e9'); dropGrad.addColorStop(1, '#0284c7');
    ctx.beginPath(); ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r*0.8, y - r*0.3, x + r*0.6, y + r*0.4);
    ctx.quadraticCurveTo(x, y + r*1.2, x - r*0.6, y + r*0.4);
    ctx.quadraticCurveTo(x - r*0.8, y - r*0.3, x, y - r);
    ctx.fillStyle = dropGrad; ctx.fill();
    ctx.shadowColor = 'rgba(14, 165, 233, 0.4)'; ctx.shadowBlur = 15; ctx.fill(); ctx.shadowBlur = 0;
    const highlight = ctx.createRadialGradient(x - r*0.3, y - r*0.4, 0, x - r*0.3, y - r*0.4, r*0.4);
    highlight.addColorStop(0, 'rgba(255,255,255,0.9)'); highlight.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.ellipse(x - r*0.3, y - r*0.4, r*0.35, r*0.25, -0.3, 0, Math.PI*2); ctx.fillStyle = highlight; ctx.fill(); ctx.restore();
  }
  function drawMiniJerryCan(){
    const canW = 80, canH = 50;
    const canX = canvas._w/2 - canW/2;
    const canY = canvas._h - canH - 20;
    ctx.save(); ctx.globalAlpha = 0.7;
    // Main body
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(canX, canY, canW, canH, 10);
    } else {
      ctx.moveTo(canX + 10, canY);
      ctx.lineTo(canX + canW - 10, canY);
      ctx.quadraticCurveTo(canX + canW, canY, canX + canW, canY + 10);
      ctx.lineTo(canX + canW, canY + canH - 10);
      ctx.quadraticCurveTo(canX + canW, canY + canH, canX + canW - 10, canY + canH);
      ctx.lineTo(canX + 10, canY + canH);
      ctx.quadraticCurveTo(canX, canY + canH, canX, canY + canH - 10);
      ctx.lineTo(canX, canY + 10);
      ctx.quadraticCurveTo(canX, canY, canX + 10, canY);
    }
    const canGrad = ctx.createLinearGradient(canX, canY, canX + canW, canY + canH);
    canGrad.addColorStop(0, '#ffe066');
    canGrad.addColorStop(0.5, '#ffd300');
    canGrad.addColorStop(1, '#b8860b');
    ctx.fillStyle = canGrad;
    ctx.fill();
    // Handle
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#b8860b';
    ctx.moveTo(canX + canW*0.18, canY - 6);
    ctx.lineTo(canX + canW*0.45, canY - 6);
    ctx.stroke();
    ctx.restore();
    // Cap
    ctx.save();
    ctx.beginPath();
    ctx.arc(canX + canW*0.45, canY - 6, 4, 0, Math.PI*2);
    ctx.fillStyle = '#8b6914';
    ctx.fill();
    ctx.restore();
    // Spout
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(canX + canW*0.45 + 7, canY, 4, 7, 0.2, 0, Math.PI*2);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.restore();
    // X emboss
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(canX + 10, canY + 8);
    ctx.lineTo(canX + canW - 10, canY + canH - 8);
    ctx.moveTo(canX + canW - 10, canY + 8);
    ctx.lineTo(canX + 10, canY + canH - 8);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#b8860b';
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  function drawWelcomeScreen(){
    drawBackground();
    ctx.save();
    ctx.fillStyle = '#07263a'; ctx.font = 'bold 32px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const centerX = canvas._w / 2; const centerY = canvas._h / 2 - 20;
    ctx.shadowColor = 'rgba(7,38,58,0.2)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.fillText('charity: water', centerX, centerY);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#1ea7ea'; ctx.font = '16px Inter, sans-serif'; ctx.fillText('Ripple Effect Game', centerX, centerY + 40);
    drawWaterDropIcon(centerX, centerY - 60);
    ctx.fillStyle = '#6b7b85'; ctx.font = '14px Inter, sans-serif'; ctx.fillText('Click "Start Round" to begin playing', centerX, centerY + 80);
    drawMiniJerryCan();
    ctx.restore();
  }

  function initializeGame(){
    resetUI(); setupCanvas(); drawWelcomeScreen();
    document.addEventListener('visibilitychange', ()=>{ if(document.hidden && running && !paused){ pauseGame(); } });
  }
  
  // Milestone checking
  function checkMilestones(){
    milestones.forEach(milestone => {
      if (score >= milestone && !milestonesReached.includes(milestone)) {
        milestonesReached.push(milestone);
        showMilestoneNotification(`🎉 ${milestone} Points Milestone!`);
  try{ sounds.milestone.currentTime = 0; sounds.milestone.play(); } catch(e){}
      }
    });
  }
  
  function showMilestoneNotification(message){
    const notification = document.getElementById('milestoneNotification');
    if (!notification) return;
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
  }
  
  // Difficulty selector handlers
  document.querySelectorAll('.btn-difficulty').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-difficulty').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.dataset.difficulty;
      if (!running) {
        const settings = difficultySettings[currentDifficulty];
        lives = settings.lives;
        resetUI();
      }
    });
  });

  // Accessibility & hints
  canvas.addEventListener('keydown', (e)=>{ if(e.key === ' ' || e.key === 'Enter') startRound(); });
  (function firstHint(){ const btn = document.getElementById('startBtn'); btn.classList.add('pulse'); setTimeout(()=> btn.classList.remove('pulse'), 2500); })();

  // Close modal with Escape
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape'){
      if (modal && modal.style.display === 'flex') {
        modal.style.display = 'none'; modal.setAttribute('aria-hidden','true');
      }
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeGame, { once: true }); else initializeGame();
})();
