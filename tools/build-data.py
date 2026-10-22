# -*- coding: utf-8 -*-
"""
湖南科技大学 3D 校园沙盘 · 数据构建
- 输入: OpenStreetMap 校园范围导出 (hnust_map.osm, ODbL 1.0)
- 输出: src/data/campus-data.json
坐标约定与上游项目一致: 米制, x 向东, z 向南, y 为高度。
"""
import json, math, os, sys, hashlib
import lxml.etree as ET

sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OSM = os.environ.get('HNUST_OSM', os.path.join(os.environ.get('TEMP', '.'), 'hnust_map.osm'))
OUT = os.path.join(ROOT, 'src', 'data', 'campus-data.json')

LAT0, LON0 = 27.9058, 112.9116
MX = 111320.0 * math.cos(math.radians(LAT0))
MZ = 110540.0

def px(lon): return (lon - LON0) * MX
def pz(lat): return -(lat - LAT0) * MZ
def unproject(x, z): return [round(LON0 + x / MX, 6), round(LAT0 - z / MZ, 6)]
def rnd(v, n=1): return round(float(v), n)

# ---------------- 读取 OSM ----------------
root = ET.parse(OSM).getroot()
nodes = {}
for n in root.findall('node'):
    nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))

ways = {}
for w in root.findall('way'):
    tags = {t.get('k'): t.get('v') for t in w.findall('tag')}
    refs = [nd.get('ref') for nd in w.findall('nd')]
    pts = [(nodes[r][0], nodes[r][1]) for r in refs if r in nodes]
    ways[w.get('id')] = {'tags': tags, 'refs': refs, 'll': pts}

relations = []
for r in root.findall('relation'):
    tags = {t.get('k'): t.get('v') for t in r.findall('tag')}
    members = [(m.get('type'), m.get('ref'), m.get('role')) for m in r.findall('member')]
    relations.append({'tags': tags, 'members': members})

def proj_ring(ll):
    """lat/lon 列表 -> 本地米制闭合环(去掉重复末点)"""
    pts = [(rnd(px(lon)), rnd(pz(lat))) for lat, lon in ll]
    out = []
    for p in pts:
        if not out or out[-1] != p:
            out.append(p)
    if len(out) > 2 and out[0] == out[-1]:
        out.pop()
    return out

def ring_area(ring):
    s = 0.0
    for i in range(len(ring)):
        x1, z1 = ring[i]; x2, z2 = ring[(i + 1) % len(ring)]
        s += x1 * z2 - x2 * z1
    return abs(s) / 2

def ring_centroid(ring):
    a = 0.0; cx = 0.0; cz = 0.0
    for i in range(len(ring)):
        x1, z1 = ring[i]; x2, z2 = ring[(i + 1) % len(ring)]
        cross = x1 * z2 - x2 * z1
        a += cross; cx += (x1 + x2) * cross; cz += (z1 + z2) * cross
    a /= 2
    if abs(a) < 1e-6:
        xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
        return [rnd(sum(xs) / len(xs)), rnd(sum(zs) / len(zs))]
    return [rnd(cx / (6 * a)), rnd(cz / (6 * a))]

def bbox_of(ring):
    xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
    return min(xs), min(zs), max(xs), max(zs)

def stitch_rings(segments):
    """把 relation outer way 拼成闭合环"""
    segs = [list(s) for s in segments if len(s) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]; segs.pop(i); changed = True; break
                if s[-1] == cur[-1]:
                    cur += list(reversed(s))[1:]; segs.pop(i); changed = True; break
                if s[-1] == cur[0]:
                    cur = s[:-1] + cur; segs.pop(i); changed = True; break
                if s[0] == cur[0]:
                    cur = list(reversed(s))[:-1] + cur; segs.pop(i); changed = True; break
        if len(cur) >= 4:
            rings.append(cur)
    return rings

# ---------------- 建筑 ----------------
used_way_ids = set()
buildings = []   # 上下文楼群
building_index = {}  # name -> building record

