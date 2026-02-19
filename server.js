// server.js
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const svgCaptcha = require('svg-captcha');
const bcrypt = require('bcryptjs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');


const app = express();
const port = process.env.PORT || 3000;


// Database setup (keep `admin` key to match your existing DB shape)
const adapter = new FileSync('db.json');
const db = low(adapter);
// ensure required top-level keys exist including new withdrawals and notifications arrays
db.defaults({ 
  users: [], 
  trades: [], 
  withdrawals: [],        // New for user withdraw requests  
  notifications: [],      // New for user notifications
  admin: [], 
  adminActions: [], 
  auditLog: [],
  user_id_counter: 0 //
}).write();


// Session
app.use(session({
  secret: 'supersecretkey', // change in production to env var
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // secure: true, // enable in production when using HTTPS
    maxAge: 1000 * 60 * 60 * 8 // 8 hours
  }
}));


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// Serve user public static files
app.use(express.static(path.join(__dirname, 'public')));


// Serve root explicitly (no wildcard)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// -------------------------
// Captcha route
// -------------------------
app.get('/captcha', (req, res) => {
  const captcha = svgCaptcha.create({
    noise: 2,
    color: true,
    background: '#ffffff',
    width: 150,
    height: 50,
    fontSize: 35,
    charPreset: '0123456789',
  });


  let svg = captcha.data;
  svg = svg.replace(/(<text[^>]*?)fill="[^"]*"/g, '$1fill="black"');
  svg = svg.replace(/(<text[^>]*?)style="[^"]*fill:[^;"]*;?[^"]*"/g, '$1style="fill:black"');
  svg = svg.replace(/(<text[^>]*?)y="\d+"/g, '$1y="40"');


  req.session.captcha = captcha.text;
  res.type('svg').send(svg);
});


// -------------------------
// Helper & Audit Utilities
// -------------------------
function recordAdminAction(adminUser, actionType, target, details = {}) {
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    admin: adminUser,
    type: actionType,
    target,
    details,
    timestamp: new Date().toISOString()
  };
  db.get('adminActions').push(entry).write();
  db.get('auditLog').push(entry).write();
  return entry;
}


function ensureDefaultAdmin() {
  const exists = db.get('admin').find({ username: 'admin' }).value();
  if (!exists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.get('admin').push({ username: 'admin', password: hash }).write();
    console.log('Default admin created: username=admin password=admin123 -> change immediately');
  }
}
ensureDefaultAdmin();


// Admin auth middleware for JSON APIs
function adminAuthApi(req, res, next) {
  if (req.session && (req.session.admin || req.session.adminLoggedIn)) {
    return next();
  }
  return res.status(403).json({ error: 'Admin auth required' });
}


// Admin auth middleware for view pages (redirect to login page if not)
function adminAuthView(req, res, next) {
  if (req.session && (req.session.admin || req.session.adminLoggedIn)) {
    return next();
  }
  return res.redirect('/admin/login.html');
}


// -------------------------
// User routes (register/login/profile etc.)
// -------------------------
// server.js
app.post('/register', (req, res) => {
    const { email, password, confirmPassword } = req.body;
    const inviteCode = 'nikki23';

    // ... existing validation code (password match, user exists) ...

    // Get the current counter, increment it, and update the database
    let nextIdNum = db.get('user_id_counter').value() + 1;
    db.set('user_id_counter', nextIdNum).write(); // 👈 USE THIS TO GET A UNIQUE ID

    // Pad to 3 digits, e.g. 001
    const newUserId = String(nextIdNum).padStart(3, '0');

    const hashed = bcrypt.hashSync(password, 10);
    db.get('users').push({
        email,
        password: hashed,
        inviteCode,
        userId: newUserId,
        balance: 0,
        creditScore: 100,
        trades: [],
        frozen: false,
        loginHistory: []
    }).write();

    return res.json({ success: true });
});


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


  // record login time
  db.get('users').find({ email }).get('loginHistory').push(new Date().toISOString()).write();


  return res.json({ success: true });
});


app.get('/profile-data', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });


  const user = db.get('users').find({ email: req.session.user.email }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });


  const { email, inviteCode, bank, balance, frozen,creditScore,userId} = user;
  res.json({ email, inviteCode, bank, balance, frozen,creditScore,userId});
});


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


