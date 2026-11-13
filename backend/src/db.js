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
    CREATE TABLE IF NOT EXISTS pages (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      book_id INT UNSIGNED NOT NULL,
      number INT UNSIGNED NOT NULL,
      width INT UNSIGNED NULL,
      height INT UNSIGNED NULL,
      UNIQUE KEY uq_book_page (book_id, number),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )`);
}

const db = () => pool;
module.exports = { initDb, db };
