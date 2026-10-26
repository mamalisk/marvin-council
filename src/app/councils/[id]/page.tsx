import {CouncilRoom} from "@/components/council-room";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <CouncilRoom id={id}/>;}
