import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// Enable / disable an account (admins cannot be disabled here)
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const s = await requireApi('admin');
    const id = Number((await params).id);
    const { is_active } = await req.json();
    await withTransaction(s.userId, (c) => c.query(
      `UPDATE users SET is_active = $2 WHERE user_id = $1 AND role <> 'admin'`, [id, Boolean(is_active)]));
    return NextResponse.json({ message: 'Updated' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
