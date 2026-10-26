import {Suspense} from "react";
import {Marketplace} from "@/components/marketplace";
export default function Page(){return <Suspense fallback={<p>Opening marketplace…</p>}><Marketplace/></Suspense>;}
