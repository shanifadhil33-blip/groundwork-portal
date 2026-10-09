import { z } from 'zod';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string[]>) { super(message); }
}
export const missing = () => new ApiError(404, 'not_found', "We couldn't find that, or you don't have access.");
export const forbidden = () => new ApiError(403, 'forbidden', "You don't have permission to make this change.");
export const invalid = (message: string, field = 'body') => new ApiError(422, 'validation', message, { [field]: [message] });
export function json(value: unknown, status = 200, headers?: HeadersInit) { return Response.json(value, { status, headers }); }
export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    const fields: Record<string,string[]> = {};
    for (const issue of error.issues) (fields[issue.path.join('.') || 'body'] ??= []).push(issue.message);
    return json({ error: { code: 'validation', message: 'Check the highlighted fields and try again.', fields } },422);
  }
  if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }, error.status);
  const code = (error as {code?: string})?.code;
  if (code === '23505') return errorResponse(new ApiError(409,'conflict','That record already exists.'));
  if (code === '23503') return errorResponse(new ApiError(409,'conflict','This record is still in use, or a related record is unavailable.'));
  if (code === 'P0409') return errorResponse(new ApiError(409,'last_admin','Keep at least one workspace admin.'));
  if (code === 'P0404') return errorResponse(missing());
  if (code === 'P0401') return errorResponse(new ApiError(401,'unauthenticated','Sign in to continue.'));
  return json({error:{code:'internal',message:"Something went wrong on our side. Your changes weren't saved. Try again."}},500);
}
export async function readBody(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { throw invalid('Send a valid JSON body.'); }
}
