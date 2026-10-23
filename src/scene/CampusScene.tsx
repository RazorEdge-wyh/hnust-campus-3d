import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CameraCommand, Landmark, SceneApi, SceneState, Season } from '../types';
import { buildings, landmarks, landscapes, roads, eras } from '../data/campus';
import { LandmarkModel } from './LandmarkModels';
import { buildingGeometry, createTrees, mergedBoxes, polygonGeometry, roadGeometry } from './geometry';
import { seededRandom } from '../state';

const transform=new THREE.Object3D();
const originTarget:[number,number,number]=[0,0,0];
const seasonal={spring:['#578353','#7eaa67','#a9c082'],summer:['#3f7350','#548858','#83a65e'],autumn:['#bd763a','#d4a44c','#8d8645'],winter:['#849b91','#a3b7ab','#c1cec7']};
const typicalLabels=new Set(['southGate','northGate','oldGate','yuehu','sakura','library','museum','zhixing','lizhi','field1','gym','studentCenter','dorm','qibaishi']);
const setTransform=(mesh:THREE.InstancedMesh,i:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,ry=0)=>{transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.set(0,ry,0);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);};

function StaticCampus({state}:{state:SceneState}){
 const road=useMemo(()=>roadGeometry(roads),[]),curb=useMemo(()=>roadGeometry(roads,5,.22),[]);
 const groups=useMemo(()=>['brick','modern','residential','dorm'].map(style=>({style,body:buildingGeometry(buildings.filter(b=>b.style===style),'body'),roof:buildingGeometry(buildings.filter(b=>b.style===style),'roof')})),[]);
 const shapes=useMemo(()=>landscapes.map(l=>({...l,geometry:polygonGeometry(l.points)})),[]);
 const lines=useMemo(()=>mergedBoxes(roads.filter(r=>r.major).flatMap(r=>r.points.slice(1).flatMap((b,i)=>{const a=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);return Array.from({length:Math.floor(len/28)},(_,j)=>{const t=(j+.5)*28/len;return {p:new THREE.Vector3(a[0]+dx*t,.54,a[1]+dz*t),s:new THREE.Vector3(.7,.07,10),r:Math.atan2(dx,dz)};});}))),[]);
 const history=state.era!=='today';
 const grass=state.season==='winter'?'#cdd9ca':state.season==='autumn'?'#9d9e58':'#6e9b58';
 return <group>
  <mesh receiveShadow position={[0,-8,0]}><boxGeometry args={[2400,15,3300]}/><meshStandardMaterial color="#dad9ca" roughness={.95}/></mesh>
  <mesh receiveShadow position={[0,.01,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2395,3295]}/><meshStandardMaterial color={grass} roughness={1}/></mesh>
  {shapes.map(s=><mesh key={s.id} geometry={s.geometry} position={[0,s.kind==='water'?.31:.15,0]} receiveShadow><meshStandardMaterial color={s.kind==='water'?(state.season==='winter'?'#94c8cd':'#578e9a'):s.kind==='sports'?'#659d8e':s.kind==='garden'?'#8fab73':(state.season==='winter'?'#d9dfcf':'#8bac75')} roughness={s.kind==='water'?.65:.95} metalness={0}/></mesh>)}
  <mesh geometry={curb} receiveShadow><meshStandardMaterial color="#e1ddd1" roughness={1}/></mesh>
  <mesh geometry={road} receiveShadow><meshStandardMaterial color="#b2b1a9" roughness={1}/></mesh>
  <mesh geometry={lines}><meshStandardMaterial color="#ede8db" roughness={1}/></mesh>
  {groups.map(g=><group key={g.style}><mesh geometry={g.body} castShadow={!history} receiveShadow><meshStandardMaterial color={history?'#c1c4b7':g.style==='brick'?'#b17762':g.style==='modern'?'#cbc8b8':g.style==='dorm'?'#eee8d6':'#c9bba4'} transparent={history} opacity={history?.26:1} roughness={.86}/></mesh><mesh geometry={g.roof} receiveShadow><meshStandardMaterial color={history?'#b9bdaf':g.style==='brick'?'#756a62':g.style==='dorm'?'#676c66':'#aaa596'} transparent={history} opacity={history?.22:1} roughness={.9}/></mesh></group>)}

 </group>;
}

