const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }
  const allowedRole = role === 'organiser' ? 'organiser' : 'customer';
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = getDb().prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(email, hash, name, allowedRole);
    const user = { id: result.lastInsertRowid, email, name, role: allowedRole };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ user, token });
  } catch {
    res.status(409).json({ error: 'Email already registered' });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ user: payload, token });
});

router.get('/me', authenticate, (req, res) => {
  const user = getDb().prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
