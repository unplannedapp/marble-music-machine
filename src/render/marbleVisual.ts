import * as THREE from 'three';

/** Procedural swirl texture so the marble's rotation is readable. */
function makeSwirlTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#1d3fb8';
  g.fillRect(0, 0, size, size);
  const bands: [string, number][] = [
    ['#f4f6ff', 0.9],
    ['#3d7bff', 0.8],
    ['#ffffff', 0.5],
    ['#0d1f6b', 0.9],
    ['#ff9f43', 0.55],
  ];
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const [color, alpha] = bands[i % bands.length];
    g.strokeStyle = color;
    g.globalAlpha = alpha;
    g.lineWidth = 14 + (i % 4) * 10;
    g.beginPath();
    const y0 = (i / 14) * size;
    g.moveTo(-50, y0);
    for (let x = 0; x <= size + 50; x += 16) {
      const y = y0 + Math.sin((x / size) * Math.PI * 2 + i) * 70 + Math.cos(x / 40 + i * 2) * 18;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createMarbleMesh(radius: number): THREE.Mesh {
  const geom = new THREE.SphereGeometry(radius, 48, 32);
  const mat = new THREE.MeshPhysicalMaterial({
    map: makeSwirlTexture(),
    roughness: 0.12,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}