// -------------------------
// User Withdrawal Request Route
// -------------------------
app.post("/withdraw", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  const { amount } = req.body;
  const user = db.get("users").find({ email: req.session.user.email }).value();
  if (!user) return res.status(404).json({ error: "User not found" });


  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: "Invalid amount" });
  if (amt > user.balance) return res.status(400).json({ error: "Insufficient funds" });


  const withdrawal = {
    id: Date.now(),
    email: user.email,
    amount: amt,
    status: "pending",
    requestedAt: new Date().toISOString()
  };


  db.get("withdrawals").push(withdrawal).write();


  res.json({ success: true, message: "Withdrawal request submitted" });
});


// -------------------------
// User Notifications Fetch API
// -------------------------
app.get("/notifications", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  const email = req.session.user.email;
  const notifs = db.get("notifications")
    .filter(n => n.to === "all" || n.to === email)
    .sortBy("timestamp")
    .reverse()
    .value();
  res.json({ success: true, notifications: notifs });
});


// -------------------------
// Place trade - pending, forcedLoss logic, freeze check
// -------------------------
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


  // Block if frozen by admin
  if (user.frozen) {
    return res.json({ success: false, message: 'Account frozen by admin. You cannot place trades.' });
  }


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
    balance: user.balance.toFixed(2),
  });
});


// -------------------------
// Background job: finalize trades
// -------------------------
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
          profitAmount = -(trade.amount * (trade.profitPercent / 100));
          result = 'LOSS';
        } else {
          // Profit only if rules (your extra rule for BTC/USDT + Buy UP etc. should be implemented in trade resolution if needed)
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


// -------------------------
// Active trade, trade history, change password, logout
// -------------------------
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


app.get('/trade-history', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });


  const user = db.get('users').find({ email: req.session.user.email }).value();
  if (!user) return res.status(404).json({ error: 'User not found' });


  const trades = user.trades || [];
  res.json({ trades });
});


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


app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});


// Protect bankcard route
app.get('/bankcard.html', (req, res, next) => {
  if (!req.session.user) return res.redirect('/login.html');
  next();
});


// -------------------------
// Admin section (files + APIs)
// -------------------------
const adminDir = path.join(__dirname, 'admin');


// Serve admin login page explicitly (publicly accessible)
app.get('/admin/login.html', (req, res) => {
  res.sendFile(path.join(adminDir, 'login.html'));
});


// Admin login POST
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.get('admin').find({ username }).value();


  if (!admin) {
    return res.redirect('/admin/login.html?error=notfound');
  }


  if (!bcrypt.compareSync(password, admin.password)) {
    return res.redirect('/admin/login.html?error=wrongpass');
  }


  // set admin session
  req.session.adminLoggedIn = true;
  req.session.admin = { username };


  // audit
  recordAdminAction(username, 'ADMIN_LOGIN', username, { msg: 'admin logged in' });


  return res.redirect('/admin/dashboard.html');
});


// Serve dashboard but protect it with adminAuthView middleware
app.get('/admin/dashboard.html', adminAuthView, (req, res) => {
  res.sendFile(path.join(adminDir, 'dashboard.html'));
});


// Admin logout
app.get('/admin/logout', adminAuthView, (req, res) => {
  const adminUser = req.session && req.session.admin ? req.session.admin.username : null;
  req.session.destroy(() => {
    if (adminUser) recordAdminAction(adminUser, 'ADMIN_LOGOUT', adminUser, { msg: 'admin logged out' });
    res.redirect('/admin/login.html');
  });
});


// Expose admin static assets (CSS/JS), AFTER the explicit protected dashboard route above
app.use('/admin', express.static(adminDir));


// -------------------------
// Admin JSON APIs (protected)
// -------------------------


// GET /admin/api/users -> list users summary
app.get('/admin/api/users', adminAuthApi, (req, res) => {
  const users = db.get('users').map(u => ({
    userId: u.userId,
    email: u.email,
    balance: u.balance,
    frozen: !!u.frozen,
    lastLogin: (u.loginHistory && u.loginHistory.length) ? u.loginHistory.slice(-1)[0] : null,
    tradesCount: (u.trades && u.trades.length) || 0
  })).value();
  res.json({ success: true, users });
});


