'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { getDb, COMPLAINT_CATEGORIES } = require('./db');
const { signToken, requireAuth, requireAdmin } = require('./auth');
const { isMailConfigured, sendResetEmail } = require('./mailer');

const router = express.Router();
const db = getDb();

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const COMPLAINT_STATUSES = ['Opening', 'Pending', 'Closed'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Wrap multer so upload errors (size/type) become 400 JSON instead of crashing.
function handleUpload(upload) {
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      return next();
    });
  };
}

const PHOTO_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const uploadPhoto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'photos')),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.user.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (PHOTO_EXTS.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (.png, .jpg, .jpeg, .gif, .webp)'));
    }
  },
});

const uploadStatement = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, 'statements')),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// ---------------------------------------------------------------------------
// Auth (public)
// ---------------------------------------------------------------------------

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (user.active === 0) {
    return res.status(401).json({ error: 'Account is deactivated' });
  }
  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      must_change_password: user.must_change_password,
    },
  });
});

router.post('/auth/forgot', async (req, res) => {
  const { username } = req.body || {};
  const response = {
    ok: true,
    message: 'If the account exists, a reset link has been sent to the registered email.',
  };
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (user && user.active === 1 && user.email) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare(
      "INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))"
    ).run(user.id, token);
    if (isMailConfigured()) {
      const resetLink = `${req.protocol}://${req.get('host')}/index.html?reset=${token}`;
      await sendResetEmail(user.email, resetLink);
    } else {
      response.devResetLink = `/index.html?reset=${token}`;
    }
  }
  return res.json(response);
});

router.post('/auth/reset', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const row = db
    .prepare(
      "SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')"
    )
    .get(token);
  if (!row) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }
  const hash = bcrypt.hashSync(String(newPassword), 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    hash,
    row.user_id
  );
  db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(row.id);
  return res.json({ ok: true, message: 'Password has been reset. Please log in.' });
});

// ---------------------------------------------------------------------------
// Member routes
// ---------------------------------------------------------------------------

router.get('/member/me', requireAuth, (req, res) => {
  const user = db
    .prepare(
      'SELECT id, username, name, flat_no, email, profile_photo, role, active, must_change_password, created_at FROM users WHERE id = ?'
    )
    .get(req.user.id);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ user });
});

router.put(
  '/member/profile',
  requireAuth,
  handleUpload(uploadPhoto.single('photo')),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    const profilePhoto = `/uploads/photos/${req.file.filename}`;
    db.prepare('UPDATE users SET profile_photo = ? WHERE id = ?').run(
      profilePhoto,
      req.user.id
    );
    return res.json({ ok: true, profile_photo: profilePhoto });
  }
);

router.post('/member/set-email', requireAuth, (req, res) => {
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  if (user && user.email) {
    return res.status(400).json({ error: 'Email is already set and cannot be changed' });
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(String(email).trim(), req.user.id);
  return res.json({ ok: true, message: 'Email linked to your account permanently.' });
});

router.put('/member/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword || '', user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    req.user.id
  );
  return res.json({ ok: true });
});

router.get('/member/balance', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT previous_balance, current_month FROM balances WHERE user_id = ?')
    .get(req.user.id);
  const previous_balance = row ? Number(row.previous_balance) || 0 : 0;
  const current_month = row ? Number(row.current_month) || 0 : 0;
  return res.json({
    previous_balance,
    current_month,
    total_due: previous_balance + current_month,
  });
});

router.post('/member/complaints', requireAuth, (req, res) => {
  const { category, description } = req.body || {};
  if (!COMPLAINT_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid complaint category' });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const info = db
    .prepare('INSERT INTO complaints (user_id, category, description) VALUES (?, ?, ?)')
    .run(req.user.id, category, String(description).trim());
  const complaint = db
    .prepare(
      'SELECT id, category, description, status, created_at FROM complaints WHERE id = ?'
    )
    .get(info.lastInsertRowid);
  return res.json({ ok: true, complaint });
});

router.get('/member/complaints', requireAuth, (req, res) => {
  const { status } = req.query;
  let sql =
    'SELECT id, category, description, status, admin_response, created_at, updated_at FROM complaints WHERE user_id = ?';
  const params = [req.user.id];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY id DESC';
  return res.json({ items: db.prepare(sql).all(...params) });
});

router.get('/member/statements', requireAuth, (req, res) => {
  const items = db
    .prepare(
      'SELECT id, month, amount, file_path AS file_url, created_at FROM statements WHERE user_id = ? ORDER BY id DESC'
    )
    .all(req.user.id);
  return res.json({ items });
});

router.get('/member/notices', requireAuth, (req, res) => {
  const items = db
    .prepare('SELECT id, title, body, created_at FROM notices ORDER BY id DESC')
    .all();
  return res.json({ items });
});

router.post('/member/feedback', requireAuth, (req, res) => {
  const { message } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  db.prepare('INSERT INTO feedback (user_id, message) VALUES (?, ?)').run(
    req.user.id,
    String(message).trim()
  );
  return res.json({ ok: true });
});

router.get('/member/feedback', requireAuth, (req, res) => {
  const items = db
    .prepare(
      'SELECT id, message, created_at FROM feedback WHERE user_id = ? ORDER BY id DESC'
    )
    .all(req.user.id);
  return res.json({ items });
});

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

router.get('/admin/members', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.flat_no, u.email, u.active, u.role, u.created_at,
              COALESCE(b.previous_balance, 0) AS previous_balance,
              COALESCE(b.current_month, 0) AS current_month
       FROM users u
       LEFT JOIN balances b ON b.user_id = u.id
       ORDER BY u.name`
    )
    .all();
  const items = rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    flat_no: r.flat_no,
    email: r.email,
    active: r.active,
    role: r.role,
    created_at: r.created_at,
    previous_balance: Number(r.previous_balance) || 0,
    current_month: Number(r.current_month) || 0,
    total_due: (Number(r.previous_balance) || 0) + (Number(r.current_month) || 0),
  }));
  return res.json({ items });
});

router.post('/admin/members', requireAuth, requireAdmin, (req, res) => {
  const { username, tempPassword, name, flat_no } = req.body || {};
  if (!username || !tempPassword || !name) {
    return res.status(400).json({ error: 'username, tempPassword and name are required' });
  }
  const taken = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (taken) {
    return res.status(400).json({ error: 'Username is already taken' });
  }
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, role, name, flat_no, active, must_change_password)
       VALUES (?, ?, 'member', ?, ?, 1, 1)`
    )
    .run(username, bcrypt.hashSync(String(tempPassword), 10), name, flat_no || null);
  db.prepare('INSERT INTO balances (user_id, previous_balance, current_month) VALUES (?, 0, 0)').run(
    info.lastInsertRowid
  );
  return res.json({ ok: true, user: { id: info.lastInsertRowid, username, name } });
});

