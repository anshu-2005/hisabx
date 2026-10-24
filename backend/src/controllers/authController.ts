import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';

// In-Memory fallback store for TypeScript API dev/test
const usersStore: any[] = [];

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { email, password, fullName } = req.body;
      if (!email || !password || password.length < 6) {
        return res.status(400).json({ error: 'Valid email and password (min 6 chars) are required' });
      }

      const existing = usersStore.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = {
        id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        email: email.trim().toLowerCase(),
        fullName: fullName || email.split('@')[0],
        passwordHash,
        createdAt: new Date().toISOString()
      };
      usersStore.push(user);

      const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: '7d' });
      return res.status(201).json({
        status: 'success',
        token,
        user: { id: user.id, email: user.email, fullName: user.fullName }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = usersStore.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, { expiresIn: '7d' });
      return res.status(200).json({
        status: 'success',
        token,
        user: { id: user.id, email: user.email, fullName: user.fullName }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async me(req: Request, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const user = usersStore.find(u => u.id === req.user?.userId);
    return res.json({
      status: 'success',
      user: user ? { id: user.id, email: user.email, fullName: user.fullName } : req.user
    });
  }
}
