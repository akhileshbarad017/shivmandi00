import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookie from 'cookie';
import { ROOT } from './env.js';
import { attachSession, csrfGuard } from './middleware/auth.js';
import { idempotencyGuard } from './middleware/idempotency.js';
import { errorHandler, notFound } from './middleware/error.js';
import { arrivalsRouter } from './routes/arrivals.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { expensesRouter } from './routes/expenses.js';
import { gateRouter } from './routes/gate.js';
import { healthRouter } from './routes/health.js';
import { invoicesRouter } from './routes/invoices.js';
import { partiesRouter } from './routes/parties.js';
import { paymentsRouter } from './routes/payments.js';
import { productsRouter } from './routes/products.js';
import { purchasesRouter } from './routes/purchases.js';
import { reportsRouter } from './routes/reports.js';
import { salesRouter } from './routes/sales.js';
import { settingsRouter } from './routes/settings.js';
import { staffRouter } from './routes/staff.js';
import { stockRouter } from './routes/stock.js';
import { vehiclesRouter } from './routes/vehicles.js';
import { whatsappRouter } from './routes/whatsapp.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // The app is served over plain HTTP on a LAN in some deployments.
          'upgrade-insecure-requests': null,
          'worker-src': ["'self'"],
          'manifest-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Parse cookies without a dependency on cookie-parser's types.
  app.use((req, _res, next) => {
    req.cookies = cookie.parse(req.headers.cookie ?? '');
    next();
  });

  app.use(attachSession);
  app.use(csrfGuard);
  app.use(idempotencyGuard);

  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/parties', partiesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/purchases', purchasesRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/arrivals', arrivalsRouter);
  app.use('/api/gate', gateRouter);
  app.use('/api/stock', stockRouter);
  app.use('/api/vehicles', vehiclesRouter);

  // Serve the built PWA (same-origin) when a production build exists.
  const webDist = path.join(ROOT, 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        index: false,
        maxAge: '1y',
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('sw.js') ||
            filePath.endsWith('manifest.webmanifest') ||
            filePath.endsWith('index.html')
          ) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
