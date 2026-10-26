import type {Metadata} from "next";
import {WorkspaceProvider} from "@/components/workspace-provider";
import {AuthProvider} from "@/components/auth-provider";
import "./globals.css";

export const metadata:Metadata={title:"Marvin Council",description:"A few good minds. One way forward. An internal council workspace for product and engineering."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" data-theme="dark" suppressHydrationWarning><body><AuthProvider><WorkspaceProvider>{children}</WorkspaceProvider></AuthProvider></body></html>;}
