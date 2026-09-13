import React from "react";
import { ImageResponse } from "next/og";
import { getContentPost, type ContentPost } from "@/lib/content-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLORS = {
  green: "#0d725f",
  greenDark: "#075548",
  ink: "#102b28",
  mint: "#dff3ec",
  cream: "#f7f5ef",
  white: "#ffffff",
  muted: "#61736f"
};

function Brand({ logoSrc, compact = false }: { logoSrc: string; compact?: boolean }) {
  return React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: compact ? "7px 10px" : "9px 13px",
      borderRadius: compact ? 13 : 16,
      background: "rgba(255,255,255,.97)",
      border: "1px solid rgba(16,43,40,.10)",
      boxShadow: "0 8px 22px rgba(16,43,40,.10)"
    }
  }, React.createElement("img", {
    src: logoSrc,
    width: compact ? 154 : 188,
    height: compact ? 65 : 80,
    style: { width: compact ? 154 : 188, height: compact ? 65 : 80, objectFit: "contain" }
  }));
}

function Cta({ text, light = false }: { text: string; light?: boolean }) {
  return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 21px", borderRadius: 999, background: light ? COLORS.white : COLORS.green, color: light ? COLORS.greenDark : COLORS.white, fontSize: 19, fontWeight: 850 } },
    React.createElement("span", null, text), React.createElement("span", { style: { fontSize: 22 } }, "→"));
}

function Promo({ logoSrc, headline, support, cta, label }: { logoSrc: string; headline: string; support: string; cta: string; label: string }) {
  const size = headline.length > 70 ? 45 : headline.length > 48 ? 52 : 59;
  return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: COLORS.ink, padding: "45px 62px 48px" } },
    React.createElement("div", { style: { position: "absolute", width: 520, height: 520, borderRadius: 999, right: -160, top: -185, background: "#17443d" } }),
    React.createElement("div", { style: { position: "absolute", width: 350, height: 350, borderRadius: 999, right: 80, bottom: -235, background: COLORS.green } }),
    React.createElement("div", { style: { position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", zIndex: 2 } },
      React.createElement(Brand, { logoSrc, compact: true }),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", maxWidth: 850 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, color: "#8be0c9", fontSize: 13, fontWeight: 900, letterSpacing: 2, marginBottom: 16 } },
          React.createElement("span", { style: { width: 38, height: 5, borderRadius: 999, background: "#58c8ac" } }), label),
        React.createElement("div", { style: { color: COLORS.white, fontSize: size, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1.7 } }, headline),
        support ? React.createElement("div", { style: { color: "#cfe5df", fontSize: 24, lineHeight: 1.38, marginTop: 19, maxWidth: 780 } }, support) : null
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 28 } },
        React.createElement(Cta, { text: cta, light: true }),
        React.createElement("div", { style: { color: "rgba(255,255,255,.72)", fontSize: 14, textAlign: "right", lineHeight: 1.4 } }, "Medical learning • Research support • Digital tools")
      )
    )
  );
}

function Education({ logoSrc, headline, support, cta, label, faq = false }: { logoSrc: string; headline: string; support: string; cta: string; label: string; faq?: boolean }) {
  const size = headline.length > 70 ? 43 : 52;
  return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", background: COLORS.cream, padding: "42px 60px 48px" } },
    React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        React.createElement(Brand, { logoSrc, compact: true }),
        faq ? React.createElement("div", { style: { width: 66, height: 66, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.mint, color: COLORS.greenDark, fontSize: 39, fontWeight: 900 } }, "?")
          : React.createElement("div", { style: { padding: "10px 16px", borderRadius: 999, background: COLORS.mint, color: COLORS.greenDark, fontSize: 14, fontWeight: 850 } }, "LEARN • APPLY • GROW")
      ),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", maxWidth: 950 } },
        React.createElement("div", { style: { color: COLORS.green, fontSize: 15, fontWeight: 900, letterSpacing: 2.2, marginBottom: 14 } }, faq ? `${label} FAQ` : label),
        React.createElement("div", { style: { color: COLORS.ink, fontSize: size, fontWeight: 900, lineHeight: 1.08, letterSpacing: -1.4 } }, headline),
        support ? React.createElement("div", { style: { color: COLORS.muted, fontSize: 24, lineHeight: 1.42, marginTop: 20, maxWidth: 850 } }, support) : null
      ),
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        React.createElement(Cta, { text: cta }),
        React.createElement("div", { style: { color: COLORS.muted, fontSize: 13 } }, "medmindslc.online")
      )
    )
  );
}

function Photo({ logoSrc, photoSrc, headline, support, cta, label }: { logoSrc: string; photoSrc: string; headline: string; support: string; cta: string; label: string }) {
  const size = headline.length > 70 ? 41 : 49;
  return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: COLORS.ink } },
    React.createElement("img", { src: photoSrc, width: 1200, height: 628, style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } }),
    React.createElement("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(90deg,rgba(16,43,40,.97) 0%,rgba(16,43,40,.90) 30%,rgba(16,43,40,.62) 52%,rgba(16,43,40,.14) 76%,rgba(16,43,40,0) 100%)" } }),
    React.createElement("div", { style: { position: "relative", zIndex: 2, width: "61%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "36px 52px 38px" } },
      React.createElement(Brand, { logoSrc, compact: true }),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", maxWidth: 650 } },
        React.createElement("div", { style: { color: "#8be0c9", fontSize: 13, fontWeight: 900, letterSpacing: 2.1, marginBottom: 13 } }, label),
        React.createElement("div", { style: { color: COLORS.white, fontSize: size, fontWeight: 900, lineHeight: 1.04, letterSpacing: -1.5 } }, headline),
        support ? React.createElement("div", { style: { color: "rgba(255,255,255,.84)", fontSize: 20, lineHeight: 1.4, marginTop: 15, maxWidth: 590 } }, support) : null
      ),
      React.createElement(Cta, { text: cta, light: true })
    )
  );
}

function propsFor(post: ContentPost) {
  const type = post.contentType.toLowerCase();
  const label = type.includes("medminds prep") ? "MEDMINDS PREP" : type.includes("research") || type.includes("data analysis") ? "MEDMINDS RESEARCH" : type.includes("digital") || type.includes("software") ? "MEDMINDS DIGITAL" : "MEDMINDS";
  return {
    headline: (post.creativeHeadline || post.title || "MedMinds").slice(0, 100),
    support: (post.creativeSupportingText || "").slice(0, 230),
    cta: (post.creativeCta || "Message MedMinds").slice(0, 60),
    label
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getContentPost(id);
  if (!post) return new Response("Creative not found", { status: 404 });
  const origin = new URL(request.url).origin;
  const logoSrc = `${origin}/medminds-logo.png`;
  const props = propsFor(post);
  let element: React.ReactElement;
  if (post.creativeVisualMode === "photo" && post.photoGeneratedAt) {
    const photoSrc = `${origin}/api/content/photo/${post.id}?v=${post.photoVersion || 1}`;
    element = React.createElement(Photo, { ...props, logoSrc, photoSrc });
  } else if (post.creativeTemplate === "education-card") {
    element = React.createElement(Education, { ...props, logoSrc });
  } else if (post.creativeTemplate === "faq-notice") {
    element = React.createElement(Education, { ...props, logoSrc, faq: true });
  } else {
    element = React.createElement(Promo, { ...props, logoSrc });
  }
  const response = new ImageResponse(element, { width: 1200, height: 628 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
