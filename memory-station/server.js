// server.js — 乡村迁徙记忆站 主服务
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'memory-station-' + crypto.randomBytes(16).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8小时
}));

// ---------- 工具 ----------
function hashPassword(pw, salt) {
  return crypto.createHash('sha256').update(salt + '::' + pw).digest('hex');
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error: '请先登录管理员账号' });
}
// 校验某私密故事是否已在当前会话解锁
function storyUnlocked(req, storyId) {
  return req.session.unlocked && req.session.unlocked.includes(storyId);
}
// 私密照片：其所属家庭若有任一已解锁私密内容则放行；否则要求照片对应家庭无私密保护时……
// 简化策略：私密照片与"该家庭任意私密故事的口令"绑定——输入任一该家庭私密口令即可看该家庭全部私密内容。
function familyUnlocked(req, familyId) {
  const privStories = db.all('SELECT id FROM stories WHERE family_id=? AND is_private=1', [familyId]);
  return privStories.some(s => storyUnlocked(req, s.id));
}

// ---------- 上传 ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
      .includes((path.extname(file.originalname) || '').toLowerCase());
    cb(ok ? null : new Error('仅支持图片文件'), ok);
  }
});

// ---------- 静态资源 ----------
app.use(express.static(path.join(__dirname, 'public')));
// 公开照片直接静态访问；私密照片走 /api/photos/:id/file 鉴权
app.use('/uploads', (req, res, next) => {
  const file = path.basename(req.path);
  const photo = db.get('SELECT * FROM photos WHERE filename=?', [file]);
  if (photo && photo.is_private) {
    return res.status(403).send('该照片为私密资料，请通过故事页面访问');
  }
  next();
}, express.static(UPLOAD_DIR));

// ============ 公开 API ============

// 站点概览
app.get('/api/site', (req, res) => {
  res.json({
    name: '乡村迁徙记忆站',
    families: db.get('SELECT COUNT(*) c FROM families').c,
    stories: db.get("SELECT COUNT(*) c FROM stories WHERE status='published'").c,
    routes: db.get('SELECT COUNT(*) c FROM routes').c,
    photos: db.get('SELECT COUNT(*) c FROM photos').c
  });
});

// 家庭列表
app.get('/api/families', (req, res) => {
  const rows = db.all(`
    SELECT f.*,
      (SELECT COUNT(*) FROM routes r WHERE r.family_id=f.id) AS route_count,
      (SELECT COUNT(*) FROM stories s WHERE s.family_id=f.id AND s.status='published' AND s.is_private=0) AS story_count,
      (SELECT COUNT(*) FROM photos p WHERE p.family_id=f.id AND p.is_private=0) AS photo_count
    FROM families f ORDER BY f.id`);
  res.json(rows);
});

// 家庭详情（公开内容；私密内容仅返回条数提示）
app.get('/api/families/:id', (req, res) => {
  const f = db.get('SELECT * FROM families WHERE id=?', [req.params.id]);
  if (!f) return res.status(404).json({ error: '未找到该家庭' });
  const unlocked = familyUnlocked(req, f.id);
  const routes = db.all('SELECT * FROM routes WHERE family_id=? ORDER BY year, sort, id', [f.id]);
  const stories = db.all(`
    SELECT id, family_id, person_name, title, era, event_year, is_private, contributor, created_at,
           substr(content,1,120) AS excerpt
    FROM stories WHERE family_id=? AND status='published'
    ORDER BY event_year, id`, [f.id])
    .map(s => (s.is_private && !unlocked)
      ? { ...s, locked: true, excerpt: '（私密故事，需访问口令）', content: undefined }
      : { ...s, locked: false });
  const photos = db.all('SELECT * FROM photos WHERE family_id=? ORDER BY year_taken, id', [f.id])
    .filter(p => !p.is_private || unlocked)
    .map(p => ({ ...p, url: p.is_private ? `/api/photos/${p.id}/file` : `/uploads/${p.filename}` }));
  const privateCount = db.get('SELECT COUNT(*) c FROM stories WHERE family_id=? AND is_private=1 AND status="published"', [f.id]).c;
  res.json({ ...f, routes, stories, photos, private_count: privateCount, unlocked });
});

// 全部迁徙路线（地图用）
app.get('/api/routes', (req, res) => {
  res.json(db.all(`
    SELECT r.*, f.name AS family_name, f.surname
    FROM routes r JOIN families f ON f.id=r.family_id
    ORDER BY r.year, r.sort, r.id`));
});

