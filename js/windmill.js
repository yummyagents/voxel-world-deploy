// js/windmill.js
// 出生区粉色风车磨坊的动态叶片：4 片格子叶片绕轴心缓慢旋转。
// 纯装饰，不参与碰撞；叶片朝向 +z（面向出生点），绕 z 轴旋转。
import * as THREE from 'three';

export class WindmillBlades {
  /**
   * @param {THREE.Scene} scene
   * @param {{x:number,y:number,z:number}} axis 叶片轴心世界坐标
   */
  constructor(scene, axis) {
    this.scene = scene;
    this.axis = axis;
    this.speed = 0.5; // 弧度/秒（缓慢）

    // 叶片组：轴心在原点，最后整体定位
    this.group = new THREE.Group();

    // 叶片材质：粉白相间，暖木色杆
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0xf7c9dd }); // 粉白叶片
    const bladeMat2 = new THREE.MeshLambertMaterial({ color: 0xffffff }); // 白色叶片
    const sparMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3c });   // 木色撑杆
    const hubMat = new THREE.MeshLambertMaterial({ color: 0xe0983c });    // 金色轴帽

    const armLen = 4.2;   // 每片叶从轴到尖长度
    const bladeW = 1.4;   // 叶片宽
    const bladeH = 2.6;   // 叶片高（格子感）

    // 十字交叉的 4 根撑杆
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;

      // 撑杆（细木条）从轴伸到叶尖
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.28, armLen, 0.28), sparMat);
      spar.position.set(0, armLen / 2, 0);
      arm.add(spar);

      // 叶片：沿撑杆外段叠 2~3 个方块"帆"
      for (let k = 0; k < 2; k++) {
        const sail = new THREE.Mesh(
          new THREE.BoxGeometry(bladeW, bladeH, 0.18),
          (k % 2 === 0) ? bladeMat : bladeMat2
        );
        sail.position.set(0, armLen - 1.0 - k * (bladeH + 0.1), 0);
        // 叶片略微错开，像风车帆格
        sail.position.x = (k === 0 ? 0.5 : -0.5) * bladeW * 0.4;
        arm.add(sail);
      }
      this.group.add(arm);
    }

    // 中心轴帽
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.6), hubMat);
    this.group.add(hub);

    // 定位到塔身正面轴点；叶片平面朝向玩家（+z）
    this.group.position.set(axis.x, axis.y, axis.z);
    scene.add(this.group);
  }

  update(dt) {
    this.group.rotation.z += this.speed * dt;
  }
}
