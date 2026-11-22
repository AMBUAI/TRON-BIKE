import * as THREE from 'three';
import { ARENA_HALF } from '../../shared/types';

export interface ArenaHandle {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

export function createArenaMesh(): ArenaHandle {
  const group = new THREE.Group();
  const arenaSize = ARENA_HALF * 2;

  // 1. Enormous Continuous Digital Grid Floor (zero internal obstacles)
  const floorGeo = new THREE.PlaneGeometry(arenaSize, arenaSize, 1, 1);
  floorGeo.rotateX(-Math.PI / 2);

  const floorUniforms = {
    uTime: { value: 0 },
    uArenaHalf: { value: ARENA_HALF },
  };

  const floorMat = new THREE.ShaderMaterial({
    uniforms: floorUniforms,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uArenaHalf;
      varying vec3 vWorldPos;

      float gridLine(vec2 coord, float spacing, float width) {
        vec2 p = coord / spacing;
        vec2 grid = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        float line = min(grid.x, grid.y);
        return 1.0 - min(line / width, 1.0);
      }

      void main() {
        vec2 xz = vWorldPos.xz;

        // Subtle obsidian carbon base with radial energy shimmer
        vec3 baseColor = vec3(0.015, 0.024, 0.052);

        // Minor 10-unit grid, Major 40-unit grid, Sector 160-unit grid
        float minorGrid = gridLine(xz, 10.0, 1.1);
        float majorGrid = gridLine(xz, 40.0, 1.6);
        float sectorGrid = gridLine(xz, 160.0, 2.2);

        vec3 minorColor = vec3(0.0, 0.42, 0.62) * minorGrid * 0.28;
        vec3 majorColor = vec3(0.0, 0.78, 0.98) * majorGrid * 0.48;
        vec3 sectorColor = vec3(0.32, 0.52, 1.0) * sectorGrid * 0.55;

        // Outer boundary warning floor strip (last 18 units)
        float edgeDist = max(abs(xz.x), abs(xz.y));
        float warningZone = smoothstep(uArenaHalf - 18.0, uArenaHalf, edgeDist);
        float pulse = 0.65 + 0.35 * sin(uTime * 4.5);
        vec3 borderGlow = vec3(1.0, 0.14, 0.42) * warningZone * 0.45 * pulse;

        // Distance fade so distant horizon blends cleanly
        float distFromOrigin = length(xz);
        float centerPulse = 0.04 * exp(-distFromOrigin * 0.008);

        vec3 col = baseColor + minorColor + majorColor + sectorColor + borderGlow + vec3(0.0, centerPulse, centerPulse * 1.4);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    extensions: {
      derivatives: true,
    } as unknown as undefined,
  });

  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = 0;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // 2. Tall Glowing Outer Energy Boundary Walls (continuous perimeter, zero gaps)
  const wallHeight = 20;
  const wallUniforms = {
    uTime: { value: 0 },
  };

  const wallMat = new THREE.ShaderMaterial({
    uniforms: wallUniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        float y = vUv.y;
        float posAlong = (abs(vWorldPos.x) > abs(vWorldPos.z)) ? vWorldPos.z : vWorldPos.x;

        // Scrolling digital energy lattice
        float hBands = smoothstep(0.86, 0.98, sin(y * 38.0 - uTime * 4.0));
        float vBands = smoothstep(0.92, 0.99, sin(posAlong * 0.42 + uTime * 1.6));

        // Intense bottom floor contact laser + top barrier rail
        float bottomRail = exp(-y * 12.0) * 1.5;
        float topRail = exp(-(1.0 - y) * 14.0) * 1.1;

        vec3 neonMagenta = vec3(1.0, 0.16, 0.48);
        vec3 neonCyan = vec3(0.0, 0.92, 1.0);

        vec3 col = mix(neonMagenta, neonCyan, y * 0.55);
        float alpha = clamp(0.18 + bottomRail + topRail + hBands * 0.25 + vBands * 0.22, 0.0, 0.95);
        col *= (1.0 + bottomRail * 0.9 + topRail * 0.6);

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const buildWall = (x: number, z: number, rotY: number) => {
    const geo = new THREE.PlaneGeometry(arenaSize, wallHeight);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(x, wallHeight / 2, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
  };

  buildWall(0, -ARENA_HALF, 0);
  buildWall(0, ARENA_HALF, Math.PI);
  buildWall(-ARENA_HALF, 0, Math.PI / 2);
  buildWall(ARENA_HALF, 0, -Math.PI / 2);

  // Solid luminous perimeter base rail & corner beacons so perimeter is unmistakably sharp
  const railMat = new THREE.MeshBasicMaterial({ color: 0xff2a85 });
  const topRailMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

  const hBarGeo = new THREE.BoxGeometry(arenaSize, 0.55, 0.55);
  const vBarGeo = new THREE.BoxGeometry(0.55, 0.55, arenaSize);

  const northRail = new THREE.Mesh(hBarGeo, railMat);
  northRail.position.set(0, 0.28, -ARENA_HALF);
  const southRail = new THREE.Mesh(hBarGeo, railMat);
  southRail.position.set(0, 0.28, ARENA_HALF);
  const westRail = new THREE.Mesh(vBarGeo, railMat);
  westRail.position.set(-ARENA_HALF, 0.28, 0);
  const eastRail = new THREE.Mesh(vBarGeo, railMat);
  eastRail.position.set(ARENA_HALF, 0.28, 0);

  const northTop = new THREE.Mesh(hBarGeo, topRailMat);
  northTop.position.set(0, wallHeight, -ARENA_HALF);
  const southTop = new THREE.Mesh(hBarGeo, topRailMat);
  southTop.position.set(0, wallHeight, ARENA_HALF);
  const westTop = new THREE.Mesh(vBarGeo, topRailMat);
  westTop.position.set(-ARENA_HALF, wallHeight, 0);
  const eastTop = new THREE.Mesh(vBarGeo, topRailMat);
  eastTop.position.set(ARENA_HALF, wallHeight, 0);

  group.add(
    northRail,
    southRail,
    westRail,
    eastRail,
    northTop,
    southTop,
    westTop,
    eastTop
  );

  // Corner energy pylons outside the boundary corners for strong scale reference
  const pylonGeo = new THREE.CylinderGeometry(1.6, 2.2, wallHeight + 8, 8);
  const pylonMat = new THREE.MeshStandardMaterial({
    color: 0x0a1324,
    emissive: 0x00f0ff,
    emissiveIntensity: 0.7,
    metalness: 0.8,
    roughness: 0.2,
  });
  const corners = [
    [-ARENA_HALF, -ARENA_HALF],
    [ARENA_HALF, -ARENA_HALF],
    [-ARENA_HALF, ARENA_HALF],
    [ARENA_HALF, ARENA_HALF],
  ];
  for (const [cx, cz] of corners) {
    const pylon = new THREE.Mesh(pylonGeo, pylonMat);
    pylon.position.set(cx, (wallHeight + 8) / 2, cz);
    group.add(pylon);
  }

  const update = (elapsed: number) => {
    floorUniforms.uTime.value = elapsed;
    wallUniforms.uTime.value = elapsed;
  };

  const dispose = () => {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
  };

  return { group, update, dispose };
}
