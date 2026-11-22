import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { CharacterModelId } from '../../shared/types';

export type CharacterPose = 'stand' | 'bike' | 'car';

export interface CharacterInstance {
  group: THREE.Group;
  setColor: (hex: string) => void;
  setPose: (pose: CharacterPose) => void;
  dispose: () => void;
}

const MODEL_PATHS: Record<CharacterModelId, string> = {
  tron1: '/models/tron1.glb',
  tron2: '/models/tron2.glb',
  tron3: '/models/tron3.glb',
};

const BIKE_RIDER_PATHS: Record<CharacterModelId, string> = {
  tron1: '/models/tronn1.glb',
  tron2: '/models/tronn2.glb',
  tron3: '/models/tronn3.glb',
};

const CAR_PATHS: Record<CharacterModelId, string> = {
  tron1: '/models/car1.glb',
  tron2: '/models/car2.glb',
  tron3: '/models/car3.glb',
};

const gltfLoader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();
const recoloredTexCache = new Map<string, THREE.CanvasTexture>();

export function preloadCharacterModels(): Promise<void> {
  const allPaths = [
    ...Object.values(BIKE_RIDER_PATHS),
    ...Object.values(CAR_PATHS),
    ...Object.values(MODEL_PATHS),
  ];
  return Promise.all(
    allPaths.map((p) => loadGLTFByPath(p).catch(() => undefined))
  ).then(() => undefined);
}

function loadGLTFByPath(urlPath: string): Promise<GLTF> {
  let cached = gltfCache.get(urlPath);
  if (!cached) {
    cached = gltfLoader.loadAsync(urlPath);
    gltfCache.set(urlPath, cached);
  }
  return cached;
}

function loadGLTF(id: CharacterModelId): Promise<GLTF> {
  return loadGLTFByPath(MODEL_PATHS[id]);
}

function getRecoloredTexture(
  sourceTex: THREE.Texture,
  mode: 'emissive' | 'diffuse',
  colorHex: string,
  characterId: CharacterModelId
): THREE.Texture {
  const img = sourceTex.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined;
  if (!img) return sourceTex;

  const normalizedHex = colorHex.toUpperCase();
  const key = `${sourceTex.uuid}_${mode}_${normalizedHex}_${characterId}`;
  const existing = recoloredTexCache.get(key);
  if (existing) return existing;

  const srcW = (img as { width?: number }).width || 512;
  const srcH = (img as { height?: number }).height || 512;
  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sourceTex;

  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const target = new THREE.Color(normalizedHex);
  const tr = Math.round(target.r * 255);
  const tg = Math.round(target.g * 255);
  const tb = Math.round(target.b * 255);
  const targetIsWhite = tr > 225 && tg > 225 && tb > 225;

  if (mode === 'emissive') {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxC = Math.max(r, g, b);
      if (maxC < 14) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        continue;
      }
      const intensity = Math.min(1, (maxC / 255) * 1.15);
      // Keep crisp glowing core while tinting strongly to target neon color
      const coreBoost = intensity > 0.88 ? (intensity - 0.88) * 1.5 : 0;
      data[i] = Math.min(255, Math.round(tr * intensity + 255 * coreBoost * 0.25));
      data[i + 1] = Math.min(255, Math.round(tg * intensity + 255 * coreBoost * 0.25));
      data[i + 2] = Math.min(255, Math.round(tb * intensity + 255 * coreBoost * 0.25));
    }
  } else {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // Recolor glowing/colored suit panels & bright armor trims while keeping dark carbon armor dark
      const isAccent =
        characterId === 'tron3'
          ? !targetIsWhite && lum > 0.56
          : sat > 0.26 && maxC > 55;

      if (isAccent) {
        const shade = 0.4 + lum * 0.65;
        data[i] = Math.min(255, Math.round(tr * shade));
        data[i + 1] = Math.min(255, Math.round(tg * shade));
        data[i + 2] = Math.min(255, Math.round(tb * shade));
      } else if (characterId !== 'tron3' && lum > 0.72 && sat < 0.2 && !targetIsWhite) {
        // Subtle tint on bright specular suit piping
        const blend = 0.55;
        data[i] = Math.min(255, Math.round(r * (1 - blend) + tr * lum * blend));
        data[i + 1] = Math.min(255, Math.round(g * (1 - blend) + tg * lum * blend));
        data[i + 2] = Math.min(255, Math.round(b * (1 - blend) + tb * lum * blend));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const outTex = new THREE.CanvasTexture(canvas);
  outTex.flipY = sourceTex.flipY;
  outTex.wrapS = sourceTex.wrapS;
  outTex.wrapT = sourceTex.wrapT;
  outTex.colorSpace = THREE.SRGBColorSpace;
  outTex.needsUpdate = true;

  recoloredTexCache.set(key, outTex);
  return outTex;
}

interface OriginalMaterialMaps {
  map: THREE.Texture | null;
  emissiveMap: THREE.Texture | null;
}

function captureRestRotations(root: THREE.Object3D): Map<string, THREE.Euler> {
  const rest = new Map<string, THREE.Euler>();
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone || obj.name.startsWith('jt_')) {
      rest.set(obj.name, obj.rotation.clone());
    }
  });
  return rest;
}

