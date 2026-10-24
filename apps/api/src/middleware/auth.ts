import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export type Role = 'admin' | 'judge';

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
  eventId?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN } as jwt.SignOptions);
}

/** Rejects the request unless it carries a valid token for one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) return res.status(401).json({ error: 'Not logged in' });
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as AuthUser;
      if (!roles.includes(payload.role)) return res.status(403).json({ error: 'Not allowed' });
      req.user = { id: payload.id, role: payload.role, name: payload.name, eventId: payload.eventId };
      next();
    } catch {
      res.status(401).json({ error: 'Session expired, log in again' });
    }
  };
}
