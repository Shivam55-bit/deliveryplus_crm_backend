import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import connectDB from './config/db.js';
import errorHandler from './middleware/errorHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import customerRoutes from './routes/customers.js';
import jobRoutes from './routes/jobs.js';
import invoiceRoutes from './routes/invoices.js';
import vehicleRoutes from './routes/vehicles.js';
import driverRoutes from './routes/drivers.js';
import dashboardRoutes from './routes/dashboard.js';
import crmRoutes from './routes/crm.js';
import { authenticate, authorize } from './middleware/auth.js';
import { createDriver } from './controllers/userController.js';

const app = express();

// Ensure uploads dir exists
if (!existsSync(config.uploadPath)) {
  mkdirSync(config.uploadPath, { recursive: true });
}

// Rate Limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again after 15 minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // only 10 login/register attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again after 15 minutes.' },
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(config.uploadPath));
app.use('/api', globalLimiter);

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.post('/api/users/drivers', authenticate, authorize('admin'), createDriver);
app.use('/api/customers', customerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/crm', crmRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Docs
app.get('/api/docs', (_req, res) => {
  const docsPath = join(__dirname, '..', 'API_DOCS.html');
  if (!existsSync(docsPath)) return res.status(404).send('Docs not found.');
  res.setHeader('Content-Type', 'text/html');
  res.send(readFileSync(docsPath));
});

// Error handler
app.use(errorHandler);

// Start
const start = async () => {
  await connectDB();
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  });
};

start();

export default app;
