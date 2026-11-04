/**
 * Authentication helper utilities for Phone, Email, and Social Auth.
 */

export interface CountryCodeOption {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  placeholder: string;
}

export const POPULAR_COUNTRIES: CountryCodeOption[] = [
  { code: "IN", name: "India", flag: "🇮🇳", dialCode: "+91", placeholder: "98765 43210" },
  {
    code: "US",
    name: "United States / Canada",
    flag: "🇺🇸",
    dialCode: "+1",
    placeholder: "555 123 4567",
  },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", dialCode: "+44", placeholder: "7911 123456" },
  { code: "SG", name: "Singapore", flag: "🇸🇬", dialCode: "+65", placeholder: "8123 4567" },
  {
    code: "AE",
    name: "United Arab Emirates",
    flag: "🇦🇪",
    dialCode: "+971",
    placeholder: "50 123 4567",
  },
  { code: "AU", name: "Australia", flag: "🇦🇺", dialCode: "+61", placeholder: "412 345 678" },
  { code: "DE", name: "Germany", flag: "🇩🇪", dialCode: "+49", placeholder: "151 23456789" },
  { code: "FR", name: "France", flag: "🇫🇷", dialCode: "+33", placeholder: "6 12 34 56 78" },
  { code: "JP", name: "Japan", flag: "🇯🇵", dialCode: "+81", placeholder: "90 1234 5678" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱", dialCode: "+31", placeholder: "6 12345678" },
];

/**
 * Normalizes a country dial code and phone number into E.164 format: +<country_code><digits>
 */
export function formatToE164(dialCode: string, rawPhone: string): string {
  // Strip non-digits from phone number
  const cleanPhone = rawPhone.replace(/\D/g, "");
  // Ensure dial code starts with + and has only digits
  const cleanDial = dialCode.startsWith("+")
    ? `+${dialCode.replace(/\D/g, "")}`
    : `+${dialCode.replace(/\D/g, "")}`;

  // If the user already pasted a full phone number including dial code
  if (cleanDial === "+1" && cleanPhone.length === 11 && cleanPhone.startsWith("1")) {
    return `+${cleanPhone}`;
  }
  if (cleanDial === "+91" && cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
    return `+${cleanPhone}`;
  }

  // Strip leading 0 if present (e.g. British or Australian local format 07xxx or 04xxx)
  const phoneWithoutLeadingZero = cleanPhone.replace(/^0+/, "");

  return `${cleanDial}${phoneWithoutLeadingZero}`;
}

/**
 * Validates whether a phone number has reasonable length and format
 */
export function isValidPhoneNumber(rawPhone: string): boolean {
  const digits = rawPhone.replace(/\D/g, "");
  // Standard phone numbers worldwide are between 7 and 15 digits
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Validates a 6-digit SMS OTP code
 */
export function isValidOtp(otp: string): boolean {
  const digits = otp.replace(/\D/g, "");
  return digits.length === 6;
}

/**
 * Basic email format check
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
