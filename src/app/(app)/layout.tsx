import { redirect } from "next/navigation";
import { getOrCreateUserFromClerk } from "@/lib/auth";
import { AppShellProvider } from "@/components/shell/app-shell-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const isAdmin = Boolean(adminEmail && user.email.trim().toLowerCase() === adminEmail);

  return (
    <AppShellProvider
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
      }}
      isAdmin={isAdmin}
    >
      {children}
    </AppShellProvider>
  );
}