// GET /admin/api/user/:email -> full user record
app.get('/admin/api/user/:email', adminAuthApi, (req, res) => {
  const email = req.params.email;
  const user = db.get('users').find({ email }).value();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
});


// POST /admin/api/update-balance -> { email, newBalance }
app.post('/admin/api/update-balance', adminAuthApi, (req, res) => {
  const adminUser = (req.session && req.session.admin) ? req.session.admin.username : 'unknown';
  const { email, newBalance } = req.body;
  const user = db.get('users').find({ email }).value();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });


  const oldBalance = user.balance;
  db.get('users').find({ email }).assign({ balance: Number(newBalance) }).write();


  const entry = recordAdminAction(adminUser, 'UPDATE_BALANCE', email, { oldBalance, newBalance: Number(newBalance) });
  res.json({ success: true, entry });
});
// POST /admin/api/update-credit-score -> { email, newCreditScore }
app.post('/admin/api/update-credit-score', adminAuthApi, (req, res) => {
  const adminUser = (req.session && req.session.admin) ? req.session.admin.username : 'unknown';
  const { email, newCreditScore } = req.body;
  const user = db.get('users').find({ email }).value();


  if (!user) return res.status(404).json({ success: false, message: 'User not found' });


  const oldCreditScore = user.creditScore || 0;
  db.get('users').find({ email }).assign({ creditScore: Number(newCreditScore) }).write();


  const entry = recordAdminAction(adminUser, 'UPDATE_CREDIT_SCORE', email, {
    oldCreditScore,
    newCreditScore: Number(newCreditScore)
  });


  res.json({ success: true, entry });
});



// POST /admin/api/freeze-account -> { email, freeze: true/false }
app.post('/admin/api/freeze-account', adminAuthApi, (req, res) => {
  const adminUser = (req.session && req.session.admin) ? req.session.admin.username : 'unknown';
  const { email, freeze } = req.body;
  const user = db.get('users').find({ email }).value();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });


  db.get('users').find({ email }).assign({ frozen: !!freeze }).write();
  const entry = recordAdminAction(adminUser, freeze ? 'FREEZE_ACCOUNT' : 'UNFREEZE_ACCOUNT', email, { freeze: !!freeze });
  res.json({ success: true, entry });
});


// POST /admin/api/modify-trade -> { email, tradeId, changes }
app.post('/admin/api/modify-trade', adminAuthApi, (req, res) => {
  const adminUser = (req.session && req.session.admin) ? req.session.admin.username : 'unknown';
  const { email, tradeId, changes } = req.body;
  const user = db.get('users').find({ email }).value();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });


  const tradeIndex = (user.trades || []).findIndex(t => String(t.id) === String(tradeId));
  if (tradeIndex === -1) return res.status(404).json({ success: false, message: 'Trade not found' });


  const oldTrade = Object.assign({}, user.trades[tradeIndex]);
  const newTrade = Object.assign({}, oldTrade, changes);


  // apply the change
  user.trades[tradeIndex] = newTrade;
  db.get('users').find({ email }).assign(user).write();


  // If result override provided, adjust balance
  if (changes && changes.result && (changes.result === 'WIN' || changes.result === 'LOSS')) {
    const profitPct = Number(newTrade.profitPercent) || 0;
    const amount = Number(newTrade.amount) || 0;
    let profitAmount = profitPct ? amount * (profitPct / 100) : 0;
    if (changes.result === 'LOSS') profitAmount = -Math.abs(profitAmount);


    const storedTrade = db.get('users').find({ email }).get('trades').find({ id: newTrade.id }).value();
    const prevProfit = storedTrade && storedTrade.profit ? Number(storedTrade.profit) : 0;


    const balanceAdjustment = profitAmount - prevProfit;
    const currentBalance = db.get('users').find({ email }).value().balance || 0;
    db.get('users').find({ email }).assign({ balance: currentBalance + balanceAdjustment }).write();


    db.get('users').find({ email }).get('trades').find({ id: newTrade.id }).assign({
      profit: profitAmount.toFixed(2),
      result: changes.result,
      status: 'completed'
    }).write();
  } else {
    db.get('users').find({ email }).assign(user).write();
  }


  const entry = recordAdminAction(adminUser, 'MODIFY_TRADE', email, { tradeId, oldTrade, newTrade });
  res.json({ success: true, entry });
});


