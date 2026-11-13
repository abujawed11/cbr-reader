const mysql = require('mysql2/promise');
const config = require('./config');

let pool;

async function initDb() {
  const { database, ...conn } = config.db;
  // Create the database if it does not exist yet.
  const boot = await mysql.createConnection(conn);
  await boot.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
  await boot.end();

  pool = mysql.createPool({ ...config.db, waitForConnections: true, connectionLimit: 10 });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      author VARCHAR(255) NULL,
      description TEXT NULL,
      price_cents INT UNSIGNED NOT NULL DEFAULT 0,
      free_pages INT UNSIGNED NOT NULL DEFAULT ${config.defaultFreePages},
      page_count INT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
      error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(30) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(100) NOT NULL,
      role ENUM('user','admin') NOT NULL DEFAULT 'user',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_users_username (username),
      UNIQUE KEY uq_users_email (email)
    )`);

  // Migration: the first version of users had a free-text "name" instead of a unique "username".
  const [userCols] = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'users' AND column_name = 'username'",
    [database]
  );
  if (!userCols.length) {
    await pool.query('ALTER TABLE users ADD COLUMN username VARCHAR(30) NULL AFTER id');
    await pool.query("UPDATE users SET username = CONCAT('user', id)"); // placeholder for any pre-existing accounts
    await pool.query('ALTER TABLE users MODIFY username VARCHAR(30) NOT NULL, ADD UNIQUE KEY uq_users_username (username), DROP COLUMN name');
  }

  // Migration: users gained a role. Everyone starts as a normal user; admins are made with `npm run create-admin`.
  const [roleCols] = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'users' AND column_name = 'role'",
    [database]
  );
  if (!roleCols.length) {
    await pool.query("ALTER TABLE users ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user' AFTER password_hash");
  }

  // Migration: books gained an owner. Older rows keep owner_id NULL (nobody can delete them via the UI).
  const [cols] = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'books' AND column_name = 'owner_id'",
    [database]
  );
  if (!cols.length) {
    await pool.query('ALTER TABLE books ADD COLUMN owner_id INT UNSIGNED NULL, ADD KEY idx_books_owner (owner_id)');
    await pool.query('ALTER TABLE books ADD CONSTRAINT fk_books_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL');
  }

  // One row per checkout attempt. Financial records are kept even if the book or its pages are deleted
  // (book_id becomes NULL, book_title is a snapshot).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      book_id INT UNSIGNED NULL,
      book_title VARCHAR(255) NOT NULL,
      amount INT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL,
      razorpay_order_id VARCHAR(64) NOT NULL,
      razorpay_payment_id VARCHAR(64) NULL,
      status ENUM('created','paid','failed','refunded') NOT NULL DEFAULT 'created',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMP NULL,
      UNIQUE KEY uq_purchases_order (razorpay_order_id),
      KEY idx_purchases_payment (razorpay_payment_id),
      KEY idx_purchases_user_book (user_id, book_id, status),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pages (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      book_id INT UNSIGNED NOT NULL,
      number INT UNSIGNED NOT NULL,
      width INT UNSIGNED NULL,
      height INT UNSIGNED NULL,
      UNIQUE KEY uq_book_page (book_id, number),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )`);

  // One row per (user, book): where this reader last was. Replaces the old browser-only localStorage progress.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      user_id INT UNSIGNED NOT NULL,
      book_id INT UNSIGNED NOT NULL,
      page INT UNSIGNED NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, book_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )`);
}

const db = () => pool;
const closeDb = () => pool?.end();
module.exports = { initDb, db, closeDb };
