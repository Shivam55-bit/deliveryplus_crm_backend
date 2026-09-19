import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
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
import driverNotificationsRoutes from './routes/driverNotifications.js';
import adminNotificationsRoutes from './routes/adminNotifications.js';
import deviceTokenRoutes from './routes/deviceTokens.js';
import emailAttachmentRoutes from './routes/emailAttachmentRoutes.js';
import emailTemplateRoutes from './routes/emailTemplateRoutes.js';
import truckDimensionsRoutes from './routes/truckDimensionsRoutes.js';
import adminManagementRoutes from './routes/admins.js';
import { authenticate, authorize } from './middleware/auth.js';
import { createDriver } from './controllers/userController.js';
import { verifyMailer } from './utils/mailer.js';

const app = express();
const allowedOrigins = [
  'https://deliveryplus.tech',
  'https://www.deliveryplus.tech',
  'https://api.deliveryplus.tech',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Ensure uploads dir exists
if (!existsSync(config.uploadPath)) {
  mkdirSync(config.uploadPath, { recursive: true });
}

// Rate Limiters - Disabled completely so login / API calls are never blocked
const globalLimiter = (req, res, next) => next();
export const authLimiter = (req, res, next) => next();

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
}));
app.options('*', cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));
app.use('/uploads', (req, res, next) => {
  // Admin and driver apps are served from different origins than the API.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(config.uploadPath));
app.use('/api', globalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.post('/api/users/drivers', authenticate, authorize('admin'), createDriver);
app.use('/api/customers', customerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/driver', driverNotificationsRoutes);
app.use('/api/admin', adminNotificationsRoutes);
app.use('/api/device-token', deviceTokenRoutes);
app.use('/api/email-attachments', emailAttachmentRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/admins', adminManagementRoutes);
app.use('/api/truck-dimensions', truckDimensionsRoutes);
app.use('/truck-dimensions', truckDimensionsRoutes);
app.use('/removalists/truck-dimensions', truckDimensionsRoutes);

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

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Uploaded signature is too large',
    });
  }

  next(err);
});

// Error handler
app.use(errorHandler);

// Start
const start = async () => {
  await connectDB();
  await verifyMailer();
  const server = app.listen(config.port, () => {
    console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Stop the process using that port or set PORT to a free one.`);
    } else {
      console.error('Server failed to start:', err);
    }
    process.exit(1);
  });
};

start();

export default app;
