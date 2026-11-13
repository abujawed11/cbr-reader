// Seeds the default admin account. Run from the backend folder:  node create-admin.js
//
// Safe to run more than once: if the username already exists it is promoted to admin
// (its password is NOT changed), otherwise the account is created.
//
// DEV ONLY: these credentials are public in the source code. Change the password (or delete this
// account) before the app is reachable by anyone else.
const bcrypt = require('bcryptjs');
const { initDb, db, closeDb } = require('./src/db');

const ADMIN = {
  username: 'admin',
  email: 'admin@example.com',
  password: 'admin123',
};

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed the default admin password in production.');
  }

  await initDb(); // makes sure the tables (and the role column) exist

  const [rows] = await db().query('SELECT id, role FROM users WHERE username = ?', [ADMIN.username]);
  if (rows[0]) {
    if (rows[0].role === 'admin') return console.log(`Admin "${ADMIN.username}" already exists. Nothing to do.`);
    await db().query("UPDATE users SET role = 'admin' WHERE id = ?", [rows[0].id]);
    return console.log(`Existing user "${ADMIN.username}" promoted to admin.`);
  }

  const hash = await bcrypt.hash(ADMIN.password, 12);
  await db().query("INSERT INTO users (username, email, password_hash, role) VALUES (?,?,?, 'admin')", [
    ADMIN.username,
    ADMIN.email,
    hash,
  ]);
  console.log(`Created admin  username: ${ADMIN.username}  password: ${ADMIN.password}`);
}

main()
  .catch((err) => {
    console.error(err.code === 'ER_DUP_ENTRY' ? `The email ${ADMIN.email} is already used by another account.` : err.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