function applyArmaturePose(
  root: THREE.Object3D,
  restRotations: Map<string, THREE.Euler>,
  pose: CharacterPose,
  modelHolder: THREE.Group,
  baseScale: number,
  baseOffset: THREE.Vector3
) {
  // Restore default skeleton rotations
  root.traverse((obj) => {
    const rest = restRotations.get(obj.name);
    if (rest) {
      obj.rotation.copy(rest);
    }
  });

  // Reset holder transform
  modelHolder.scale.setScalar(baseScale);
  modelHolder.position.copy(baseOffset);
  modelHolder.rotation.set(0, Math.PI, 0);

  if (pose === 'stand') return;

  const findBone = (prefix: string): THREE.Object3D | undefined => {
    let found: THREE.Object3D | undefined;
    root.traverse((obj) => {
      if (!found && obj.name.startsWith(prefix)) found = obj;
    });
    return found;
  };

  const hasBones = restRotations.size > 0;
  if (!hasBones) {
    // Static mesh (tron3): tilt / tuck cleanly for bike & car seats
    if (pose === 'bike') {
      modelHolder.rotation.x = -0.45;
      modelHolder.position.y = baseOffset.y - 0.14;
    } else if (pose === 'car') {
      modelHolder.rotation.x = -0.18;
      modelHolder.scale.setScalar(baseScale * 0.78);
      modelHolder.position.y = baseOffset.y - 0.36;
    }
    return;
  }

  const spineLower = findBone('jt_SpineLower');
  const spineUpper = findBone('jt_SpineUpper');
  const head = findBone('jt_Head') || findBone('jt_Neck');
  const shoulderL = findBone('jt_Shoulder_L');
  const shoulderR = findBone('jt_Shoulder_R');
  const elbowL = findBone('jt_Elbow_L');
  const elbowR = findBone('jt_Elbow_R');
  const hipL = findBone('jt_Hip_L');
  const hipR = findBone('jt_Hip_R');
  const kneeL = findBone('jt_Knee_L');
  const kneeR = findBone('jt_Knee_R');

  if (pose === 'bike') {
    // Sportbike forward tuck
    if (spineLower) spineLower.rotation.z += 0.42;
    if (spineUpper) spineUpper.rotation.z += 0.25;
    if (head) head.rotation.z -= 0.36;
    if (shoulderL) {
      shoulderL.rotation.z -= 0.65;
      shoulderL.rotation.y += 0.22;
    }
    if (shoulderR) {
      shoulderR.rotation.z += 0.65;
      shoulderR.rotation.y -= 0.22;
    }
    if (elbowL) elbowL.rotation.y -= 0.45;
    if (elbowR) elbowR.rotation.y += 0.45;
    if (hipL) hipL.rotation.z -= 0.85;
    if (hipR) hipR.rotation.z -= 0.85;
    if (kneeL) kneeL.rotation.z += 1.25;
    if (kneeR) kneeR.rotation.z += 1.25;
    modelHolder.position.y = baseOffset.y - 0.26;
  } else if (pose === 'car') {
    // Seated cockpit posture
    if (spineLower) spineLower.rotation.z -= 0.12;
    if (shoulderL) {
      shoulderL.rotation.z -= 0.75;
      shoulderL.rotation.y += 0.32;
    }
    if (shoulderR) {
      shoulderR.rotation.z += 0.75;
      shoulderR.rotation.y -= 0.32;
    }
    if (elbowL) elbowL.rotation.y -= 0.42;
    if (elbowR) elbowR.rotation.y += 0.42;
    if (hipL) hipL.rotation.z -= 1.28;
    if (hipR) hipR.rotation.z -= 1.28;
    if (kneeL) kneeL.rotation.z += 1.32;
    if (kneeR) kneeR.rotation.z += 1.32;
    modelHolder.position.y = baseOffset.y - 0.34;
  }
}

