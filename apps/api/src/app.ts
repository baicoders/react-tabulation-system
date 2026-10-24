import 'express-async-errors';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { UPLOADS_DIR } from './lib/images';
import { authRouter } from './routes/auth';
import { candidatesRouter } from './routes/candidates';
import { deductionsRouter } from './routes/deductions';
import { eventsRouter } from './routes/events';
import { importRouter } from './routes/import';
import { judgeRouter } from './routes/judge';
import { reportsRouter } from './routes/reports';
import { roundsRouter } from './routes/rounds';
import { setupRouter } from './routes/setup';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  // Picture file names change on every upload, so they can be cached for a long time.
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', authRouter);
  // Candidates first: eventsRouter is admin only and would block judges from /api/events/:id/candidates.
  app.use('/api', candidatesRouter);
  app.use('/api', judgeRouter);
  app.use('/api', roundsRouter);
  app.use('/api', reportsRouter);
  app.use('/api', deductionsRouter);
  app.use('/api', importRouter);
  app.use('/api/events', eventsRouter);
  // Admin-only setup routes. Mounted last because its admin check covers every /api path it sees.
  app.use('/api', setupRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // express-async-errors forwards rejected promises from async handlers to here.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', issues: err.issues });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
