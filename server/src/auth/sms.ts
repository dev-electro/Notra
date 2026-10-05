export interface SmsProvider {
  /** Send an OTP to an E.164 number. Throw on failure. */
  sendOtp(phoneE164: string, code: string): Promise<void>;
}

/** Development only: logs the code to the Worker console instead of sending an SMS. Never used unless SMS_PROVIDER=dev. */
export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phoneE164: string, code: string): Promise<void> {
    console.log(`[dev sms] OTP for ${phoneE164}: ${code}`);
  }
}

/**
 * MSG91 OTP API (India, DLT-registered template). `MSG91_TEMPLATE_ID` is the approved DLT template id.
 * https://docs.msg91.com/otp/send-otp
 */
export class Msg91Provider implements SmsProvider {
  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    const qs = new URLSearchParams({
      template_id: this.templateId,
      mobile: phoneE164.replace('+', ''),
      otp: code,
    });
    const res = await this.fetchImpl(`https://control.msg91.com/api/v5/otp?${qs}`, {
      method: 'POST',
      headers: { authkey: this.authKey, 'content-type': 'application/json', accept: 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string };
    if (!res.ok || body.type !== 'success') throw new Error(`msg91 failed (${res.status})`);
  }
}