function Trees({state}:{state:SceneState}){
 const trunk=useRef<THREE.InstancedMesh>(null),crown=useRef<THREE.InstancedMesh>(null);
 const data=useMemo(()=>createTrees(state.seed,buildings,landmarks,landscapes,roads),[state.seed]);
 const count=Math.min(data.length,Math.round(data.length*state.trees/150));
 const {invalidate}=useThree();
 useEffect(()=>{if(!trunk.current||!crown.current)return;const palette=seasonal[state.season];data.forEach((p,i)=>{setTransform(trunk.current!,i,p.x,3.9*p.scale,p.z,1.25*p.scale,7.3*p.scale,1.25*p.scale);setTransform(crown.current!,i,p.x,11.2*p.scale,p.z,5.5*p.scale,7*p.scale,5.5*p.scale);crown.current!.setColorAt(i,new THREE.Color(palette[Math.floor(p.shade*3)]));});trunk.current.instanceMatrix.needsUpdate=true;crown.current.instanceMatrix.needsUpdate=true;if(crown.current.instanceColor)crown.current.instanceColor.needsUpdate=true;invalidate();},[data,state.season,invalidate]);
 useEffect(()=>{if(trunk.current&&crown.current){trunk.current.count=count;crown.current.count=count;invalidate();}},[count,invalidate]);
 return <group><instancedMesh ref={trunk} args={[undefined,undefined,1750]} castShadow><cylinderGeometry args={[.7,1,1,5]}/><meshStandardMaterial color="#887260" roughness={1}/></instancedMesh><instancedMesh ref={crown} args={[undefined,undefined,1750]} castShadow><icosahedronGeometry args={[1,1]}/><meshStandardMaterial roughness={1}/></instancedMesh></group>;
}

function Flowers({state}:{state:SceneState}){
 const lilac=useRef<THREE.InstancedMesh>(null),cercis=useRef<THREE.InstancedMesh>(null),branches=useRef<THREE.InstancedMesh>(null);
 const {invalidate}=useThree();
 const plants=useMemo(()=>{const r=seededRandom(state.seed+63);return Array.from({length:180},(_,i)=>{const anchor=landmarks[i%landmarks.length];const angle=r()*Math.PI*2,dist=Math.max(anchor.size[0],anchor.size[2])*.58+8+r()*16;return {x:anchor.position[0]+Math.cos(angle)*dist,z:anchor.position[1]+Math.sin(angle)*dist,scale:.7+r()*.7};});},[state.seed]);
 useEffect(()=>{if(!lilac.current||!cercis.current||!branches.current)return;plants.forEach((p,i)=>{setTransform(branches.current!,i,p.x,2,p.z,.28,4,.28);for(let j=0;j<4;j++){const a=j*Math.PI/2;setTransform(lilac.current!,i*4+j,p.x+Math.cos(a)*1.8*p.scale,2.8+(j%2)*.7,p.z+Math.sin(a)*1.8*p.scale,1.1*p.scale,2.1*p.scale,1.1*p.scale,a);lilac.current!.setColorAt(i*4+j,new THREE.Color(i%4===0?'#f7eef1':'#e9b7c6'));}for(let j=0;j<6;j++){const a=j*2.399;setTransform(cercis.current!,i*6+j,p.x+Math.cos(a)*1.3,1.8+j*.45,p.z+Math.sin(a)*1.3,.9,1,.9);}});[lilac.current,cercis.current,branches.current].forEach(m=>{m.instanceMatrix.needsUpdate=true;});if(lilac.current.instanceColor)lilac.current.instanceColor.needsUpdate=true;invalidate();},[plants,invalidate]);
 const spring=state.season==='spring'?1:state.season==='summer'?.15:0;
 useEffect(()=>{if(lilac.current&&cercis.current&&branches.current){lilac.current.count=Math.round(720*state.lilac/100*spring);cercis.current.count=Math.round(1080*state.cercis/100*spring);branches.current.count=Math.round(180*Math.max(state.lilac,state.cercis)/100);invalidate();}},[state.lilac,state.cercis,spring,invalidate]);
 return <group><instancedMesh ref={branches} args={[undefined,undefined,180]}><cylinderGeometry args={[.7,1,1,4]}/><meshStandardMaterial color="#7d6955"/></instancedMesh><instancedMesh ref={lilac} args={[undefined,undefined,720]}><coneGeometry args={[1,1,6]}/><meshStandardMaterial roughness={1}/></instancedMesh><instancedMesh ref={cercis} args={[undefined,undefined,1080]}><icosahedronGeometry args={[1,0]}/><meshStandardMaterial color="#d97d9a" roughness={1}/></instancedMesh></group>;
}

