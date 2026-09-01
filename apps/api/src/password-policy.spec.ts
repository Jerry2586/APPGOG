import { passwordPolicyViolations } from './password-policy';

describe('password policy', () => {
  it('accepts a long password with at least three character classes', () => {
    expect(passwordPolicyViolations('Ocean-Glass-47-Lantern!', 'owner@example.com')).toEqual([]);
  });

  it('rejects short passwords', () => {
    expect(passwordPolicyViolations('Short-4!')).toContain('密码至少需要 16 位');
  });

  it('rejects common password fragments', () => {
    expect(passwordPolicyViolations('Password-For-Admin-47!')).toContain('密码包含常见弱口令片段');
  });

  it('rejects passwords containing the email account', () => {
    expect(passwordPolicyViolations('Owner-Strong-47-Secret!', 'owner@example.com')).toContain('密码不能包含邮箱账号');
  });
});
