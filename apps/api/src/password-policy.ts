const COMMON_PASSWORD_PARTS = ['password', 'changeme', '123456', 'qwerty', 'appgog123', 'admin123'];

export function passwordPolicyViolations(password: string, email?: string) {
  const violations: string[] = [];
  if (password.length < 16) violations.push('密码至少需要 16 位');
  if (password.length > 128) violations.push('密码不能超过 128 位');

  const characterClasses = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)]
    .filter(Boolean).length;
  if (characterClasses < 3) violations.push('密码必须包含大小写字母、数字和符号中的至少三类');

  const normalized = password.toLowerCase();
  if (COMMON_PASSWORD_PARTS.some(value => normalized.includes(value))) violations.push('密码包含常见弱口令片段');
  const localPart = email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && normalized.includes(localPart)) violations.push('密码不能包含邮箱账号');
  return violations;
}

export function assertStrongPassword(password: string, email?: string) {
  const violations = passwordPolicyViolations(password, email);
  if (violations.length) throw new Error(violations.join('；'));
}