// 时间线数据：迁徙事件 + 公开故事 + 已解锁私密故事 + 年代说明
app.get('/api/timeline', (req, res) => {
  const routes = db.all(`
    SELECT r.id, r.year, r.from_place, r.to_place, r.reason, r.family_id, f.name AS family_name
    FROM routes r JOIN families f ON f.id=r.family_id WHERE r.year IS NOT NULL`);
  const stories = db.all(`
    SELECT s.id, s.title, s.person_name, s.era, s.event_year, s.is_private, s.family_id, f.name AS family_name,
           substr(s.content,1,100) AS excerpt
    FROM stories s JOIN families f ON f.id=s.family_id
    WHERE s.status='published' AND s.event_year IS NOT NULL`)
    .filter(s => !s.is_private || storyUnlocked(req, s.id));
  const eras = db.all('SELECT * FROM eras ORDER BY year_start, sort, id');
  res.json({ routes, stories, eras });
});

// 年代说明
app.get('/api/eras', (req, res) => {
  res.json(db.all('SELECT * FROM eras ORDER BY year_start, sort, id'));
});

// 故事详情
app.get('/api/stories/:id', (req, res) => {
  const s = db.get(`
    SELECT s.*, f.name AS family_name FROM stories s
    JOIN families f ON f.id=s.family_id
    WHERE s.id=? AND s.status='published'`, [req.params.id]);
  if (!s) return res.status(404).json({ error: '未找到该故事' });
  if (s.is_private && !storyUnlocked(req, s.id)) {
    return res.json({
      locked: true, id: s.id, title: s.title, family_name: s.family_name,
      family_id: s.family_id, person_name: s.person_name, era: s.era,
      hint: '这是私密故事，请输入家属告知的访问口令'
    });
  }
  const unlocked = familyUnlocked(req, s.family_id);
  const photos = db.all('SELECT * FROM photos WHERE story_id=? ORDER BY id', [s.id])
    .filter(p => !p.is_private || unlocked)
    .map(p => ({ ...p, url: p.is_private ? `/api/photos/${p.id}/file` : `/uploads/${p.filename}` }));
  const { access_code, ...safe } = s;
  res.json({ ...safe, locked: false, photos });
});

// 私密故事口令校验
app.post('/api/stories/:id/unlock', (req, res) => {
  const s = db.get("SELECT * FROM stories WHERE id=? AND status='published'", [req.params.id]);
  if (!s) return res.status(404).json({ error: '未找到该故事' });
  if (!s.is_private) return res.json({ ok: true });
  const code = (req.body.code || '').trim();
  if (code && code === (s.access_code || '').trim()) {
    if (!req.session.unlocked) req.session.unlocked = [];
    if (!req.session.unlocked.includes(s.id)) req.session.unlocked.push(s.id);
    return res.json({ ok: true });
  }
  res.status(403).json({ error: '口令不正确，请向家中长辈或管理员询问' });
});

