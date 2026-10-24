import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole, signToken } from '../middleware/auth';

export const authRouter = Router();

const loginSchema = z.object({
  role: z.enum(['admin', 'judge']),
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const { role, username, password } = loginSchema.parse(req.body);

  if (role === 'admin') {
    const admin = await prisma.adminUser.findUnique({ where: { username } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    const user = { id: admin.id, role: 'admin' as const, name: admin.username };
    return res.json({ token: signToken(user), user });
  }

  // Judges log in to the active event. Username is the judge's name.
  const judge = await prisma.judge.findFirst({
    where: { name: username, event: { status: 'ACTIVE' } },
  });
  if (!judge || !(await bcrypt.compare(password, judge.passwordHash))) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  const user = { id: judge.id, role: 'judge' as const, name: judge.name, eventId: judge.eventId };
  res.json({ token: signToken(user), user });
});

authRouter.get('/me', requireRole('admin', 'judge'), (req, res) => {
  res.json({ user: req.user });
});
