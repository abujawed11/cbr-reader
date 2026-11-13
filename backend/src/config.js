require('dotenv').config();
const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 4000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cbr_reader',
  },
  storageDir: path.join(__dirname, '..', 'storage'),
  defaultFreePages: 10,
};
