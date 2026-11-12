import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

// Update the detector thresholds (chk_thresholds enforces 0 < review < auto <= 1)
export async function PUT(req: Request) {
  try {
    const s = await requireApi('admin');
    const { auto_threshold, review_threshold } = await req.json();
    await withTransaction(s.userId, (c) => c.query(
      `UPDATE detection_settings SET auto_threshold = $1, review_threshold = $2, updated_by = $3, updated_at = now() WHERE id = 1`,
      [Number(auto_threshold), Number(review_threshold), s.userId]));
    return NextResponse.json({ message: 'Thresholds saved' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
