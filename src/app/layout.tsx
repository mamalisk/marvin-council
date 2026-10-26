import type {Metadata} from "next";
import {WorkspaceProvider} from "@/components/workspace-provider";
import "./globals.css";

export const metadata:Metadata={title:"Marvin Council",description:"A few good minds. One way forward. An internal council workspace for product and engineering."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" data-theme="dark" suppressHydrationWarning><body><WorkspaceProvider>{children}</WorkspaceProvider></body></html>;}
