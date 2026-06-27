import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface OfficeDesk {
  name: string;
  color: string;
  active: boolean;
  busy: boolean;
}

interface OfficeSceneProps {
  desks: OfficeDesk[];
  onSelect: (index: number) => void;
}

const STATUS_BUSY = 0x3fb950;
const STATUS_ACTIVE = 0x58a6ff;
const STATUS_IDLE = 0x484f58;

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(13,17,23,0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillStyle = "#e6edf3";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = text.length > 16 ? `${text.slice(0, 15)}…` : text;
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

// Imperative three.js office: one desk per Hermes profile, avatar colored by
// the profile color, and an emissive status light (busy/active/idle). Loaded
// lazily so the three.js bundle is only pulled when the Office view opens.
function OfficeScene({ desks, onSelect }: OfficeSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.Fog(0x0d1117, 18, 42);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(8, 14, 8);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x58a6ff, 0.35);
    rim.position.set(-10, 6, -8);
    scene.add(rim);

    // Floor
    const cols = Math.max(1, Math.ceil(Math.sqrt(desks.length || 1)));
    const rows = Math.max(1, Math.ceil((desks.length || 1) / cols));
    const spacing = 3.2;
    const floorSize = Math.max(cols, rows) * spacing + 6;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorSize, floorSize),
      new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(floorSize, Math.round(floorSize / spacing) * 2, 0x30363d, 0x21262d);
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const selectable: THREE.Object3D[] = [];
    const disposables: Array<{ dispose: () => void }> = [];

    desks.forEach((desk, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = (col - (cols - 1) / 2) * spacing;
      const z = (row - (rows - 1) / 2) * spacing;

      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.userData.index = index;

      // Desk top
      const deskGeo = new THREE.BoxGeometry(1.8, 0.12, 1);
      const deskMat = new THREE.MeshStandardMaterial({ color: 0x2a313c, roughness: 0.7 });
      const deskTop = new THREE.Mesh(deskGeo, deskMat);
      deskTop.position.y = 0.7;
      deskTop.castShadow = true;
      group.add(deskTop);
      disposables.push(deskGeo, deskMat);

      // Monitor
      const monGeo = new THREE.BoxGeometry(0.9, 0.55, 0.06);
      const monMat = new THREE.MeshStandardMaterial({
        color: 0x0d1117,
        emissive: desk.busy ? 0x123a1f : 0x0a1929,
        emissiveIntensity: desk.busy ? 0.9 : 0.4,
      });
      const monitor = new THREE.Mesh(monGeo, monMat);
      monitor.position.set(0, 1.1, -0.35);
      group.add(monitor);
      disposables.push(monGeo, monMat);

      // Avatar (rounded body) colored by profile
      let avatarColor = 0x58a6ff;
      try {
        avatarColor = new THREE.Color(desk.color || "#58a6ff").getHex();
      } catch {
        avatarColor = 0x58a6ff;
      }
      const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.5, 4, 12);
      const bodyMat = new THREE.MeshStandardMaterial({ color: avatarColor, roughness: 0.5 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(0, 1.05, 0.45);
      body.castShadow = true;
      group.add(body);
      disposables.push(bodyGeo, bodyMat);

      const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({ color: avatarColor, roughness: 0.4 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(0, 1.55, 0.45);
      head.castShadow = true;
      group.add(head);
      disposables.push(headGeo, headMat);

      // Status light
      const statusColor = desk.busy ? STATUS_BUSY : desk.active ? STATUS_ACTIVE : STATUS_IDLE;
      const lightGeo = new THREE.SphereGeometry(0.12, 12, 12);
      const lightMat = new THREE.MeshStandardMaterial({
        color: statusColor,
        emissive: statusColor,
        emissiveIntensity: desk.busy || desk.active ? 1.1 : 0.3,
      });
      const statusLight = new THREE.Mesh(lightGeo, lightMat);
      statusLight.position.set(0.7, 1.9, 0.45);
      group.add(statusLight);
      statusLight.userData.pulse = desk.busy;
      disposables.push(lightGeo, lightMat);

      // Name label
      const label = makeLabelSprite(desk.name);
      label.position.set(0, 2.3, 0.45);
      group.add(label);
      disposables.push(label.material as THREE.Material, (label.material as THREE.SpriteMaterial).map as THREE.Texture);

      scene.add(group);
      selectable.push(deskTop, monitor, body, head, statusLight);
      deskTop.userData.index = index;
      monitor.userData.index = index;
      body.userData.index = index;
      head.userData.index = index;
      statusLight.userData.index = index;
    });

    // Camera orbit (spherical)
    let theta = Math.PI / 4;
    let phi = Math.PI / 3.2;
    let radius = floorSize * 0.95;
    let autoRotate = true;
    const target = new THREE.Vector3(0, 1, 0);

    const applyCamera = () => {
      phi = Math.max(0.35, Math.min(Math.PI / 2.1, phi));
      radius = Math.max(6, Math.min(floorSize * 1.6, radius));
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.cos(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.sin(theta),
      );
      camera.lookAt(target);
    };
    applyCamera();

    // Pointer interaction
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      moved = false;
      autoRotate = false;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      theta -= dx * 0.008;
      phi -= dy * 0.008;
      lastX = event.clientX;
      lastY = event.clientY;
      applyCamera();
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      try {
        renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      if (moved) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(selectable, false);
      if (hits.length > 0) {
        const index = hits[0].object.userData.index;
        if (typeof index === "number") onSelectRef.current(index);
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      radius += event.deltaY * 0.01;
      applyCamera();
    };

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    let frame = 0;
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      frame += 1;
      if (autoRotate) {
        theta += 0.0025;
        applyCamera();
      }
      const pulse = 0.6 + Math.sin(frame * 0.08) * 0.4;
      scene.traverse((obj) => {
        if (obj.userData.pulse && obj instanceof THREE.Mesh) {
          (obj.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
        }
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      disposables.forEach((d) => {
        try {
          d.dispose();
        } catch {
          /* ignore */
        }
      });
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      if (el.parentNode === container) container.removeChild(el);
    };
  }, [desks]);

  return <div className="office-canvas" ref={containerRef} />;
}

export default OfficeScene;
