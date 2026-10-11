import { signOut, getSessionUserId } from '../../../../lib/auth';
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) return Response.json({ error: { message: 'We couldn’t sign you out. Please try again.' } }, { status: 403 });
  try { await signOut({ redirect: false }); if (await getSessionUserId(req)) return Response.json({ error: { message: 'We couldn’t sign you out. Please try again.' } }, { status: 500 }); return Response.json({ signed_out: true }, {headers:{'Set-Cookie':'groundwork-demo=; Path=/; SameSite=Lax; Max-Age=0'}}); }
  catch { return Response.json({ error: { message: 'We couldn’t sign you out. Please try again.' } }, { status: 500 }); }
}
