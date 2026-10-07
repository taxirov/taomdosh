import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull } from 'drizzle-orm';
import { groupMembers } from '../db/schema';
import type { Db } from './infra.module';

export interface AuthUser {
  id: string;
  locale: string;
}

const IS_PUBLIC = 'isPublic';
/** Token talab qilinmaydigan endpoint */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

/** Global guard: Authorization: Bearer <access token> */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('token_required');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; loc?: string; typ?: string }>(header.slice(7));
      if (payload.typ !== 'access') throw new Error('wrong type');
      req.user = { id: payload.sub, locale: req.headers['accept-language'] ?? payload.loc ?? 'uz' } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('token_invalid');
    }
  }
}

/** A'zolikni tekshiradi; admin kerak bo'lsa — rolni ham. Qaytaradi: a'zolik yozuvi. */
export async function requireMember(db: Db, groupId: string, userId: string, opts: { admin?: boolean } = {}) {
  const [m] = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId), isNull(groupMembers.leftAt)));
  if (!m) throw new NotFoundException('group_not_found');
  if (opts.admin && m.role !== 'admin') throw new ForbiddenException('admin_only');
  return m;
}
