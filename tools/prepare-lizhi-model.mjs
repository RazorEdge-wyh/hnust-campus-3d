// 把 E:\project\unityVR\shared\building-model.json（真实 Revit 导出几何）
// 转成网页用 GLB：按「标高 × 构件类别」合并，保留楼层分组，便于查看器做楼层筛选。
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// three 的 GLTFExporter 在 Node 里依赖 FileReader，补一个最小实现
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() { this.result = null; this.onloadend = null; this.onerror = null; }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (typeof this.onloadend === 'function') this.onloadend();
      }).catch((err) => {
        if (typeof this.onerror === 'function') this.onerror(err);
      });
    }
  };
}

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = process.env.LIZHI_MODEL || 'E:\\project\\unityVR\\shared\\building-model.json';
const OUT_DIR = path.join(ROOT, 'public', 'models');
const OUT_GLB = path.join(OUT_DIR, 'lizhi.glb');
const OUT_META = path.join(OUT_DIR, 'lizhi-meta.json');

const CAT_COLORS = {
  Floors: 0xd9d4c8,
  Roofs: 0x9a9288,
  Walls: 0xd8cbb6,
  Columns: 0xb9b3a8,
  Windows: 0x7fa6b8,
  Doors: 0x8a6f55,
  Stairs: 0xbfb6a6,
  Landings: 0xc7bfae,
  Runs: 0xb5ad9d,
  Railings: 0x7d7a72,
  'Top Rails': 0x8b877e,
  Balusters: 0x918d84,
  Supports: 0x9c9286,
  'Curtain Panels': 0x76a1b5,
  Concept: 0xd4c8b4,
};

console.log('读取模型:', SRC);
const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
console.log('对象:', raw.objects.length, '标高:', raw.levels.length);

// 统一坐标：以整体包围盒中心为原点，Y 向上（源数据已是 Unity XZY 转出的 Y-up）
const groups = new Map(); // levelId -> category -> geometries
const levelStats = new Map();
const categoryCount = {};
const categoryTris = {};

for (const obj of raw.objects) {
  const verts = obj.vertices;
  const tris = obj.triangles;
  if (!verts?.length || !tris?.length) continue;
  const levelId = obj.levelId || 'unknown';
  const category = obj.category || 'Other';
  categoryCount[category] = (categoryCount[category] || 0) + 1;
  const triCount = Math.floor(tris.length / 3);
  categoryTris[category] = (categoryTris[category] || 0) + triCount;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(tris);
  // 法线在查看器加载后统一计算，减小 GLB 体积

  if (!groups.has(levelId)) groups.set(levelId, new Map());
  const byCat = groups.get(levelId);
  if (!byCat.has(category)) byCat.set(category, []);
  byCat.get(category).push(geo);

  if (!levelStats.has(levelId)) levelStats.set(levelId, { objects: 0, triangles: 0 });
  const st = levelStats.get(levelId);
  st.objects += 1;
  st.triangles += triCount;
}

// 整体包围盒
const bbox = new THREE.Box3();
for (const byCat of groups.values()) {
  for (const list of byCat.values()) for (const g of list) {
    g.computeBoundingBox();
    bbox.union(g.boundingBox);
  }
}
const center = bbox.getCenter(new THREE.Vector3());
const size = bbox.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
const scale = 100 / maxDim; // 统一缩放到 100 单位，方便查看器
console.log('原始尺寸:', size.toArray().map(n => n.toFixed(2)), '缩放:', scale.toFixed(5));

const rootGroup = new THREE.Group();
rootGroup.name = 'LizhiBuilding';
const levelList = raw.levels.map(l => ({ ...l, objects: levelStats.get(l.id)?.objects || 0, triangles: levelStats.get(l.id)?.triangles || 0 }));

for (const [levelId, byCat] of groups) {
  const levelDef = raw.levels.find(l => l.id === levelId);
  const levelGroup = new THREE.Group();
  levelGroup.name = `LEVEL_${levelId}`;
  levelGroup.userData = {
    levelId,
    levelName: levelDef?.name || levelId,
    elevation: levelDef?.elevation ?? 0,
    objects: levelStats.get(levelId)?.objects || 0,
    triangles: levelStats.get(levelId)?.triangles || 0,
  };
  for (const [category, list] of byCat) {
    const merged = mergeGeometries(list, false);
    list.forEach(g => g.dispose());
    if (!merged) continue;
    merged.translate(-center.x, -center.y, -center.z);
    merged.scale(scale, scale, scale);
    const mat = new THREE.MeshStandardMaterial({
      color: CAT_COLORS[category] ?? 0xb9b0a2,
      roughness: 0.82,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `OBJ_${category.replace(/\s+/g, '_')}`;
    mesh.userData = { levelId, category };
    levelGroup.add(mesh);
  }
  rootGroup.add(levelGroup);
}

const meta = {
  schemaVersion: 1,
  source: raw.source,
  isPlaceholder: !!raw.isPlaceholder,
  units: 'metres',
  generatedAt: new Date().toISOString(),
  levels: levelList,
  categories: Object.entries(categoryCount)
    .map(([name, count]) => ({ name, count, triangles: categoryTris[name] || 0 }))
    .sort((a, b) => b.count - a.count),
  totals: {
    objects: raw.objects.length,
    levels: raw.levels.length,
    triangles: Object.values(categoryTris).reduce((a, b) => a + b, 0),
    categories: Object.keys(categoryCount).length,
    sourceSizeMB: +(fs.statSync(SRC).size / 1024 / 1024).toFixed(2),
  },
  viewer: { scale, bbox: { min: bbox.min.toArray(), max: bbox.max.toArray() } },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_META, JSON.stringify(meta, null, 2));

const exporter = new GLTFExporter();
exporter.parse(
  rootGroup,
  (result) => {
    const buf = Buffer.from(result);
    fs.writeFileSync(OUT_GLB, buf);
    console.log('GLB:', OUT_GLB, (buf.length / 1024 / 1024).toFixed(2), 'MB');
    console.log('META:', OUT_META, (fs.statSync(OUT_META).size / 1024).toFixed(1), 'KB');
    console.log('三角面:', meta.totals.triangles.toLocaleString(), '构件:', meta.totals.objects);
  },
  (err) => { console.error('导出失败', err); process.exit(1); },
  { binary: true, onlyVisible: true },
);
