import { gateway, generateText } from "ai";
import { getAiModel } from "@/lib/env";
import { addMessage, getConversation, getOrCreateLead } from "@/lib/store";
import { weddingDatabase } from "@/lib/walima-inbox";
import { shouldHandleWedding, WALIMA_KNOWLEDGE, weddingFallback } from "@/lib/walima-knowledge";
import { sendWhatsAppText, type IncomingWhatsAppMessage } from "@/lib/whatsapp";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { restoreChat } from "@/lib/chat-lifecycle";

export async function handleWeddingReply(message:IncomingWhatsAppMessage,isStaff:boolean) {
  const sql=await weddingDatabase();
  const rows=await sql.query(`SELECT invitation_id,last_reply_at FROM walima_guest_context WHERE phone=$1`,[message.phone]);
  const guest=rows[0];
  const history=await getConversation(message.phone,16);
  const lastAssistant=[...history].reverse().find(m=>m.role==="assistant");
  const activeWeddingThread=Boolean(guest?.last_reply_at && lastAssistant && Date.parse(lastAssistant.createdAt)<=Date.parse(String(guest.last_reply_at)) && Date.now()-Date.parse(String(guest.last_reply_at))<86400000);
  if(!shouldHandleWedding({text:message.text,knownGuest:Boolean(guest),lastAssistant:lastAssistant?.content,activeWeddingThread,quotedInvitation:Boolean(guest && message.replyToMessageId===guest.invitation_id),isStaff})) return false;
  const isNew=await addMessage(message.phone,"user",message.text,message.id);
  if(!isNew) return true;
  await restoreChat(message.phone);
  const lead=await getOrCreateLead(message.phone,"whatsapp");
  // Respect an administrator's active human takeover.
  if(lead.aiPaused) return true;
  let reply:string;
  try {
    const result=await generateText({model:gateway(getAiModel()),system:WALIMA_KNOWLEDGE,messages:[...history.map(m=>({role:m.role,content:m.content})),{role:"user",content:message.text}],maxOutputTokens:500,abortSignal:AbortSignal.timeout(20000)});
    reply=result.text.trim() || weddingFallback(message.text);
  } catch { reply=weddingFallback(message.text); }
  // A timeout must not trigger an automatic resend of the same reply.
  const sent=await sendWhatsAppText(message.phone,reply,message.phoneNumberId ?? undefined);
  await addMessage(message.phone,"assistant",reply,sent.messageId);
  await recordOutgoingMessageAccepted({messageId:sent.messageId,phone:message.phone});
  await sql.query(`UPDATE walima_guest_context SET last_reply_at=NOW() WHERE phone=$1`,[message.phone]);
  return true;
}