def make_building(ring, tags, bid):
    area = ring_area(ring)
    if area < 25:
        return None
    xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
    w = max(xs) - min(xs); d = max(zs) - min(zs)
    if w < 2 or d < 2:
        return None
    name = tags.get('name') or tags.get('name:zh')
    bt = tags.get('building', 'yes')
    h = None
    try:
        if tags.get('height'):
            h = float(str(tags['height']).replace('m', '').strip())
        elif tags.get('building:levels'):
            h = float(tags['building:levels']) * 3.2
    except Exception:
        h = None
    if h is None or h <= 0:
        if bt in ('apartments', 'dormitory'):
            h = 21
        elif bt in ('house', 'terrace', 'residential'):
            h = 10
        elif bt in ('gatehouse', 'gate', 'kiosk'):
            h = 4
        else:
            h = min(30, 14 + area / 320)
    h = max(3, min(42, h))
    if bt in ('apartments', 'dormitory'):
        style = 'dorm'
    elif bt in ('house', 'terrace', 'residential'):
        style = 'residential'
    elif bt in ('gatehouse', 'gate'):
        style = 'brick'
    else:
        style = 'modern'
        if name and area >= 1500 and sum(ord(ch) for ch in name) % 3 == 0:
            style = 'brick'
    rec = {
        'id': bid,
        'name': name,
        'position': ring_centroid(ring),
        'size': [rnd(w), rnd(h), rnd(d)],
        'footprint': ring,
        'style': style,
        'area': rnd(area, 0),
        'tags': {k: v for k, v in tags.items() if k in ('building', 'amenity', 'name', 'height', 'building:levels')},
    }
    return rec

# 先处理 building relation（多为大体量建筑）
for rel in relations:
    tags = rel['tags']
    if 'building' not in tags:
        continue
    segs = []
    for typ, ref, role in rel['members']:
        if typ == 'way' and role != 'inner' and ref in ways:
            w = ways[ref]
            if len(w['ll']) >= 2:
                segs.append(proj_ring(w['ll']))
            used_way_ids.add(ref)
    for ring in stitch_rings(segs):
        rec = make_building(ring, tags, 'rel-' + str(len(buildings)))
        if rec:
            buildings.append(rec)
            if rec['name']:
                building_index.setdefault(rec['name'], rec)

for wid, w in ways.items():
    tags = w['tags']
    if 'building' not in tags or wid in used_way_ids:
        continue
    if len(w['ll']) < 4:
        continue
    ring = proj_ring(w['ll'])
    if len(ring) < 3:
        continue
    rec = make_building(ring, tags, 'b' + wid)
    if rec:
        buildings.append(rec)
        if rec['name'] and rec['name'] not in building_index:
            building_index[rec['name']] = rec

# ---------------- 道路 ----------------
WIDTH = {
    'motorway': 16, 'trunk': 16, 'primary': 13, 'primary_link': 9, 'secondary': 9,
    'secondary_link': 7, 'tertiary': 7, 'tertiary_link': 6, 'unclassified': 5.5,
    'residential': 5.5, 'living_street': 5, 'service': 3.5, 'pedestrian': 4.5,
    'footway': 2.2, 'path': 2.0, 'cycleway': 2.2, 'steps': 2.0, 'track': 2.5,
}
ROAD_ORDER = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
              'residential', 'living_street', 'service', 'pedestrian', 'footway', 'path', 'cycleway', 'steps', 'track']
roads = []
for wid, w in ways.items():
    hw = w['tags'].get('highway')
    if hw not in WIDTH or len(w['ll']) < 2:
        # 服务车道与步行道保留，其他忽略
        continue
    if w['tags'].get('area') == 'yes':
        continue
    ring = proj_ring(w['ll'])
    if len(ring) < 2:
        continue
    xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
    if max(xs) - min(xs) < 1 and max(zs) - min(zs) < 1:
        continue
    width = WIDTH[hw]
    roads.append({
        'id': 'r' + wid,
        'name': w['tags'].get('name'),
        'points': ring,
        'width': width,
        'major': width >= 7,
        'kind': hw,
    })
roads.sort(key=lambda r: -r['width'])

# ---------------- 水体 / 绿地 / 运动场 ----------------
landscapes = []
water_features = {}
garden_features = {}
field_features = {}

def feature_record(name, ring, kind, fid, source_tags=None):
    return {
        'id': fid, 'kind': kind, 'name': name, 'points': ring,
        'area': rnd(ring_area(ring), 0),
        'tags': source_tags or {},
    }

