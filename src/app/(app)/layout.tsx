import { redirect } from "next/navigation";
import { getServerSession } from "@/core/auth/session";
import { AppShellProvider } from "@/components/shell/app-shell-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerSession();
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
