// db.js — sql.js 数据库封装（WASM SQLite，持久化到文件）
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'memory.db');
let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  display_name TEXT DEFAULT '管理员',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                -- 如：陈氏家族
  surname TEXT,                      -- 姓氏
  origin_village TEXT,               -- 祖籍村庄
  summary TEXT,                      -- 家族简介
  cover_photo TEXT,                  -- 封面照片文件名
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  from_place TEXT NOT NULL,
  to_place TEXT NOT NULL,
  from_lat REAL, from_lng REAL,
  to_lat REAL, to_lng REAL,
  year INTEGER,                      -- 迁徙年份
  reason TEXT,                       -- 迁徙原因
  transport TEXT,                    -- 交通方式
  description TEXT,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  person_name TEXT,                  -- 人物
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  era TEXT,                          -- 年代标签，如"1950年代"
  event_year INTEGER,                -- 故事发生年份（时间线排序用）
  is_private INTEGER DEFAULT 0,      -- 1=私密
  access_code TEXT,                  -- 私密访问口令
  contributor TEXT,                  -- 资料提供者
  status TEXT DEFAULT 'published',   -- published / draft
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  caption TEXT,                      -- 照片说明
  year_taken TEXT,                   -- 拍摄年代
  is_private INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS eras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,               -- 如"三年困难时期"
  year_start INTEGER,
  year_end INTEGER,
  description TEXT,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,
  type TEXT NOT NULL,                -- story 故事 / photo 照片 / correction 纠错补充
  person_name TEXT,
  title TEXT,
  content TEXT,
  photo_file TEXT,                   -- 上传的照片
  photo_caption TEXT,
  submitter_name TEXT NOT NULL,      -- 提交人称呼
  contact TEXT,                      -- 联系方式
  status TEXT DEFAULT 'pending',     -- pending / approved / rejected
  admin_note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`;

async function init() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON;');
  db.run(SCHEMA);
  save();
  return db;
}

function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ---- 查询辅助 ----
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : null;
}
function run(sql, params = []) {
  db.run(sql, params);
  save();
}
function insert(sql, params = []) {
  db.run(sql, params);
  const id = get('SELECT last_insert_rowid() AS id').id;
  save();
  return id;
}

module.exports = { init, all, get, run, insert, save, getDb: () => db };
