import {requireWorkspaceUser} from "@/lib/auth/server";
export default async function Layout({children}: {children: React.ReactNode}) {
  await requireWorkspaceUser();
  return children;
}
