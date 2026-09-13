import Link from "next/link";
import { MedMindsContentStudio } from "@/components/medminds-content-studio";

export const dynamic = "force-dynamic";

export default function ContentStudioPage() {
  return <>
    <style>{`
      /* Content Studio previews mirror the square-first MedMinds Facebook feed. */
      aside > div[class*="preview"] { aspect-ratio: 1 / 1 !important; background: #edf1f2 !important; }
      aside > div[class*="preview"] > img { object-fit: contain !important; background: #edf1f2; }
    `}</style>
    <Link href="/admin/social" style={{position:"fixed",right:18,top:18,zIndex:60,padding:"10px 14px",borderRadius:12,background:"#ffffff",border:"1px solid #cfdad6",boxShadow:"0 8px 24px rgba(16,43,40,.12)",color:"#075548",fontSize:12,fontWeight:900,textDecoration:"none"}}>Facebook Scheduler</Link>
    <MedMindsContentStudio />
  </>;
}