function NameTag({landmark,state,onSelect}:{landmark:Landmark;state:SceneState;onSelect:(id:string)=>void}){
 const [visible,setVisible]=useState(false);const last=useRef(false);
 useFrame(({camera})=>{const distance=camera.position.distanceTo(new THREE.Vector3(landmark.position[0],0,landmark.position[1]));const show=state.labels&&(state.selected===landmark.id||distance<190||(distance<4600&&typicalLabels.has(landmark.id)&&(window.innerWidth>760||!['gate','library'].includes(landmark.id))));if(last.current!==show){last.current=show;setVisible(show);}});
 const existed=true;
 return <Html position={[0,landmark.size[1]+9,0]} center zIndexRange={[12,1]} style={{display:visible&&existed?'block':'none'}}><button className={`map-label ${state.selected===landmark.id?'selected':''}`} onClick={e=>{e.stopPropagation();onSelect(landmark.id);}}><span/>{landmark.name}</button></Html>;
}

function CameraRig({command,onManual,apiRef,onReady}:{command:CameraCommand;onManual:()=>void;apiRef:React.RefObject<SceneApi|null>;onReady:()=>void}){
 const controls=useRef<any>(null);const tween=useRef<{from:THREE.Vector3;to:THREE.Vector3;fromTarget:THREE.Vector3;toTarget:THREE.Vector3;elapsed:number;duration:number;orbit:boolean}|null>(null);
 const stats=useRef({fps:0,calls:0,triangles:0});const samples=useRef({frames:0,time:0});const {camera,gl,invalidate}=useThree();
 useEffect(()=>{gl.domElement.dataset.cameraMoving='true';tween.current={from:camera.position.clone(),to:new THREE.Vector3(...command.position),fromTarget:controls.current?.target.clone()??new THREE.Vector3(),toTarget:new THREE.Vector3(...command.target),elapsed:0,duration:command.duration??1.4,orbit:command.orbit??false};invalidate();},[command,camera,invalidate,gl]);
 useEffect(()=>{apiRef.current={stopCamera:()=>{tween.current=null;gl.domElement.dataset.cameraMoving='false';},getCamera:()=>({position:camera.position.toArray() as [number,number,number],target:(controls.current?.target.toArray()??[0,0,0]) as [number,number,number]}),capture:()=>gl.domElement.toDataURL('image/png'),getStats:()=>({...stats.current,calls:gl.info.render.calls,triangles:gl.info.render.triangles})};onReady();return()=>{apiRef.current=null;};},[apiRef,camera,gl,onReady]);
 useFrame((_,delta)=>{const s=samples.current;s.frames++;s.time+=delta;if(s.time>1){stats.current.fps=Math.round(s.frames/s.time);s.frames=0;s.time=0;}const t=tween.current;if(!t||!controls.current)return;t.elapsed+=delta;const p=Math.min(1,t.elapsed/t.duration),ease=1-Math.pow(1-p,3);camera.position.lerpVectors(t.from,t.to,ease);controls.current.target.lerpVectors(t.fromTarget,t.toTarget,ease);controls.current.update();if(p===1){if(t.orbit){const v=t.to.clone().sub(t.toTarget);v.applyAxisAngle(new THREE.Vector3(0,1,0),delta*.07);t.to.copy(t.toTarget).add(v);t.from.copy(t.to);t.fromTarget.copy(t.toTarget);}else {tween.current=null;gl.domElement.dataset.cameraMoving='false';}}invalidate();});
 return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.09} minDistance={28} maxDistance={3900} minPolarAngle={.12} maxPolarAngle={Math.PI/2-.02} target={originTarget} onStart={()=>{tween.current=null;gl.domElement.dataset.cameraMoving='false';onManual();}}/>;
}

