import { HttpError, SuspendedError } from '@/sync/http';

const BY_CODE: Record<string, string> = {
  invalid_phone: 'सही 10 अंकों का मोबाइल नंबर डालें',
  invalid_code: 'कोड ग़लत है, फिर से देखें',
  code_expired: 'कोड की समय सीमा खत्म हो गई, नया कोड मँगाएँ',
  too_many_attempts: 'बहुत ग़लत कोशिशें हुईं, नया कोड मँगाएँ',
  resend_too_soon: 'थोड़ा रुकें, फिर नया कोड मँगाएँ',
  too_many_requests: 'अभी बहुत कोशिशें हो चुकी हैं, थोड़ी देर बाद करें',
  sms_failed: 'SMS नहीं भेज पाए, थोड़ी देर बाद कोशिश करें',
  blocked: 'इस नंबर से अभी साइन इन नहीं हो सकता, सहायता से संपर्क करें',
  invalid_google_token: 'Google से साइन इन नहीं हो पाया',
  identity_belongs_to_another_user: 'यह खाता किसी और के साथ जुड़ा है',
  already_linked_to_different_identity: 'पहले से दूसरा खाता जुड़ा है',
};

/** Plain-Hindi message for a sign-in failure. Network problems get the "no internet" message. */
export function authErrorMessage(e: unknown): string {
  if (e instanceof SuspendedError) return e.messageHi;
  if (e instanceof HttpError) return BY_CODE[e.code] ?? 'कुछ गड़बड़ हुई, दोबारा कोशिश करें';
  return 'इंटरनेट नहीं है, दोबारा कोशिश करें';
}
