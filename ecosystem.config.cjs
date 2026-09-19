const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'hub-crm-backend',
      script: './src/server.js',
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      max_memory_restart: '512M',
      watch: false,
      merge_logs: true,
      error_file: path.join(__dirname, 'logs', 'hub-crm-backend-error.log'),
      out_file: path.join(__dirname, 'logs', 'hub-crm-backend-out.log'),
      env: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5003,
        MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/hub_crm',
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
        JWT_EXPIRE: process.env.JWT_EXPIRE,
        JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE,
        UPLOAD_PATH: process.env.UPLOAD_PATH || './uploads',
      },
    },
  ],
};
