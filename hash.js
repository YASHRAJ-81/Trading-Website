const bcrypt = require('bcryptjs');

const plainPassword = 'Admin#149'; // Replace with your secure password
const saltRounds = 12;

bcrypt.hash(plainPassword, saltRounds, (err, hash) => {
  if (err) throw err;
  console.log('Hashed password:', hash);
});
