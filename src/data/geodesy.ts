import type {Point} from '../types.ts';
// BD-09 source polygons are cross-checked against GCJ-02 landmark POIs.
const pi=Math.PI, a=6378245, ee=0.00669342162296594323;
export const origin:[number,number]=[116.3215,40.002];
export function bdToGcj([lng,lat]:Point):Point{const x=lng-.0065,y=lat-.006,z=Math.sqrt(x*x+y*y)-.00002*Math.sin(y*pi*3000/180),t=Math.atan2(y,x)-.000003*Math.cos(x*pi*3000/180);return [z*Math.cos(t),z*Math.sin(t)];}
function offset([lng,lat]:Point):Point{const x=lng-105,y=lat-35;let dy=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));let dx=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));dy+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;dy+=(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3;dy+=(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;dx+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;dx+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;dx+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;const rad=lat/180*pi,magic=1-ee*Math.sin(rad)**2;return [(dx*180)/(a/Math.sqrt(magic)*Math.cos(rad)*pi),(dy*180)/(a*(1-ee)/(magic*Math.sqrt(magic))*pi)];}
export function wgsToGcj(p:Point):Point{const o=offset(p);return [p[0]+o[0],p[1]+o[1]];}
export function gcjToWgs(p:Point):Point{let r:Point=[...p];for(let i=0;i<5;i++){const g=wgsToGcj(r);r=[r[0]+p[0]-g[0],r[1]+p[1]-g[1]];}return r;}
export function project(p:Point):Point{return [(p[0]-origin[0])*111320*Math.cos(origin[1]*pi/180),-(p[1]-origin[1])*111320];}
export function unproject(p:Point):Point{return [origin[0]+p[0]/(111320*Math.cos(origin[1]*pi/180)),origin[1]-p[1]/111320];}
export const fromSource=(p:Point)=>project(gcjToWgs(bdToGcj(p)));