router.put('/admin/members/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { name, flat_no, active } = req.body || {};
  const activeNum = active === undefined ? undefined : Number(active);
  if (id === req.user.id && activeNum === 0) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }
  const fields = [];
  const params = [];
  if (name !== undefined) {
    fields.push('name = ?');
    params.push(name);
  }
  if (flat_no !== undefined) {
    fields.push('flat_no = ?');
    params.push(flat_no);
  }
  if (activeNum !== undefined) {
    fields.push('active = ?');
    params.push(activeNum ? 1 : 0);
  }
  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  params.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return res.json({ ok: true });
});

router.post('/admin/members/:id/balance', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const previous_balance = Number(req.body && req.body.previous_balance) || 0;
  const current_month = Number(req.body && req.body.current_month) || 0;
  db.prepare(
    `INSERT INTO balances (user_id, previous_balance, current_month) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET previous_balance = excluded.previous_balance, current_month = excluded.current_month`
  ).run(id, previous_balance, current_month);
  return res.json({ ok: true });
});

router.put('/admin/members/:id/password', requireAuth, requireAdmin, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    Number(req.params.id)
  );
  return res.json({ ok: true });
});

router.get('/admin/complaints', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT c.id, c.category, c.description, c.status, c.admin_response, c.created_at, c.updated_at,
                    u.name AS user_name, u.flat_no, c.user_id
             FROM complaints c
             LEFT JOIN users u ON u.id = c.user_id`;
  const params = [];
  if (status) {
    sql += ' WHERE c.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY c.id DESC';
  return res.json({ items: db.prepare(sql).all(...params) });
});

router.put('/admin/complaints/:id', requireAuth, requireAdmin, (req, res) => {
  const { status, admin_response } = req.body || {};
  if (!COMPLAINT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare(
    "UPDATE complaints SET status = ?, admin_response = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, admin_response || null, Number(req.params.id));
  return res.json({ ok: true });
});

router.get('/admin/notices', requireAuth, requireAdmin, (req, res) => {
  const items = db
    .prepare('SELECT id, title, body, created_at FROM notices ORDER BY id DESC')
    .all();
  return res.json({ items });
});

router.post('/admin/notices', requireAuth, requireAdmin, (req, res) => {
  const { title, body } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }
  const info = db.prepare('INSERT INTO notices (title, body) VALUES (?, ?)').run(title, body);
  const notice = db
    .prepare('SELECT id, title, body, created_at FROM notices WHERE id = ?')
    .get(info.lastInsertRowid);
  return res.json({ ok: true, notice });
});

router.delete('/admin/notices/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM notices WHERE id = ?').run(Number(req.params.id));
  return res.json({ ok: true });
});

router.post(
  '/admin/statements',
  requireAuth,
  requireAdmin,
  handleUpload(uploadStatement.single('file')),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { user_id, month, amount } = req.body || {};
    if (!user_id || !month || amount === undefined || amount === '') {
      return res.status(400).json({ error: 'user_id, month and amount are required' });
    }
    const filePath = `/uploads/statements/${req.file.filename}`;
    const info = db
      .prepare('INSERT INTO statements (user_id, month, amount, file_path) VALUES (?, ?, ?, ?)')
      .run(Number(user_id), month, Number(amount), filePath);
    return res.json({
      ok: true,
      statement: {
        id: info.lastInsertRowid,
        month,
        amount: Number(amount),
        file_url: filePath,
      },
    });
  }
);

router.get('/admin/statements', requireAuth, requireAdmin, (req, res) => {
  const items = db
    .prepare(
      `SELECT s.id, s.month, s.amount, s.file_path AS file_url, s.created_at,
              u.name AS user_name, u.flat_no
       FROM statements s
       LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.id DESC`
    )
    .all();
  return res.json({ items });
});

router.get('/admin/feedback', requireAuth, requireAdmin, (req, res) => {
  const items = db
    .prepare(
      `SELECT f.id, f.message, f.created_at, u.name AS user_name, u.flat_no
       FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.id DESC`
    )
    .all();
  return res.json({ items });
});

router.get('/admin/reset-requests', requireAuth, requireAdmin, (req, res) => {
  const items = db
    .prepare(
      `SELECT r.id, r.user_id, r.token, r.expires_at, r.created_at, u.username
       FROM reset_tokens r
       JOIN users u ON u.id = r.user_id
       WHERE r.used = 0 AND r.expires_at > datetime('now')
       ORDER BY r.id DESC`
    )
    .all();
  return res.json({ items });
});

module.exports = router;
