import data from './campus-data.json' with {type:'json'};
import type { Landmark, Building, Road, Landscape, TourRoute, Era, District } from '../types.ts';

// 数据来源：OpenStreetMap（ODbL 1.0）+ 湖南科技大学公开资料。
// 建筑轮廓与位置按 OSM 公开数据绘制，高度为示意估算；水面、绿地与运动场地按公开轮廓绘制。
export const mapMeta={
  source:'https://www.hnust.edu.cn/zjkd/xyfg/index.htm',
  updated:'2026 年 10 月',
  precision:'建筑轮廓与位置来自 OpenStreetMap 公开数据（ODbL 1.0），建筑高度为示意估算；水面、绿地与运动场地按公开轮廓绘制。底图为平面沙盘，未接入高程数据，不宣称测绘精度。',
};

export const landmarks=data.landmarks as unknown as Landmark[];
export const buildings=data.buildings as unknown as Building[];
export const roads=data.roads as unknown as Road[];
export const landscapes=data.landscapes as unknown as Landscape[];
export const tours=data.tours as unknown as TourRoute[];
export const eras=data.eras as {id:Era;title:string;period:string;year:number;description:string}[];
export const districts=data.districts as unknown as District[];
export const terrainReview=data.terrainReview as {name:string;status:string}[];
export const campusInfo=data.meta;