for wid, w in ways.items():
    tags = w['tags']
    if len(w['ll']) < 4:
        continue
    ring = proj_ring(w['ll'])
    if len(ring) < 3:
        continue
    area = ring_area(ring)
    if area < 40:
        continue
    name = tags.get('name')
    is_water = tags.get('natural') == 'water' or bool(tags.get('water')) or tags.get('waterway') == 'riverbank'
    if is_water and area > 60:
        rec = feature_record(name, ring, 'water', 'w' + wid, tags)
        landscapes.append({'id': rec['id'], 'kind': 'water', 'points': ring})
        if name:
            water_features.setdefault(name, rec)
        continue
    leisure = tags.get('leisure')
    landuse = tags.get('landuse')
    natural = tags.get('natural')
    if leisure in ('pitch', 'track', 'stadium', 'sports_centre'):
        rec = feature_record(name, ring, 'sports', 's' + wid, tags)
        landscapes.append({'id': rec['id'], 'kind': 'sports', 'points': ring})
        if name:
            field_features.setdefault(name, rec)
        continue
    if leisure in ('park', 'garden', 'playground') or landuse in ('recreation_ground', 'village_green', 'meadow') or natural in ('wood', 'scrub') or landuse in ('forest',):
        kind = 'garden' if (leisure in ('park', 'garden') or natural in ('wood', 'scrub') or landuse == 'forest') else 'lawn'
        rec = feature_record(name, ring, kind, 'g' + wid, tags)
        landscapes.append({'id': rec['id'], 'kind': kind, 'points': ring})
        if name:
            garden_features.setdefault(name, rec)

# ---------------- 地标 ----------------
HNSUT = 'https://www.hnust.edu.cn/'
SRC_SCHOOL = {'title': '湖南科技大学 · 学校概况', 'url': HNSUT + 'xxgk/xxjj/index.htm'}
SRC_MAP = {'title': '湖南科技大学 · 校园风光', 'url': HNSUT + 'zjkd/xyfg/index.htm'}
SRC_OSM = {'title': 'OpenStreetMap（ODbL 1.0）', 'url': 'https://www.openstreetmap.org/copyright'}
SRC_MOE = {'title': '教育部：同意湘潭工学院与湘潭师范学院合并组建湖南科技大学', 'url': 'http://www.moe.gov.cn/srcsite/A03/s181/200304/t20030416_170545.html'}
SRC_MOTTO = {'title': '湖南科技大学 · 校训', 'url': 'https://news.hnust.edu.cn/kdyw/xwtt/32401.htm'}

def geo_for(rec):
    x, z = rec['position']
    return {
        'coordinates': unproject(x, z),
        'source': 'OpenStreetMap 公开建筑轮廓（ODbL 1.0）',
        'date': '2026-10-22',
        'status': '位置与轮廓来自 OSM；建筑高度为示意估算',
        'elevation': '平面沙盘 · 未接入高程数据',
    }

def bbox_size(ring):
    xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
    return max(xs) - min(xs), max(zs) - min(zs)

def landmark_from_building(bid, meta, height=None, model_size=None):
    rec = building_index[bid]
    ring = rec['footprint']
    w, d = bbox_size(ring)
    h = height if height else rec['size'][1]
    lm = {
        'id': meta['id'], 'name': meta['name'], 'subtitle': meta['subtitle'],
        'category': meta['category'], 'focus': meta['focus'], 'model': meta['model'],
        'position': rec['position'], 'size': [rnd(w), rnd(h), rnd(d)],
        'footprints': [ring], 'style': meta['style'],
        'description': meta['description'], 'facts': meta['facts'],
        'sources': meta['sources'], 'aliases': meta.get('aliases', []),
        'geo': geo_for(rec), '_sourceId': rec['id'],
    }
    if model_size:
        lm['size'] = model_size
    return lm

def landmark_from_feature(feat, meta, h, model_size=None):
    ring = feat['points']
    w, d = bbox_size(ring)
    pos = ring_centroid(ring)
    size = model_size or [rnd(w), h, rnd(d)]
    return {
        'id': meta['id'], 'name': meta['name'], 'subtitle': meta['subtitle'],
        'category': meta['category'], 'focus': meta['focus'], 'model': meta['model'],
        'position': pos, 'size': size, 'style': meta['style'],
        'description': meta['description'], 'facts': meta['facts'],
        'sources': meta['sources'], 'aliases': meta.get('aliases', []),
        'geo': {'coordinates': unproject(*pos), 'source': 'OpenStreetMap 公开水面/绿地/场地轮廓（ODbL 1.0）',
                'date': '2026-10-22', 'status': '轮廓来自 OSM；模型为示意', 'elevation': '平面沙盘 · 未接入高程数据'},
    }

