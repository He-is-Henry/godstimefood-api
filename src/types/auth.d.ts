interface JwtPayload {
  id: number;
  email: string;
  sessionId: string;
  role: import('@prisma/client').Role;
  mustChangePassword: boolean;
}
