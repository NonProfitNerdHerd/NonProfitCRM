import { PasswordUpdateForm } from "@/components/auth/password-update-form";

export default function ResetPasswordPage() {
  return (
    <PasswordUpdateForm
      title="Set a New Password"
      subtitle="Enter your new password to complete password recovery."
    />
  );
}
