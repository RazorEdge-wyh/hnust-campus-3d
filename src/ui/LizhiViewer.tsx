import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Building2, Layers, RotateCcw, X } from 'lucide-react';

const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}models/lizhi.glb`;
const META_URL = `${BASE}models/lizhi-meta.json`;

type LevelMeta = { id: string; name: string; elevation: number; objects: number; triangles: number };
type Meta = {
  source: string;
  isPlaceholder: boolean;
  generatedAt: string;
  levels: LevelMeta[];
  categories: { name: string; count: number; triangles: number }[];
  totals: { objects: number; levels: number; triangles: number; categories: number; sourceSizeMB: number };
};

class ModelBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Building({ level, autoRotate, onPick, onReady }: { level: string | null; autoRotate: boolean; onPick: (id: string) => void; onReady: () => void }) {
  const { scene } = useGLTF(MODEL_URL);
  const group = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.geometry.computeVertexNormals();
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    return clone;
  }, [scene]);

  useEffect(() => { onReady(); }, [onReady]);

  useEffect(() => {
    model.traverse((o) => {
      let node: THREE.Object3D | null = o;
      while (node && !node.name.startsWith('LEVEL_')) node = node.parent;
      if (!node) return;
      const id = node.name.slice('LEVEL_'.length);
      node.visible = !level || id === level;
    });
  }, [model, level]);

  useFrame((_, delta) => {
    if (autoRotate && group.current) group.current.rotation.y += delta * 0.12;
  });

  return (
    <group ref={group}>
      <primitive
        object={model}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          let node: THREE.Object3D | null = e.object;
          while (node && !node.name.startsWith('LEVEL_')) node = node.parent;
          if (node) onPick(node.name.slice('LEVEL_'.length));
        }}
      />
    </group>
  );
}

export function LizhiViewer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) { setLoaded(false); return; }
    let alive = true;
    fetch(META_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('meta'))))
      .then((d: Meta) => { if (alive) setMeta(d); })
      .catch(() => { if (alive) setMeta(null); });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const mobile = typeof window !== 'undefined' && window.innerWidth < 900;

  const levels = meta ? [...meta.levels].sort((a, b) => a.elevation - b.elevation) : [];
  const current = levels.find((l) => l.id === level);

  return (
    <div className="lizhi-modal" role="dialog" aria-modal="true" aria-label="立志楼数字孪生模型">
      <div className="lizhi-head">
        <div>
          <span className="lizhi-eyebrow"><Building2 size={14} />立志楼 · 数字孪生</span>
          <h2>立志楼真实 BIM 模型</h2>
          <p>{meta ? `${meta.totals.objects.toLocaleString()} 个构件 · ${meta.totals.triangles.toLocaleString()} 个三角面 · ${meta.totals.levels} 个标高` : '正在读取模型信息…'}</p>
        </div>
        <button className="lizhi-close" onClick={onClose} aria-label="关闭模型查看器"><X size={20} /></button>
      </div>

      <div className="lizhi-body">
        <aside className="lizhi-levels">
          <div className="lizhi-levels-head"><Layers size={14} />楼层 / 标高</div>
          <button className={level === null ? 'active' : ''} onClick={() => setLevel(null)}>
            <strong>整栋建筑</strong><small>全部 15 个标高</small>
          </button>
          {levels.map((l) => (
            <button key={l.id} className={level === l.id ? 'active' : ''} onClick={() => setLevel(l.id)}>
              <strong>{l.name}</strong>
              <small>{l.elevation.toFixed(2)} m · {l.objects} 构件</small>
            </button>
          ))}
        </aside>

        <div className="lizhi-stage">
          <ModelBoundary onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <Canvas dpr={[1, 1.8]} camera={{ position: mobile ? [235, 195, 255] : [82, 68, 92], fov: 40, near: 1, far: 2000 }} gl={{ antialias: true }}>
                <color attach="background" args={['#12161c']} />
                <ambientLight intensity={1.1} />
                <hemisphereLight args={['#dfe9ff', '#2a2f36', 1.2]} />
                <directionalLight position={[120, 160, 90]} intensity={2.4} />
                <directionalLight position={[-100, 60, -80]} intensity={1.1} color="#c7d7ff" />
                <Building level={level} autoRotate={autoRotate} onPick={setLevel} onReady={() => setLoaded(true)} />
                <OrbitControls enableDamping target={[0, 0, 0]} minDistance={25} maxDistance={420} />
              </Canvas>
            </Suspense>
          </ModelBoundary>
          {failed && (
            <div className="lizhi-loading">
              模型加载失败：请确认 public/models/lizhi.glb 已构建（运行 node tools/prepare-lizhi-model.mjs）
            </div>
          )}
          {!loaded && !failed && <div className="lizhi-loading"><div className="lizhi-spinner" />正在加载真实 Revit 模型（9.6 MB）…</div>}
          <div className="lizhi-hint">拖动旋转 · 滚轮缩放 · 点击构件选择楼层</div>
        </div>

        <aside className="lizhi-info">
          <div className="lizhi-actions">
            <button className={autoRotate ? 'active' : ''} onClick={() => setAutoRotate((v) => !v)}>
              <RotateCcw size={14} />{autoRotate ? '停止旋转' : '自动旋转'}
            </button>
            {level && <button onClick={() => setLevel(null)}>查看整栋</button>}
          </div>
          {level && current ? (
            <div className="lizhi-current">
              <h3>{current.name}</h3>
              <dl>
                <dt>标高</dt><dd>{current.elevation.toFixed(2)} m</dd>
                <dt>构件</dt><dd>{current.objects.toLocaleString()}</dd>
                <dt>三角面</dt><dd>{current.triangles.toLocaleString()}</dd>
              </dl>
            </div>
          ) : (
            <div className="lizhi-current">
              <h3>整栋建筑</h3>
              <p>{meta ? `真实 Revit 几何，由「${meta.source}」导出。当前为概念性数字孪生展示：楼层、构件均来自模型文件本身。` : '正在读取…'}</p>
            </div>
          )}
          <div className="lizhi-cats">
            <h4>构件类别</h4>
            {meta?.categories.slice(0, 8).map((c) => (
              <div key={c.name}><span>{c.name}</span><strong>{c.count.toLocaleString()}</strong></div>
            ))}
          </div>
          <p className="lizhi-note">模型只读展示，不含实时传感器数据；传感器点位与仿真数据见桌面项目 E:\project\unityVR。</p>
        </aside>
      </div>
    </div>
  );
}
