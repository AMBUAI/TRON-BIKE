import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CharacterModelId, VehicleType } from '../../shared/types';
import { createLightCycleRig, type VehicleRig } from '../game/bikeMesh';
import { createNeonCarRig } from '../game/carMesh';
import {
  createCharacterInstance,
  type CharacterInstance,
} from '../game/characterLoader';

interface ProfilePreviewCanvasProps {
  characterId: CharacterModelId;
  colorHex: string;
  vehicleType: VehicleType;
}

export const ProfilePreviewCanvas: React.FC<ProfilePreviewCanvasProps> = ({
  characterId,
  colorHex,
  vehicleType,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    scene: THREE.Scene;
    rig: VehicleRig;
    standingChar: CharacterInstance | null;
    vehicleType: VehicleType;
    characterId: CharacterModelId;
    colorHex: string;
    loadSeq: number;
    disposed: boolean;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const w = Math.max(240, container.clientWidth || 320);
    const h = Math.max(150, container.clientHeight || 180);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a15);

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.2, 100);
    camera.position.set(3.4, 2.05, 4.4);
    camera.lookAt(0, 0.85, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0x7ae2ff, 0x0b1020, 1.0);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(5, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff2a85, 0.95);
    rim.position.set(-5, 4, -5);
    scene.add(rim);

    // Subtle reflective grid pedestal
    const grid = new THREE.GridHelper(10, 12, 0x1e3a5f, 0x0d1b33);
    scene.add(grid);

    const rig =
      vehicleType === 'car'
        ? createNeonCarRig(colorHex, characterId)
        : createLightCycleRig(colorHex, characterId);
    rig.root.position.set(0.55, 0, 0);
    rig.root.rotation.y = -0.35;
    scene.add(rig.root);

    const st = {
      scene,
      rig,
      standingChar: null as CharacterInstance | null,
      vehicleType,
      characterId,
      colorHex,
      loadSeq: 0,
      disposed: false,
    };
    stateRef.current = st;

    const loadStandingChar = (charId: CharacterModelId, hex: string) => {
      const seq = ++st.loadSeq;
      void createCharacterInstance(charId, hex, 'stand', 1.72)
        .then((inst) => {
          if (st.disposed || seq !== st.loadSeq) {
            inst.dispose();
            return;
          }
          if (st.standingChar) {
            st.scene.remove(st.standingChar.group);
            st.standingChar.dispose();
          }
          inst.group.position.set(-1.35, 0, 0.65);
          inst.group.rotation.y = -2.65;
          st.standingChar = inst;
          st.scene.add(inst.group);
        })
        .catch(() => {
          // ignore if unavailable
        });
    };
    loadStandingChar(characterId, colorHex);

    const handleResize = () => {
      if (st.disposed) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (nw <= 0 || nh <= 0) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => handleResize())
        : null;
    ro?.observe(container);

    const clock = new THREE.Clock();
    let frameId = 0;

    const renderLoop = () => {
      if (st.disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;

      st.rig.spinWheels(-dt * 10);
      st.rig.root.rotation.y = -0.35 + Math.sin(t * 0.65) * 0.28;
      if (st.standingChar) {
        st.standingChar.group.rotation.y = -2.65 + Math.sin(t * 0.7) * 0.25;
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        frameId = window.setTimeout(renderLoop, 90);
      } else {
        frameId = requestAnimationFrame(renderLoop);
      }
    };
    renderLoop();

    return () => {
      st.disposed = true;
      st.loadSeq += 1;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
      st.rig.dispose();
      st.standingChar?.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      stateRef.current = null;
    };
    // Mount once; updates handled by second effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const st = stateRef.current;
    if (!st || st.disposed) return;

    if (st.vehicleType !== vehicleType) {
      st.scene.remove(st.rig.root);
      st.rig.dispose();
      st.rig =
        vehicleType === 'car'
          ? createNeonCarRig(colorHex, characterId)
          : createLightCycleRig(colorHex, characterId);
      st.rig.root.position.set(0.55, 0, 0);
      st.rig.root.rotation.y = -0.35;
      st.scene.add(st.rig.root);
      st.vehicleType = vehicleType;
    } else {
      if (st.colorHex !== colorHex) {
        st.rig.setColor(colorHex);
      }
      if (st.characterId !== characterId) {
        st.rig.setCharacter(characterId);
      }
    }

    if (st.characterId !== characterId) {
      const seq = ++st.loadSeq;
      void createCharacterInstance(characterId, colorHex, 'stand', 1.72)
        .then((inst) => {
          if (st.disposed || seq !== st.loadSeq) {
            inst.dispose();
            return;
          }
          if (st.standingChar) {
            st.scene.remove(st.standingChar.group);
            st.standingChar.dispose();
          }
          inst.group.position.set(-1.35, 0, 0.65);
          inst.group.rotation.y = -2.65;
          st.standingChar = inst;
          st.scene.add(inst.group);
        })
        .catch(() => undefined);
    } else if (st.colorHex !== colorHex && st.standingChar) {
      st.standingChar.setColor(colorHex);
    }

    st.characterId = characterId;
    st.colorHex = colorHex;
  }, [characterId, colorHex, vehicleType]);

  return (
    <div
      ref={mountRef}
      className="w-full h-32 sm:h-36 md:h-44 rounded-lg border border-white/10 bg-[#060A15] overflow-hidden"
    />
  );
};
