import * as THREE from 'three';

/** Shared visual materials so the machine reads as one object family. */
export const visuals = {
  metal: new THREE.MeshStandardMaterial({ color: 0xb8bcc6, metalness: 0.9, roughness: 0.32 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x3a3c44, metalness: 0.85, roughness: 0.4 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9a4a2e, metalness: 0.0, roughness: 0.65 }),
  board: new THREE.MeshStandardMaterial({ color: 0x5f5d70, metalness: 0.0, roughness: 0.95 }),
  colored(color: string | number | THREE.Color): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.45 });
  },
};

export const geometries = {
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  unitSphere: new THREE.SphereGeometry(1, 16, 12),
  /** Unit cylinder along Y. */
  unitCylinder: new THREE.CylinderGeometry(1, 1, 1, 24, 1),
};
