import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  ARENA_HALF,
  BIKE_SPEED,
  DIR_VECTORS,
  type CharacterModelId,
  type Direction,
  type RoomPhase,
  type TrailPoint,
  type VehicleType,
} from '../../shared/types';
import { createArenaMesh, type ArenaHandle } from './arenaMesh';
import { createLightCycleRig, type VehicleRig } from './bikeMesh';
import { createNeonCarRig } from './carMesh';
import { preloadCharacterModels } from './characterLoader';
import { PlayerTrailMesh } from './trailRenderer';

export type CameraMode = 'third' | 'first';

function buildVehicleRig(
  vehicleType: VehicleType,
  colorHex: string,
  characterId: CharacterModelId
): VehicleRig {
  return vehicleType === 'car'
    ? createNeonCarRig(colorHex, characterId)
    : createLightCycleRig(colorHex, characterId);
}

interface ClientBikeState {
  playerId: string;
  colorHex: string;
  characterId: CharacterModelId;
  vehicleType: VehicleType;
  alive: boolean;
  targetX: number;
  targetZ: number;
  displayX: number;
  displayZ: number;
  dir: Direction;
  displayYaw: number;
  leanAngle: number;
  rig: VehicleRig;
  trailMesh: PlayerTrailMesh;
  trailPoints: TrailPoint[];
}

interface CrashParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  life: number;
  maxLife: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

const DIR_YAW: Record<Direction, number> = {
  0: 0, // -Z
  1: -Math.PI / 2, // +X
  2: Math.PI, // +Z
  3: Math.PI / 2, // -X
};

