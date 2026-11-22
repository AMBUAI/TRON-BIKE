import * as THREE from 'three';
import type { CharacterModelId } from '../../shared/types';
import { getSharedUnderglowTexture, type VehicleRig } from './bikeMesh';
import {
  createCarModelInstance,
  type CarModelInstance,
} from './characterLoader';

export function createNeonCarRig(
  initialColorHex: string,
  characterId: CharacterModelId = 'tron1'
): VehicleRig {
  const root = new THREE.Group();
  const leanGroup = new THREE.Group();
  root.add(leanGroup);

  // Rear axle pivot at z = +1.35 so winning car performs a clean rear-wheelie celebration
  const wheeliePivot = new THREE.Group();
  wheeliePivot.position.set(0, 0, 1.35);
  leanGroup.add(wheeliePivot);

  const chassisFrame = new THREE.Group();
  chassisFrame.position.set(0, 0, -1.35);
  wheeliePivot.add(chassisFrame);

  let activeColorHex = initialColorHex;
  const color = new THREE.Color(initialColorHex);

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x0e1420,
    metalness: 0.88,
    roughness: 0.22,
  });

  const darkAlloyMat = new THREE.MeshStandardMaterial({
    color: 0x1a2335,
    metalness: 0.74,
    roughness: 0.36,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x070a0f,
    metalness: 0.2,
    roughness: 0.65,
  });

  const neonMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.4,
    roughness: 0.18,
    metalness: 0.1,
  });

  // Instant placeholder car shown ONLY while async GLB streams in
  const fallbackGroup = new THREE.Group();
  chassisFrame.add(fallbackGroup);

  const buildCarWheel = (xPos: number, zPos: number): THREE.Group => {
    const wg = new THREE.Group();
    wg.position.set(xPos, 0.5, zPos);

    const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    wg.add(tireMesh);

    const rimGeo = new THREE.TorusGeometry(0.36, 0.042, 8, 22);
    rimGeo.rotateY(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, neonMat);
    rimMesh.position.x = xPos > 0 ? 0.15 : -0.15;
    wg.add(rimMesh);

    return wg;
  };

  const fbFL = buildCarWheel(-0.96, -1.35);
  const fbFR = buildCarWheel(0.96, -1.35);
  const fbRL = buildCarWheel(-0.98, 1.35);
  const fbRR = buildCarWheel(0.98, 1.35);
  fallbackGroup.add(fbFL, fbFR, fbRL, fbRR);

  const fbBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.78, 0.52, 3.85),
    carbonMat
  );
  fbBody.position.set(0, 0.52, 0.02);
  fallbackGroup.add(fbBody);

  const fbLeftStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.1, 3.4),
    neonMat
  );
  fbLeftStrip.position.set(-0.96, 0.58, 0);
  const fbRightStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.1, 3.4),
    neonMat
  );
  fbRightStrip.position.set(0.96, 0.58, 0);
  const fbCockpit = new THREE.Mesh(
    new THREE.BoxGeometry(1.12, 0.32, 1.3),
    darkAlloyMat
  );
  fbCockpit.position.set(0, 0.9, 0.05);
  fallbackGroup.add(fbLeftStrip, fbRightStrip, fbCockpit);

  // Full 3D Car GLB Mount (car1 / car2 / car3)
  const glbMount = new THREE.Group();
  chassisFrame.add(glbMount);

  let activeCarModel: CarModelInstance | null = null;
  let loadSeq = 0;
  let disposed = false;

  const loadModel = (id: CharacterModelId) => {
    const seq = ++loadSeq;
    void createCarModelInstance(id, activeColorHex, 4.25)
      .then((inst) => {
        if (disposed || seq !== loadSeq) {
          inst.dispose();
          return;
        }
        if (activeCarModel) {
          glbMount.remove(activeCarModel.group);
          activeCarModel.dispose();
        }
        activeCarModel = inst;
        glbMount.add(inst.group);
        fallbackGroup.visible = false;
      })
      .catch(() => {
        // Keep geometric fallback car if GLB fails
      });
  };
  loadModel(characterId);

  // Rear Tail Light-Wall Emitter
  const emitterMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.62, 0.18),
    neonMat
  );
  emitterMesh.position.set(0, 0.65, 2.08);
  chassisFrame.add(emitterMesh);

  // Ground Contact Underglow Plane
  const underglowMat = new THREE.MeshBasicMaterial({
    map: getSharedUnderglowTexture(),
    color,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const underglowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 5.8),
    underglowMat
  );
  underglowPlane.rotation.x = -Math.PI / 2;
  underglowPlane.position.set(0, 0.03, 0.02);
  leanGroup.add(underglowPlane);

  const spinWheels = (deltaAngle: number, rearOnly = false) => {
    if (activeCarModel) {
      activeCarModel.spinWheels(deltaAngle, rearOnly);
    } else if (fallbackGroup.visible) {
      fbRL.rotation.x += deltaAngle;
      fbRR.rotation.x += deltaAngle;
      if (!rearOnly) {
        fbFL.rotation.x += deltaAngle;
        fbFR.rotation.x += deltaAngle;
      }
    }
  };

  const setColor = (hex: string) => {
    activeColorHex = hex;
    const next = new THREE.Color(hex);
    neonMat.color.copy(next);
    neonMat.emissive.copy(next);
    underglowMat.color.copy(next);
    activeCarModel?.setColor(hex);
  };

  const setCharacter = (id: CharacterModelId) => {
    loadModel(id);
  };

  const dispose = () => {
    disposed = true;
    loadSeq += 1;
    if (activeCarModel) {
      activeCarModel.dispose();
      activeCarModel = null;
    }
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
  };

  return {
    root,
    leanGroup,
    wheeliePivot,
    vehicleType: 'car',
    spinWheels,
    setColor,
    setCharacter,
    dispose,
  };
}
