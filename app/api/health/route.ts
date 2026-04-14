import { NextResponse } from 'next/server';
import packageJson from '../../../package.json';

export const dynamic = 'force-dynamic';

/**
 * Santé de l’API pour load balancers / uptime (UptimeRobot, Better Stack, etc.).
 * GET /api/health
 */
export async function GET() {
  const firebaseAdminConfigured = Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );

  return NextResponse.json(
    {
      status: 'ok',
      service: 'bizaflow-telecom',
      version: packageJson.version,
      environment: process.env.NODE_ENV,
      time: new Date().toISOString(),
      checks: {
        firebaseAdmin: firebaseAdminConfigured,
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
