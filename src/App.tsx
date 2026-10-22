import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { landmarks, tours, eras, buildings, roads, landscapes } from './data/campus';
import { CampusScene } from './scene/CampusScene';
import { Editor } from './ui/Editor';
import { decodeState, defaults, encodeState } from './state';
import type { CameraCommand, Landmark, SceneApi, SceneState, ViewMode, Vec3 } from './types';

const overview={position:[1900,2100,1950] as Vec3,target:[0,0,0] as Vec3};
function landmarkView(l:Landmark,view:ViewMode='isometric'):Omit<CameraCommand,'id'> {
 const [x,z]=l.position;const d=Math.max(85,Math.max(l.size[0],l.size[2])*1.7);
 if(view==='overhead')return {position:[x,d*2.4,z+1],target:[x,0,z]};
 if(view==='ground')return {position:[x+d*.8,Math.max(8,l.size[1]*.3),z+d],target:[x,l.size[1]*.4,z]};
 return {position:[x+d,l.size[1]+d*.9,z+d*1.2],target:[x,l.size[1]*.25,z],orbit:view==='cinematic'};
}
class SceneBoundary extends Component<{children:ReactNode;fallback:ReactNode;onError:()=>void},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(error:Error,info:ErrorInfo){console.error('三维场景初始化失败',error,info.componentStack);this.props.onError();}render(){return this.state.failed?this.props.fallback:this.props.children;}
}
function MapFallback({onSelect}:{onSelect:(id:string)=>void}){
 return <div className="fallback-map"><div className="fallback-explanation"><strong>二维校园概览</strong><p>可选择地点查看介绍与位置依据。</p></div><svg viewBox="-1200 -1500 2400 3300" aria-label="湖南科技大学校园二维轮廓图"><rect x="-1200" y="-1500" width="2400" height="3300" fill="#d4dfc2"/>{landscapes.map(l=><polygon key={l.id} points={l.points.map(p=>p.join(',')).join(' ')} fill={l.kind==='water'?'#86afbd':'#759c77'}/>)}{roads.map(r=><polyline key={r.id} points={r.points.map(p=>p.join(',')).join(' ')} stroke="#f8f6eb" strokeWidth={r.width} fill="none"/>)}{buildings.map(b=><polygon key={b.id} points={b.footprint?.map(p=>p.join(',')).join(' ')} fill="#b7aa9c"/>)}{landmarks.map(l=><g key={l.id} onClick={()=>onSelect(l.id)} role="button" tabIndex={0} aria-label={l.name} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onSelect(l.id);}}>{l.footprints?.map((r,i)=><polygon key={i} points={r.map(p=>p.join(',')).join(' ')} fill="#1e55af"/>)??<circle cx={l.position[0]} cy={l.position[1]} r="12" fill="#1e55af"/>}<circle cx={l.position[0]} cy={l.position[1]} r="18" fill="transparent"/><title>{l.name}</title></g>)}</svg></div>;
}
export default function App(){
 const [state,setState]=useState<SceneState>(()=>decodeState(new URLSearchParams(window.location.search).get('scene')));
 const [command,setCommand]=useState<CameraCommand>(()=>({id:0,...(state.camera??(landmarks.find(l=>l.id===state.selected)?landmarkView(landmarks.find(l=>l.id===state.selected)!):overview)),duration:0}));
 const [ready,setReady]=useState(false),[notice,setNotice]=useState(''),[stats,setStats]=useState<{fps:number;calls:number;triangles:number}|null>(null);
 const [tour,setTour]=useState<{routeId:string;index:number;playing:boolean}|null>(null);const apiRef=useRef<SceneApi|null>(null);
 const [shareLink,setShareLink]=useState('');const [postcard,setPostcard]=useState('');const [postcardDownload,setPostcardDownload]=useState('');
 useEffect(()=>()=>{if(postcardDownload)URL.revokeObjectURL(postcardDownload);},[postcardDownload]);
 const selected=landmarks.find(l=>l.id===state.selected);
 const notify=useCallback((message:string)=>{setNotice(message);},[]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4200);return()=>clearTimeout(t);},[notice]);
 const onReady=useCallback(()=>setReady(true),[]);
 useEffect(()=>{const t=setInterval(()=>{if(apiRef.current)setStats(apiRef.current.getStats());},3000);return()=>clearInterval(t);},[]);
 const onManual=useCallback(()=>{setTour(t=>t?{...t,playing:false}:null);},[]);
 const moveTo=useCallback((l:Landmark,view:ViewMode='isometric')=>setCommand(c=>({id:c.id+1,...landmarkView(l,view)})),[]);
 const onSelect=useCallback((id:string)=>{const l=landmarks.find(l=>l.id===id);if(!l)return;setTour(null);setState(s=>({...s,selected:id,era:'today',view:'isometric',camera:undefined}));moveTo(l);},[moveTo]);
 const onChange=useCallback((patch:Partial<SceneState>)=>{setState(s=>({...s,...patch}));if(patch.era){setTour(null);setState(s=>({...s,selected:null}));setCommand(c=>({id:c.id+1,...overview}));}},[]);
 const onView=useCallback((view:ViewMode)=>{setTour(null);setState(s=>({...s,view,camera:undefined}));if(selected){moveTo(selected,view);return;}const p:Vec3=view==='overhead'?[0,1900,1]:view==='ground'?[420,80,880]:overview.position;setCommand(c=>({id:c.id+1,position:p,target:overview.target,orbit:view==='cinematic'}));},[selected,moveTo]);
 const showStop=useCallback((routeId:string,index:number,playing:boolean)=>{const r=tours.find(t=>t.id===routeId);if(!r)return;const stop=(index+r.stops.length)%r.stops.length,l=landmarks.find(l=>l.id===r.stops[stop]);if(!l)return;setState(s=>({...s,selected:l.id,era:'today',view:'isometric'}));setTour({routeId,index:stop,playing});moveTo(l);},[moveTo]);
 useEffect(()=>{if(!tour?.playing)return;const r=tours.find(r=>r.id===tour.routeId);if(!r)return;const timer=setTimeout(()=>{if(tour.index===r.stops.length-1){setTour(t=>t?{...t,playing:false}:null);notify('导览完成。可以继续自由漫游科大校园。');}else showStop(tour.routeId,tour.index+1,true);},9500);return()=>clearTimeout(timer);},[tour,showStop,notify]);
 const onShare=async()=>{const snapshot={...state,camera:apiRef.current?.getCamera()??state.camera};const url=new URL(window.location.href);url.searchParams.set('scene',encodeState(snapshot));setShareLink(url.toString());try{await navigator.clipboard.writeText(url.toString());notify('分享链接已复制，好友可以打开相同的校园画面。');}catch{const area=document.createElement('textarea');area.value=url.toString();document.body.append(area);area.select();const ok=document.execCommand('copy');area.remove();if(ok)notify('分享链接已复制。');else {window.history.replaceState(null,'',url);notify('地址栏已更新为分享链接，可以复制分享。');}}};
 const onCapture=()=>{if(!apiRef.current){notify('三维画面尚未准备好，请稍候。');return;}try{const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1100;const ctx=canvas.getContext('2d')!;const image=new Image();image.onload=()=>{ctx.fillStyle='#f8f7f3';ctx.fillRect(0,0,1600,1100);const w=1480,h=880;ctx.fillStyle='#e4edf0';ctx.fillRect(60,50,w,h);const fit=Math.min(w/image.width,h/image.height);ctx.drawImage(image,60+(w-image.width*fit)/2,50+(h-image.height*fit)/2,image.width*fit,image.height*fit);ctx.fillStyle='#660874';ctx.font='600 42px serif';ctx.fillText('科大沙盘',64,1004);ctx.fillStyle='#827a87';ctx.font='22px sans-serif';const season={spring:'春',summer:'夏',autumn:'秋',winter:'冬'}[state.season];ctx.fillText(`${selected?.name??'漫游科大校园'} · ${season}日 ${Math.floor(state.time).toString().padStart(2,'0')}:${Math.round((state.time%1)*60).toString().padStart(2,'0')}  /  校园建筑沙盘`,64,1049);ctx.textAlign='right';ctx.fillStyle='#660874';ctx.font='20px sans-serif';ctx.fillText('唯实惟新 · 至诚致志',1536,1004);const card=canvas.toDataURL('image/png');setPostcard(card);const bytes=Uint8Array.from(atob(card.split(',')[1]),c=>c.charCodeAt(0));setPostcardDownload(URL.createObjectURL(new Blob([bytes],{type:'image/png'})));const a=document.createElement('a');a.download=`科大沙盘-${selected?.name??'校园'}-${season}日.png`;a.href=canvas.toDataURL('image/png');notify('四季明信片已生成，可以下载保存。');};image.src=apiRef.current.capture();}catch{notify('画面保存失败，请重新尝试。');}};
 const fallback=<MapFallback onSelect={onSelect}/>;
 const webgl=useMemoWebGL();
 return <main className="app-shell" data-season={state.season} data-era={state.era} data-seed={state.seed} data-time={state.time} data-trees={state.trees} data-selected={state.selected??''}>
  {webgl?<SceneBoundary fallback={fallback} onError={onReady}><CampusScene state={state} command={command} onSelect={onSelect} onManual={onManual} apiRef={apiRef} onReady={onReady}/></SceneBoundary>:fallback}
  <Editor state={state} landmarks={landmarks} tours={tours} eras={eras} selected={selected} onChange={onChange} onSelect={onSelect} onView={onView} onShare={onShare} onCapture={onCapture} onReset={()=>{setState({...defaults});setTour(null);setCommand(c=>({id:c.id+1,...overview}));notify('已回到春日科大。');}} onRegenerate={()=>{setState(s=>({...s,seed:(s.seed+137)%999999}));notify('花木布景已更新，校园建筑和道路保持原位。');}} onTour={id=>showStop(id,0,true)} onTourToggle={()=>{apiRef.current?.stopCamera();setTour(t=>t?{...t,playing:!t.playing}:null);}} onTourStep={direction=>{if(tour)showStop(tour.routeId,tour.index+direction,tour.playing);}} onTourStop={()=>{apiRef.current?.stopCamera();setTour(null);}} tour={tour} notice={notice} ready={ready||!webgl} stats={stats}/>
  {postcard&&<div className="modal-overlay" onClick={()=>setPostcard('')}><section className="info-modal postcard-modal" role="dialog" aria-modal="true" aria-label="科大四季明信片" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" aria-label="关闭明信片" onClick={()=>setPostcard('')}>×</button><h2>科大四季明信片</h2><img src={postcard} alt="当前校园画面的四季明信片"/><a className="full-button" download="科大沙盘-四季明信片.png" href={postcardDownload||postcard}>下载明信片</a><p>手机也可以长按图片保存。</p></section></div>}
  {shareLink&&<div className="modal-overlay" onClick={()=>setShareLink('')}><section className="info-modal" role="dialog" aria-modal="true" aria-label="分享校园画面" onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" aria-label="关闭分享" onClick={()=>setShareLink('')}>×</button><h2>把此刻的科大校园分享出去</h2><p>链接会保留机位、建筑、四季与布景参数。好友无需登录即可打开。</p><input className="share-link" aria-label="分享链接" readOnly value={shareLink} onFocus={e=>e.target.select()}/><a className="full-button" href={shareLink} target="_blank" rel="noreferrer">打开分享画面</a></section></div>}
 </main>;
}
function useMemoWebGL(){const [supported]=useState(()=>{try{if(new URLSearchParams(window.location.search).get('mode')==='2d')return false;const c=document.createElement('canvas');const context=c.getContext('webgl2');if(!context)return false;context.getExtension('WEBGL_lose_context')?.loseContext();return true;}catch{return false;}});return supported;}