landmarks = []
used_building_ids = set()

def add_building_landmark(bid, meta, height=None, model_size=None):
    lm = landmark_from_building(bid, meta, height, model_size)
    landmarks.append(lm)
    used_building_ids.add(lm['_sourceId'])

L = {}

L['southGate'] = dict(id='southGate', name='科大南门', subtitle='南校区主入口 · 学府路方向', category='heritage',
    focus=['scenic'], model='gate', style='校门 · 横向门廊与校名题字',
    description='科大南门面向学府路，是南校区的主要入口。横向门廊与校名题字构成校园的第一印象；由此进入，经广场与林荫道可走向月湖与教学区。',
    facts=['位于校园南侧，临近学府路', '门体为示意模型，位置参照 OSM 校门节点', '周边广场与道路按公开地图布置'],
    sources=[SRC_MAP, SRC_OSM])

L['northGate'] = dict(id='northGate', name='北门', subtitle='北校区入口 · 北门商圈', category='heritage',
    focus=['scenic'], model='gate', style='校门 · 门房与通道',
    description='北门连接北校区与北门商圈，是北侧生活与教学空间的主要出入口。门房、道路与周边商业共同构成校园北缘的日常场景。',
    facts=['OSM 标注有“北门”门房建筑', '北门商圈位于校门外侧', '高度为示意估算'],
    sources=[SRC_MAP, SRC_OSM])

L['oldGate'] = dict(id='oldGate', name='原湘潭工学院校门', subtitle='旧校门 · 工科办学的记忆', category='heritage',
    focus=['scenic'], model='gate', style='旧校门 · 题名与门柱',
    description='原湘潭工学院校门是校园里保留的旧校门。学校工科办学源于 1978 年成立的湘潭煤炭学院，1981 年更名湘潭矿业学院，1997 年更名湘潭工学院，2003 年与湘潭师范学院合并组建湖南科技大学。',
    facts=['校名沿革：湘潭煤炭学院 → 湘潭矿业学院 → 湘潭工学院', '2003 年两校合并组建湖南科技大学', '旧校门位置来自 OSM 标注'],
    sources=[SRC_MOE, SRC_OSM])

L['yuehu'] = dict(id='yuehu', name='月湖', subtitle='校园中心水面 · 环湖步道', category='heritage',
    focus=['scenic'], model='water', style='水景 · 环湖步道与广场',
    description='月湖位于校园中部，是科大最具代表性的水景。环湖步道、月湖广场与周边树林构成师生散步、摄影与社团活动的空间；校园道路“月湖路”也因湖得名。',
    facts=['水面轮廓来自 OpenStreetMap', '月湖广场与环湖路为公开地图标注', '岸线与水位为示意，未作测绘'],
    sources=[SRC_MAP, SRC_OSM])

L['sakura'] = dict(id='sakura', name='樱花园', subtitle='春季赏花 · 樱花路', category='heritage',
    focus=['scenic'], model='garden', style='花园 · 樱花与草坪',
    description='樱花园是春季校园最热闹的赏花地之一。樱花路与园内步道串联起花木与草坪，花开时是校园摄影与社团活动的热门地点。',
    facts=['OSM 标注为 leisure=garden', '校园内有“樱花路”命名', '花木分布为程序化布景，非逐株清点'],
    sources=[SRC_MAP, SRC_OSM])

L['library'] = dict(id='library', name='第二图书馆', subtitle='北校区 · 文献信息中心', category='modern',
    focus=['scenic'], model='library', style='图书馆 · 主体与入口',
    description='第二图书馆位于北校区，是学校重要的文献信息中心。学校公开资料显示图书馆藏书 300 余万册，为教学科研与自主学习提供支撑。',
    facts=['学校公开数据：图书馆藏书 304 万余册', '名称与位置来自 OSM 校园标注', '建筑高度为示意估算'],
    sources=[SRC_SCHOOL, SRC_OSM])

