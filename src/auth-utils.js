export const MICROSOFT_DEVICE_LOGIN_URL = 'https://microsoft.com/devicelogin';

export function formatMicrosoftDeviceCodeNotice(deviceCode = {}) {
  const lines = [
    '',
    '============================================================',
    ' MICROSOFT DEVICE SIGN-IN REQUIRED',
    '',
    `Open: ${MICROSOFT_DEVICE_LOGIN_URL}`,
    `Code: ${deviceCode.user_code ?? '(code was not provided)'}`
  ];

  if (deviceCode.verification_uri && deviceCode.verification_uri !== MICROSOFT_DEVICE_LOGIN_URL) {
    lines.push(`Microsoft verification URL: ${deviceCode.verification_uri}`);
  }

  lines.push(
    '',
    'Sign in with the dedicated Minecraft Microsoft account.',
    '============================================================',
    ''
  );
  return lines.join('\n');
}