export async function createCharacterInstance(
  characterId: CharacterModelId,
  initialColorHex: string,
  pose: CharacterPose = 'stand',
  targetHeight = 1.65
): Promise<CharacterInstance> {
  const gltf = await loadGLTF(characterId);
  const cloned = SkeletonUtils.clone(gltf.scene);

  const modelHolder = new THREE.Group();
  modelHolder.rotation.y = Math.PI; // Model faces +Z in Sketchfab export; align forward to -Z
  modelHolder.add(cloned);

  // Measure bounding box in normalized facing orientation
  modelHolder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelHolder);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const rawHeight = Math.max(0.001, size.y);
  const baseScale = targetHeight / rawHeight;
  const baseOffset = new THREE.Vector3(
    -center.x * baseScale,
    -box.min.y * baseScale,
    -center.z * baseScale
  );

  const group = new THREE.Group();
  group.add(modelHolder);

  // Clone materials individually so per-player colors don't collide
  const clonedMaterials = new Map<
    THREE.MeshStandardMaterial,
    OriginalMaterialMaps
  >();

  cloned.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;

      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const nextMats = mats.map((m) => {
        const std = m.clone() as THREE.MeshStandardMaterial;
        clonedMaterials.set(std, {
          map: std.map,
          emissiveMap: std.emissiveMap,
        });
        return std;
      });
      mesh.material = Array.isArray(mesh.material) ? nextMats : nextMats[0];
    }
  });

  const restRotations = captureRestRotations(cloned);
  let currentColor = initialColorHex;
  let currentPose = pose;

  const setColor = (hex: string) => {
    currentColor = hex;
    const targetCol = new THREE.Color(hex);
    for (const [mat, orig] of clonedMaterials.entries()) {
      if (orig.map) {
        mat.map = getRecoloredTexture(orig.map, 'diffuse', currentColor, characterId);
      }
      if (orig.emissiveMap) {
        mat.emissiveMap = getRecoloredTexture(
          orig.emissiveMap,
          'emissive',
          currentColor,
          characterId
        );
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 2.05;
      } else {
        mat.emissive.copy(targetCol);
        mat.emissiveIntensity = 1.6;
      }
      mat.needsUpdate = true;
    }
  };

  const setPose = (nextPose: CharacterPose) => {
    currentPose = nextPose;
    applyArmaturePose(
      cloned,
      restRotations,
      currentPose,
      modelHolder,
      baseScale,
      baseOffset
    );
  };

  setColor(initialColorHex);
  setPose(pose);

  const dispose = () => {
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        mats.forEach((m) => m.dispose());
      }
    });
  };

  return { group, setColor, setPose, dispose };
}

export interface BikeWithRiderInstance {
  group: THREE.Group;
  setColor: (hex: string) => void;
  dispose: () => void;
}