L['zhixing'] = dict(id='zhixing', name='知行楼', subtitle='北校区 · 教学与公共空间', category='teaching',
    focus=['teaching'], model='six', style='教学组团 · 双体量与连廊',
    description='知行楼是北校区的教学与公共空间，取“知行合一”之意。楼名与校训“唯实惟新，至诚致志”共同体现学校重视实践与创新的育人取向。',
    facts=['位于北校区教学区', '校训：唯实惟新，至诚致志', '模型以双体量与连廊示意'],
    sources=[SRC_MOTTO, SRC_OSM])

L['yifu'] = dict(id='yifu', name='逸夫教学楼', subtitle='公共教学 · 逸夫捐赠', category='teaching',
    focus=['teaching'], model='school', style='教学楼 · 坡顶与入口',
    description='逸夫教学楼由邵逸夫先生捐资兴建，是学校重要的公共教学空间之一。楼体与入口广场承担着日常上课与人流集散。',
    facts=['“逸夫教学楼”为 OSM 校园标注名称', '邵逸夫先生长期捐资支持内地教育', '高度为示意估算'],
    sources=[SRC_OSM, SRC_SCHOOL])

def teaching_meta(i, name, subtitle):
    return dict(id='teach' + str(i), name=name, subtitle=subtitle, category='teaching',
        focus=['teaching'], model='footprint', style='教学楼 · 标准层与窗列',
        description=name + '是校园教学空间的一部分。标准层、连廊与入口组织起日常上课的人流；建筑轮廓与位置按公开地图数据表达。',
        facts=['名称来自 OSM 校园标注', '轮廓来自 OSM；高度为示意估算', '室内布局未作复原'],
        sources=[SRC_OSM, SRC_SCHOOL])

L['teach1'] = teaching_meta(1, '第一教学楼', '南校区 · 公共课堂')
L['teach8'] = teaching_meta(8, '第八教学楼', '北校区 · 公共课堂')
L['teach9'] = teaching_meta(9, '第九教学楼', '北校区 · 公共课堂')

def dept_meta(i, name, subtitle, desc=None):
    return dict(id=i, name=name, subtitle=subtitle, category='department',
        focus=['department'], model='footprint', style='学院楼 · 院系与实验空间',
        description=desc or (name + '是学校的教学科研单位之一。学校现设 21 个教学院，院系楼承担课堂、实验与办公功能；建筑轮廓与位置按公开地图数据表达。'),
        facts=['学校现设 21 个教学院（学校公开数据）', '名称来自 OSM 校园标注', '轮廓来自 OSM；高度为示意估算'],
        sources=[SRC_SCHOOL, SRC_OSM])

L['business'] = dept_meta('business', '商学院', '经济与管理类教学')
L['civil'] = dept_meta('civil', '土木工程学院', '土木与工程类教学')
L['foreign'] = dept_meta('foreign', '外国语学院', '外语教学与研究')
L['lifeSci'] = dept_meta('lifeSci', '生命科学学院', '生命科学教学与实验')
L['art'] = dept_meta('art', '美术楼', '美术与设计教学', '美术楼承担美术、设计类课程与创作空间，与齐白石艺术馆共同构成校园艺术空间。')
L['info'] = dept_meta('info', '信息楼', '信息与计算机类教学')

L['museum'] = dict(id='museum', name='博物馆', subtitle='校史与科普展示', category='modern',
    focus=['scenic'], model='museum', style='文化建筑 · 横向体量',
    description='学校设有档案馆（校史馆、博物馆），承担校史陈列、档案与科普展示。建筑以横向体量与入口空间组织展览流线。',
    facts=['学校机构设置含档案馆（校史馆、博物馆）', '名称与位置来自 OSM 校园标注', '内部展陈未作复原'],
    sources=[SRC_SCHOOL, SRC_OSM])

L['qibaishi'] = dict(id='qibaishi', name='齐白石艺术馆', subtitle='艺术展示 · 美育空间', category='heritage',
    focus=['scenic'], model='humanities', style='艺术馆 · 体量与柱廊',
    description='齐白石艺术馆以湘潭籍艺术大师齐白石命名，是学校艺术展示与美育空间。艺术馆与美术楼、博物馆共同构成校园的文化艺术节点。',
    facts=['齐白石为湘潭籍艺术大师', '名称来自 OSM 校园标注', '模型以体量与柱廊示意'],
    sources=[SRC_MAP, SRC_OSM])

