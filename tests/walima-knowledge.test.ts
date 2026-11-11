import { describe,it,expect } from "vitest";
import { shouldHandleWedding,weddingFallback,WALIMA_KNOWLEDGE } from "@/lib/walima-knowledge";
const guest={knownGuest:true,isStaff:false,quotedInvitation:false,lastAssistant:"[Walima invitation card: Guest]"};
describe("wedding conversation routing",()=>{
  it("answers short invitation replies without treating them as sales leads",()=>expect(shouldHandleWedding({...guest,text:"Thank you, where is it?"})).toBe(true));
  it("keeps a wedding conversation active after a short acknowledgement",()=>expect(shouldHandleWedding({...guest,lastAssistant:"You're welcome!",activeWeddingThread:true,text:"What time?"})).toBe(true));
  it("lets an existing guest ask for business services",()=>expect(shouldHandleWedding({...guest,text:"I need a quotation for my dissertation"})).toBe(false));
  it("keeps staff business requests in the staff agent",()=>expect(shouldHandleWedding({...guest,isStaff:true,text:"What are today's priorities?"})).toBe(false));
  it("recognises a staff guest’s unquoted invitation response",()=>expect(shouldHandleWedding({...guest,isStaff:true,text:"Thank you, I will come"})).toBe(true));
  it("answers staff wedding questions",()=>expect(shouldHandleWedding({...guest,isStaff:true,text:"Where is the Walima?"})).toBe(true));
  it("uses quoted invitation IDs for short staff replies",()=>expect(shouldHandleWedding({...guest,isStaff:true,quotedInvitation:true,text:"What time?"})).toBe(true));
  it("does not hijack unrelated first contacts",()=>expect(shouldHandleWedding({...guest,knownGuest:false,text:"Hello"})).toBe(false));
  it("never invents Nikah arrangements",()=>{expect(weddingFallback("When is the Nikah?")).toContain("don’t yet have the confirmed Nikah");expect(WALIMA_KNOWLEDGE).toContain("Its date, time and venue are NOT confirmed");});
});
