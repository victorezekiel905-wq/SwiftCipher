import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { AuditService } from '../src/common/audit.service';
import { PrismaService } from '../src/common/prisma.service';

describe('AuthService', () => {
  it('should be defined', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test' })],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(AuthService)).toBeDefined();
  });
});