function Lighting({state}:{state:SceneState}){
 const {gl,invalidate}=useThree();const angle=(state.time-6)/12*Math.PI;const daylight=Math.max(0,Math.sin(angle));const night=daylight<.03;
 useEffect(()=>{gl.toneMappingExposure=state.exposure;invalidate();},[gl,state.exposure,invalidate]);
 const sun=useRef<THREE.DirectionalLight>(null);
 useEffect(()=>{if(sun.current){const c=sun.current.shadow.camera;c.left=-1500;c.right=1500;c.top=1500;c.bottom=-1500;c.near=10;c.far=4500;c.updateProjectionMatrix();}},[]);
 return <><color attach="background" args={[night?'#253549':daylight<.4?'#e2e5ec':'#e4edf0']}/><fog attach="fog" args={[night?'#253549':daylight<.4?'#e2e5ec':'#e4edf0',3400,6700]}/><ambientLight intensity={night?.55:.35} color={night?'#9aaed7':'#fff4e5'}/><hemisphereLight args={[night?'#8a99c0':'#e6f3ff','#769858',night?.45:.8]}/><directionalLight ref={sun} position={[Math.cos(angle)*1900,Math.max(220,daylight*2200),-1200]} intensity={night?.18:daylight<.4?1.6:2} color={daylight<.4?'#ffdeb0':'#fff0d7'} castShadow={state.quality!=='low'} shadow-mapSize={[2048,2048]} shadow-bias={-.0003} shadow-normalBias={1.4}/></>;
}


function CrowdFlow({activity}:{activity:number}){
 const points=useRef<THREE.Points>(null),halo=useRef<THREE.Points>(null),trail=useRef<THREE.LineSegments>(null);
 const {invalidate}=useThree();
 const MAX=320;
 const palette=['#f6c46a','#6fb6f0','#9fe3d0','#ffe1b0'];
 const agents=useMemo(()=>{const rnd=seededRandom(20261023);const pool=roads.filter(r=>r.points.length>1);const out:{ax:number;az:number;bx:number;bz:number;off:number;speed:number;dir:number;color:string}[]=[];for(let n=0;n<1200&&out.length<MAX;n++){const road=pool[Math.floor(rnd()*pool.length)];if(!road||road.points.length<2)continue;const i=Math.floor(rnd()*(road.points.length-1));const a=road.points[i],b=road.points[i+1];const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<6)continue;out.push({ax:a[0],az:a[1],bx:b[0],bz:b[1],off:rnd(),speed:.006+rnd()*.016,dir:rnd()>.5?1:-1,color:palette[out.length%palette.length]});}return out;},[]);
 const count=Math.min(agents.length,Math.max(0,Math.round(activity*3.6)));
 const pos=useMemo(()=>new Float32Array(MAX*3),[]);
 const col=useMemo(()=>new Float32Array(MAX*3),[]);
 const tpos=useMemo(()=>new Float32Array(MAX*6),[]);
 const tcol=useMemo(()=>new Float32Array(MAX*6),[]);
 const sprite=useMemo(()=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;const grad=ctx.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(.22,'rgba(255,255,255,.9)');grad.addColorStop(.55,'rgba(255,255,255,.22)');grad.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;},[]);
 useEffect(()=>{
  if(points.current)points.current.geometry.setDrawRange(0,count);
  if(halo.current)halo.current.geometry.setDrawRange(0,count);
  if(trail.current)trail.current.geometry.setDrawRange(0,count*2);
  agents.slice(0,count).forEach((a,i)=>{const c=new THREE.Color(a.color);col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;});
  const ca=points.current?.geometry.attributes.color;if(ca)ca.needsUpdate=true;
  invalidate();
 },[count,agents,col,invalidate]);
 useFrame(({clock})=>{
  if(!points.current||!trail.current||!count)return;
  const t=clock.elapsedTime;
  const ha=halo.current?.geometry.attributes.position as THREE.BufferAttribute|undefined;
  const hc=halo.current?.geometry.attributes.color as THREE.BufferAttribute|undefined;
  const pa=points.current.geometry.attributes.position as THREE.BufferAttribute;
  const ca=points.current.geometry.attributes.color as THREE.BufferAttribute;
  const ta=trail.current.geometry.attributes.position as THREE.BufferAttribute;
  const tca=trail.current.geometry.attributes.color as THREE.BufferAttribute;
  const pArr=pa.array as Float32Array,pCol=ca.array as Float32Array,tArr=ta.array as Float32Array,tCol=tca.array as Float32Array;
  for(let i=0;i<count;i++){
   const a=agents[i];
   const u=((a.off+t*a.speed*a.dir)%1+1)%1;
   const x=a.ax+(a.bx-a.ax)*u, z=a.az+(a.bz-a.az)*u;
   const ut=Math.max(0,Math.min(1,u-a.dir*.1));
   const xt=a.ax+(a.bx-a.ax)*ut, zt=a.az+(a.bz-a.az)*ut;
   const bob=Math.sin(t*1.6+a.off*18)*.16;
   pArr[i*3]=x;pArr[i*3+1]=2.8+bob;pArr[i*3+2]=z;
   pCol[i*3]=pCol[i*3]; // static, but keep for clarity
   tArr[i*6]=xt;tArr[i*6+1]=2.45;tArr[i*6+2]=zt;
   tArr[i*6+3]=x;tArr[i*6+4]=2.8+bob;tArr[i*6+5]=z;
   const c=new THREE.Color(a.color);
   tCol[i*6]=c.r*.12;tCol[i*6+1]=c.g*.12;tCol[i*6+2]=c.b*.12;
   tCol[i*6+3]=c.r*.95;tCol[i*6+4]=c.g*.95;tCol[i*6+5]=c.b*.95;
  }
  pa.needsUpdate=true;ca.needsUpdate=true;ta.needsUpdate=true;tca.needsUpdate=true;if(ha)ha.needsUpdate=true;if(hc)hc.needsUpdate=true;
  invalidate();
 });
 return <group>
  <points ref={halo} frustumCulled={false}>
   <bufferGeometry>
    <bufferAttribute attach="attributes-position" args={[pos,3]}/>
    <bufferAttribute attach="attributes-color" args={[col,3]}/>
   </bufferGeometry>
   <pointsMaterial map={sprite} vertexColors size={16} sizeAttenuation transparent opacity={.22} depthWrite={false} blending={THREE.AdditiveBlending}/>
  </points>
  <points ref={points} frustumCulled={false}>
   <bufferGeometry>
    <bufferAttribute attach="attributes-position" args={[pos,3]}/>
    <bufferAttribute attach="attributes-color" args={[col,3]}/>
   </bufferGeometry>
   <pointsMaterial map={sprite} vertexColors size={5.0} sizeAttenuation transparent opacity={.95} depthWrite={false} blending={THREE.AdditiveBlending}/>
  </points>
  <lineSegments ref={trail} frustumCulled={false}>
   <bufferGeometry>
    <bufferAttribute attach="attributes-position" args={[tpos,3]}/>
    <bufferAttribute attach="attributes-color" args={[tcol,3]}/>
   </bufferGeometry>
   <lineBasicMaterial vertexColors transparent opacity={.62} blending={THREE.AdditiveBlending} depthWrite={false}/>
  </lineSegments>
 </group>;
}

