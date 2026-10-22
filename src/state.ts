import type { SceneState, Vec3 } from './types.ts';
export const defaults: SceneState = {version:2,season:'spring',time:16.5,trees:100,lilac:65,cercis:75,activity:35,exposure:1.05,quality:'auto',seed:1911,era:'today',labels:true,selected:null,view:'isometric'};
const bounded=(v:unknown,min:number,max:number,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
const tuple=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<20000);
export function sanitizeState(input:unknown):SceneState {
 if (!input || typeof input!=='object' || ![1,2].includes((input as {version?:number}).version??0)) return {...defaults};
 const s=input as Partial<SceneState>;
 const result:SceneState={...defaults,season:['spring','summer','autumn','winter'].includes(s.season??'')?s.season!:defaults.season,era:'today',view:['isometric','overhead','ground','cinematic'].includes(s.view??'')?s.view!:defaults.view,quality:['auto','high','low'].includes(s.quality??'')?s.quality!:defaults.quality,time:bounded(s.time,0,24,defaults.time),trees:bounded(s.trees,0,150,defaults.trees),lilac:bounded(s.lilac,0,100,defaults.lilac),cercis:bounded(s.cercis,0,100,defaults.cercis),activity:bounded(s.activity,0,100,defaults.activity),exposure:bounded(s.exposure,0.6,1.6,defaults.exposure),seed:Math.round(bounded(s.seed,0,999999,defaults.seed)),labels:typeof s.labels==='boolean'?s.labels:true,selected:typeof s.selected==='string'&&s.selected.length<80?s.selected:null};
 if ((input as {version:number}).version===2&&s.camera&&tuple(s.camera.position)&&tuple(s.camera.target))result.camera=s.camera;
 return result;
}
export function encodeState(s:SceneState):string { return btoa(JSON.stringify(sanitizeState(s))); }
export function decodeState(value:string|null):SceneState { try {if(!value||value.length>4000)return {...defaults};return sanitizeState(JSON.parse(atob(value)));}catch{return {...defaults};} }
export function seededRandom(seed:number) { let n=seed>>>0; return ()=>{n+=0x6D2B79F5;let t=Math.imul(n^(n>>>15),1|n);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;}; }
