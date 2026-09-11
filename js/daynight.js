import * as THREE from 'three';

/**
 * 昼夜循环系统
 * - 太阳/月亮绕场景旋转
 * - 星空（夜晚可见）
 * - 天空色、雾色、环境光/方向光随时间平滑渐变
 * - 一天 240 秒（可配置）
 */
export class DayNightCycle {
  constructor(scene, { dayLength = 240, startTime = 0.28 } = {}) {
    this.scene = scene;
    this.dayLength = dayLength; // 秒
    this.time = startTime; // 0~1, 0=黎明, 0.25=正午, 0.5=黄昏, 0.75=午夜
    this.sunAngle = 0;
    // 儿童模式：永远明亮的上午（0.28 ≈ 上午 9 点）
    this.alwaysDay = true;
    this.DAY_FIXED_TIME = 0.28;

    // 方向光（太阳）
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.position.set(50, 100, 50);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // 环境光（略提亮，让暗部柔和、不死黑，儿童向更明快）
    this.ambient = new THREE.AmbientLight(0xffffff, 0.62);
    scene.add(this.ambient);

    // 半球光（天/地色反射）：天空暖蓝、地面嫩草绿
    this.hemi = new THREE.HemisphereLight(0xbfe0ff, 0x6a8a4a, 0.55);
    scene.add(this.hemi);

    // 太阳 mesh（自发光方块）
    const sunGeo = new THREE.BoxGeometry(8, 8, 8);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee88, fog: false });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    scene.add(this.sunMesh);

    // 太阳柔和光晕（暖色径向渐变 Sprite，始终朝向相机）
    this.sunGlowTex = this._makeGlowTexture();
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.sunGlowTex, color: 0xffe9b0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.9,
    }));
    this.sunGlow.scale.set(90, 90, 1);
    scene.add(this.sunGlow);

    // 月亮 mesh
    const moonGeo = new THREE.BoxGeometry(6, 6, 6);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xddddf0, fog: false });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    scene.add(this.moonMesh);

    // 星空
    this._createStars();

    // 体素云（方块感白云，缓慢漂移）
    this._createClouds();
  }

  /** 生成柔和径向光晕贴图（太阳/暖色辉光用） */
  _makeGlowTexture() {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,246,214,0.95)');
    grad.addColorStop(0.25, 'rgba(255,232,170,0.55)');
    grad.addColorStop(0.6, 'rgba(255,214,140,0.18)');
    grad.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  _createClouds() {
    this.clouds = [];
    // 用白色半透明方块拼出几朵蓬松的体素云，分布在玩家周围高空
    const N = 9;                 // 云朵数量
    const SPREAD = 260;          // 水平分布半径
    const CLOUD_Y = 78;          // 云的高度
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
    for (let i = 0; i < N; i++) {
      const g = new THREE.Group();
      const w = 4 + ((Math.random() * 4) | 0);   // 宽 4~7 块
      const d = 3 + ((Math.random() * 3) | 0);   // 深 3~5 块
      for (let x = 0; x < w; x++) {
        for (let z = 0; z < d; z++) {
          // 边缘做一点高低错落，像蓬松的云团
          const edge = (x === 0 || x === w - 1 || z === 0 || z === d - 1);
          if (edge && Math.random() < 0.45) continue;
          const top = (Math.random() < 0.4) ? 1 : 0;
          for (let y = 0; y <= top; y++) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 4), cloudMat);
            m.position.set(x * 4 - w * 2, y * 2, z * 4 - d * 2);
            g.add(m);
          }
        }
      }
      g.position.set((Math.random() - 0.5) * SPREAD * 2, CLOUD_Y + Math.random() * 8, (Math.random() - 0.5) * SPREAD * 2);
      g.userData.speed = 0.6 + Math.random() * 0.7;  // 漂移速度
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  _createStars() {    const count = 800;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // 随机分布在半球天空
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.9 + 0.05);
      const r = 300;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 20;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  /** 时间 t: 0~1 → 太阳高度角 (-π/2 ~ 3π/2) */
  _updateSun(dt) {
    // 儿童常亮模式：时间固定在明亮上午，太阳不移动
    if (!this.alwaysDay) this.time = (this.time + dt / this.dayLength) % 1;
    else this.time = this.DAY_FIXED_TIME;
    // 太阳角度：t=0 时日出(角度0=东方地平)，t=0.25 正午(π/2)，t=0.5 日落(π)，t=0.75 午夜(-π/2)
    const angle = this.time * Math.PI * 2 - Math.PI / 2;
    this.sunAngle = angle;
    const r = 200;
    const sx = Math.cos(angle) * r;
    const sy = Math.sin(angle) * r;
    const sz = 40;
    this.sunMesh.position.set(sx, sy, sz);
    this.sunLight.position.set(sx, sy, sz);
    this.sunLight.target.position.set(0, 0, 0);

    // 月亮在太阳对面
    this.moonMesh.position.set(-sx, -sy, sz);
    // 光晕跟随太阳
    if (this.sunGlow) {
      this.sunGlow.position.set(sx * 0.9, sy * 0.9, sz);
      // 太阳高度越低（日出日落）光晕越大越柔；地平线下隐藏
      const h = Math.max(0, Math.sin(angle));
      this.sunGlow.visible = h > 0.02;
      this.sunGlow.material.opacity = 0.55 + h * 0.4;
      const sc = 90 + (1 - h) * 40;
      this.sunGlow.scale.set(sc, sc, 1);
    }
  }

  /** 根据时间返回天色、光强等关键值 */
  _getPhase() {
    const t = this.time;
    // 定义关键时间点
    // 0.00 日出, 0.08 早晨, 0.25 正午, 0.42 下午, 0.50 日落, 0.58 黄昏, 0.75 午夜, 0.92 凌晨
    const phases = [
      { t: 0.00, sky: new THREE.Color(0xff8866), fog: new THREE.Color(0xff9977), amb: 0.35, sun: 0.6, hemi: 0.3 },   // 日出
      { t: 0.08, sky: new THREE.Color(0x88bbff), fog: new THREE.Color(0xaaccff), amb: 0.55, sun: 1.0, hemi: 0.5 },   // 早晨
      { t: 0.25, sky: new THREE.Color(0x77aadd), fog: new THREE.Color(0x99bbee), amb: 0.65, sun: 1.2, hemi: 0.55 },  // 正午
      { t: 0.42, sky: new THREE.Color(0x88bbff), fog: new THREE.Color(0xaaccff), amb: 0.55, sun: 1.0, hemi: 0.5 },   // 下午
      { t: 0.50, sky: new THREE.Color(0xff7744), fog: new THREE.Color(0xff8866), amb: 0.35, sun: 0.6, hemi: 0.3 },   // 日落
      { t: 0.58, sky: new THREE.Color(0x332244), fog: new THREE.Color(0x443355), amb: 0.2, sun: 0.15, hemi: 0.15 }, // 黄昏
      { t: 0.75, sky: new THREE.Color(0x0a0a1e), fog: new THREE.Color(0x0e0e22), amb: 0.1, sun: 0.05, hemi: 0.08 }, // 午夜
      { t: 0.92, sky: new THREE.Color(0x222244), fog: new THREE.Color(0x333355), amb: 0.18, sun: 0.1, hemi: 0.12 },  // 凌晨
    ];

    // 找到 t 所在的两个阶段，做线性插值
    let a = phases[phases.length - 1], b = phases[0];
    for (let i = 0; i < phases.length; i++) {
      const next = phases[(i + 1) % phases.length];
      const curT = phases[i].t;
      let nextT = next.t;
      if (nextT <= curT) nextT += 1;
      let tt = t;
      if (tt < curT) tt += 1;
      if (tt >= curT && tt <= nextT) {
        a = phases[i];
        b = next;
        const f = (tt - curT) / (nextT - curT);
        return {
          sky: a.sky.clone().lerp(b.sky, f),
          fog: a.fog.clone().lerp(b.fog, f),
          amb: a.amb + (b.amb - a.amb) * f,
          sun: a.sun + (b.sun - a.sun) * f,
          hemi: a.hemi + (b.hemi - a.hemi) * f,
        };
      }
    }
    return { sky: phases[2].sky, fog: phases[2].fog, amb: 0.65, sun: 1.2, hemi: 0.55 };
  }

  update(dt, camera, opts = {}) {
    this._updateSun(dt);

    const p = this._getPhase();

    // 天空与雾色（昼夜系统主导；天气系统会通过 setSkyTint 叠加微调）
    const sky = p.sky.clone();
    const fog = p.fog.clone();
    if (this._skyTint) {
      sky.lerp(this._skyTint, this._skyTintAmt);
      fog.lerp(this._skyTint, this._skyTintAmt);
    }
    // 群系雾色（空气透视）：白天明亮时段，把远景雾轻微染成当前群系色调
    if (opts.biomeFogColor != null && this.sunAngle > 0) {
      const dayAmt = Math.min(1, Math.max(0, Math.sin(this.sunAngle))); // 地平线附近减弱
      const tint = opts.biomeFogColor instanceof THREE.Color
        ? opts.biomeFogColor
        : new THREE.Color(opts.biomeFogColor);
      fog.lerp(tint, 0.45 * dayAmt);
      sky.lerp(tint, 0.18 * dayAmt);
    }
    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color = fog;

    // 光照
    this.ambient.intensity = p.amb;
    this.sunLight.intensity = p.sun;
    this.hemi.intensity = p.hemi;

    // 太阳/月亮颜色随阶段微调
    if (this.sunAngle > 0) {
      // 白天：暖调阳光（略偏奶油白），配合更高环境光让阴影柔和不死黑
      this.sunLight.color.setHex(0xfff6e0);
      this.sunMesh.visible = true;
      this.moonMesh.visible = false;
    } else {
      // 夜晚：月亮给点冷光
      this.sunLight.color.setHex(0x8899ff);
      this.sunMesh.visible = false;
      this.moonMesh.visible = true;
    }

    // 星空可见度（夜晚淡入）
    const nightFactor = Math.max(0, Math.min(1, -(Math.sin(this.sunAngle)) * 1.5 + 0.3));
    this.stars.material.opacity = nightFactor;
    this.stars.visible = nightFactor > 0.01;

    // 星空跟随玩家
    if (camera) {
      this.stars.position.copy(camera.position);
      // 体素云缓慢向东漂移；整体跟随玩家位置（在玩家周围范围内循环）
      const SPREAD = 260;
      for (const c of this.clouds) {
        c.position.x += c.userData.speed * dt;
        // 相对玩家的位置，超出范围则绕回，保持始终有云在头顶
        let rx = c.position.x - camera.position.x;
        let rz = c.position.z - camera.position.z;
        if (rx > SPREAD) c.position.x -= SPREAD * 2;
        if (rx < -SPREAD) c.position.x += SPREAD * 2;
        if (rz > SPREAD) c.position.z -= SPREAD * 2;
        if (rz < -SPREAD) c.position.z += SPREAD * 2;
      }
      // 夜晚云变暗一点（与天色协调）
      const dayAmt = Math.min(1, Math.max(0, Math.sin(this.sunAngle) * 1.3 + 0.1));
      for (const c of this.clouds) {
        for (const m of c.children) {
          m.material.opacity = 0.25 + 0.6 * dayAmt;
        }
      }
    }
  }

  /** 天气系统调用：叠加天色（如下雨偏灰） */
  setSkyTint(color, amount = 0.3) {
    if (color) {
      this._skyTint = color instanceof THREE.Color ? color : new THREE.Color(color);
      this._skyTintAmt = amount;
    } else {
      this._skyTint = null;
      this._skyTintAmt = 0;
    }
  }

  /** 获取当前时段文字 */
  getTimeOfDay() {
    const t = this.time;
    if (t < 0.06 || t >= 0.96) return '黎明';
    if (t < 0.20) return '早晨';
    if (t < 0.35) return '正午';
    if (t < 0.46) return '下午';
    if (t < 0.56) return '黄昏';
    if (t < 0.68) return '傍晚';
    return '夜晚';
  }

  /** 是否夜晚（用于怪物/生物行为） */
  isNight() {
    if (this.alwaysDay) return false;
    return this.time > 0.6 || this.time < 0.1;
  }

  /** 儿童常亮模式开关：true=永远白天，false=正常昼夜循环 */
  setAlwaysDay(on) {
    this.alwaysDay = !!on;
    if (on) this.time = this.DAY_FIXED_TIME;
  }
}