export async function createBikeWithRiderInstance(
  characterId: CharacterModelId,
  initialColorHex: string,
  targetLength = 3.85
): Promise<BikeWithRiderInstance> {
  const gltf = await loadGLTFByPath(BIKE_RIDER_PATHS[characterId]);
  const cloned = gltf.scene.clone(true);

  const modelHolder = new THREE.Group();
  modelHolder.rotation.y = Math.PI; // Sketchfab export faces +Z; rotate to face -Z forward
  modelHolder.add(cloned);

  modelHolder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelHolder);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const rawLength = Math.max(0.001, size.z);
  const scale = targetLength / rawLength;
  modelHolder.scale.setScalar(scale);
  modelHolder.position.set(
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale
  );

  const group = new THREE.Group();
  group.add(modelHolder);

  const clonedMaterials = new Map<
    THREE.MeshStandardMaterial,
    { map: THREE.Texture | null; emissiveMap: THREE.Texture | null; isFace: boolean }
  >();

  cloned.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;

      const isFace = /face/i.test(mesh.name);
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const nextMats = mats.map((m) => {
        const std = m.clone() as THREE.MeshStandardMaterial;
        clonedMaterials.set(std, {
          map: std.map,
          emissiveMap: std.emissiveMap,
          isFace,
        });
        return std;
      });
      mesh.material = Array.isArray(mesh.material) ? nextMats : nextMats[0];
    }
  });

  const setColor = (hex: string) => {
    const targetCol = new THREE.Color(hex);
    for (const [mat, orig] of clonedMaterials.entries()) {
      if (orig.map && !orig.isFace) {
        mat.map = getRecoloredTexture(orig.map, 'diffuse', hex, characterId);
      }
      if (orig.emissiveMap) {
        mat.emissiveMap = getRecoloredTexture(
          orig.emissiveMap,
          'emissive',
          hex,
          characterId
        );
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 2.1;
      } else if (!orig.isFace) {
        mat.emissive.copy(targetCol);
        mat.emissiveIntensity = 1.5;
      }
      mat.needsUpdate = true;
    }
  };

  setColor(initialColorHex);

  const dispose = () => {
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        mats.forEach((m) => m.dispose());
      }
    });
  };

  return { group, setColor, dispose };
}

export interface CarModelInstance {
  group: THREE.Group;
  spinWheels: (deltaAngle: number, rearOnly?: boolean) => void;
  setColor: (hex: string) => void;
  dispose: () => void;
}

const FRONT_WHEEL_RE = /^(FRWheel|FLWheel|Wheel FR|Wheel FL|WheelFR|WheelFL)$/i;
const REAR_WHEEL_RE = /^(BRWheel|BLWheel|Wheel BR|Wheel BL|WheelBR|WheelBL)$/i;

export async function createCarModelInstance(
  characterId: CharacterModelId,
  initialColorHex: string,
  targetLength = 4.25
): Promise<CarModelInstance> {
  const gltf = await loadGLTFByPath(CAR_PATHS[characterId]);
  const cloned = gltf.scene.clone(true);

  const modelHolder = new THREE.Group();
  modelHolder.rotation.y = Math.PI; // Cars face +Z in Sketchfab export; rotate to face -Z forward
  modelHolder.add(cloned);

  modelHolder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelHolder);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const rawLength = Math.max(0.001, size.z);
  const scale = targetLength / rawLength;
  modelHolder.scale.setScalar(scale);
  modelHolder.position.set(
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale
  );

  const group = new THREE.Group();
  group.add(modelHolder);

  const frontWheels: THREE.Object3D[] = [];
  const rearWheels: THREE.Object3D[] = [];
  const glowMaterials: THREE.MeshStandardMaterial[] = [];

  cloned.traverse((obj) => {
    if (FRONT_WHEEL_RE.test(obj.name)) {
      frontWheels.push(obj);
    } else if (REAR_WHEEL_RE.test(obj.name)) {
      rearWheels.push(obj);
    }

    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;

      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const nextMats = mats.map((m) => {
        const std = m.clone() as THREE.MeshStandardMaterial;
        if (/glow/i.test(std.name)) {
          glowMaterials.push(std);
        }
        return std;
      });
      mesh.material = Array.isArray(mesh.material) ? nextMats : nextMats[0];
    }
  });

  const spinWheels = (deltaAngle: number, rearOnly = false) => {
    for (const w of rearWheels) w.rotation.x -= deltaAngle;
    if (!rearOnly) {
      for (const w of frontWheels) w.rotation.x -= deltaAngle;
    }
  };

  const setColor = (hex: string) => {
    const targetCol = new THREE.Color(hex);
    for (const mat of glowMaterials) {
      mat.color.copy(targetCol);
      mat.emissive.copy(targetCol);
      mat.emissiveIntensity = 2.4;
      mat.needsUpdate = true;
    }
  };

  setColor(initialColorHex);

  const dispose = () => {
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        mats.forEach((m) => m.dispose());
      }
    });
  };

  return { group, spinWheels, setColor, dispose };
}