function shortestAngleDiff(current: number, target: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

export class TronEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private arena: ArenaHandle;
  private showcaseRig: VehicleRig;
  private showcaseCharacterId: CharacterModelId = 'tron1';
  private showcaseColorHex = '#00F0FF';
  private showcaseVehicleType: VehicleType = 'bike';

  private isSoftwareGl: boolean;
  private resizeObserver: ResizeObserver | null = null;
  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  private mode: 'showcase' | 'match' = 'showcase';
  private phase: RoomPhase = 'lobby';
  private localPlayerId: string | null = null;
  private cameraMode: CameraMode = 'third';
  private winnerId: string | null = null;
  private winnerStuntElapsed = 0;

  private bikes = new Map<string, ClientBikeState>();
  private particles: CrashParticle[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private shardGeo = new THREE.BoxGeometry(0.45, 0.25, 0.75);
  private ringGeo = new THREE.RingGeometry(0.6, 1.4, 32);

  // Camera smoothing state
  private camPos = new THREE.Vector3(0, 12, 24);
  private camLook = new THREE.Vector3(0, 1, 0);
  private camRoll = 0;
  private camInit = false;

  // Free Spectator Camera state
  private specActive = false;
  private specPos = new THREE.Vector3(0, 45, 90);
  private specYaw = 0;
  private specPitch = -0.35;
  private specMoveInput = { forward: 0, strafe: 0, vertical: 0 };

  constructor(container: HTMLElement, defaultCam: CameraMode = 'third') {
    this.container = container;
    this.cameraMode = defaultCam;

    this.isSoftwareGl = (() => {
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

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060d);
    this.scene.fog = new THREE.FogExp2(0x04060d, 0.00175);

    this.camera = new THREE.PerspectiveCamera(68, w / Math.max(1, h), 0.25, 1100);
    this.camera.position.copy(this.camPos);

    // Studio environment reflection for metallic bike fairings
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 3-point atmospheric lighting
    const hemi = new THREE.HemisphereLight(0x55d8ff, 0x090d1a, 0.9);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xeef7ff, 1.8);
    keyLight.position.set(80, 140, 60);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 10;
      keyLight.shadow.camera.far = 350;
      const d = 120;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff2a85, 0.9);
    rimLight.position.set(-90, 50, -80);
    this.scene.add(rimLight);

    // Enormous 800x800 Arena
    this.arena = createArenaMesh();
    this.scene.add(this.arena.group);

    // Showcase vehicle + character for menu backdrop
    void preloadCharacterModels();
    this.showcaseRig = buildVehicleRig(
      this.showcaseVehicleType,
      this.showcaseColorHex,
      this.showcaseCharacterId
    );
    this.showcaseRig.root.position.set(0, 0, 0);
    this.scene.add(this.showcaseRig.root);

    // Postprocessing bloom on hardware GPU
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.55,
        0.45,
        0.72
      );
      this.composer.addPass(this.bloomPass);
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.ringGeo.rotateX(-Math.PI / 2);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(container);
    }
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.handleContextLost
    );

    this.tick();
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
  };

  public handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  };

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
  }

  public getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  public setLocalPlayerId(id: string | null) {
    this.localPlayerId = id;
  }

  public setShowcaseConfig(
    characterId: CharacterModelId,
    colorHex: string,
    vehicleType: VehicleType
  ) {
    const vehicleChanged = vehicleType !== this.showcaseVehicleType;
    const charChanged = characterId !== this.showcaseCharacterId;
    const colorChanged = colorHex !== this.showcaseColorHex;

    this.showcaseCharacterId = characterId;
    this.showcaseColorHex = colorHex;
    this.showcaseVehicleType = vehicleType;

    if (vehicleChanged) {
      const wasVisible = this.showcaseRig.root.visible;
      this.scene.remove(this.showcaseRig.root);
      this.showcaseRig.dispose();
      this.showcaseRig = buildVehicleRig(vehicleType, colorHex, characterId);
      this.showcaseRig.root.visible = wasVisible;
      this.scene.add(this.showcaseRig.root);
    } else {
      if (colorChanged) {
        this.showcaseRig.setColor(colorHex);
      }
      if (charChanged) {
        this.showcaseRig.setCharacter(characterId);
      }
    }
  }

  public enterShowcaseMode() {
    this.mode = 'showcase';
    this.phase = 'lobby';
    this.specActive = false;
    this.winnerId = null;
    this.clearMatchObjects();
    this.showcaseRig.root.visible = true;
    this.showcaseRig.wheeliePivot.rotation.x = 0;
  }

  private clearMatchObjects() {
    for (const b of this.bikes.values()) {
      this.scene.remove(b.rig.root);
      this.scene.remove(b.trailMesh.group);
      b.rig.dispose();
      b.trailMesh.dispose();
    }
    this.bikes.clear();
  }

  public syncMatchSnapshot(
    phase: RoomPhase,
    bikesData: Array<{
      playerId: string;
      colorHex: string;
      characterId: CharacterModelId;
      vehicleType: VehicleType;
      x: number;
      z: number;
      dir: Direction;
      alive: boolean;
      trail: TrailPoint[];
    }>,
    winnerId: string | null
  ) {
    this.mode = 'match';
    this.showcaseRig.root.visible = false;

    const prevPhase = this.phase;
    this.phase = phase;

    if (phase === 'victory_stunt' && prevPhase !== 'victory_stunt') {
      this.winnerId = winnerId;
      this.winnerStuntElapsed = 0;
      this.specActive = false;
    } else if (phase !== 'victory_stunt' && phase !== 'results') {
      this.winnerId = null;
    }

    const incomingIds = new Set(bikesData.map((b) => b.playerId));
    for (const [id, existing] of this.bikes.entries()) {
      if (!incomingIds.has(id)) {
        this.scene.remove(existing.rig.root);
        this.scene.remove(existing.trailMesh.group);
        existing.rig.dispose();
        existing.trailMesh.dispose();
        this.bikes.delete(id);
      }
    }

    for (const bd of bikesData) {
      let state = this.bikes.get(bd.playerId);
      if (!state) {
        const rig = buildVehicleRig(bd.vehicleType, bd.colorHex, bd.characterId);
        const trailMesh = new PlayerTrailMesh(bd.colorHex);
        this.scene.add(rig.root);
        this.scene.add(trailMesh.group);

        const yaw = DIR_YAW[bd.dir];
        rig.root.position.set(bd.x, 0, bd.z);
        rig.root.rotation.y = yaw;

        state = {
          playerId: bd.playerId,
          colorHex: bd.colorHex,
          characterId: bd.characterId,
          vehicleType: bd.vehicleType,
          alive: bd.alive,
          targetX: bd.x,
          targetZ: bd.z,
          displayX: bd.x,
          displayZ: bd.z,
          dir: bd.dir,
          displayYaw: yaw,
          leanAngle: 0,
          rig,
          trailMesh,
          trailPoints: bd.trail,
        };
        this.bikes.set(bd.playerId, state);

        if (bd.playerId === this.localPlayerId && !this.camInit) {
          this.snapCameraToBike(state);
          this.camInit = true;
        }
      } else {
        if (state.vehicleType !== bd.vehicleType) {
          this.scene.remove(state.rig.root);
          state.rig.dispose();
          state.vehicleType = bd.vehicleType;
          state.characterId = bd.characterId;
          state.colorHex = bd.colorHex;
          state.rig = buildVehicleRig(bd.vehicleType, bd.colorHex, bd.characterId);
          state.rig.root.position.set(state.displayX, 0, state.displayZ);
          state.rig.root.rotation.y = state.displayYaw;
          this.scene.add(state.rig.root);
          state.trailMesh.setColor(bd.colorHex);
        } else {
          if (state.colorHex !== bd.colorHex) {
            state.colorHex = bd.colorHex;
            state.rig.setColor(bd.colorHex);
            state.trailMesh.setColor(bd.colorHex);
          }
          if (state.characterId !== bd.characterId) {
            state.characterId = bd.characterId;
            state.rig.setCharacter(bd.characterId);
          }
        }
        state.targetX = bd.x;
        state.targetZ = bd.z;
        if (state.dir !== bd.dir) {
          // Determine turn sign for lean animation (steeper for bike, subtle roll for car)
          const diff = (bd.dir - state.dir + 4) % 4;
          const maxLean = state.vehicleType === 'car' ? 0.16 : 0.48;
          if (diff === 1) state.leanAngle = -maxLean;
          else if (diff === 3) state.leanAngle = maxLean;
          state.dir = bd.dir;
        }
        state.alive = bd.alive;
        state.trailPoints = bd.trail;

        // Immediately hide bike & entire trail if eliminated
        if (!bd.alive) {
          state.rig.root.visible = false;
          state.trailMesh.updateTrail([], false);
          if (bd.playerId === this.localPlayerId && !this.specActive && phase === 'playing') {
            this.activateSpectatorMode(state.displayX, state.displayZ, state.displayYaw);
          }
        } else {
          state.rig.root.visible = true;
        }
      }

      if (bd.alive) {
        state.trailMesh.updateTrail(bd.trail, true);
      }
    }

    if (phase === 'countdown') {
      this.specActive = false;
      this.camInit = false;
      const local = this.localPlayerId ? this.bikes.get(this.localPlayerId) : null;
      if (local) {
        local.rig.wheeliePivot.rotation.x = 0;
        this.snapCameraToBike(local);
      }
    }
  }

  public applyTickUpdate(
    bikesData: Array<{
      playerId: string;
      x: number;
      z: number;
      dir: Direction;
      alive: boolean;
      trail: TrailPoint[];
    }>
  ) {
    if (this.mode !== 'match') return;
    for (const bd of bikesData) {
      const state = this.bikes.get(bd.playerId);
      if (!state) continue;

      state.targetX = bd.x;
      state.targetZ = bd.z;

      if (state.dir !== bd.dir) {
        const diff = (bd.dir - state.dir + 4) % 4;
        const maxLean = state.vehicleType === 'car' ? 0.18 : 0.5;
        if (diff === 1) state.leanAngle = -maxLean;
        else if (diff === 3) state.leanAngle = maxLean;
        state.dir = bd.dir;
      }

      state.alive = bd.alive;
      state.trailPoints = bd.trail;

      if (!bd.alive) {
        state.rig.root.visible = false;
        state.trailMesh.updateTrail([], false);
        if (bd.playerId === this.localPlayerId && !this.specActive && this.phase === 'playing') {
          this.activateSpectatorMode(state.displayX, state.displayZ, state.displayYaw);
        }
      } else {
        state.rig.root.visible = true;
        state.trailMesh.updateTrail(bd.trail, true);
      }
    }
  }

  public spawnEliminationEffect(x: number, z: number, colorHex: string) {
    const color = new THREE.Color(colorHex);

    // Expanding shockwave ring
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.position.set(x, 0.25, z);
    this.scene.add(ringMesh);
    this.shockwaves.push({ mesh: ringMesh, life: 0, maxLife: 0.75 });

    // 22 glowing derez shards
    for (let i = 0; i < 22; i++) {
      const shardMat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffffff : color,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.shardGeo, shardMat);
      mesh.position.set(x, 0.8 + Math.random() * 1.1, z);
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 28;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 5 + Math.random() * 16,
        vz: Math.sin(angle) * speed,
        rx: (Math.random() - 0.5) * 14,
        ry: (Math.random() - 0.5) * 14,
        life: 0,
        maxLife: 0.9 + Math.random() * 0.4,
      });
    }
  }

  private activateSpectatorMode(fromX: number, fromZ: number, fromYaw: number) {
    this.specActive = true;
    this.specPos.set(fromX, 26, fromZ);
    // Offset slightly back from crash site
    this.specPos.x += Math.sin(fromYaw) * 24;
    this.specPos.z += Math.cos(fromYaw) * 24;
    this.specYaw = fromYaw;
    this.specPitch = -0.38;
  }

  public rotateSpectator(deltaYaw: number, deltaPitch: number) {
    if (!this.specActive) return;
    this.specYaw += deltaYaw;
    this.specPitch = THREE.MathUtils.clamp(
      this.specPitch + deltaPitch,
      -1.35,
      0.25
    );
  }

  public setSpectatorMove(forward: number, strafe: number, vertical: number) {
    this.specMoveInput.forward = forward;
    this.specMoveInput.strafe = strafe;
    this.specMoveInput.vertical = vertical;
  }

  public jumpSpectatorToNextAlive(): string | null {
    const alive = Array.from(this.bikes.values()).filter((b) => b.alive);
    if (alive.length === 0) return null;
    // Pick nearest or cycle based on current camera distance
    let best = alive[0];
    let maxD = -1;
    for (const b of alive) {
      const d = Math.hypot(b.displayX - this.specPos.x, b.displayZ - this.specPos.z);
      if (d > maxD) {
        maxD = d;
        best = b;
      }
    }
    const vec = DIR_VECTORS[best.dir];
    this.specPos.set(
      best.displayX - vec.x * 26,
      18,
      best.displayZ - vec.z * 26
    );
    this.specYaw = DIR_YAW[best.dir];
    this.specPitch = -0.35;
    return best.playerId;
  }

  private snapCameraToBike(bike: ClientBikeState) {
    const vec = DIR_VECTORS[bike.dir];
    if (this.cameraMode === 'first') {
      this.camPos.set(bike.displayX + vec.x * 0.95, 1.78, bike.displayZ + vec.z * 0.95);
      this.camLook.set(bike.displayX + vec.x * 38, 1.45, bike.displayZ + vec.z * 38);
    } else {
      this.camPos.set(bike.displayX - vec.x * 13.5, 5.4, bike.displayZ - vec.z * 13.5);
      this.camLook.set(bike.displayX + vec.x * 10, 1.3, bike.displayZ + vec.z * 10);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private tick = () => {
    if (this.disposed) return;

    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;

    this.arena.update(elapsed);
    this.updateEffects(dt);

    if (this.mode === 'showcase') {
      this.updateShowcase(dt, elapsed);
    } else {
      this.updateMatch(dt, elapsed);
    }

    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateEffects(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 26 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.15, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.y += p.ry * dt;
      const t = 1 - p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const p = s.life / s.maxLife;
      const scale = 1 + p * 16;
      s.mesh.scale.set(scale, scale, scale);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.9;
    }
  }

  private updateShowcase(dt: number, elapsed: number) {
    // Showcase vehicle cruising along Z=0 and banking gently in center backdrop
    this.showcaseRig.spinWheels(-dt * 16);
    const leanAmp = this.showcaseVehicleType === 'car' ? 0.04 : 0.14;
    this.showcaseRig.leanGroup.rotation.z = Math.sin(elapsed * 0.9) * leanAmp;

    const orbitAngle = elapsed * 0.34;
    const isShortLandscape = this.camera.aspect > 1.75;
    const radius = isShortLandscape ? 8.1 : 7.6;
    this.camera.position.set(
      Math.sin(orbitAngle) * radius,
      (isShortLandscape ? 2.85 : 2.65) + Math.sin(elapsed * 0.6) * 0.3,
      Math.cos(orbitAngle) * radius
    );
    this.camera.fov = isShortLandscape ? 52 : 56;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, isShortLandscape ? 0.2 : 0.35, 0);
  }

  private updateMatch(dt: number, elapsed: number) {
    // 1. Update all living vehicles smoothly
    for (const b of this.bikes.values()) {
      if (!b.alive) continue;

      if (this.phase === 'playing') {
        const vec = DIR_VECTORS[b.dir];
        // Dead-reckon forward smoothly between server ticks, then damp toward server target
        b.displayX += vec.x * BIKE_SPEED * dt;
        b.displayZ += vec.z * BIKE_SPEED * dt;
        b.displayX = THREE.MathUtils.damp(b.displayX, b.targetX, 22, dt);
        b.displayZ = THREE.MathUtils.damp(b.displayZ, b.targetZ, 22, dt);

        b.rig.spinWheels(-dt * 48);
      } else {
        b.displayX = THREE.MathUtils.damp(b.displayX, b.targetX, 14, dt);
        b.displayZ = THREE.MathUtils.damp(b.displayZ, b.targetZ, 14, dt);
      }

      const targetYaw = DIR_YAW[b.dir];
      const yawDiff = shortestAngleDiff(b.displayYaw, targetYaw);
      b.displayYaw += yawDiff * (1 - Math.exp(-26 * dt));
      b.leanAngle = THREE.MathUtils.damp(b.leanAngle, 0, 9, dt);

      b.rig.root.position.set(b.displayX, 0, b.displayZ);
      b.rig.root.rotation.y = b.displayYaw;
      b.rig.leanGroup.rotation.z = b.leanAngle;

      // Wheelie victory stunt on winning vehicle!
      if (
        (this.phase === 'victory_stunt' || this.phase === 'results') &&
        b.playerId === this.winnerId
      ) {
        this.winnerStuntElapsed += dt;
        const targetLift =
          0.62 + Math.sin(this.winnerStuntElapsed * 5.2) * 0.045;
        b.rig.wheeliePivot.rotation.x = THREE.MathUtils.damp(
          b.rig.wheeliePivot.rotation.x,
          targetLift,
          5.5,
          dt
        );
        b.rig.spinWheels(-dt * 26, true);
      } else {
        b.rig.wheeliePivot.rotation.x = THREE.MathUtils.damp(
          b.rig.wheeliePivot.rotation.x,
          0,
          10,
          dt
        );
      }
    }

    // 2. Camera choreography
    if (
      (this.phase === 'victory_stunt' || this.phase === 'results') &&
      this.winnerId &&
      this.bikes.has(this.winnerId)
    ) {
      const winBike = this.bikes.get(this.winnerId)!;
      const orbit = winBike.displayYaw + 0.65 + this.winnerStuntElapsed * 0.55;
      const dist = 9.5;
      _vec3A.set(
        winBike.displayX + Math.sin(orbit) * dist,
        3.2,
        winBike.displayZ + Math.cos(orbit) * dist
      );
      _vec3B.set(winBike.displayX, 1.5, winBike.displayZ);
      this.camPos.lerp(_vec3A, 1 - Math.exp(-5 * dt));
      this.camLook.lerp(_vec3B, 1 - Math.exp(-7 * dt));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 60, 6, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    const localBike = this.localPlayerId
      ? this.bikes.get(this.localPlayerId)
      : undefined;

    if (this.specActive || (localBike && !localBike.alive)) {
      // Free Spectator Camera across the entire enormous arena
      const speed = 95;
      const fwdX = -Math.sin(this.specYaw);
      const fwdZ = -Math.cos(this.specYaw);
      const rightX = Math.cos(this.specYaw);
      const rightZ = -Math.sin(this.specYaw);

      this.specPos.x +=
        (fwdX * this.specMoveInput.forward + rightX * this.specMoveInput.strafe) *
        speed *
        dt;
      this.specPos.z +=
        (fwdZ * this.specMoveInput.forward + rightZ * this.specMoveInput.strafe) *
        speed *
        dt;
      this.specPos.y = THREE.MathUtils.clamp(
        this.specPos.y + this.specMoveInput.vertical * 48 * dt,
        4,
        170
      );
      this.specPos.x = THREE.MathUtils.clamp(
        this.specPos.x,
        -ARENA_HALF + 5,
        ARENA_HALF - 5
      );
      this.specPos.z = THREE.MathUtils.clamp(
        this.specPos.z,
        -ARENA_HALF + 5,
        ARENA_HALF - 5
      );

      _vec3B.set(
        this.specPos.x + Math.cos(this.specPitch) * fwdX * 30,
        this.specPos.y + Math.sin(this.specPitch) * 30,
        this.specPos.z + Math.cos(this.specPitch) * fwdZ * 30
      );

      this.camera.position.lerp(this.specPos, 1 - Math.exp(-14 * dt));
      this.camLook.lerp(_vec3B, 1 - Math.exp(-16 * dt));
      this.camera.lookAt(this.camLook);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 72, 6, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    if (localBike && localBike.alive) {
      const fwdX = -Math.sin(localBike.displayYaw);
      const fwdZ = -Math.cos(localBike.displayYaw);

      if (this.phase === 'countdown') {
        // Sweeping dramatic pre-race camera settle
        const offsetAngle = Math.sin(elapsed * 1.1) * 0.25;
        const dist = this.cameraMode === 'first' ? 0.2 : 12.5;
        const height = this.cameraMode === 'first' ? 2.08 : 5.0;
        _vec3A.set(
          localBike.displayX - (fwdX + Math.sin(offsetAngle) * 0.2) * dist,
          height,
          localBike.displayZ - (fwdZ + Math.cos(offsetAngle) * 0.2) * dist
        );
        _vec3B.set(
          localBike.displayX + fwdX * 18,
          1.4,
          localBike.displayZ + fwdZ * 18
        );
        this.camPos.lerp(_vec3A, 1 - Math.exp(-7 * dt));
        this.camLook.lerp(_vec3B, 1 - Math.exp(-9 * dt));
        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 68, 8, dt);
        this.camera.updateProjectionMatrix();
        return;
      }

      if (this.cameraMode === 'first') {
        // Immersive First-Person Rider Perspective
        _vec3A.set(
          localBike.displayX + fwdX * 0.95,
          1.78,
          localBike.displayZ + fwdZ * 0.95
        );
        _vec3B.set(
          localBike.displayX + fwdX * 42,
          1.45,
          localBike.displayZ + fwdZ * 42
        );
        this.camPos.lerp(_vec3A, 1 - Math.exp(-32 * dt));
        this.camLook.lerp(_vec3B, 1 - Math.exp(-28 * dt));
        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);

        this.camRoll = THREE.MathUtils.damp(
          this.camRoll,
          localBike.leanAngle * 0.35,
          12,
          dt
        );
        this.camera.rotateZ(this.camRoll);
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 88, 8, dt);
        this.camera.updateProjectionMatrix();
      } else {
        // Smooth Third-Person Chase Camera
        _vec3A.set(
          localBike.displayX - fwdX * 14.0,
          5.5,
          localBike.displayZ - fwdZ * 14.0
        );
        _vec3B.set(
          localBike.displayX + fwdX * 15,
          1.45,
          localBike.displayZ + fwdZ * 15
        );
        this.camPos.lerp(_vec3A, 1 - Math.exp(-20 * dt));
        this.camLook.lerp(_vec3B, 1 - Math.exp(-22 * dt));
        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);

        this.camRoll = THREE.MathUtils.damp(
          this.camRoll,
          localBike.leanAngle * 0.18,
          10,
          dt
        );
        this.camera.rotateZ(this.camRoll);
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 78, 8, dt);
        this.camera.updateProjectionMatrix();
      }
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.handleContextLost
    );

    this.clearMatchObjects();
    this.showcaseRig.dispose();
    this.arena.dispose();
    this.shardGeo.dispose();
    this.ringGeo.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