function World(props:{state:SceneState;command:CameraCommand;onSelect:(id:string)=>void;onManual:()=>void;apiRef:React.RefObject<SceneApi|null>;onReady:()=>void}){
 const year=eras.find(e=>e.id===props.state.era)?.year??2025;
 return <><Lighting state={props.state}/><StaticCampus state={props.state}/><Trees state={props.state}/><Flowers state={props.state}/><CrowdFlow activity={props.state.activity}/>{landmarks.map(l=>{const reference=false;return <group key={l.id} position={[l.position[0],.65,l.position[1]]} rotation={[0,l.rotation??0,0]} onClick={e=>{if(e.delta>4)return;e.stopPropagation();props.onSelect(l.id);}} visible={true}>
 <LandmarkModel landmark={l} season={props.state.season} active={props.state.selected===l.id} year={year}/>
 {props.state.selected===l.id&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.5,0]}><ringGeometry args={[Math.max(l.size[0],l.size[2])*.6,Math.max(l.size[0],l.size[2])*.6+1.5,64]}/><meshBasicMaterial color="#f1a90d" transparent opacity={.5} depthWrite={false}/></mesh>}
 <NameTag landmark={l} state={props.state} onSelect={props.onSelect}/>
 </group>;})}

 <CameraRig command={props.command} onManual={props.onManual} apiRef={props.apiRef} onReady={props.onReady}/></>;
}

export function CampusScene(props:{state:SceneState;command:CameraCommand;onSelect:(id:string)=>void;onManual:()=>void;apiRef:React.RefObject<SceneApi|null>;onReady:()=>void}){
 const mobile=typeof window!=='undefined'&&window.innerWidth<760;const low=props.state.quality==='low';
 return <Canvas className="campus-canvas" shadows={!low} frameloop="demand" dpr={low?1:props.state.quality==='high'?[1,2]:mobile?1:[1,1.4]} camera={{position:[1900,2100,1950],fov:38,near:1,far:10000}} gl={{antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.shadowMap.type=THREE.PCFSoftShadowMap;}}><World {...props}/></Canvas>;
}

