import { Resend as ResendClient } from 'resend';
import { generateRandomString } from 'oslo/crypto';
import { Email } from '@convex-dev/auth/providers/Email';

export const OTP = Email({
  id: 'otp',
  apiKey: process.env.RESEND_API_KEY,
  maxAge: 60 * 15, // 15 minutes, TODO: Replace with EffectTS Duration
  generateVerificationToken: () => generateRandomString(6, '0123456789'),
  sendVerificationRequest: async ({ identifier: email, provider, token }) => {
    const resend = new ResendClient(provider.apiKey);
    const { error } = await resend.emails.send({
      to: [email],
      text: 'Your verification code is ' + token,
      from: 'RSSBrief <onboarding@resend.dev>',
      subject: `Your verification code`,
    });

    console.log('Sent OTP to', email);
    console.log('OTP', token);

    if (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
