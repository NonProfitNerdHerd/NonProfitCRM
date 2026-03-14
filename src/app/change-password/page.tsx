import { PasswordUpdateForm } from "@/components/auth/password-update-form";

export default function ChangePasswordPage() {
  return (
    <PasswordUpdateForm
      title="Change Temporary Password"
      subtitle="You must set a new password before continuing."
    />
  );
}
