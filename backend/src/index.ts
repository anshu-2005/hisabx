import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { SmartTransactionParser } from './services/nlpParserService';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    application: 'HisabX Fintech API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    currency: config.defaultCurrency,
    timezone: config.defaultTimezone,
  });
});

import apiRouter from './routes';

app.use('/api', apiRouter);
app.use('/api/v1', apiRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`🚀 HisabX API Server running on port ${config.port} [${config.nodeEnv}]`);
  });
}

export default app;