// 私密照片文件（需已解锁该家庭任一私密故事）
app.get('/api/photos/:id/file', (req, res) => {
  const p = db.get('SELECT * FROM photos WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).send('照片不存在');
  if (p.is_private && !familyUnlocked(req, p.family_id)) {
    return res.status(403).send('该照片为私密资料，需访问口令');
  }
  res.sendFile(path.join(UPLOAD_DIR, p.filename));
});

// 亲属提交补充资料（无需登录）
app.post('/api/submissions', upload.single('photo'), (req, res) => {
  const { family_id, type, person_name, title, content, photo_caption, submitter_name, contact } = req.body;
  if (!submitter_name || !submitter_name.trim())
    return res.status(400).json({ error: '请填写您的称呼，方便家族确认身份' });
  if (!['story', 'photo', 'correction'].includes(type))
    return res.status(400).json({ error: '资料类型不正确' });
  if (type !== 'photo' && (!content || !content.trim()))
    return res.status(400).json({ error: '请填写资料内容' });
  if (type === 'photo' && !req.file)
    return res.status(400).json({ error: '请选择要上传的照片' });
  const id = db.insert(`
    INSERT INTO submissions (family_id,type,person_name,title,content,photo_file,photo_caption,submitter_name,contact)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [family_id || null, type, person_name || '', title || '', content || '',
     req.file ? req.file.filename : null, photo_caption || '',
     submitter_name.trim(), contact || '']);
  res.json({ ok: true, id, message: '提交成功！管理员审核后将收录进站，感谢您的分享。' });
});

// ============ 管理 API ============
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const a = db.get('SELECT * FROM admins WHERE username=?', [username || '']);
  if (!a || hashPassword(password || '', a.salt) !== a.password_hash) {
    return res.status(401).json({ error: '用户名或密码不正确' });
  }
  req.session.adminId = a.id;
  res.json({ ok: true, name: a.display_name });
});
app.post('/api/admin/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get('/api/admin/me', (req, res) => {
  if (!req.session.adminId) return res.status(401).json({ error: '未登录' });
  const a = db.get('SELECT id,username,display_name FROM admins WHERE id=?', [req.session.adminId]);
  const pending = db.get("SELECT COUNT(*) c FROM submissions WHERE status='pending'").c;
  res.json({ ...a, pending });
});

// --- 家庭 CRUD ---
app.get('/api/admin/families', requireAdmin, (req, res) => {
  res.json(db.all('SELECT * FROM families ORDER BY id'));
});
app.post('/api/admin/families', requireAdmin, (req, res) => {
  const { name, surname, origin_village, summary } = req.body;
  if (!name) return res.status(400).json({ error: '请填写家庭名称' });
  const id = db.insert('INSERT INTO families (name,surname,origin_village,summary) VALUES (?,?,?,?)',
    [name, surname || '', origin_village || '', summary || '']);
  res.json({ ok: true, id });
});
app.put('/api/admin/families/:id', requireAdmin, (req, res) => {
  const { name, surname, origin_village, summary } = req.body;
  db.run('UPDATE families SET name=?,surname=?,origin_village=?,summary=? WHERE id=?',
    [name, surname || '', origin_village || '', summary || '', req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/admin/families/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM families WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// --- 迁徙路线 CRUD ---
app.get('/api/admin/routes', requireAdmin, (req, res) => {
  res.json(db.all('SELECT r.*, f.name AS family_name FROM routes r JOIN families f ON f.id=r.family_id ORDER BY r.family_id, r.year, r.sort'));
});
app.post('/api/admin/routes', requireAdmin, (req, res) => {
  const r = req.body;
  if (!r.family_id || !r.from_place || !r.to_place)
    return res.status(400).json({ error: '请填写所属家庭、出发地和目的地' });
  const id = db.insert(`INSERT INTO routes
    (family_id,from_place,to_place,from_lat,from_lng,to_lat,to_lng,year,reason,transport,description,sort)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [r.family_id, r.from_place, r.to_place, r.from_lat || null, r.from_lng || null,
     r.to_lat || null, r.to_lng || null, r.year || null, r.reason || '', r.transport || '',
     r.description || '', r.sort || 0]);
  res.json({ ok: true, id });
});
app.put('/api/admin/routes/:id', requireAdmin, (req, res) => {
  const r = req.body;
  db.run(`UPDATE routes SET family_id=?,from_place=?,to_place=?,from_lat=?,from_lng=?,
    to_lat=?,to_lng=?,year=?,reason=?,transport=?,description=?,sort=? WHERE id=?`,
    [r.family_id, r.from_place, r.to_place, r.from_lat || null, r.from_lng || null,
     r.to_lat || null, r.to_lng || null, r.year || null, r.reason || '', r.transport || '',
     r.description || '', r.sort || 0, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/admin/routes/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM routes WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// --- 故事 CRUD ---
app.get('/api/admin/stories', requireAdmin, (req, res) => {
  res.json(db.all(`SELECT s.*, f.name AS family_name FROM stories s
    JOIN families f ON f.id=s.family_id ORDER BY s.id DESC`));
});
app.post('/api/admin/stories', requireAdmin, (req, res) => {
  const s = req.body;
  if (!s.family_id || !s.title || !s.content)
    return res.status(400).json({ error: '请填写所属家庭、标题和内容' });
  const id = db.insert(`INSERT INTO stories
    (family_id,person_name,title,content,era,event_year,is_private,access_code,contributor,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [s.family_id, s.person_name || '', s.title, s.content, s.era || '', s.event_year || null,
     s.is_private ? 1 : 0, s.access_code || '', s.contributor || '', s.status || 'published']);
  res.json({ ok: true, id });
});
app.put('/api/admin/stories/:id', requireAdmin, (req, res) => {
  const s = req.body;
  db.run(`UPDATE stories SET family_id=?,person_name=?,title=?,content=?,era=?,event_year=?,
    is_private=?,access_code=?,contributor=?,status=? WHERE id=?`,
    [s.family_id, s.person_name || '', s.title, s.content, s.era || '', s.event_year || null,
     s.is_private ? 1 : 0, s.access_code || '', s.contributor || '', s.status || 'published', req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/admin/stories/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM stories WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// --- 照片管理 ---
app.get('/api/admin/photos', requireAdmin, (req, res) => {
  res.json(db.all(`SELECT p.*, f.name AS family_name FROM photos p
    JOIN families f ON f.id=p.family_id ORDER BY p.id DESC`));
});
app.post('/api/admin/photos', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择照片文件' });
  const { family_id, story_id, caption, year_taken, is_private } = req.body;
  if (!family_id) return res.status(400).json({ error: '请选择所属家庭' });
  const id = db.insert(`INSERT INTO photos (family_id,story_id,filename,caption,year_taken,is_private)
    VALUES (?,?,?,?,?,?)`,
    [family_id, story_id || null, req.file.filename, caption || '', year_taken || '', is_private ? 1 : 0]);
  res.json({ ok: true, id });
});
app.put('/api/admin/photos/:id', requireAdmin, (req, res) => {
  const { caption, year_taken, is_private, story_id } = req.body;
  db.run('UPDATE photos SET caption=?,year_taken=?,is_private=?,story_id=? WHERE id=?',
    [caption || '', year_taken || '', is_private ? 1 : 0, story_id || null, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/admin/photos/:id', requireAdmin, (req, res) => {
  const p = db.get('SELECT * FROM photos WHERE id=?', [req.params.id]);
  db.run('DELETE FROM photos WHERE id=?', [req.params.id]);
  if (p) { try { fs.unlinkSync(path.join(UPLOAD_DIR, p.filename)); } catch (e) {} }
  res.json({ ok: true });
});

// --- 年代说明 CRUD ---
app.get('/api/admin/eras', requireAdmin, (req, res) => {
  res.json(db.all('SELECT * FROM eras ORDER BY year_start, sort, id'));
});
app.post('/api/admin/eras', requireAdmin, (req, res) => {
  const { title, year_start, year_end, description, sort } = req.body;
  if (!title) return res.status(400).json({ error: '请填写年代标题' });
  const id = db.insert('INSERT INTO eras (title,year_start,year_end,description,sort) VALUES (?,?,?,?,?)',
    [title, year_start || null, year_end || null, description || '', sort || 0]);
  res.json({ ok: true, id });
});
app.put('/api/admin/eras/:id', requireAdmin, (req, res) => {
  const { title, year_start, year_end, description, sort } = req.body;
  db.run('UPDATE eras SET title=?,year_start=?,year_end=?,description=?,sort=? WHERE id=?',
    [title, year_start || null, year_end || null, description || '', sort || 0, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/admin/eras/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM eras WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// --- 亲属提交审核 ---
app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  res.json(db.all(`SELECT s.*, f.name AS family_name FROM submissions s
    LEFT JOIN families f ON f.id=s.family_id ORDER BY s.status='pending' DESC, s.id DESC`));
});
app.post('/api/admin/submissions/:id/approve', requireAdmin, (req, res) => {
  const sub = db.get('SELECT * FROM submissions WHERE id=?', [req.params.id]);
  if (!sub) return res.status(404).json({ error: '记录不存在' });
  const note = (req.body && req.body.note) || '';
  // 故事/纠错类 → 转为正式故事；照片类 → 转为正式照片
  if ((sub.type === 'story' || sub.type === 'correction') && sub.family_id) {
    db.insert(`INSERT INTO stories (family_id,person_name,title,content,contributor,status)
      VALUES (?,?,?,?,?,'published')`,
      [sub.family_id, sub.person_name || '', sub.title || '亲属补充资料', sub.content || '', sub.submitter_name]);
  }
  if (sub.type === 'photo' && sub.family_id && sub.photo_file) {
    db.insert(`INSERT INTO photos (family_id,filename,caption,year_taken) VALUES (?,?,?,?)`,
      [sub.family_id, sub.photo_file, sub.photo_caption || sub.title || '', '']);
  }
  db.run("UPDATE submissions SET status='approved', admin_note=? WHERE id=?", [note, sub.id]);
  res.json({ ok: true });
});
app.post('/api/admin/submissions/:id/reject', requireAdmin, (req, res) => {
  const note = (req.body && req.body.note) || '';
  db.run("UPDATE submissions SET status='rejected', admin_note=? WHERE id=?", [note, req.params.id]);
  res.json({ ok: true });
});

// 修改密码
app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { old_password, new_password } = req.body || {};
  const a = db.get('SELECT * FROM admins WHERE id=?', [req.session.adminId]);
  if (hashPassword(old_password || '', a.salt) !== a.password_hash)
    return res.status(403).json({ error: '原密码不正确' });
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ error: '新密码至少6位' });
  const salt = crypto.randomBytes(8).toString('hex');
  db.run('UPDATE admins SET password_hash=?, salt=? WHERE id=?',
    [hashPassword(new_password, salt), salt, a.id]);
  res.json({ ok: true });
});

// 管理后台页面（静态，但统一入口）
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

// ---------- 启动 ----------
db.init().then(() => {
  // 确保默认管理员存在
  if (!db.get('SELECT id FROM admins LIMIT 1')) {
    const salt = crypto.randomBytes(8).toString('hex');
    db.insert('INSERT INTO admins (username,password_hash,salt,display_name) VALUES (?,?,?,?)',
      ['admin', hashPassword('admin123', salt), salt, '站点管理员']);
    console.log('已创建默认管理员 admin / admin123（请尽快修改）');
  }
  app.listen(PORT, () => console.log(`乡村迁徙记忆站已启动: http://localhost:${PORT}`));
});