L['studentCenter'] = dict(id='studentCenter', name='学生活动中心', subtitle='社团 · 演出 · 校园文化', category='life',
    focus=['life'], model='theater', style='活动中心 · 剧场体量',
    description='学生活动中心是社团活动、演出与校园文化的集中场所。剧场体量与前厅空间承载晚会、讲座与社团招新等日常活动。',
    facts=['名称与位置来自 OSM 校园标注', '模型以剧场体量示意', '内部布局未作复原'],
    sources=[SRC_OSM, SRC_SCHOOL])

L['gym'] = dict(id='gym', name='第三体育馆', subtitle='室内运动 · 体育教学', category='sports',
    focus=['sports'], model='footprint', style='体育馆 · 大空间与入口',
    description='第三体育馆是校园室内运动与体育教学场地之一，与田径场、篮球场、网球场等共同构成校园运动设施群。',
    facts=['名称来自 OSM 校园标注', '周边分布田径场与球场', '高度为示意估算'],
    sources=[SRC_OSM, SRC_SCHOOL])

L['field1'] = dict(id='field1', name='第一田径场', subtitle='田径与足球 · 校园主运动场', category='sports',
    focus=['sports'], model='field', style='运动场 · 跑道与草坪',
    description='第一田径场是校园主要的田径与足球活动场地，跑道、草坪与看台周边分布着篮球场、网球场等设施，是体育课与日常锻炼的核心空间。',
    facts=['名称来自 OSM 校园标注', '场地轮廓来自 OSM', '跑道与草坪为示意模型'],
    sources=[SRC_OSM, SRC_SCHOOL])

L['dining'] = dict(id='dining', name='南园食府', subtitle='南校区 · 学生食堂', category='dining',
    focus=['dining'], model='footprint', style='食堂 · 大空间与入口',
    description='南园食府位于南校区，是学生日常就餐的主要食堂之一。学校另有五味苑、八珍楼、三白馆、二至坊等多处餐饮点，分布在南北校区。',
    facts=['名称来自 OSM 校园标注', '校园内另有多处食堂与餐厅', '内部布局未作复原'],
    sources=[SRC_OSM, SRC_SCHOOL])

L['dorm'] = dict(id='dorm', name='学生宿舍区', subtitle='北苑公寓 · 校园生活', category='life',
    focus=['life'], model='dorm', style='学生公寓 · 组团与院落',
    description='学生宿舍区由多栋公寓、食堂与服务设施组成。北校区与南校区均有学生生活组团，宿舍、食堂、超市与运动场共同构成日常校园生活。',
    facts=['校园南北校区均设学生生活区', '公寓分布为示意，不呈现具体住户信息', '名称与范围按 OSM 建筑群归纳'],
    sources=[SRC_OSM, SRC_SCHOOL])

L['training'] = dict(id='training', name='工程训练中心', subtitle='金工实习 · 工程实践', category='department',
    focus=['department'], model='technology', style='工程训练 · 厂房与实训空间',
    description='工程训练中心承担金工实习、电子工艺与工程实践教学，是工科人才培养的重要基地。厂房式大空间与实训设备支撑从认知到操作的实践环节。',
    facts=['名称来自 OSM 校园标注（工程训练中心 1—5）', '承担工程实践类教学', '模型以厂房体量示意'],
    sources=[SRC_OSM, SRC_SCHOOL])

# 建筑匹配
add_building_landmark('第二图书馆', L['library'], height=24)
add_building_landmark('知行楼', L['zhixing'], height=24)
add_building_landmark('逸夫教学楼', L['yifu'])
add_building_landmark('第一教学楼', L['teach1'])
add_building_landmark('第八教学楼', L['teach8'])
add_building_landmark('第九教学楼', L['teach9'])
add_building_landmark('商学院', L['business'])
add_building_landmark('土木工程学院', L['civil'])
add_building_landmark('外国语学院', L['foreign'])
add_building_landmark('生命科学学院', L['lifeSci'])
add_building_landmark('美术楼', L['art'])
add_building_landmark('信息楼', L['info'])
add_building_landmark('博物馆', L['museum'], height=20)
add_building_landmark('学生活动中心', L['studentCenter'], height=20)
add_building_landmark('齐白石艺术馆', L['qibaishi'], height=14)
add_building_landmark('第三体育馆', L['gym'], height=14)
add_building_landmark('南园食府', L['dining'])
add_building_landmark('工程训练中心1', L['training'], height=16)
add_building_landmark('原湘潭工学院校门', L['oldGate'], height=10)
add_building_landmark('北门', L['northGate'], height=12)

