import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  Lock,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  Send,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  POPULAR_COUNTRIES,
  formatToE164,
  isValidPhoneNumber,
  isValidOtp,
  isValidEmail,
} from "@/lib/auth-helpers";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — RoleRadar" },
      { name: "description", content: "Sign in to your RoleRadar job tracker." },
      { property: "og:title", content: "Sign in — RoleRadar" },
      { property: "og:description", content: "Sign in to your RoleRadar job tracker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

export function AuthPage() {
  const navigate = useNavigate();

  // Root primary auth method tab: "phone" | "email"
  const [activeTab, setActiveTab] = useState<"phone" | "email">("phone");

  // Email sub-mode: "signin" | "signup" | "magiclink" | "forgot"
  const [emailMode, setEmailMode] = useState<"signin" | "signup" | "magiclink" | "forgot">(
    "signin",
  );

  // Email form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Phone form state
  const [selectedCountryCode, setSelectedCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneStep, setPhoneStep] = useState<"input" | "verify">("input");
  const [otp, setOtp] = useState("");
  const [formattedFullPhone, setFormattedFullPhone] = useState("");

  // Timer for OTP resend
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Loading states
  const [busy, setBusy] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/jobs" });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate({ to: "/jobs" });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  // Handle OTP countdown timer
  useEffect(() => {
    if (resendCountdown > 0) {
      countdownIntervalRef.current = setTimeout(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (countdownIntervalRef.current) {
        clearTimeout(countdownIntervalRef.current);
      }
    };
  }, [resendCountdown]);

  // Social OAuth Handler (Google or Apple)
  async function handleOAuth(provider: "google" | "apple") {
    setOauthLoading(provider);
    try {
      const redirectUri = `${window.location.origin}/jobs`;

      // Try Lovable OAuth helper first for preview environments
      const lovableResult = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: redirectUri,
      });

      if (lovableResult?.error) {
        // Fallback directly to Supabase OAuth
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: redirectUri,
          },
        });
        if (error) {
          toast.error(error.message);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sign in with provider";
      toast.error(message);
    } finally {
      setOauthLoading(null);
    }
  }

  // 1. Phone Auth: Send SMS OTP
  async function handleSendPhoneOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (!phoneNumber.trim()) {
      toast.error("Please enter your phone number");
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      toast.error("Please enter a valid phone number (7-15 digits)");
      return;
    }

    const fullPhone = formatToE164(selectedCountryCode, phoneNumber);
    setFormattedFullPhone(fullPhone);
    setBusy(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(`Verification code sent to ${fullPhone}`);
      setPhoneStep("verify");
      setOtp("");
      setResendCountdown(60);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setBusy(false);
    }
  }

  // 1. Phone Auth: Verify OTP
  async function handleVerifyPhoneOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (!isValidOtp(otp)) {
      toast.error("Please enter the complete 6-digit verification code");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: formattedFullPhone,
        token: otp,
        type: "sms",
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.session) {
        toast.success("Successfully signed in!");
        navigate({ to: "/jobs" });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to verify code");
    } finally {
      setBusy(false);
    }
  }

  // 2. Email Auth: Password Sign In, Sign Up, Magic Link, or Reset
  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();

    if (!isValidEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setBusy(true);
    try {
      if (emailMode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        if (data.session) {
          toast.success("Welcome back!");
          navigate({ to: "/jobs" });
        }
      } else if (emailMode === "signup") {
        if (password.length < 6) {
          toast.error("Password must be at least 6 characters");
          return;
        }
        if (password !== confirmPassword) {
          toast.error("Passwords do not match");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/jobs`,
          },
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        if (data.session) {
          toast.success("Account created successfully!");
          navigate({ to: "/jobs" });
        } else {
          toast.success("Account created! Check your email to confirm your account.");
          setEmailMode("signin");
        }
      } else if (emailMode === "magiclink") {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/jobs`,
          },
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Magic sign-in link sent! Please check your email inbox.");
      } else if (emailMode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/settings`,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Password reset link sent! Check your inbox.");
        setEmailMode("signin");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  const selectedCountry =
    POPULAR_COUNTRIES.find((c) => c.dialCode === selectedCountryCode) || POPULAR_COUNTRIES[0];

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lift sm:p-8">
        {/* Brand Header */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            RoleRadar
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Secure Sign In
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
          {phoneStep === "verify"
            ? "Enter 6-digit code"
            : emailMode === "forgot"
              ? "Reset password"
              : "Welcome to RoleRadar"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {phoneStep === "verify"
            ? `We sent a security code to ${formattedFullPhone}`
            : emailMode === "forgot"
              ? "Enter your email to receive a password reset link"
              : "Track job openings, match LinkedIn posts, and monitor careers."}
        </p>

        {/* Top Social OAuth Buttons (Google & Apple) */}
        {phoneStep !== "verify" && emailMode !== "forgot" && (
          <div className="mt-6 space-y-2.5">
            {/* Google OAuth Button */}
            <Button
              type="button"
              variant="outline"
              className="relative w-full h-10 font-medium hover:bg-accent/60 transition-colors"
              onClick={() => handleOAuth("google")}
              disabled={busy || oauthLoading !== null}
            >
              {oauthLoading === "google" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <svg className="mr-2.5 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              Continue with Google
            </Button>

            {/* Apple OAuth Button */}
            <Button
              type="button"
              variant="outline"
              className="relative w-full h-10 font-medium hover:bg-accent/60 transition-colors"
              onClick={() => handleOAuth("apple")}
              disabled={busy || oauthLoading !== null}
            >
              {oauthLoading === "apple" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <svg
                  className="mr-2.5 h-4 w-4 fill-current text-foreground"
                  viewBox="0 0 170 170"
                  aria-hidden="true"
                >
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.6-7.85-11.7-14.42-6.09-9.78-10.74-20.76-13.97-32.93-3.23-12.18-4.85-23.77-4.85-34.78 0-14.13 3.65-25.96 10.96-35.49 7.31-9.52 16.42-14.38 27.34-14.59 4.35 0 9.4 1.15 15.17 3.45 5.76 2.3 9.43 3.51 11.01 3.62 1.95-.22 5.79-1.52 11.51-3.9 5.72-2.38 10.72-3.41 15.01-3.1 11.41.65 20.65 4.89 27.72 12.71-9.9 5.98-14.75 14.23-14.55 24.77.22 8.37 3.54 15.37 9.97 21 6.42 5.64 13.92 8.91 22.49 9.8-2.6 7.82-5.76 15.86-9.47 24.12zM119.22 31.84c0-7.39 2.66-14.23 7.97-20.52 5.32-6.29 11.75-10.42 19.3-12.39.22 1.3.33 2.49.33 3.58 0 7.39-2.77 14.39-8.31 21-5.54 6.62-12 10.76-19.39 12.42-.01-1.3-.01-2.69.1-4.09z" />
                </svg>
              )}
              Continue with Apple
            </Button>

            {/* Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative bg-card px-3 text-xs uppercase tracking-wider text-muted-foreground">
                or continue with
              </div>
            </div>
          </div>
        )}

        {/* Primary Auth Form: Phone vs Email */}
        {phoneStep === "verify" ? (
          /* Phone OTP Verification Subview */
          <div className="mt-4 space-y-5">
            <div className="flex flex-col items-center justify-center space-y-3 py-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Verification code sent to</p>
                <p className="font-semibold text-foreground tracking-wide">{formattedFullPhone}</p>
              </div>
            </div>

            <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
              <div className="flex flex-col items-center justify-center space-y-2">
                <Label htmlFor="otp-input" className="text-xs text-muted-foreground">
                  Type the 6-digit SMS code
                </Label>
                <InputOTP
                  id="otp-input"
                  maxLength={6}
                  value={otp}
                  onChange={setOtp}
                  disabled={busy}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button
                type="submit"
                variant="ink"
                className="w-full h-10 mt-2 font-medium"
                disabled={busy || otp.length !== 6}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Verify & Continue
                  </>
                )}
              </Button>
            </form>

            {/* Resend and Change Number Actions */}
            <div className="flex flex-col gap-2 pt-2 text-center text-xs text-muted-foreground">
              {resendCountdown > 0 ? (
                <p>
                  Resend code in{" "}
                  <span className="font-semibold text-foreground">{resendCountdown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  className="font-medium text-primary hover:underline inline-flex items-center justify-center gap-1 mx-auto"
                  onClick={() => handleSendPhoneOtp()}
                  disabled={busy}
                >
                  <RefreshCw className="h-3 w-3" /> Resend SMS Code
                </button>
              )}

              <button
                type="button"
                className="mt-1 text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 mx-auto"
                onClick={() => {
                  setPhoneStep("input");
                  setOtp("");
                }}
              >
                <ArrowLeft className="h-3 w-3" /> Use a different phone number
              </button>
            </div>
          </div>
        ) : emailMode === "forgot" ? (
          /* Forgot Password Subview */
          <div className="mt-4 space-y-4">
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Account Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>

              <Button type="submit" variant="ink" className="w-full h-10" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending link...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" /> Send Reset Link
                  </>
                )}
              </Button>
            </form>

            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 mt-2"
              onClick={() => setEmailMode("signin")}
            >
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </button>
          </div>
        ) : (
          /* Standard Auth Tabs: Phone vs Email */
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "phone" | "email")}
            className="mt-2"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="phone" className="gap-2 text-xs font-medium">
                <Phone className="h-3.5 w-3.5" /> Phone Number
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-2 text-xs font-medium">
                <Mail className="h-3.5 w-3.5" /> Email Address
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: PHONE LOGIN */}
            <TabsContent value="phone" className="mt-4 space-y-4">
              <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone-input">Mobile Number</Label>
                  <div className="flex gap-2">
                    {/* Country Code Selector */}
                    <Select
                      value={selectedCountryCode}
                      onValueChange={setSelectedCountryCode}
                      disabled={busy}
                    >
                      <SelectTrigger className="w-[120px] shrink-0">
                        <SelectValue>
                          <span className="flex items-center gap-1.5 text-xs font-medium">
                            <span>{selectedCountry.flag}</span>
                            <span>{selectedCountry.dialCode}</span>
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {POPULAR_COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.dialCode}>
                            <span className="flex items-center gap-2 text-xs">
                              <span>{country.flag}</span>
                              <span className="font-medium">{country.name}</span>
                              <span className="ml-auto text-muted-foreground">
                                {country.dialCode}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Phone Number Input */}
                    <Input
                      id="phone-input"
                      type="tel"
                      inputMode="tel"
                      placeholder={selectedCountry.placeholder}
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      required
                      disabled={busy}
                      className="flex-1 font-mono tracking-wide"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    We will send a one-time 6-digit SMS verification code to this number.
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="ink"
                  className="w-full h-10 font-medium"
                  disabled={busy || !phoneNumber.trim()}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending OTP...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" /> Send Verification Code
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* TAB 2: EMAIL LOGIN */}
            <TabsContent value="email" className="mt-4 space-y-4">
              {/* Email Mode Selector Switch */}
              <div className="flex rounded-lg border bg-muted/40 p-1 text-xs">
                <button
                  type="button"
                  className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                    emailMode === "signin"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setEmailMode("signin")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                    emailMode === "signup"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setEmailMode("signup")}
                >
                  Sign up
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md py-1.5 font-medium transition-all ${
                    emailMode === "magiclink"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setEmailMode("magiclink")}
                >
                  Magic Link
                </button>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="email-input">Email Address</Label>
                  <Input
                    id="email-input"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                  />
                </div>

                {emailMode === "magiclink" ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Password-free sign in
                    </p>
                    We will send a secure one-click login link directly to your inbox.
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password-input">Password</Label>
                        {emailMode === "signin" && (
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => setEmailMode("forgot")}
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <Input
                        id="password-input"
                        type="password"
                        placeholder="••••••••"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                      />
                    </div>

                    {emailMode === "signup" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="confirm-password-input">Confirm Password</Label>
                        <Input
                          id="confirm-password-input"
                          type="password"
                          placeholder="••••••••"
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          disabled={busy}
                        />
                      </div>
                    )}
                  </>
                )}

                <Button type="submit" variant="ink" className="w-full h-10 mt-2" disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...
                    </>
                  ) : emailMode === "signin" ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" /> Sign In with Password
                    </>
                  ) : emailMode === "signup" ? (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" /> Create Account
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" /> Send Magic Login Link
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}

export default AuthPage;
