import { auth } from '@/lib/auth';
import { updateRule, deleteRule } from '@/lib/rules/queries';
import { prisma } from '@/lib/db';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership or admin
    const rule = await prisma.rule.findUnique({ where: { id } });
    if (!rule) return new Response('Not found', { status: 404 });

    if (rule.orgId && rule.orgId !== session.user.orgId) {
      return new Response('Forbidden', { status: 403 });
    }

    const isOwner = rule.createdById === session.user.agentUserId;
    const isAdmin = session.user.role === 'admin';
    const isSystemRule = rule.ruleType === 'system';

    if (isSystemRule || (!isOwner && !isAdmin)) {
      return new Response('Forbidden', { status: 403 });
    }

    const body = await req.json();
    const updated = await updateRule(id, {
      content: body.content,
      category: body.category,
    });

    return Response.json(updated);
  } catch (error) {
    console.error('[rules/id] Database error:', error);
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const rule = await prisma.rule.findUnique({ where: { id } });
    if (!rule) return new Response('Not found', { status: 404 });

    if (rule.orgId && rule.orgId !== session.user.orgId) {
      return new Response('Forbidden', { status: 403 });
    }

    const isOwner = rule.createdById === session.user.agentUserId;
    const isAdmin = session.user.role === 'admin';
    const isSystemRule = rule.ruleType === 'system';

    if (isSystemRule || (!isOwner && !isAdmin)) {
      return new Response('Forbidden', { status: 403 });
    }

    await deleteRule(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('[rules/id] Database error:', error);
    return Response.json(
      { error: 'An internal error occurred. Please try again.' },
      { status: 500 },
    );
  }
}
