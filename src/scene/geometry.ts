import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Point, Building, Road, Landscape, Landmark } from '../types';
import { seededRandom } from '../state.ts';
export const boxGeo=new THREE.BoxGeometry(1,1,1);
export function polygonGeometry(points:Point[],height=0) {
 const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
 const g=height?new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}):new THREE.ShapeGeometry(shape);
 g.rotateX(-Math.PI/2); return g;
}
export function mergedBoxes(boxes:{p:THREE.Vector3;s:THREE.Vector3;r?:number}[]) {
 const geometries=boxes.map(b=>{const g=boxGeo.clone();g.scale(b.s.x,b.s.y,b.s.z);g.rotateY(b.r??0);g.translate(b.p.x,b.p.y,b.p.z);return g;});
 const result=geometries.length?mergeGeometries(geometries):new THREE.BufferGeometry();geometries.forEach(g=>g.dispose());return result!;
}
export function roadGeometry(roads:Road[],extra=0,height=0.35){
 return mergedBoxes(roads.flatMap(road=>road.points.slice(1).map((b,i)=>{const a=road.points[i];const dx=b[0]-a[0],dz=b[1]-a[1];return {p:new THREE.Vector3((a[0]+b[0])/2,height,(a[1]+b[1])/2),s:new THREE.Vector3(road.width+extra,.25,Math.hypot(dx,dz)+road.width/2),r:Math.atan2(dx,dz)};})));
}
export function buildingGeometry(buildings:Building[],part:'body'|'roof') {
 const geometries=buildings.map(b=>{const points=b.footprint??[[b.position[0]-b.size[0]/2,b.position[1]-b.size[2]/2],[b.position[0]+b.size[0]/2,b.position[1]-b.size[2]/2],[b.position[0]+b.size[0]/2,b.position[1]+b.size[2]/2],[b.position[0]-b.size[0]/2,b.position[1]+b.size[2]/2]] as Point[];const g=polygonGeometry(points,part==='body'?b.size[1]:.8);g.translate(0,part==='body'?.7:b.size[1]+.7,0);return g;});
 const result=geometries.length?mergeGeometries(geometries):new THREE.BufferGeometry();geometries.forEach(g=>g.dispose());return result!;
}
export function inside(point:Point,ring:Point[]) { let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function distanceToSegment(p:Point,a:Point,b:Point){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}
export function createTrees(seed:number,buildings:Building[],landmarks:Landmark[],landscapes:Landscape[],roads:Road[]):{x:number;z:number;scale:number;shade:number}[]{
 const rng=seededRandom(seed);const plants:{x:number;z:number;scale:number;shade:number}[]=[];
 const solid=[...buildings,...landmarks.filter(l=>!['water','garden','houses','neighborhood','marker','field','court'].includes(l.model))];
 for(let n=0;n<36000&&plants.length<1750;n++){
  const x=(rng()-.5)*2350,z=(rng()-.5)*2900,p:Point=[x,z];
  if(solid.some(b=>Math.abs(x-b.position[0])<b.size[0]/2+8&&Math.abs(z-b.position[1])<b.size[2]/2+8))continue;
  if(landscapes.some(l=>['water','sports'].includes(l.kind)&&inside(p,l.points)))continue;
  if(roads.some(r=>r.points.slice(1).some((b,i)=>distanceToSegment(p,r.points[i],b)<r.width/2+3)))continue;
  plants.push({x,z,scale:.7+rng()*.7,shade:rng()});
 }
 return plants;
}