# 水面 / 花园 / 场地
if '月湖' in water_features:
    landmarks.append(landmark_from_feature(water_features['月湖'], L['yuehu'], 12, [150, 12, 95]))
else:
    print('WARN: 月湖 not found')

sak = garden_features.get('樱花园')
if sak:
    landmarks.append(landmark_from_feature(sak, L['sakura'], 12, [110, 12, 80]))
else:
    print('WARN: 樱花园 not found')

if '第一田径场' in field_features:
    landmarks.append(landmark_from_feature(field_features['第一田径场'], L['field1'], 6))
else:
    print('WARN: 第一田径场 not found')

# 学生宿舍区：取北校区公寓群的中心，作为组团示意
dorm_pos = [365, -620]
landmarks.append({
    'id': 'dorm', 'name': L['dorm']['name'], 'subtitle': L['dorm']['subtitle'],
    'category': 'life', 'focus': L['dorm']['focus'], 'model': 'dorm',
    'position': dorm_pos, 'size': [270, 22, 220], 'style': L['dorm']['style'],
    'description': L['dorm']['description'], 'facts': L['dorm']['facts'],
    'sources': L['dorm']['sources'], 'aliases': [],
    'geo': {'coordinates': unproject(*dorm_pos), 'source': 'OpenStreetMap 学生公寓建筑群（ODbL 1.0）',
            'date': '2026-10-22', 'status': '范围按 OSM 公寓群归纳；体量为示意', 'elevation': '平面沙盘 · 未接入高程数据'},
})

# 南门：使用 OSM 校门节点
GATE_NODES = []
for n in root.findall('node'):
    tags = {t.get('k'): t.get('v') for t in n.findall('tag')}
    if (tags.get('name') == '科大南门'):
        GATE_NODES.append((float(n.get('lat')), float(n.get('lon'))))
if GATE_NODES:
    lat = sum(a for a, b in GATE_NODES) / len(GATE_NODES)
    lon = sum(b for a, b in GATE_NODES) / len(GATE_NODES)
    pos = [rnd(px(lon)), rnd(pz(lat))]
    landmarks.append({
        'id': 'southGate', 'name': L['southGate']['name'], 'subtitle': L['southGate']['subtitle'],
        'category': 'heritage', 'focus': L['southGate']['focus'], 'model': 'gate',
        'position': pos, 'size': [64, 16, 18], 'style': L['southGate']['style'],
        'description': L['southGate']['description'], 'facts': L['southGate']['facts'],
        'sources': L['southGate']['sources'], 'aliases': [],
        'geo': {'coordinates': unproject(*pos), 'source': 'OpenStreetMap 校门节点（ODbL 1.0）',
                'date': '2026-10-22', 'status': '位置来自 OSM 校门节点；模型为示意', 'elevation': '平面沙盘 · 未接入高程数据'},
    })
else:
    print('WARN: 科大南门 nodes not found')

for lm in landmarks:
    lm.pop('_sourceId', None)

# 上下文楼群：排除已作为地标的建筑
landmarks_by_id = {l['id']: l for l in landmarks}
used_rings = set()
for l in landmarks:
    if l.get('footprints'):
        for ring in l['footprints']:
            used_rings.add(tuple(map(tuple, ring)))
context_buildings = []
for b in buildings:
    if b['id'] in used_building_ids:
        continue
    if tuple(map(tuple, b['footprint'])) in used_rings:
        continue
    context_buildings.append({
        'id': b['id'], 'position': b['position'], 'size': b['size'],
        'footprint': b['footprint'], 'style': b['style'],
    })

