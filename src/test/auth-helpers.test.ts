import { describe, it, expect } from "vitest";
import {
  formatToE164,
  isValidPhoneNumber,
  isValidOtp,
  isValidEmail,
  POPULAR_COUNTRIES,
} from "@/lib/auth-helpers";

describe("Authentication helpers", () => {
  describe("formatToE164", () => {
    it("formats Indian phone numbers correctly with dial code", () => {
      expect(formatToE164("+91", "9876543210")).toBe("+919876543210");
      expect(formatToE164("+91", "98765 43210")).toBe("+919876543210");
      expect(formatToE164("+91", "09876543210")).toBe("+919876543210"); // Leading zero stripped
    });

    it("formats US/Canada phone numbers correctly", () => {
      expect(formatToE164("+1", "5551234567")).toBe("+15551234567");
      expect(formatToE164("+1", "(555) 123-4567")).toBe("+15551234567");
      expect(formatToE164("+1", "15551234567")).toBe("+15551234567"); // 11-digit already prefixed
    });

    it("formats UK numbers stripping leading local zero", () => {
      expect(formatToE164("+44", "07911 123456")).toBe("+447911123456");
      expect(formatToE164("+44", "7911123456")).toBe("+447911123456");
    });

    it("handles dial codes without leading plus sign", () => {
      expect(formatToE164("91", "9876543210")).toBe("+919876543210");
    });
  });

  describe("isValidPhoneNumber", () => {
    it("accepts valid phone lengths (7 to 15 digits)", () => {
      expect(isValidPhoneNumber("9876543210")).toBe(true);
      expect(isValidPhoneNumber("555-1234")).toBe(true);
      expect(isValidPhoneNumber("+91 98765 43210")).toBe(true);
    });

    it("rejects phone numbers that are too short or empty", () => {
      expect(isValidPhoneNumber("")).toBe(false);
      expect(isValidPhoneNumber("12345")).toBe(false);
      expect(isValidPhoneNumber("abc")).toBe(false);
    });

    it("rejects phone numbers that exceed 15 digits", () => {
      expect(isValidPhoneNumber("1234567890123456")).toBe(false);
    });
  });

  describe("isValidOtp", () => {
    it("validates 6 digit codes", () => {
      expect(isValidOtp("123456")).toBe(true);
      expect(isValidOtp("000000")).toBe(true);
      expect(isValidOtp(" 123 456 ")).toBe(true);
    });

    it("rejects non-6 digit codes", () => {
      expect(isValidOtp("12345")).toBe(false);
      expect(isValidOtp("1234567")).toBe(false);
      expect(isValidOtp("")).toBe(false);
      expect(isValidOtp("abc")).toBe(false);
    });
  });

  describe("isValidEmail", () => {
    it("accepts valid email formats", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("john.doe@company.org")).toBe(true);
      expect(isValidEmail("candidate+test@domain.co.in")).toBe(true);
    });

    it("rejects invalid email formats", () => {
      expect(isValidEmail("plainaddress")).toBe(false);
      expect(isValidEmail("@missingusername.com")).toBe(false);
      expect(isValidEmail("user@domain")).toBe(false);
      expect(isValidEmail("")).toBe(false);
    });
  });

  describe("POPULAR_COUNTRIES", () => {
    it("includes major countries with dial codes and flags", () => {
      expect(POPULAR_COUNTRIES.some((c) => c.code === "IN" && c.dialCode === "+91")).toBe(true);
      expect(POPULAR_COUNTRIES.some((c) => c.code === "US" && c.dialCode === "+1")).toBe(true);
      expect(POPULAR_COUNTRIES.some((c) => c.code === "GB" && c.dialCode === "+44")).toBe(true);
    });
  });
});