// POST /admin/api/delete-trade -> { email, tradeId }
app.post('/admin/api/delete-trade', adminAuthApi, (req, res) => {
  const adminUser = (req.session && req.session.admin) ? req.session.admin.username : 'unknown';
  const { email, tradeId } = req.body;
  const user = db.get('users').find({ email }).value();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });


  const trade = db.get('users').find({ email }).get('trades').find({ id: tradeId }).value();
  if (!trade) return res.status(404).json({ success: false, message: 'Trade not found' });


  const prevProfit = trade && trade.profit ? Number(trade.profit) : 0;
  if (prevProfit) {
    const currentBalance = db.get('users').find({ email }).value().balance || 0;
    db.get('users').find({ email }).assign({ balance: currentBalance - prevProfit }).write();
  }


  db.get('users').find({ email }).get('trades').remove({ id: tradeId }).write();


  const entry = recordAdminAction(adminUser, 'DELETE_TRADE', email, { tradeId, prevProfit });
  res.json({ success: true, entry });
});


// GET /admin/api/actions -> return adminActions (audit)
app.get('/admin/api/actions', adminAuthApi, (req, res) => {
  const actions = db.get('adminActions').value();
  res.json({ success: true, actions });
});


// -------------------------
// Admin Notifications API
// -------------------------
// POST /admin/api/notifications/send -> send notification to user or all users
app.post("/admin/api/notifications/send", adminAuthApi, (req, res) => {
  const { to, message } = req.body; // to = email OR "all"
  if (!message) return res.status(400).json({ error: "Message required" });


  const notification = {
    id: Date.now(),
    to,
    message,
    timestamp: new Date().toISOString()
  };


  if (to === "all") {
    db.get("notifications").push(notification).write();
  } else {
    const user = db.get("users").find({ email: to }).value();
    if (!user) return res.status(404).json({ error: "User not found" });
    db.get("notifications").push(notification).write();
  }


  recordAdminAction(req.session.admin.username, "SEND_NOTIFICATION", to, { message });
  res.json({ success: true });
});
// GET /admin/api/notifications -> list all notifications (latest first)
app.get("/admin/api/notifications", adminAuthApi, (req, res) => {
  const notifs = db.get("notifications")
    .sortBy("timestamp")
    .reverse()
    .value();
  res.json({ success: true, notifications: notifs });
});

// DELETE /admin/api/notifications/:id -> undo/remove a notification
app.delete("/admin/api/notifications/:id", adminAuthApi, (req, res) => {
  const notifId = parseInt(req.params.id);
  const exists = db.get("notifications").find({ id: notifId }).value();
  if (!exists) return res.status(404).json({ error: "Notification not found" });

  db.get("notifications").remove({ id: notifId }).write();
  recordAdminAction(req.session.admin.username, "DELETE_NOTIFICATION", exists.to, { message: exists.message });

  res.json({ success: true, message: "Notification removed" });
});



// -------------------------
// Admin Withdrawal Requests API
// -------------------------


// GET /admin/api/withdrawals - list all withdrawal requests
app.get("/admin/api/withdrawals", adminAuthApi, (req, res) => {
  const withdrawals = db.get("withdrawals").sortBy("requestedAt").reverse().value();
  res.json({ success: true, withdrawals });
});


// POST /admin/api/withdrawals/update - approve/reject withdrawal
app.post("/admin/api/withdrawals/update", adminAuthApi, (req, res) => {
  const { id, status } = req.body;
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }


  const withdrawal = db.get("withdrawals").find({ id }).value();
  if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });


  db.get("withdrawals").find({ id }).assign({ status }).write();


  // If approved reduce balance
  if (status === "approved") {
    const user = db.get("users").find({ email: withdrawal.email }).value();
    if (user) {
      db.get("users").find({ email: withdrawal.email })
        .assign({ balance: user.balance - withdrawal.amount }).write();
    }
  }


  // Add notification for user
  db.get("notifications").push({
    id: Date.now(),
    to: withdrawal.email,
    message: `Your withdrawal of $${withdrawal.amount} has been ${status}`,
    timestamp: new Date().toISOString()
  }).write();


  recordAdminAction(req.session.admin.username, "UPDATE_WITHDRAWAL", withdrawal.email, { id, status });
  res.json({ success: true });
});


// -------------------------
// Start server
// -------------------------
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});


