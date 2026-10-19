"use client";

import { useState } from "react";
import { attachmentDisplayName, clientAttachmentUrl, type ClientAttachmentPayload } from "@/lib/client-attachment-content";

export function ClientAttachment({ attachment }: { attachment: ClientAttachmentPayload }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fileName = attachmentDisplayName(attachment);
  const url = clientAttachmentUrl(attachment, false, attempt);
  const badge = { image: "IMG", document: "DOC", audio: "AUDIO", video: "VIDEO" }[attachment.kind];

  return <figure className="clientAttachmentCard" aria-label={`${attachment.kind} attachment: ${fileName}`}>
    {!failed && attachment.kind === "image" ? <a className="clientAttachmentPreview" href={url} target="_blank" rel="noreferrer" aria-label={`Open image ${fileName}`}>
      <img src={url} alt={attachment.caption || fileName} loading="lazy" onError={() => setFailed(true)} />
    </a> : null}
    {!failed && attachment.kind === "audio" ? <audio className="clientAttachmentPlayer" key={url} src={url} controls preload="none" aria-label={fileName} onError={() => setFailed(true)} /> : null}
    {!failed && attachment.kind === "video" ? <video className="clientAttachmentPlayer" key={url} src={url} controls playsInline preload="none" aria-label={fileName} onError={() => setFailed(true)} /> : null}
    {failed ? <div className="clientAttachmentError" role="status">Preview unavailable. Try again or use Open. Older files may no longer be available from WhatsApp.<button type="button" onClick={() => { setAttempt((value) => value + 1); setFailed(false); }}>Retry preview</button></div> : null}
    <span className="clientAttachmentBadge" aria-hidden="true">{badge}</span>
    <figcaption className="clientAttachmentCopy"><strong>{fileName}</strong><small>{attachment.mimeType || `${attachment.kind} attachment`}</small>{attachment.caption ? <span>{attachment.caption}</span> : null}</figcaption>
    <div className="clientAttachmentActions">
      <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${fileName}`}>Open</a>
      <a href={clientAttachmentUrl(attachment, true)} download={fileName} aria-label={`Download ${fileName}`}>Download</a>
    </div>
  </figure>;
}
