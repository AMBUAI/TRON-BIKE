import * as THREE from 'three';
import type { CharacterModelId, VehicleType } from '../../shared/types';
import {
  createBikeWithRiderInstance,
  type BikeWithRiderInstance,
} from './characterLoader';

export interface VehicleRig {
  root: THREE.Group;
  leanGroup: THREE.Group;
  wheeliePivot: THREE.Group;
  vehicleType: VehicleType;
  spinWheels: (deltaAngle: number, rearOnly?: boolean) => void;
  setColor: (hex: string) => void;
  setCharacter: (characterId: CharacterModelId) => void;
  dispose: () => void;
}

export type LightCycleRig = VehicleRig;

function createUnderglowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.35)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedGlowTex: THREE.CanvasTexture | null = null;

export function getSharedUnderglowTexture(): THREE.CanvasTexture {
  if (!sharedGlowTex) {
    sharedGlowTex = createUnderglowTexture();
  }
  return sharedGlowTex;
}

export function createLightCycleRig(
  initialColorHex: string,
  characterId: CharacterModelId = 'tron1'
): VehicleRig {
  const root = new THREE.Group();
  const leanGroup = new THREE.Group();
  root.add(leanGroup);

  // Rear axle contact pivot at z = +1.38, y = 0 so wheelie lifts front wheel naturally!
  const wheeliePivot = new THREE.Group();
  wheeliePivot.position.set(0, 0, 1.38);
  leanGroup.add(wheeliePivot);

  const chassisFrame = new THREE.Group();
  chassisFrame.position.set(0, 0, -1.38);
  wheeliePivot.add(chassisFrame);

  let activeColorHex = initialColorHex;
  const color = new THREE.Color(initialColorHex);

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x101622,
    metalness: 0.85,
    roughness: 0.24,
  });

  const darkAlloyMat = new THREE.MeshStandardMaterial({
    color: 0x1c2536,
    metalness: 0.72,
    roughness: 0.38,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x090c12,
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

  // Procedural fallback bike shown ONLY while async GLB streams in
  const fallbackGroup = new THREE.Group();
  chassisFrame.add(fallbackGroup);

  const buildWheel = (zPos: number): THREE.Group => {
    const wg = new THREE.Group();
    wg.position.set(0, 0.68, zPos);

    const tireGeo = new THREE.TorusGeometry(0.56, 0.13, 14, 32);
    tireGeo.rotateY(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = true;
    wg.add(tireMesh);

    const rimGeo = new THREE.TorusGeometry(0.45, 0.045, 10, 32);
    rimGeo.rotateY(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, neonMat);
    wg.add(rimMesh);

    const spokeGeo = new THREE.BoxGeometry(0.16, 0.76, 0.06);
    const spoke1 = new THREE.Mesh(spokeGeo, darkAlloyMat);
    const spoke2 = new THREE.Mesh(spokeGeo, darkAlloyMat);
    spoke2.rotation.x = Math.PI / 2;
    wg.add(spoke1, spoke2);

    return wg;
  };

  const frontWheel = buildWheel(-1.35);
  const rearWheel = buildWheel(1.38);
  fallbackGroup.add(frontWheel, rearWheel);

  const hullMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.62, 2.55),
    carbonMat
  );
  hullMesh.position.set(0, 0.9, 0);
  fallbackGroup.add(hullMesh);

  const stripGeo = new THREE.BoxGeometry(0.08, 0.11, 2.35);
  const leftStrip = new THREE.Mesh(stripGeo, neonMat);
  leftStrip.position.set(-0.37, 0.94, 0.02);
  const rightStrip = new THREE.Mesh(stripGeo, neonMat);
  rightStrip.position.set(0.37, 0.94, 0.02);
  fallbackGroup.add(leftStrip, rightStrip);

  const torsoMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.62, 6, 12),
    darkAlloyMat
  );
  torsoMesh.position.set(0, 1.48, 0.22);
  torsoMesh.rotation.x = -1.02;
  fallbackGroup.add(torsoMesh);

  // Full 3D Bike + Rider GLB Mount (tronn1 / tronn2 / tronn3)
  const glbMount = new THREE.Group();
  chassisFrame.add(glbMount);

  let activeBikeModel: BikeWithRiderInstance | null = null;
  let loadSeq = 0;
  let disposed = false;

  const loadModel = (id: CharacterModelId) => {
    const seq = ++loadSeq;
    void createBikeWithRiderInstance(id, activeColorHex, 3.85)
      .then((inst) => {
        if (disposed || seq !== loadSeq) {
          inst.dispose();
          return;
        }
        if (activeBikeModel) {
          glbMount.remove(activeBikeModel.group);
          activeBikeModel.dispose();
        }
        activeBikeModel = inst;
        glbMount.add(inst.group);
        fallbackGroup.visible = false;
      })
      .catch(() => {
        // Keep fallback cycle if GLB fails to fetch
      });
  };
  loadModel(characterId);

  // Rear Tail Light-Wall Emitter Crystal (aligns trail cleanly behind rear wheel)
  const emitterMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.58, 0.16),
    neonMat
  );
  emitterMesh.position.set(0, 0.68, 1.96);
  chassisFrame.add(emitterMesh);

  // Ground Contact Underglow Plane
  const underglowMat = new THREE.MeshBasicMaterial({
    map: getSharedUnderglowTexture(),
    color,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const underglowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 5.2),
    underglowMat
  );
  underglowPlane.rotation.x = -Math.PI / 2;
  underglowPlane.position.set(0, 0.03, 0.05);
  leanGroup.add(underglowPlane);

  const spinWheels = (deltaAngle: number, rearOnly = false) => {
    if (fallbackGroup.visible) {
      rearWheel.rotation.x += deltaAngle;
      if (!rearOnly) {
        frontWheel.rotation.x += deltaAngle;
      }
    }
  };

  const setColor = (hex: string) => {
    activeColorHex = hex;
    const next = new THREE.Color(hex);
    neonMat.color.copy(next);
    neonMat.emissive.copy(next);
    underglowMat.color.copy(next);
    activeBikeModel?.setColor(hex);
  };

  const setCharacter = (id: CharacterModelId) => {
    loadModel(id);
  };

  const dispose = () => {
    disposed = true;
    loadSeq += 1;
    if (activeBikeModel) {
      activeBikeModel.dispose();
      activeBikeModel = null;
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
    vehicleType: 'bike',
    spinWheels,
    setColor,
    setCharacter,
    dispose,
  };
}