# ---------------- 导览 / 分期 / 片区 ----------------
tours = [
    {'id': 'south-lake', 'name': '南门·月湖', 'subtitle': '从南门进入，沿月湖走到樱花深处', 'color': '#1e55af',
     'stops': ['southGate', 'yuehu', 'sakura', 'studentCenter']},
    {'id': 'north-axis', 'name': '北门·教学轴线', 'subtitle': '北门 → 知行楼 → 教学楼群 → 图书馆', 'color': '#3a6bbf',
     'stops': ['northGate', 'zhixing', 'teach8', 'yifu', 'library']},
    {'id': 'engineering-art', 'name': '工科与艺术', 'subtitle': '土木工程学院 → 工程训练中心 → 齐白石艺术馆 → 博物馆', 'color': '#c2871f',
     'stops': ['civil', 'training', 'qibaishi', 'museum']},
    {'id': 'sports-life', 'name': '运动与生活', 'subtitle': '田径场、体育馆、食堂与宿舍', 'color': '#2f6bc4',
     'stops': ['field1', 'gym', 'dining', 'dorm']},
]
eras = [
    {'id': 'garden', 'title': '师范与起点', 'period': '1949—1977', 'year': 1977,
     'description': '学校办学源头可追溯到 1949 年的湘北建设学院；1958 年湘潭专区师范专科学校成立，1959 年更名为湘潭师范专科学校，为后来的湘潭师范学院奠定基础。'},
    {'id': 'university', 'title': '煤炭与工科', 'period': '1978—2002', 'year': 2002,
     'description': '1978 年湘潭煤炭学院成立，1981 年更名湘潭矿业学院，1997 年更名湘潭工学院；1985 年湘潭师范专科学校升格为湘潭师范学院。两条办学脉络在湘潭并行生长。'},
    {'id': 'engineering', 'title': '合并组建', 'period': '2003—2015', 'year': 2015,
     'description': '2003 年，湘潭工学院与湘潭师范学院合并组建湖南科技大学，形成工科与师范并重的综合性大学格局，校园空间也进入整合与扩展阶段。'},
    {'id': 'today', 'title': '当代科大', 'period': '2016—2025', 'year': 2025,
     'description': '2016 年起学校成为国家国防科工局与湖南省共建高校，2025 年成为湖南省与自然资源部共建高校；北校区、南校区与月湖景观带构成今天的校园。'},
]
districts = [
    {'id': 'north-academic', 'name': '北校区教学区', 'position': [-120, -720],
     'points': [[-1000, -1400], [900, -1400], [900, -350], [-1000, -350]]},
    {'id': 'south-life', 'name': '南校区生活区', 'position': [430, 720],
     'points': [[-250, 300], [1100, 300], [1100, 1300], [-250, 1300]]},
    {'id': 'yuehu-scenic', 'name': '月湖景观带', 'position': [220, 40],
     'points': [[-100, -250], [650, -250], [650, 400], [-100, 400]]},
    {'id': 'sports-zone', 'name': '运动场区', 'position': [520, -560],
     'points': [[150, -850], [950, -850], [950, -250], [150, -250]]},
]
terrain_review = [
    {'name': '月湖岸线与环湖步道', 'status': '使用 OSM 公开水面轮廓；岸线细节与水位未实测'},
    {'name': '田径场与球场', 'status': '跑道、草坪按 OSM 场地轮廓示意，未作运动场地测绘'},
    {'name': '建筑高度与地面高程', 'status': '高度为示意估算，地面为平面沙盘，未接入高程数据'},
]

data = {
    'meta': {
        'name': '湖南科技大学',
        'nameEn': 'Hunan University of Science and Technology',
        'center': [LON0, LAT0],
        'bbox': [112.9000, 27.8935, 112.9235, 27.9185],
        'updated': '2026-10-22',
        'sources': [SRC_OSM, SRC_SCHOOL, SRC_MAP, SRC_MOE, SRC_MOTTO],
    },
    'buildings': context_buildings,
    'roads': roads,
    'landscapes': landscapes,
    'landmarks': landmarks,
    'tours': tours,
    'eras': eras,
    'districts': districts,
    'terrainReview': terrain_review,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

print('buildings(context):', len(context_buildings), '/ all:', len(buildings))
print('roads:', len(roads), 'landscapes:', len(landscapes), 'landmarks:', len(landmarks))
print('file:', OUT, round(os.path.getsize(OUT) / 1024 / 1024, 2), 'MB')
print('landmark ids:', ', '.join(l['id'] for l in landmarks))
print('missing building landmarks:', [bid for bid in ['第二图书馆','知行楼','逸夫教学楼','第一教学楼','第八教学楼','第九教学楼','商学院','土木工程学院','外国语学院','生命科学学院','美术楼','信息楼','博物馆','齐白石艺术馆','学生活动中心','第三体育馆','南园食府','工程训练中心1','原湘潭工学院校门','北门'] if bid not in building_index])

