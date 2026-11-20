/* 나이테 우체국 — 3D 배경 (Three.js r128)
 * 나이테가 새겨진 그루터기 + 궤도를 도는 편지 봉투 + 퍼져나가는 나이테 물결 + 반딧불
 * window.NaiteScene.setMode('home' | 'page'), window.NaiteScene.burst()
 */
(function () {
  'use strict';
  const api = { setMode() {}, burst() {}, setRings() {} };
  window.NaiteScene = api;

  const canvas = document.getElementById('bg3d');
  if (!canvas || !window.THREE) return;
  const THREE = window.THREE;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { canvas.remove(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.documentElement.classList.add('has-3d');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1512, 10, 26);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  // ---------- 조명 ----------
  scene.add(new THREE.HemisphereLight(0xffe6c2, 0x0c1a14, 0.75));
  const key = new THREE.DirectionalLight(0xffd8a0, 1.15);
  key.position.set(4, 7, 5); scene.add(key);
  const warm = new THREE.PointLight(0xff7a45, 1.6, 18);
  warm.position.set(-3.5, 1.5, 2.5); scene.add(warm);
  const cool = new THREE.PointLight(0x5fd0a0, 0.9, 18);
  cool.position.set(4, -1, -3); scene.add(cool);

  // ---------- 텍스처 (캔버스로 직접 그림) ----------
  function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function ringTexture(highlight = 0) {
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); const r = rand(7); const C = S / 2;
    g.fillStyle = '#6b4325'; g.fillRect(0, 0, S, S);
    let radius = C - 6; let i = 0;
    const glowRings = [];
    while (radius > 8) {
      if (i > 0 && i <= highlight) glowRings.push(radius);
      const t = radius / C;
      g.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.04; a += 0.04) {
        const wob = Math.sin(a * 3 + i) * 2.2 + Math.sin(a * 7 + i * 0.7) * 1.3 + (r() - 0.5) * 1.2;
        const rr = radius + wob;
        g.lineTo(C + Math.cos(a) * rr, C + Math.sin(a) * rr);
      }
      g.closePath();
      const light = 56 + (1 - t) * 14 - (i % 2 ? 7 : 0) + r() * 4;
      g.fillStyle = `hsl(${28 + (1 - t) * 8}, ${48 + t * 8}%, ${light}%)`;
      g.fill();
      g.strokeStyle = `rgba(92, 52, 22, ${0.35 + r() * 0.3})`;
      g.lineWidth = 1.5 + r() * 2.5; g.stroke();
      radius -= 9 + r() * 15; i++;
    }
    // 내 나이테 (바깥쪽부터 금빛으로)
    glowRings.forEach((rad, k) => {
      g.beginPath(); g.arc(C, C, rad, 0, Math.PI * 2);
      g.strokeStyle = k === 0 ? 'rgba(255,225,140,.95)' : 'rgba(255,200,100,.6)';
      g.lineWidth = k === 0 ? 7 : 4; g.shadowColor = 'rgba(255,190,80,.9)'; g.shadowBlur = 18; g.stroke();
    });
    g.shadowBlur = 0;
    // 가장 바깥 껍질 테두리
    g.lineWidth = 14; g.strokeStyle = '#3b2414';
    g.beginPath(); g.arc(C, C, C - 7, 0, Math.PI * 2); g.stroke();
    // 가운데 갈라짐
    g.strokeStyle = 'rgba(60,30,10,.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(C, C); g.lineTo(C + 180, C - 60); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function barkTexture() {
    const W = 512, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); const r = rand(3);
    g.fillStyle = '#3a2416'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 3 + r() * 6) {
      g.fillStyle = `rgba(${90 + r() * 40}, ${55 + r() * 25}, ${30 + r() * 15}, ${0.35 + r() * 0.4})`;
      g.fillRect(x, 0, 1 + r() * 3, H);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(4, 1); tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function envelopeTexture(hue) {
    const W = 256, H = 170, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff6e6'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(160,120,80,.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(4, 4); g.lineTo(W / 2, H * 0.58); g.lineTo(W - 4, 4); g.stroke();
    g.beginPath(); g.moveTo(4, H - 4); g.lineTo(W * 0.4, H * 0.5); g.moveTo(W - 4, H - 4); g.lineTo(W * 0.6, H * 0.5); g.stroke();
    // 우표
    g.fillStyle = `hsl(${hue}, 70%, 52%)`; g.fillRect(W - 62, 14, 44, 52);
    g.strokeStyle = '#fff'; g.setLineDash([4, 4]); g.lineWidth = 3; g.strokeRect(W - 62, 14, 44, 52); g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(W - 40, 40, 10, 0, Math.PI * 2); g.fill();
    // 봉랍(빨간 실링)
    g.fillStyle = '#c8412d'; g.beginPath(); g.arc(W / 2, H * 0.58, 15, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    return tex;
  }

  // ---------- 그루터기 ----------
  const world = new THREE.Group(); scene.add(world);
  const stump = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.6, 1.0, 96, 1),
    [
      new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ map: ringTexture(), roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: 0x24160d, roughness: 1 }),
    ],
  );
  world.add(stump);

  // 나이테 위에 놓인 작은 빨간 우체통
  const box = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xd2412b, roughness: 0.45, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 32), red);
  body.position.y = 0.95;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), red);
  cap.position.y = 1.4;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x1b0d08 }));
  slot.position.set(0, 1.18, 0.33);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.12, 32), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 }));
  base.position.y = 0.56;
  box.add(body, cap, slot, base);
  box.position.set(0.55, 0, 0.35);
  world.add(box);

  // ---------- 나이테 물결 ----------
  const ripples = [];
  function spawnRipple(strength = 1) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(2.5, 0.025 * strength, 8, 120),
      new THREE.MeshBasicMaterial({ color: 0xffc56b, transparent: true, opacity: 0.85 }),
    );
    m.rotation.x = Math.PI / 2; m.position.y = 0.5;
    m.userData.t = 0; m.userData.s = strength;
    world.add(m); ripples.push(m);
  }

  // ---------- 궤도 편지 ----------
  const envelopes = [];
  const hues = [8, 145, 38, 200, 330, 20, 95];
  for (let i = 0; i < 9; i++) {
    const tex = envelopeTexture(hues[i % hues.length]);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.52),
      new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }),
    );
    m.userData = {
      r: 3.1 + (i % 3) * 0.75,
      a: (i / 9) * Math.PI * 2,
      speed: (0.12 + (i % 4) * 0.035) * (i % 2 ? 1 : -1) * 0.8,
      y: 0.6 + Math.sin(i * 1.7) * 1.1,
      bob: 0.6 + (i % 3) * 0.3,
      spin: 0.4 + (i % 5) * 0.15,
    };
    world.add(m); envelopes.push(m);
  }

  // 편지를 보내면 날아드는 봉투
  const flyers = [];
  function spawnFlyer() {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.47),
      new THREE.MeshStandardMaterial({ map: envelopeTexture(8), side: THREE.DoubleSide }),
    );
    m.position.set(-4, -3, 4); m.userData.t = 0;
    world.add(m); flyers.push(m);
  }

  // ---------- 반딧불 ----------
  const N = 140;
  const pos = new Float32Array(N * 3);
  const seeds = [];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = (Math.random() - 0.3) * 9;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    seeds.push(Math.random() * 10);
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,230,160,1)'); gr.addColorStop(0.3, 'rgba(255,200,110,.6)'); gr.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const points = new THREE.Points(pgeo, new THREE.PointsMaterial({
    size: 0.22, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(points);

  // ---------- 카메라·모드 ----------
  const modes = {
    home: { cam: new THREE.Vector3(0, 3.1, 9.2), look: new THREE.Vector3(0, 0.2, 0), world: new THREE.Vector3(0, -1.3, 0) },
    page: { cam: new THREE.Vector3(0, 5.5, 12.5), look: new THREE.Vector3(0, 0, 0), world: new THREE.Vector3(0, -2.6, -2) },
  };
  let mode = 'home';
  const camTarget = modes.home.cam.clone();
  const lookTarget = modes.home.look.clone();
  const look = modes.home.look.clone();
  camera.position.copy(camTarget);
  world.position.copy(modes.home.world);

  api.setMode = (m) => { mode = modes[m] ? m : 'page'; document.documentElement.dataset.scene = mode; };
  api.burst = () => { spawnFlyer(); };
  let ringsShown = -1;
  api.setRings = (n) => {
    const h = Math.max(0, Math.min(24, n | 0));
    if (h === ringsShown) return;
    ringsShown = h;
    const top = stump.material[1];
    const old = top.map; top.map = ringTexture(h); top.needsUpdate = true;
    if (old) old.dispose();
    if (h > 0) spawnRipple(1.8);
  };

  // 시차 (마우스·기울기)
  const tilt = { x: 0, y: 0 }; const tiltS = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    tilt.x = (e.clientX / innerWidth - 0.5) * 2; tilt.y = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    tilt.x = Math.max(-1, Math.min(1, e.gamma / 30)); tilt.y = Math.max(-1, Math.min(1, (e.beta - 40) / 30));
  }, { passive: true });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 세로 화면에서는 조금 더 멀리
    camera.fov = w < h ? 50 : 38;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // ---------- 루프 ----------
  const clock = new THREE.Clock();
  let rippleClock = 0; let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); loop(); } });

  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const k = reduce ? 0.15 : 1;

    // 모드 전환 보간
    const M = modes[mode];
    camTarget.lerp(M.cam, 0.04); lookTarget.lerp(M.look, 0.04);
    world.position.lerp(M.world, 0.04);
    tiltS.x += (tilt.x - tiltS.x) * 0.05; tiltS.y += (tilt.y - tiltS.y) * 0.05;
    camera.position.set(camTarget.x + tiltS.x * 1.2, camTarget.y - tiltS.y * 0.6, camTarget.z);
    look.copy(lookTarget); camera.lookAt(look);

    stump.rotation.y += dt * 0.08 * k;
    box.rotation.y = stump.rotation.y;
    box.position.set(Math.cos(-stump.rotation.y + 0.6) * 0.65, 0, Math.sin(-stump.rotation.y + 0.6) * 0.65);

    envelopes.forEach((m, i) => {
      const u = m.userData; u.a += u.speed * dt * k;
      m.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * u.bob + i) * 0.25, Math.sin(u.a) * u.r);
      m.rotation.set(Math.sin(t * 0.5 + i) * 0.25, -u.a + Math.PI / 2, Math.sin(t * u.spin + i) * 0.2);
    });

    // 주기적인 잔잔한 물결
    rippleClock += dt;
    if (rippleClock > (reduce ? 9 : 3.2)) { rippleClock = 0; spawnRipple(1); }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const m = ripples[i]; m.userData.t += dt * 0.35;
      const s = 1 + m.userData.t * 1.6; m.scale.set(s, s, s);
      m.material.opacity = Math.max(0, 0.75 * (1 - m.userData.t));
      if (m.userData.t >= 1) { world.remove(m); m.geometry.dispose(); m.material.dispose(); ripples.splice(i, 1); }
    }

    // 날아드는 편지 → 우체통 → 큰 물결
    for (let i = flyers.length - 1; i >= 0; i--) {
      const m = flyers[i]; m.userData.t += dt * 0.55;
      const p = Math.min(m.userData.t, 1); const e = 1 - Math.pow(1 - p, 3);
      const target = new THREE.Vector3().copy(box.position).add(new THREE.Vector3(0, 1.2, 0.3));
      m.position.set(-4 + (target.x + 4) * e, -3 + (target.y + 3) * e + Math.sin(p * Math.PI) * 2.2, 4 + (target.z - 4) * e);
      m.rotation.set(p * 6, p * 3, p * 2); m.scale.setScalar(1 - p * 0.75);
      if (p >= 1) {
        world.remove(m); m.geometry.dispose(); m.material.dispose(); flyers.splice(i, 1);
        spawnRipple(2.4); setTimeout(() => spawnRipple(1.6), 260); setTimeout(() => spawnRipple(1.2), 520);
      }
    }

    // 반딧불
    const arr = pgeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] += Math.sin(t * 0.6 + seeds[i]) * 0.0035 * k;
      arr[i * 3] += Math.cos(t * 0.4 + seeds[i]) * 0.0025 * k;
    }
    pgeo.attributes.position.needsUpdate = true;
    points.material.opacity = 0.6 + Math.sin(t * 1.3) * 0.25;

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  spawnRipple(1);
  loop();
})();
