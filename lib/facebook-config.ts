export function getFacebookSetup() {
  const pageId = process.env.MEDMINDS_FACEBOOK_PAGE_ID?.trim() || "";
  const accessToken = process.env.MEDMINDS_FACEBOOK_PAGE_ACCESS_TOKEN?.trim() || "";
  const graphVersion = process.env.MEDMINDS_FACEBOOK_GRAPH_VERSION?.trim() || process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v25.0";
  return {
    configured: Boolean(pageId && accessToken),
    pageId: pageId || null,
    graphVersion
  };
}
