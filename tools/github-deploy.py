# -*- coding: utf-8 -*-
"""通过 GitHub REST API 发布：main 源码 + gh-pages 构建产物 + Pages。"""
import base64, json, os, sys, time, urllib.request, urllib.error

sys.stdout.reconfigure(encoding='utf-8')
OWNER = 'RazorEdge-wyh'
REPO = 'hnust-campus-3d'
BASE = '/hnust-campus-3d/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = open(os.path.join(os.environ['TEMP'], 'gh_token.txt'), encoding='utf-8').read().strip()
PROXY = os.environ.get('HTTPS_PROXY') or 'http://127.0.0.1:7897'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY}))

def api(method, path, data=None, raw=False):
    url = 'https://api.github.com' + path
    body = None
    headers = {
        'Authorization': 'Bearer ' + TOKEN,
        'User-Agent': 'hnust-campus-deploy',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if data is not None:
        body = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    last = None
    for attempt in range(4):
        try:
            with OPENER.open(req, timeout=90) as r:
                content = r.read()
                return json.loads(content) if content else {}
        except urllib.error.HTTPError as e:
            print('HTTP', e.code, method, path, e.read().decode('utf-8', 'replace')[:500])
            raise
        except Exception as e:
            last = e
            time.sleep(2 + attempt * 2)
    raise last

def create_blob(data_bytes):
    return api('POST', f'/repos/{OWNER}/{REPO}/git/blobs',
               {'content': base64.b64encode(data_bytes).decode('ascii'), 'encoding': 'base64'})['sha']

def commit_tree(files, message, branch, parent=None):
    tree = []
    for rel, full in files:
        with open(full, 'rb') as f:
            data = f.read()
        sha = create_blob(data)
        tree.append({'path': rel.replace('\\', '/'), 'mode': '100644', 'type': 'blob', 'sha': sha})
    t = api('POST', f'/repos/{OWNER}/{REPO}/git/trees', {'tree': tree})['sha']
    payload = {'message': message, 'tree': t}
    if parent:
        payload['parents'] = [parent]
    c = api('POST', f'/repos/{OWNER}/{REPO}/git/commits', payload)['sha']
    try:
        api('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/{branch}')
        exists = True
    except urllib.error.HTTPError:
        exists = False
    if exists:
        api('PATCH', f'/repos/{OWNER}/{REPO}/git/refs/heads/{branch}', {'sha': c, 'force': True})
    else:
        api('POST', f'/repos/{OWNER}/{REPO}/git/refs', {'ref': f'refs/heads/{branch}', 'sha': c})
    print(f'{branch}: {len(tree)} files -> {c}')
    return c

def ensure_initial_commit():
    """空仓库无法直接创建 blobs，先用 Contents API 建立首个提交。"""
    try:
        return api('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/main')['object']['sha']
    except urllib.error.HTTPError:
        readme = open(os.path.join(ROOT, 'README.md'), 'rb').read()
        api('PUT', f'/repos/{OWNER}/{REPO}/contents/README.md', {
            'message': 'init: 项目说明',
            'content': base64.b64encode(readme).decode('ascii'),
        })
        return api('GET', f'/repos/{OWNER}/{REPO}/git/ref/heads/main')['object']['sha']

# 1) 创建仓库
try:
    api('GET', f'/repos/{OWNER}/{REPO}')
    print('仓库已存在')
except urllib.error.HTTPError as e:
    if e.code == 404:
        api('POST', '/user/repos', {
            'name': REPO, 'private': False,
            'description': '湖南科技大学 3D 校园沙盘（仿清华园境 MIT 项目，OpenStreetMap 数据）',
            'homepage': f'https://{OWNER.lower()}.github.io/{REPO}/',
            'has_issues': True, 'has_projects': False, 'has_wiki': False,
        })
        print('仓库已创建')
    else:
        raise

# 2) main：源码
EXCLUDE_DIRS = {'node_modules', 'dist', '.git', 'data'}
EXCLUDE_FILES = {'tsconfig.tsbuildinfo'}
files = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    rel_dir = os.path.relpath(dirpath, ROOT)
    if rel_dir == '.':
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', 'dist', '.git')]
    for fn in filenames:
        if fn in EXCLUDE_FILES or fn.endswith('.tmp') or '.tmpdir' in rel_dir:
            continue
        full = os.path.join(dirpath, fn)
        rel = os.path.relpath(full, ROOT)
        if rel.startswith('node_modules') or rel.startswith('dist'):
            continue
        files.append((rel, full))
# 源码里附带 OSM 原始数据，便于复现
osm = os.path.join(ROOT, 'data', 'hnust_map.osm')
if os.path.exists(osm):
    files.append(('data/hnust_map.osm', osm))
print('main 文件数:', len(files))
main_parent = ensure_initial_commit()
commit_tree(files, 'feat: 湖南科技大学 3D 校园沙盘 v1.0（基于清华园境 MIT 代码）', 'main', main_parent)

# 3) gh-pages：构建产物
dist = os.path.join(ROOT, 'dist')
gh = []
for dirpath, dirnames, filenames in os.walk(dist):
    for fn in filenames:
        full = os.path.join(dirpath, fn)
        gh.append((os.path.relpath(full, dist), full))
commit_tree(gh, 'deploy: GitHub Pages build', 'gh-pages')

# 4) 开启 Pages
try:
    api('POST', f'/repos/{OWNER}/{REPO}/pages', {'source': {'branch': 'gh-pages', 'path': '/'}})
    print('Pages 已开启')
except urllib.error.HTTPError:
    print('Pages 可能已存在')

# 5) 等待构建
for i in range(40):
    time.sleep(6)
    try:
        p = api('GET', f'/repos/{OWNER}/{REPO}/pages')
        print('pages status:', p.get('status'), p.get('html_url'))
        if p.get('status') == 'built':
            break
    except Exception as e:
        print('poll err', e)
print('DONE', f'https://{OWNER.lower()}.github.io/{REPO}/')
