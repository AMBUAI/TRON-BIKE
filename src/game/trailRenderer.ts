import * as THREE from 'three';
import type { TrailPoint } from '../../shared/types';

const MAX_SEGMENTS = 1600;
const WALL_HEIGHT = 2.15;
const RAIL_HALF_WIDTH = 0.14;

export class PlayerTrailMesh {
  public readonly group = new THREE.Group();
  private wallGeo: THREE.BufferGeometry;
  private wallMat: THREE.MeshBasicMaterial;
  private wallMesh: THREE.Mesh;

  private railGeo: THREE.BufferGeometry;
  private railMat: THREE.MeshBasicMaterial;
  private railMesh: THREE.Mesh;

  private wallPositions: Float32Array;
  private railPositions: Float32Array;

  constructor(colorHex: string) {
    const color = new THREE.Color(colorHex);

    // 6 vertices (2 triangles) per segment for vertical light wall
    this.wallPositions = new Float32Array(MAX_SEGMENTS * 6 * 3);
    this.wallGeo = new THREE.BufferGeometry();
    this.wallGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.wallPositions, 3)
    );
    this.wallGeo.setDrawRange(0, 0);

    this.wallMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.wallMesh = new THREE.Mesh(this.wallGeo, this.wallMat);
    this.wallMesh.frustumCulled = false;

    // Bright solid top energy rail (6 vertices per segment) so trails read clearly from 1st & 3rd person
    this.railPositions = new Float32Array(MAX_SEGMENTS * 6 * 3);
    this.railGeo = new THREE.BufferGeometry();
    this.railGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.railPositions, 3)
    );
    this.railGeo.setDrawRange(0, 0);

    const brightColor = color.clone().lerp(new THREE.Color(0xffffff), 0.35);
    this.railMat = new THREE.MeshBasicMaterial({
      color: brightColor,
      side: THREE.DoubleSide,
    });
    this.railMesh = new THREE.Mesh(this.railGeo, this.railMat);
    this.railMesh.frustumCulled = false;

    this.group.add(this.wallMesh, this.railMesh);
  }

  public setColor(hex: string) {
    const color = new THREE.Color(hex);
    this.wallMat.color.copy(color);
    this.railMat.color.copy(color).lerp(new THREE.Color(0xffffff), 0.35);
  }

  public updateTrail(points: TrailPoint[], alive: boolean) {
    if (!alive || points.length < 2) {
      this.group.visible = false;
      this.wallGeo.setDrawRange(0, 0);
      this.railGeo.setDrawRange(0, 0);
      return;
    }

    this.group.visible = true;
    const segCount = Math.min(points.length - 1, MAX_SEGMENTS);
    let wIdx = 0;
    let rIdx = 0;

    for (let i = 0; i < segCount; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.001) continue;

      // Vertical Wall Quad (2 triangles)
      // A_bot, B_bot, B_top, A_bot, B_top, A_top
      const y0 = 0.05;
      const y1 = WALL_HEIGHT;

      this.wallPositions[wIdx++] = a.x;
      this.wallPositions[wIdx++] = y0;
      this.wallPositions[wIdx++] = a.z;

      this.wallPositions[wIdx++] = b.x;
      this.wallPositions[wIdx++] = y0;
      this.wallPositions[wIdx++] = b.z;

      this.wallPositions[wIdx++] = b.x;
      this.wallPositions[wIdx++] = y1;
      this.wallPositions[wIdx++] = b.z;

      this.wallPositions[wIdx++] = a.x;
      this.wallPositions[wIdx++] = y0;
      this.wallPositions[wIdx++] = a.z;

      this.wallPositions[wIdx++] = b.x;
      this.wallPositions[wIdx++] = y1;
      this.wallPositions[wIdx++] = b.z;

      this.wallPositions[wIdx++] = a.x;
      this.wallPositions[wIdx++] = y1;
      this.wallPositions[wIdx++] = a.z;

      // Top Glowing Core Ribbon Quad (horizontal strip at y = WALL_HEIGHT)
      const nx = (-dz / len) * RAIL_HALF_WIDTH;
      const nz = (dx / len) * RAIL_HALF_WIDTH;

      this.railPositions[rIdx++] = a.x - nx;
      this.railPositions[rIdx++] = y1;
      this.railPositions[rIdx++] = a.z - nz;

      this.railPositions[rIdx++] = a.x + nx;
      this.railPositions[rIdx++] = y1;
      this.railPositions[rIdx++] = a.z + nz;

      this.railPositions[rIdx++] = b.x + nx;
      this.railPositions[rIdx++] = y1;
      this.railPositions[rIdx++] = b.z + nz;

      this.railPositions[rIdx++] = a.x - nx;
      this.railPositions[rIdx++] = y1;
      this.railPositions[rIdx++] = a.z - nz;

      this.railPositions[rIdx++] = b.x + nx;
      this.railPositions[rIdx++] = y1;
      this.railPositions[rIdx++] = b.z + nz;

      this.railPositions[rIdx++] = b.x - nx;
      this.railPositions[rIdx++] = y1;
      this.railPositions[rIdx++] = b.z - nz;
    }

    const wallPosAttr = this.wallGeo.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    wallPosAttr.needsUpdate = true;
    this.wallGeo.setDrawRange(0, wIdx / 3);

    const railPosAttr = this.railGeo.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    railPosAttr.needsUpdate = true;
    this.railGeo.setDrawRange(0, rIdx / 3);
  }

  public dispose() {
    this.wallGeo.dispose();
    this.wallMat.dispose();
    this.railGeo.dispose();
    this.railMat.dispose();
  }
}
