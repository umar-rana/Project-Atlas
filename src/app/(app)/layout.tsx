import { redirect } from "next/navigation";
import { getOrCreateUserFromClerk } from "@/lib/auth";
import { AppShellProvider } from "@/components/shell/app-shell-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getOrCreateUserFromClerk();
  if (!user) redirect("/sign-in");

  return (
    <AppShellProvider
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
      }}
    >
      {children}
    </AppShellProvider>
  );
}
